self.addEventListener('install', (event) => {
    // Força a atualização imediata do Service Worker
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    // Assume o controle de todas as abas abertas imediatamente
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
    const data = event.data ? event.data.text() : 'Nova atualização no TGS Delivery!';
    event.waitUntil(
        self.registration.showNotification('TGS Delivery ⚡', {
            body: data,
            icon: 'icon-192.png', // Otimizado para o ícone menor
            vibrate: [200, 100, 200, 100, 200]
        })
    );
});

// NOVO: O que acontece quando o usuário clica na notificação
self.addEventListener('notificationclick', function(event) {
    event.notification.close(); // Fecha a notificação da barra do celular

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Se o app já estiver aberto em alguma aba/janela, traz ele para a frente (foco)
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url.includes('/') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Se o app estiver fechado, abre ele do zero
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});
