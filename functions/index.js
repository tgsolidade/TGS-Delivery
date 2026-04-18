const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentDeleted } = require("firebase-functions/v2/firestore"); // 🚨 ADDED: onDocumentDeleted
const cors = require("cors")({ origin: true });
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const https = require("https");
const admin = require('firebase-admin');

// Inicializa o banco de dados do Firebase
admin.initializeApp();
const db = admin.firestore();

// ==========================================
// 🚨 1. SUAS CREDENCIAIS DE PRODUÇÃO 🚨
// ==========================================
const CLIENT_ID = "Client_Id_3acb0e3696cad42298182e044b77c2d657f1ee35";
const CLIENT_SECRET = "Client_Secret_1cda43d7997277246c9e9f43acf88751db6f667d";
const NOME_ARQUIVO_P12 = "producao-894737-tgsdelivery.p12";
const SENHA_CERTIFICADO = ""; 
const CHAVE_PIX_DESTINO = "6891f3a9-ccfc-4221-bcc5-8614cd774110"; 

// ==========================================
// 2. GERAR O PIX E SALVAR NO BANCO (GERAÇÃO 2)
// ==========================================
exports.gerarPix = onRequest((request, response) => {
    cors(request, response, async () => {
        try {
            const { valor, uid, nome } = request.body;
            if (!uid) return response.status(400).send({ erro: "UID do usuário é obrigatório" });

            const certificadoPath = path.join(__dirname, NOME_ARQUIVO_P12);
            const certificado = fs.readFileSync(certificadoPath);
            const httpsAgent = new https.Agent({ pfx: certificado, passphrase: SENHA_CERTIFICADO });

            const credenciais = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
            
            const authResponse = await axios({
                method: 'POST',
                url: 'https://pix.api.efipay.com.br/oauth/token',
                headers: { Authorization: `Basic ${credenciais}`, 'Content-Type': 'application/json' },
                data: JSON.stringify({ grant_type: 'client_credentials' }),
                httpsAgent: httpsAgent
            });

            const accessToken = authResponse.data.access_token;

            const cobResponse = await axios({
                method: 'POST',
                url: 'https://pix.api.efipay.com.br/v2/cob',
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                data: {
                    calendario: { expiracao: 3600 },
                    valor: { original: valor || "1.00" },
                    chave: CHAVE_PIX_DESTINO,
                    solicitacaoPagador: "Recarga TGS Delivery"
                },
                httpsAgent: httpsAgent
            });

            const txid = cobResponse.data.txid;
            const locId = cobResponse.data.loc.id;

            const qrCodeResponse = await axios({
                method: 'GET',
                url: `https://pix.api.efipay.com.br/v2/loc/${locId}/qrcode`,
                headers: { Authorization: `Bearer ${accessToken}` },
                httpsAgent: httpsAgent
            });

            await db.collection('pagamentos_pendentes').doc(txid).set({
                uid: uid,
                nome: nome || "Motoboy",
                valor: parseFloat(valor),
                status: 'pendente',
                timestamp: Date.now()
            });

            response.status(200).send({
                sucesso: true,
                copiaECola: qrCodeResponse.data.qrcode,
                imagemQrCode: qrCodeResponse.data.imagemQrcode
            });

        } catch (erro) {
            console.error("Erro ao gerar PIX:", erro.response ? erro.response.data : erro.message);
            response.status(500).send({ erro: "Falha ao gerar o PIX" });
        }
    });
});

// ==========================================
// 3. WEBHOOK: OUVIR A CONFIRMAÇÃO DO BANCO
// ==========================================
exports.webhookPix = onRequest(async (request, response) => {
    const token = request.path; 
    
    if (!token.includes("TGS_SENHA_SECRETA_2026")) {
        return response.status(403).send("Acesso Negado");
    }

    const { pix } = request.body;

    if (!pix || pix.length === 0) {
        return response.status(200).send("OK");
    }

    try {
        for (const p of pix) {
            const txid = p.txid;
            const pDoc = await db.collection('pagamentos_pendentes').doc(txid).get();
            
            if (pDoc.exists) {
                const dados = pDoc.data();
                
                await db.collection('usuarios').doc(dados.uid).update({
                    saldo: admin.firestore.FieldValue.increment(dados.valor)
                });

                await db.collection('recargas').add({
                    motoboyId: dados.uid,
                    motoboyNome: dados.nome,
                    valor: dados.valor,
                    tipo: 'pix_automatico',
                    timestamp: Date.now()
                });

                await db.collection('pagamentos_pendentes').doc(txid).delete();
                console.log(`✅ Saldo de R$ ${dados.valor} liberado automaticamente para ${dados.nome}`);
            }
        }
        return response.status(200).send("Webhook Processado");
    } catch (erro) {
        console.error("Erro no Webhook:", erro);
        return response.status(500).send("Erro ao processar webhook");
    }
});

// ==========================================
// 🚀 4. ROBÔ DE NOTIFICAÇÃO PUSH (FCM) - AUTOMÁTICO 🚀
// ==========================================
exports.notificarNovoPedido = onDocumentCreated("pedidos/{pedidoId}", async (event) => {
    const snap = event.data;
    if (!snap) return null;
    
    const pedido = snap.data();

    // Só avisa se o pedido entrar no estado de aguardando.
    if (pedido.status !== 'aguardando') return null;

    try {
        const motosSnapshot = await db.collection('usuarios')
            .where('perfil', '==', 'motoboy')
            .where('status', '==', 'online')
            .get();

        if (motosSnapshot.empty) return null;

        const tokens = [];
        motosSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.fcmToken && (!data.punishedUntil || data.punishedUntil < Date.now())) {
                if (pedido.bagGrande === true && !data.bagGrande) {
                    // Pula o motoboy se for pedido de bag grande e ele não tiver
                } else {
                    tokens.push(data.fcmToken);
                }
            }
        });

        if (tokens.length === 0) return null;

        let modoTag = "";
        if (pedido.modo === 'flash') modoTag = " ⚡ [FLASH]";
        if (pedido.modo === 'expresso') modoTag = " 🏍️ [EXPRESSO]";

        const payload = {
            notification: {
                title: "NOVO PEDIDO NA TELA!",
                body: `${pedido.lojaNome}${modoTag} - R$ ${pedido.taxa.replace('R$ ', '')} para ${pedido.bairro}`
            },
            android: { priority: "high" }, 
            webpush: { headers: { Urgency: "high" } }, 
            tokens: tokens
        };

        const response = await admin.messaging().sendEachForMulticast(payload);
        console.log(`Push automático enviado! Sucesso: ${response.successCount} / Falhas: ${response.failureCount}`);

    } catch (error) {
        console.error("Erro ao enviar notificação Push FCM:", error);
    }
    
    return null;
});

// ==========================================
// 📢 5. MEGAFONE ADMIN: ALERTAR MOTOS OU LOJAS 📢
// ==========================================
exports.notificarTodosMotos = onRequest((request, response) => {
    cors(request, response, async () => {
        try {
            const { titulo, mensagem, publico } = request.body;

            if (!titulo || !mensagem) {
                return response.status(400).send({ sucesso: false, erro: "Título e mensagem são obrigatórios" });
            }

            let alvo = 'motoboy';
            if (publico === 'lojas') {
                alvo = 'loja';
            }

            const snapshot = await db.collection('usuarios')
                .where('perfil', '==', alvo)
                .get();

            if (snapshot.empty) {
                return response.status(200).send({ sucesso: true, disparos: 0, msg: `Nenhum usuário no alvo: ${alvo}` });
            }

            const tokens = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.status !== 'bloqueado' && data.fcmToken) {
                    tokens.push(data.fcmToken);
                }
            });

            if (tokens.length === 0) {
                return response.status(200).send({ sucesso: true, disparos: 0, msg: "Sem tokens registrados para disparo" });
            }

            const payload = {
                notification: {
                    title: titulo,
                    body: mensagem
                },
                android: {
                    priority: "high"
                },
                webpush: {
                    headers: {
                        Urgency: "high"
                    }
                },
                tokens: tokens
            };

            const pushResponse = await admin.messaging().sendEachForMulticast(payload);
            
            return response.status(200).send({
                sucesso: true,
                disparos: pushResponse.successCount
            });

        } catch (error) {
            console.error("Erro crítico no Megafone:", error);
            return response.status(500).send({ sucesso: false, erro: "Falha interna" });
        }
    });
});

// ==========================================
// 🧹 6. FAXINEIRO AUTOMÁTICO (EXCLUSÃO TOTAL)
// ==========================================
exports.limparAuthAoDeletarUsuario = onDocumentDeleted("usuarios/{uid}", async (event) => {
    const uid = event.params.uid;
    try {
        await admin.auth().deleteUser(uid);
        console.log(`Conta Auth do UID ${uid} deletada com sucesso.`);
    } catch (error) {
        console.log(`Usuário Auth ${uid} já não existia ou erro ao deletar:`, error.message);
    }
});