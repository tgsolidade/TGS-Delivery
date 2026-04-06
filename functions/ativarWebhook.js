const axios = require("axios");
const fs = require("fs");
const https = require("https");
const path = require("path");

// ==========================================
// 🚨 CREDENCIAIS DE PRODUÇÃO
// ==========================================
const CLIENT_ID = "Client_Id_3acb0e3696cad42298182e044b77c2d657f1ee35";
const CLIENT_SECRET = "Client_Secret_1cda43d7997277246c9e9f43acf88751db6f667d";
const NOME_ARQUIVO_P12 = "producao-894737-tgsdelivery.p12";
const CHAVE_PIX = "6891f3a9-ccfc-4221-bcc5-8614cd774110";

// ==========================================
// 🛡️ A NOSSA URL BLINDADA
// ==========================================
const URL_WEBHOOK = "https://webhookpix-mnqcjnimuq-uc.a.run.app/TGS_SENHA_SECRETA_2026";

async function configurarWebhook() {
    console.log("🔄 Conectando com a Efí Bank em ambiente de Produção...");
    
    try {
        const certificado = fs.readFileSync(path.join(__dirname, NOME_ARQUIVO_P12));
        const httpsAgent = new https.Agent({ pfx: certificado, passphrase: "" });
        const credenciais = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

        // 1. Pegar o Token de Acesso
        const authResponse = await axios({
            method: 'POST',
            url: 'https://pix.api.efipay.com.br/oauth/token', // Produção
            headers: { Authorization: `Basic ${credenciais}`, 'Content-Type': 'application/json' },
            data: JSON.stringify({ grant_type: 'client_credentials' }),
            httpsAgent: httpsAgent
        });

        const accessToken = authResponse.data.access_token;

        // 2. Cadastrar a URL na chave PIX pulando o mTLS (Regra para Servidores Cloud/Firebase)
        const webhookResponse = await axios({
            method: 'PUT',
            url: `https://pix.api.efipay.com.br/v2/webhook/${CHAVE_PIX}`, // Produção
            headers: { 
                Authorization: `Bearer ${accessToken}`, 
                'Content-Type': 'application/json',
                'x-skip-mtls-checking': 'true' // 🚀 O CÓDIGO VIP PARA O FIREBASE
            },
            data: { webhookUrl: URL_WEBHOOK },
            httpsAgent: httpsAgent
        });

        console.log("✅ BOOM! Webhook configurado com sucesso na Efí!");
        console.log("A partir de agora, todo PIX pago vai atualizar o saldo no Firebase automaticamente.");

    } catch (erro) {
        console.error("❌ Erro ao configurar webhook:", erro.response ? erro.response.data : erro.message);
    }
}

configurarWebhook();