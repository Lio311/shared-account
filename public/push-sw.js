self.addEventListener('push', function(event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'התראה', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/new-logo-update.ff3b97310ec758844738483bf14e3cb1.svg',
    badge: '/new-logo-update.ff3b97310ec758844738483bf14e3cb1.svg',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'סיכום יומי', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});
