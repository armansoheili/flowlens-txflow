import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUsageEvent } from '../lib/usage.ts';
import worker from '../dist/worker.mjs';

const event = { eventId: 'a'.repeat(32), visitorId: 'b'.repeat(32), action: 'page_view', source: 'page' };

test('usage events accept counts while rejecting wallets, arbitrary fields and invalid event types', () => {
  assert.deepEqual(parseUsageEvent(event), event);
  assert.equal(parseUsageEvent({ ...event, address: '0x' + '1'.repeat(40) }), null);
  assert.equal(parseUsageEvent({ ...event, url: 'https://example.com/?address=private' }), null);
  assert.equal(parseUsageEvent({ ...event, action: 'other' }), null);
  assert.equal(parseUsageEvent({ ...event, visitorId: '192.0.2.1' }), null);
  assert.equal(parseUsageEvent({ ...event, network: 'mainnet' }), null);
  assert.equal(parseUsageEvent({ ...event, action: 'search_start' }), null);
  assert.ok(parseUsageEvent({ ...event, action: 'search_start', source: 'manual', network: 'mainnet' }));
});

test('tracking rejects cross-site posts and oversized data without touching storage', async () => {
  const env = { ASSETS: { fetch: async () => new Response('site') } };
  assert.equal((await worker.fetch(new Request('https://example.com/api/usage'), env)).status, 405);
  const post = (body, origin = 'https://example.com') => worker.fetch(new Request('https://example.com/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body }), env);
  assert.equal((await post(JSON.stringify(event), 'https://other.example')).status, 403);
  assert.equal((await post('x'.repeat(3000))).status, 400);
  assert.equal((await post(JSON.stringify({ ...event, wallet: 'private' }))).status, 400);
  assert.equal((await post(JSON.stringify(event))).status, 503);
  assert.equal((await worker.fetch(new Request('https://example.com/'), env)).status, 200);
});

test('a tracking request persists only the allowed fields and a hashed browser ID', async () => {
  let saved;
  const env = { ASSETS: {}, USAGE_ANALYTICS: { idFromName: name => name, get: () => ({ fetch: async request => { saved = await request.json(); return new Response(null, { status: 204 }); } }) } };
  const response = await worker.fetch(new Request('https://example.com/api/usage', { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: JSON.stringify(event) }), env);
  assert.equal(response.status, 204);
  assert.notEqual(saved.event.visitorId, event.visitorId);
  assert.match(saved.event.visitorId, /^[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(saved.event).sort(), Object.keys(event).sort());
  assert.ok(Number.isSafeInteger(saved.now));
});

test('the private stats route is closed until a strong secret is configured and checked', async () => {
  const request = token => new Request('https://example.com/api/admin/usage', { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  assert.equal((await worker.fetch(request(), { ASSETS: {} })).status, 503);
  const env = { ASSETS: {}, ANALYTICS_ADMIN_TOKEN: 'test-only-admin-password-with-more-than-24-characters' };
  assert.equal((await worker.fetch(request(), env)).status, 401);
  assert.equal((await worker.fetch(request('wrong-password'), env)).status, 401);
  assert.equal((await worker.fetch(request(env.ANALYTICS_ADMIN_TOKEN), env)).status, 503);
});

test('the admin document has no embedded password and no-cache, frame and script protections', async () => {
  const token = 'test-only-admin-password-with-more-than-24-characters';
  const response = await worker.fetch(new Request('https://example.com/admin'), { ASSETS: {}, ANALYTICS_ADMIN_TOKEN: token });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
  const nonce = html.match(/<script nonce="([a-f0-9]+)"/)[1];
  assert.ok(response.headers.get('Content-Security-Policy').includes("'nonce-" + nonce + "'"));
  assert.doesNotMatch(html, new RegExp(token));
  assert.match(html, /Checker users/);
  assert.match(html, /Failed searches/);
  assert.doesNotMatch(html, /localStorage|sessionStorage/);
  assert.equal((await worker.fetch(new Request('https://example.com/admin/unknown'), { ASSETS: {} })).status, 404);
});
