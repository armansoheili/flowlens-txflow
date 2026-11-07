import type { UsageAction, UsageEvent, UsageSource } from '../lib/usage';

const VISITOR_KEY = 'flowlens.usage.visitor.v1';
let visitorId: string | null = null;
let pageRecorded = false;

function randomId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}

function getVisitorId(): string {
  if (visitorId) return visitorId;
  try {
    const saved = window.localStorage.getItem(VISITOR_KEY);
    if (saved && /^[a-f0-9]{32}$/.test(saved)) return visitorId = saved;
  } catch { /* Private browsing may disable local storage. */ }
  visitorId = randomId();
  try { window.localStorage.setItem(VISITOR_KEY, visitorId); } catch { /* Use a page-local ID. */ }
  return visitorId;
}

function sendUsage(action: UsageAction, source: UsageSource, network?: 'mainnet' | 'testnet'): void {
  // Analytics failure must never delay or fail a wallet search.
  let payload: string;
  try {
    const event: UsageEvent = { eventId: randomId(), visitorId: getVisitorId(), action, source, ...(network ? { network } : {}) };
    payload = JSON.stringify(event);
  } catch { return; }
  try {
    if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon('/api/usage', new Blob([payload], { type: 'application/json' }))) return;
  } catch { /* Try a keepalive request when Beacon is unavailable. */ }
  try {
    void fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true, credentials: 'omit' }).catch(() => {});
  } catch { /* Telemetry is best effort. */ }
}

export function recordPageView(): void {
  if (pageRecorded) return;
  pageRecorded = true;
  sendUsage('page_view', 'page');
}

export function recordSearch(action: 'search_start' | 'search_success' | 'search_error', network: 'mainnet' | 'testnet', source: Exclude<UsageSource, 'page'>): void {
  sendUsage(action, source, network);
}
