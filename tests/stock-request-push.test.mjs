import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function worker() {
  const listeners = new Map(), notifications = [], windows = [];
  const context = vm.createContext({ Date, URL,
    self: { location: { origin: 'https://example.test' }, addEventListener(type, handler) { listeners.set(type, handler); }, registration: { async showNotification(title, options) { notifications.push({ title, options }); } } },
    clients: { async openWindow(url) { windows.push(url); } },
  });
  vm.runInContext(await readFile(new URL('../public/push-sw.js', import.meta.url), 'utf8'), context);
  return {
    notifications, windows,
    async push(payload) {
      let pending;
      listeners.get('push')({ data: { json() { return payload; } }, waitUntil(value) { pending = value; } });
      await pending;
    },
    async click(url) {
      let pending, closed = false;
      listeners.get('notificationclick')({ notification: { data: { url }, close() { closed = true; } }, waitUntil(value) { pending = value; } });
      await pending;
      return closed;
    },
  };
}

test('research notification preserves allowed research destination and opens it on click', async () => {
  const sw = await worker();
  await sw.push({ title: 'Research', body: 'Ready', url: '/?view=research', tag: 'research-test' });
  assert.equal(sw.notifications[0].options.data.url, '/?view=research');
  assert.equal(sw.notifications[0].options.tag, 'research-test');
  assert.equal(await sw.click(sw.notifications[0].options.data.url), true);
  assert.equal(sw.windows[0], '/?view=research');
});

test('push content cannot redirect the browser to another origin or executable URL', async () => {
  for (const url of ['https://evil.test/?view=research', '//evil.test/?view=research', 'javascript:alert(1)', '/?view=admin', '/?view=research&redirect=https://evil.test', null]) {
    const sw = await worker();
    await sw.push({ title: 'Research', url });
    assert.equal(sw.notifications[0].options.data.url, '/', String(url));
    await sw.click(url);
    assert.equal(sw.windows[0], '/', String(url));
  }
});

test('personal request UUID survives push and click without losing direct research destination', async () => {
  const sw = await worker();
  const url = '/?view=research&request=12345678-1234-4123-8123-123456789abc';
  await sw.push({ title: 'Requested Research', url, tag: 'stock-request-specific' });
  assert.equal(sw.notifications[0].options.data.url, url);
  await sw.click(sw.notifications[0].options.data.url);
  assert.equal(sw.windows[0], url);
});

test('malformed request deep links cannot bypass worker URL allowlist', async () => {
  for (const url of ['/?view=research&request=invalid', '/?view=research&request=12345678-1234-4123-8123-123456789abc&redirect=https://evil.test', '/?view=research&request=../admin', '/?view=research&request=%3Cscript%3E']) {
    const sw = await worker();
    await sw.push({ url });
    assert.equal(sw.notifications[0].options.data.url, '/');
    await sw.click(url);
    assert.equal(sw.windows[0], '/');
  }
});
