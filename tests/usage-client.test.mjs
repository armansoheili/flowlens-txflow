import test from 'node:test';
import assert from 'node:assert/strict';

function browser(t, { beacon = () => true, storage } = {}) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage ?? { getItem: () => null, setItem: () => {} } } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { sendBeacon: beacon } });
  t.after(() => {
    if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else delete globalThis.window;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
  });
}

test('one page view is counted per document and search events reuse a browser ID without wallet data', async t => {
  const bodies = [], values = new Map();
  browser(t, { beacon: (url, body) => { assert.equal(url, '/api/usage'); bodies.push(body); return true; }, storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } });
  const usage = await import('../src/usage.ts?case=events');
  usage.recordPageView(); usage.recordPageView();
  usage.recordSearch('search_start', 'mainnet', 'manual');
  usage.recordSearch('search_success', 'mainnet', 'manual');
  const events = await Promise.all(bodies.map(async body => JSON.parse(await body.text())));
  assert.equal(events.length, 3);
  assert.deepEqual(events.map(event => event.action), ['page_view', 'search_start', 'search_success']);
  assert.equal(new Set(events.map(event => event.visitorId)).size, 1);
  assert.equal(new Set(events.map(event => event.eventId)).size, 3);
  assert.equal(values.size, 1);
  assert.ok(events.every(event => !('address' in event) && !('url' in event) && !('ip' in event)));
});

test('failed Beacon and disabled storage use a non-blocking keepalive request', async t => {
  browser(t, { beacon: () => false, storage: { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } } });
  const calls = [];
  t.mock.method(globalThis, 'fetch', (url, options) => { calls.push({ url, options }); return new Promise(() => {}); });
  const usage = await import('../src/usage.ts?case=keepalive');
  assert.equal(usage.recordPageView(), undefined);
  assert.equal(usage.recordSearch('search_error', 'testnet', 'sample'), undefined);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, '/api/usage');
  assert.equal(calls[0].options.keepalive, true);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(JSON.parse(calls[0].options.body).visitorId, JSON.parse(calls[1].options.body).visitorId);
});

test('a complete tracking transport failure cannot throw into the wallet checker', async t => {
  browser(t, { beacon: () => { throw new Error('blocked'); } });
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  const usage = await import('../src/usage.ts?case=offline');
  assert.doesNotThrow(() => usage.recordSearch('search_start', 'mainnet', 'manual'));
  await new Promise(resolve => setImmediate(resolve));
});
