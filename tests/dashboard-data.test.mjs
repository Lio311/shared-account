import test from 'node:test';
import assert from 'node:assert/strict';
import { authenticatedFetch, loadDashboardData } from '../src/dashboardData.mjs';

test('expired session triggers reauthentication instead of showing an empty account', async t => {
  const events = [];
  t.mock.method(globalThis, 'fetch', async () => ({ status: 401 }));
  const previous = globalThis.window;
  globalThis.window = { dispatchEvent: event => events.push(event.type) };
  try {
    await assert.rejects(authenticatedFetch('/api/transactions'), /Authentication/);
    assert.deepEqual(events, ['shared-account-auth-expired']);
  } finally { globalThis.window = previous; }
});

test('dashboard loading includes session credentials and fails visibly on partial server failure', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
    return { status: 200, ok: true, json: async () => [{ id: url }] };
  });
  const result = await loadDashboardData();
  assert.equal(result.transactions.length, 1);
  t.mock.method(globalThis, 'fetch', async url => ({ status: url.includes('salaries') ? 503 : 200, ok: !url.includes('salaries'), json: async () => [] }));
  await assert.rejects(loadDashboardData(), /unavailable/);
});
