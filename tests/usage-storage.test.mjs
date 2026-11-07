import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { Miniflare, Log, LogLevel } from 'miniflare';

const token = 'test-only-admin-password-with-more-than-24-characters';
const origin = 'https://example.com';
const scriptPath = new URL('../dist/worker.mjs', import.meta.url).pathname;
const id = number => number.toString(16).padStart(32, '0');
const page = (number, visitor) => ({ eventId: id(number), visitorId: id(visitor), action: 'page_view', source: 'page' });
const search = (number, visitor, action, network = 'mainnet', source = 'manual') => ({ eventId: id(number), visitorId: id(visitor), action, source, network });

test('actual SQLite Durable Objects count unique checker users, deduplicate events and preserve totals after restart', async t => {
  const persist = await mkdtemp(new URL('../.usage-storage-test-', import.meta.url).pathname);
  let mf;
  // This pinned Wrangler ships workerd through 2026-05-22. The production
  // config keeps its current date; exercise SQLite against the bundled runtime.
  const create = () => new Miniflare({ modules: true, scriptPath, compatibilityDate: '2026-05-22', durableObjects: { USAGE_ANALYTICS: { className: 'UsageAnalytics', useSQLite: true } }, durableObjectsPersist: persist, bindings: { ANALYTICS_ADMIN_TOKEN: token }, log: new Log(LogLevel.NONE) });
  t.after(async () => { if (mf) await mf.dispose(); await rm(persist, { recursive: true, force: true }); });
  mf = create();
  const track = async event => {
    const response = await mf.dispatchFetch(origin + '/api/usage', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(event) });
    assert.equal(response.status, 204);
  };
  const stats = async (range = 'all') => {
    const response = await mf.dispatchFetch(origin + '/api/admin/usage?range=' + range, { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.status, 200);
    return response.json();
  };
  await track(page(1, 100));
  await track(search(2, 100, 'search_start'));
  await track(search(3, 100, 'search_success'));
  await track(search(3, 100, 'search_success'));
  await track(page(4, 200));
  await track(page(5, 300));
  await track(search(6, 300, 'search_start', 'testnet', 'sample'));
  await track(search(7, 300, 'search_error', 'testnet', 'sample'));
  const first = await stats();
  assert.deepEqual(first.totals, { visitors: 3, checker_users: 2, page_views: 3, search_starts: 2, search_successes: 1, search_errors: 1, sample_starts: 1, mainnet_starts: 1, testnet_starts: 1 });
  assert.equal(first.daily.length, 1);
  assert.equal(first.daily[0].checker_users, 2);
  assert.deepEqual((await stats('today')).totals, first.totals);
  assert.deepEqual((await stats('7d')).totals, first.totals);
  assert.deepEqual((await stats('30d')).totals, first.totals);

  const namespace = await mf.getDurableObjectNamespace('USAGE_ANALYTICS');
  const stub = namespace.get(namespace.idFromName('flowlens-global-v1'));
  const oldDay = Date.now() - 2 * 86400000;
  // The internal namespace is private; exercise a second UTC day on the real runtime.
  await stub.fetch('https://usage.internal/track', { method: 'POST', body: JSON.stringify({ event: page(8, 999), now: oldDay }) });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('flowlens-usage-v1:' + id(100)));
  const existingVisitor = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
  await stub.fetch('https://usage.internal/track', { method: 'POST', body: JSON.stringify({ event: { ...page(9, 100), visitorId: existingVisitor }, now: oldDay }) });
  await stub.fetch('https://usage.internal/track', { method: 'POST', body: JSON.stringify({ event: { ...search(10, 100, 'search_start'), visitorId: existingVisitor }, now: oldDay }) });
  assert.equal((await stats('today')).totals.visitors, 3);
  assert.equal((await stats('7d')).totals.visitors, 4);
  assert.equal((await stats('7d')).totals.checker_users, 2);
  const beforeRestart = await stats();
  await mf.dispose();
  mf = create();
  const restored = await stats();
  assert.deepEqual(restored.totals, beforeRestart.totals);
  assert.equal(restored.trackingSince, beforeRestart.trackingSince);
  await track(search(3, 100, 'search_success'));
  assert.equal((await stats()).totals.search_successes, 1);
  const startsBefore = (await stats()).totals.search_starts;
  await Promise.all(Array.from({ length: 10 }, (_, index) => track(search(1000 + index, 100, 'search_start'))));
  assert.equal((await stats()).totals.search_starts, startsBefore + 10);
  assert.equal((await stats()).totals.checker_users, 2);
  const unauthorized = await mf.dispatchFetch(origin + '/api/admin/usage');
  assert.equal(unauthorized.status, 401);
  const admin = await mf.dispatchFetch(origin + '/admin');
  assert.equal(admin.status, 200);
  assert.match(await admin.text(), /Private usage analytics/);
  const health = await (await mf.dispatchFetch(origin + '/api/health')).json();
  assert.equal(health.usageTracking, true);
});
