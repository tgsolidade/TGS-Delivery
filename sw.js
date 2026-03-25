self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function(event) {
    const data = event.data ? event.data.text() : 'Nova atualização no TGS Delivery!';
    event.waitUntil(
        self.registration.showNotification('TGS Delivery ⚡', {
            body: data,
            icon: 'icon.png',
            vibrate: [200, 100, 200, 100, 200]
        })
    );
});