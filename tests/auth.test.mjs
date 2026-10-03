import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { authenticatePin, issueSession, session, requireAuth, requireCron, sameOrigin } from '../api/_lib/auth.mjs';
import authHandler from '../api/auth.mjs';

const envKeys = ['AUTH_SECRET', 'DATABASE_URL', 'AUTH_PIN_BEN', 'AUTH_PIN_BAT', 'CRON_SECRET', 'NODE_ENV'];
function withEnvironment(values, action) {
  const before = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  Object.assign(process.env, values);
  try { return action(); } finally {
    for (const key of envKeys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
}
function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
const req = extra => ({ headers: { host: 'example.test', origin: 'https://example.test', 'x-forwarded-proto': 'https', ...extra } });
function signedCookie(data, secret = 'test-session-secret') {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const key = createHmac('sha256', secret).update('shared-account-session-v1').digest();
  const sig = createHmac('sha256', key).update(payload).digest('base64url');
  return `shared_account_session=${payload}.${sig}`;
}
test('issued session is HttpOnly, secure, and verified; forged payload/signature is rejected', () => withEnvironment({ AUTH_SECRET: 'test-session-secret', NODE_ENV: 'production' }, () => {
  const res = response();
  issueSession(req(), res, 'ליאור הבן');
  assert.match(res.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/);
  assert.match(res.headers['Set-Cookie'], /; Secure/);
  const cookie = res.headers['Set-Cookie'].split(';')[0];
  assert.equal(session(req({ cookie })).person, 'ליאור הבן');
  const forged = cookie.replace(/.$/, char => char === 'a' ? 'b' : 'a');
  assert.equal(session(req({ cookie: forged })), null);
  const [name, token] = cookie.split('=');
  const [, sig] = token.split('.');
  const altered = Buffer.from(JSON.stringify({ person: 'ליאור הבת', expires: Date.now() + 10000 })).toString('base64url');
  assert.equal(session(req({ cookie: `${name}=${altered}.${sig}` })), null);
  assert.equal(session(req({ cookie: cookie + '.extra' })), null);
}));
test('even correctly signed expired and unrecognized-user sessions are rejected', () => withEnvironment({ AUTH_SECRET: 'test-session-secret' }, () => {
  assert.equal(session(req({ cookie: signedCookie({ person: 'ליאור הבן', expires: Date.now() - 1 }) })), null);
  assert.equal(session(req({ cookie: signedCookie({ person: 'attacker', expires: Date.now() + 10000 }) })), null);
  assert.equal(session(req({ cookie: signedCookie({ person: 'ליאור הבן', expires: '2999999999999' }) })), null);
}));
test('authentication fails closed without signing configuration; login never reports success', () => withEnvironment({ AUTH_PIN_BEN: '1234', AUTH_PIN_BAT: '5678' }, () => {
  const protectedResponse = response();
  assert.equal(requireAuth(req({ cookie: signedCookie({ person: 'ליאור הבן', expires: Date.now() + 10000 }) }), protectedResponse), false);
  assert.equal(protectedResponse.statusCode, 401);
  const res = response();
  authHandler({ ...req({ 'x-forwarded-for': 'auth-test-missing-config' }), method: 'POST', body: { pin: '1234' } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'Authentication unavailable');
  assert.equal(res.headers['Set-Cookie'], undefined);
}));
test('configured login succeeds and brute-force attempts are limited', () => withEnvironment({ AUTH_SECRET: 'test-session-secret', AUTH_PIN_BEN: '1234', AUTH_PIN_BAT: '5678' }, () => {
  const res = response();
  authHandler({ ...req({ 'x-forwarded-for': 'auth-test-success' }), method: 'POST', body: { pin: '1234' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.authenticated, true);
  assert.ok(res.headers['Set-Cookie']);
  const attacker = req({ 'x-forwarded-for': 'auth-test-rate-limit' });
  for (let index = 0; index < 5; index++) assert.equal(authenticatePin('0000', attacker).status, 401);
  assert.equal(authenticatePin('1234', attacker).status, 429);
}));
test('cross-origin access is rejected and cron requires explicit configured secret', () => {
  assert.equal(sameOrigin(req({ origin: 'https://evil.test' })), false);
  withEnvironment({}, () => {
    const res = response();
    assert.equal(requireCron(req({ authorization: 'Bearer undefined' }), res), false);
    assert.equal(res.statusCode, 401);
  });
  withEnvironment({ CRON_SECRET: 'test-cron-secret' }, () => {
    assert.equal(requireCron(req(), response()), false);
    assert.equal(requireCron(req({ authorization: 'Bearer wrong' }), response()), false);
    assert.equal(requireCron(req({ authorization: 'Bearer test-cron-secret' }), response()), true);
  });
});

test('login fails closed when identity PIN configuration is missing', () => withEnvironment({ AUTH_SECRET: 'test-session-secret' }, () => {
  const res = response();
  authHandler({ ...req({ 'x-forwarded-for': 'auth-test-missing-pins' }), method: 'POST', body: { pin: '1234' } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error, 'Authentication is not configured');
  assert.equal(res.headers['Set-Cookie'], undefined);
}));
