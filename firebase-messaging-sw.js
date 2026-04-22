importScripts("https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js");

// Suas credenciais atuais do Firebase
firebase.initializeApp({
  apiKey: "AIzaSyDLSvxNn8jwZGG8Ky9MUlDRvSH6vHK7vdI",
  authDomain: "base-delivery-1d420.firebaseapp.com",
  projectId: "base-delivery-1d420",
  storageBucket: "base-delivery-1d420.firebasestorage.app",
  messagingSenderId: "734860193156",
  appId: "1:734860193156:web:b013890e8351b10b72c1d1",
});

const messaging = firebase.messaging();

// ESSE É O CARA QUE ESCUTA A NOTIFICAÇÃO QUANDO O APP ESTÁ FECHADO/MINIMIZADO
messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Notificação recebida em segundo plano!", payload);

  // BLINDAGEM: Se 'notification' não existir, ele tenta buscar em 'data' ou usa o texto padrão.
  const notificationTitle = payload.notification?.title || payload.data?.title || "TGS Delivery";
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || "Você tem uma nova notificação!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [600, 200, 600, 200, 1500],
    requireInteraction: true, // Faz a notificação ficar na tela
  };

  return self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});

// A ENGRENAGEM NOVA: O que acontece quando o motoboy clica na notificação?
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Clique na notificação recebido.');
  
  event.notification.close(); 

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.registration.scope) !== -1 && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});