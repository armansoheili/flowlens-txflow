export const USAGE_ACTIONS = ['page_view', 'search_start', 'search_success', 'search_error'] as const;
export type UsageAction = typeof USAGE_ACTIONS[number];
export type UsageSource = 'page' | 'manual' | 'sample' | 'deep_link';
export type UsageEvent = {
  eventId: string;
  visitorId: string;
  action: UsageAction;
  network?: 'mainnet' | 'testnet';
  source: UsageSource;
};

export function parseUsageEvent(value: unknown): UsageEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (Object.keys(p).some(key => !['eventId', 'visitorId', 'action', 'network', 'source'].includes(key))) return null;
  if (typeof p.eventId !== 'string' || !/^[a-f0-9]{32}$/.test(p.eventId)) return null;
  if (typeof p.visitorId !== 'string' || !/^[a-f0-9]{32}$/.test(p.visitorId)) return null;
  if (!(USAGE_ACTIONS as readonly unknown[]).includes(p.action)) return null;
  if (!['page', 'manual', 'sample', 'deep_link'].includes(p.source as string)) return null;
  if (p.action === 'page_view') {
    if (p.source !== 'page' || p.network !== undefined) return null;
  } else if (p.source === 'page' || !['mainnet', 'testnet'].includes(p.network as string)) return null;
  return p as UsageEvent;
}
