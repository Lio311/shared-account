self.addEventListener('push', function(event) {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { title: 'התראה', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/mutual-logo.svg',
    badge: '/mutual-logo.svg',
    vibrate: [100, 50, 100],
    tag: data.tag,
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '1',
      url: data.url === '/?view=research' ? data.url : '/'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'סיכום יומי', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url === '/?view=research' ? '/?view=research' : '/')
  );
});
