import { parseUsageEvent } from '../lib/usage';
import type { UsageEvent } from '../lib/usage';

type Row = Record<string, string | number | null>;
type Sql = { exec(query: string, ...values: (string | number | null)[]): { toArray(): Row[] } };
type State = { storage: { sql: Sql; transactionSync<T>(callback: () => T): T } };
type Stub = { fetch(request: Request): Promise<Response> };
export interface UsageEnv {
  USAGE_ANALYTICS?: { idFromName(name: string): unknown; get(id: unknown): Stub };
  ANALYTICS_ADMIN_TOKEN?: string;
}

const COUNTERS = ['page_views', 'search_starts', 'search_successes', 'search_errors', 'sample_starts', 'mainnet_starts', 'testnet_starts'] as const;
const COUNTER_COLUMNS = COUNTERS.join(', ');
const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: NO_STORE });
const dayOf = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export class UsageAnalytics {
  private sql: Sql;
  constructor(private ctx: State) {
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS totals (
        id INTEGER PRIMARY KEY CHECK(id = 1), created_at TEXT NOT NULL,
        visitors INTEGER NOT NULL DEFAULT 0, checker_users INTEGER NOT NULL DEFAULT 0,
        page_views INTEGER NOT NULL DEFAULT 0, search_starts INTEGER NOT NULL DEFAULT 0,
        search_successes INTEGER NOT NULL DEFAULT 0, search_errors INTEGER NOT NULL DEFAULT 0,
        sample_starts INTEGER NOT NULL DEFAULT 0, mainnet_starts INTEGER NOT NULL DEFAULT 0,
        testnet_starts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS daily (
        day TEXT PRIMARY KEY, visitors INTEGER NOT NULL DEFAULT 0, checker_users INTEGER NOT NULL DEFAULT 0,
        page_views INTEGER NOT NULL DEFAULT 0, search_starts INTEGER NOT NULL DEFAULT 0,
        search_successes INTEGER NOT NULL DEFAULT 0, search_errors INTEGER NOT NULL DEFAULT 0,
        sample_starts INTEGER NOT NULL DEFAULT 0, mainnet_starts INTEGER NOT NULL DEFAULT 0,
        testnet_starts INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS visitors (id TEXT PRIMARY KEY, used_checker INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS daily_visitors (day TEXT NOT NULL, id TEXT NOT NULL, used_checker INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, id));
      CREATE TABLE IF NOT EXISTS seen_events (id TEXT PRIMARY KEY, day TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS seen_events_day ON seen_events(day);
      CREATE TABLE IF NOT EXISTS maintenance (id INTEGER PRIMARY KEY CHECK(id = 1), day TEXT NOT NULL);
    `);
    this.sql.exec('INSERT OR IGNORE INTO totals (id, created_at) VALUES (1, ?)', new Date().toISOString());
  }

  private record(event: UsageEvent, now: number): void {
    const day = dayOf(now);
    this.ctx.storage.transactionSync(() => {
      if (this.sql.exec('SELECT id FROM seen_events WHERE id = ?', event.eventId).toArray().length) return;
      this.sql.exec('INSERT INTO seen_events (id, day) VALUES (?, ?)', event.eventId, day);
      this.sql.exec('INSERT OR IGNORE INTO daily (day) VALUES (?)', day);

      const used = event.action !== 'page_view' ? 1 : 0;
      const visitor = this.sql.exec('SELECT used_checker FROM visitors WHERE id = ?', event.visitorId).toArray()[0];
      if (!visitor) {
        this.sql.exec('INSERT INTO visitors (id, used_checker) VALUES (?, ?)', event.visitorId, used);
        this.sql.exec('UPDATE totals SET visitors = visitors + 1, checker_users = checker_users + ? WHERE id = 1', used);
      } else if (used && !visitor.used_checker) {
        this.sql.exec('UPDATE visitors SET used_checker = 1 WHERE id = ?', event.visitorId);
        this.sql.exec('UPDATE totals SET checker_users = checker_users + 1 WHERE id = 1');
      }
      const today = this.sql.exec('SELECT used_checker FROM daily_visitors WHERE day = ? AND id = ?', day, event.visitorId).toArray()[0];
      if (!today) {
        this.sql.exec('INSERT INTO daily_visitors (day, id, used_checker) VALUES (?, ?, ?)', day, event.visitorId, used);
        this.sql.exec('UPDATE daily SET visitors = visitors + 1, checker_users = checker_users + ? WHERE day = ?', used, day);
      } else if (used && !today.used_checker) {
        this.sql.exec('UPDATE daily_visitors SET used_checker = 1 WHERE day = ? AND id = ?', day, event.visitorId);
        this.sql.exec('UPDATE daily SET checker_users = checker_users + 1 WHERE day = ?', day);
      }

      const column = { page_view: 'page_views', search_start: 'search_starts', search_success: 'search_successes', search_error: 'search_errors' }[event.action];
      const additions = [`${column} = ${column} + 1`];
      if (event.action === 'search_start') {
        if (event.source === 'sample') additions.push('sample_starts = sample_starts + 1');
        const networkColumn = event.network === 'mainnet' ? 'mainnet_starts' : 'testnet_starts';
        additions.push(`${networkColumn} = ${networkColumn} + 1`);
      }
      this.sql.exec(`UPDATE totals SET ${additions.join(', ')} WHERE id = 1`);
      this.sql.exec(`UPDATE daily SET ${additions.join(', ')} WHERE day = ?`, day);

      const maintenance = this.sql.exec('SELECT day FROM maintenance WHERE id = 1').toArray()[0];
      if (!maintenance || maintenance.day !== day) {
        this.sql.exec('DELETE FROM seen_events WHERE day < ?', dayOf(now - 14 * 86400000));
        this.sql.exec('INSERT INTO maintenance (id, day) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET day = excluded.day', day);
      }
    });
  }

  private stats(range: string, now: number): unknown {
    const first = this.sql.exec('SELECT * FROM totals WHERE id = 1').toArray()[0];
    const start = range === 'all' ? null : dayOf(now - (range === '7d' ? 6 : range === '30d' ? 29 : 0) * 86400000);
    let counts: Row;
    if (!start) counts = first;
    else {
      counts = this.sql.exec(`SELECT ${COUNTERS.map(key => `COALESCE(SUM(${key}), 0) AS ${key}`).join(', ')} FROM daily WHERE day >= ?`, start).toArray()[0];
      if (range === 'today') {
        const today = this.sql.exec('SELECT visitors, checker_users FROM daily WHERE day = ?', start).toArray()[0];
        counts.visitors = today?.visitors ?? 0;
        counts.checker_users = today?.checker_users ?? 0;
      } else {
        const unique = this.sql.exec('SELECT COUNT(DISTINCT id) AS visitors, COUNT(DISTINCT CASE WHEN used_checker = 1 THEN id END) AS checker_users FROM daily_visitors WHERE day >= ?', start).toArray()[0];
        counts.visitors = unique.visitors;
        counts.checker_users = unique.checker_users;
      }
    }
    const daily = this.sql.exec(`SELECT day, visitors, checker_users, ${COUNTER_COLUMNS} FROM daily ${start ? 'WHERE day >= ?' : ''} ORDER BY day DESC LIMIT 30`, ...(start ? [start] : [])).toArray();
    const totals = Object.fromEntries(['visitors', 'checker_users', ...COUNTERS].map(key => [key, Number(counts[key] ?? 0)]));
    return { range, trackingSince: first.created_at, updatedAt: new Date(now).toISOString(), totals, daily };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/track' && request.method === 'POST') {
      const input = await request.json() as { event: UsageEvent; now: number };
      const event = parseUsageEvent(input.event);
      if (!event || !Number.isSafeInteger(input.now)) return json({ error: 'Invalid event.' }, 400);
      // Only the origin Worker can access this namespace; stored IDs are hashes.
      this.record(event, input.now);
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/stats' && request.method === 'GET') {
      const range = url.searchParams.get('range') ?? 'all';
      if (!['all', 'today', '7d', '30d'].includes(range)) return json({ error: 'Invalid range.' }, 400);
      return json(this.stats(range, Date.now()));
    }
    return json({ error: 'Not found.' }, 404);
  }
}

async function smallJson(request: Request): Promise<unknown> {
  if (!request.body) throw new Error('Empty body');
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2048) throw new Error('Oversized event');
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally { try { await reader.cancel(); } catch {} }
}

export async function collectUsage(request: Request, env: UsageEnv): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (request.headers.get('Origin') !== new URL(request.url).origin) return json({ error: 'Origin not allowed.' }, 403);
  if (!(request.headers.get('Content-Type') ?? '').toLowerCase().startsWith('application/json')) return json({ error: 'JSON required.' }, 415);
  let event: UsageEvent | null;
  try { event = parseUsageEvent(await smallJson(request)); } catch { return json({ error: 'Invalid event.' }, 400); }
  if (!event) return json({ error: 'Invalid event.' }, 400);
  if (!env.USAGE_ANALYTICS) return json({ error: 'Usage tracking is not configured.' }, 503);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('flowlens-usage-v1:' + event.visitorId));
  event.visitorId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
  try {
    const stub = env.USAGE_ANALYTICS.get(env.USAGE_ANALYTICS.idFromName('flowlens-global-v1'));
    const result = await stub.fetch(new Request('https://usage.internal/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, now: Date.now() }) }));
    if (!result.ok) return json({ error: 'Usage tracking is temporarily unavailable.' }, 503);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch { return json({ error: 'Usage tracking is temporarily unavailable.' }, 503); }
}

async function sameToken(value: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([value, expected].map(text => crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
  const left = new Uint8Array(a), right = new Uint8Array(b);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function readUsageStats(request: Request, env: UsageEnv): Promise<Response> {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
  if (!env.ANALYTICS_ADMIN_TOKEN || env.ANALYTICS_ADMIN_TOKEN.length < 24) return json({ error: 'Set the ANALYTICS_ADMIN_TOKEN secret in Cloudflare to enable this dashboard.' }, 503);
  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token || token.length > 256 || !await sameToken(token, env.ANALYTICS_ADMIN_TOKEN)) return json({ error: 'Invalid admin password.' }, 401);
  const range = new URL(request.url).searchParams.get('range') ?? 'all';
  if (!['all', 'today', '7d', '30d'].includes(range)) return json({ error: 'Invalid range.' }, 400);
  if (!env.USAGE_ANALYTICS) return json({ error: 'Usage storage is not configured.' }, 503);
  try {
    const stub = env.USAGE_ANALYTICS.get(env.USAGE_ANALYTICS.idFromName('flowlens-global-v1'));
    const result = await stub.fetch(new Request('https://usage.internal/stats?range=' + range));
    if (!result.ok) return json({ error: 'Statistics are temporarily unavailable.' }, 503);
    return new Response(await result.text(), { headers: { ...NO_STORE, 'Content-Type': 'application/json' } });
  } catch { return json({ error: 'Statistics are temporarily unavailable.' }, 503); }
}
