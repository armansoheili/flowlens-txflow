export const API_VERSION = "2026-08-16";
export const PAGE_SIZE = 500;
export const MAX_OFFSET = 200000;
export const SAMPLE_WALLET = "0x091564806dce41ffeebafbc417e73b6849b1c29e";
export const PERIODS = ["ALLTIME", "7D", "30D", "90D"] as const;
export type Period = typeof PERIODS[number];
export type Network = "mainnet" | "testnet";
export type Fill = {
  coin: string; symbol?: string; px: string; sz: string; side: string;
  time: number; closedPnl?: string; fee?: string; feeToken?: string;
  builderFee?: string; hash?: string; oid?: number | string;
  tid?: number | string; instrumentId?: number; tradeSide?: string; dir?: string;
};
export type Ledger = { time: number; hash?: string; delta: {type: string; amount?: string; status?: string; chain?: string; [key: string]: unknown} };
export type Page<T> = {data: T[]; hasMore: boolean; total?: number};
export type Overview = {volume: string; pnl: string; roe: string; totalEquity: string; maxDrawdown: string};
export type VolumeRanking = {
  status: 'ranked'|'unranked'|'unavailable'|'unsupported';
  rank: number|null; total: number|null; topPercent: number|null;
  volume: string|null; asOf: number|null; period: string|null;
};
export type Report = {
  address: string; network: Network; period: Period; end: number;
  overview: Overview | null; fills: Page<Fill>; ledger: Page<Ledger> | null;
  warnings: string[]; fetchedAt: number; ranking: VolumeRanking;
};

export function emptyRanking(status:VolumeRanking['status'],period:string|null=null):VolumeRanking {
  return {status,rank:null,total:null,topPercent:null,volume:null,asOf:null,period};
}

export function parseRanking(cohort:Record<string,unknown>, filtered:Record<string,unknown>, address:string, period:string):VolumeRanking {
  const all=cohort.data as {total?:number;lastUpdated?:number}|undefined;
  const own=filtered.data as {data?:{rank?:number;userName?:string;volume?:string}[];lastUpdated?:number}|undefined;
  if(!all||!own||!Number.isSafeInteger(all.total)||all.total!<0||!Array.isArray(own.data)||!Number.isSafeInteger(all.lastUpdated)||all.lastUpdated!==own.lastUpdated)throw new ApiError('Leaderboard snapshots could not be reconciled.');
  const row=own.data.find(r=>r.userName?.toLowerCase()===address.toLowerCase());
  if(!row)return {...emptyRanking('unranked',period),total:all.total!,asOf:all.lastUpdated!};
  if(!Number.isSafeInteger(row.rank)||row.rank!<1||row.rank!>all.total!||typeof row.volume!=='string'||!Number.isFinite(Number(row.volume))||Number(row.volume)<0)throw new ApiError('Invalid volume leaderboard data.');
  return {status:'ranked',rank:row.rank!,total:all.total!,topPercent:row.rank!/all.total!*100,volume:row.volume,asOf:all.lastUpdated!,period};
}

export async function getVolumeRanking(network:Network,address:string,period:Period,fetcher:typeof fetch=fetch):Promise<VolumeRanking> {
  // These public, read-only parameters are the ones used by TXFLOW's official leaderboard.
  if(period==='90D')return emptyRanking('unsupported');
  const p=period.toLowerCase();
  const base={type:'growthGeneralPublic',interface:'/uapi/v1/leaderboard/getOverview',period:p,sortBy:'volume',sortDirection:'desc',offset:0,limit:1};
  for(let attempt=0;attempt<2;attempt++){
    try{
      const [all,own]=await Promise.all([rpcRead(network,{...base,queryAddress:''},fetcher),rpcRead(network,{...base,queryAddress:address},fetcher)]);
      return parseRanking(all,own,address,p);
    }catch{if(attempt===1)return emptyRanking('unavailable',p);}
  }
  return emptyRanking('unavailable',p);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

export function windowStart(period: Period, end: number) {
  return period === "ALLTIME" ? undefined : end - Number(period.slice(0,-1)) * 86400000;
}

export async function rpcRead(network: Network, body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const host = network === "mainnet" ? "https://rpc.txflow.com" : "https://rpc.txflow-testnet.xyz";
  let response: Response;
  try {
    response = await fetcher(host + "/info", {
      method: "POST",
      headers: {"Content-Type":"application/json", "x-api-version":API_VERSION, "User-Agent":"FlowLens/1.0"},
      body: JSON.stringify(body), signal: AbortSignal.timeout(18000),
    });
  } catch { throw new ApiError("Could not connect to the official TXFLOW API. Please try again shortly."); }
  if (!response.ok) {
    if (response.status === 429) throw new ApiError("TXFLOW rate limit reached. Please try again shortly.", 429);
    throw new ApiError(`The official TXFLOW API returned HTTP ${response.status}. Data is temporarily unavailable.`);
  }
  let json: Record<string,unknown>;
  try { json = await response.json() as Record<string,unknown>; }
  catch { throw new ApiError("The official API returned an unreadable response."); }
  if (json.success === false || (json.code !== undefined && json.code !== 0)) {
    throw new ApiError("The official API could not return this information. Please try again later.");
  }
  return json;
}

export function parsePage<T>(json: Record<string,unknown>): Page<T> {
  const page = json.data as Partial<Page<T>> | undefined;
  if (!page || !Array.isArray(page.data) || typeof page.hasMore !== "boolean") {
    throw new ApiError("The API history format has changed. No metrics were calculated from this response.");
  }
  return {data: page.data, hasMore: page.hasMore, ...(typeof page.total === "number" ? {total:page.total} : {})};
}

export async function historyPage<T>(network: Network, address: string, period: Period, end: number, kind: "fills"|"ledger", offset=0): Promise<Page<T>> {
  const start = windowStart(period,end);
  const body = {
    type: kind === "fills" ? "userFills" : "userNonFundingLedgerUpdates",
    user: address, limit:PAGE_SIZE, offset, endTimeMs:end,
    ...(start === undefined ? {} : {startTimeMs:start}),
    ...(kind === "fills" ? {accountType:["perp"]} : {deltaTypes:["deposit","withdraw"]}),
  };
  return parsePage<T>(await rpcRead(network,body));
}

export async function getReport(network: Network, address: string, period: Period, end: number): Promise<Report> {
  const [fills,overview,ledger,ranking] = await Promise.allSettled([
    historyPage<Fill>(network,address,period,end,"fills"),
    rpcRead(network,{type:"userOverview", user_address:address, period}),
    historyPage<Ledger>(network,address,period,end,"ledger"),
    getVolumeRanking(network,address,period),
  ]);
  if(fills.status === "rejected") throw fills.reason;
  const warnings: string[] = [];
  let summary: Overview | null = null;
  if(overview.status === "fulfilled") {
    const o = overview.value;
    if(["volume","pnl","totalEquity"].every(k=>typeof o[k]==="string" && Number.isFinite(Number(o[k])))) summary=o as unknown as Overview;
    else warnings.push("Account summary is unavailable. Trading volume is calculated from retrieved fills.");
  } else warnings.push("Account summary could not be loaded. Trading volume is calculated from retrieved fills.");
  if(ledger.status === "rejected") warnings.push("Deposit and withdrawal history is temporarily unavailable.");
  return {address,network,period,end,overview:summary,fills:fills.value,ledger:ledger.status==="fulfilled"?ledger.value:null,warnings,fetchedAt:Date.now(),ranking:ranking.status==='fulfilled'?ranking.value:emptyRanking('unavailable')};
}

// Decimal arithmetic avoids accumulating binary floating-point errors in money totals.
const SCALE = 10n ** 18n;
function fixed(value: string | undefined): bigint {
  if(!value || !/^-?\d+(\.\d+)?$/.test(value)) return 0n;
  const sign = value.startsWith("-") ? -1n : 1n;
  const [whole, decimal=""] = value.replace(/^-/,'').split('.');
  return sign * (BigInt(whole)*SCALE + BigInt((decimal+'0'.repeat(18)).slice(0,18)));
}
function fromFixed(value: bigint) { const sign=value<0n?'-':'';const n=value<0n?-value:value;return Number(sign+String(n/SCALE)+'.'+String(n%SCALE).padStart(18,'0')); }
export function notional(fill: Fill) { const n = fixed(fill.px)*fixed(fill.sz)/SCALE; return fromFixed(n<0n?-n:n); }

export function appendPage<T>(previous: Page<T>, next: Page<T>): Page<T> {
  // Advance cursors by source-row count; deduplication belongs in metric calculation.
  return {data:[...previous.data,...next.data],hasMore:next.hasMore,total:next.total??previous.total};
}

export function uniqueFills(fills: Fill[]): Fill[] {
  const keys=new Set<string>();
  return fills.filter(f=>{
    const instrument=f.instrumentId??f.symbol??f.coin;
    const key=f.tid!==undefined ? `${instrument}:${f.tid}` : JSON.stringify([instrument,f.oid,f.time,f.px,f.sz,f.side,f.hash]);
    if(keys.has(key))return false;
    keys.add(key);return true;
  });
}

export function summarize(fills: Fill[]) {
  const rows=uniqueFills(fills);
  let volume=0n,fees=0n,closedPnl=0n,makers=0,takers=0,otherFeeCount=0;
  let first:number|null=null,last:number|null=null;
  const days=new Set<string>(), markets=new Map<string,{name:string;volume:number;count:number}>(), orders=new Set<string>(), hashes=new Set<string>();
  for(const f of rows) {
    let v=fixed(f.px)*fixed(f.sz)/SCALE; if(v<0n)v=-v; volume+=v;
    if(f.feeToken==='USDC') fees+=fixed(f.fee); else if(f.fee && fixed(f.fee)!==0n)otherFeeCount++;
    closedPnl+=fixed(f.closedPnl);
    if(f.tradeSide==='Maker')makers++;if(f.tradeSide==='Taker')takers++;
    if(Number.isFinite(f.time)){days.add(new Date(f.time).toISOString().slice(0,10));first=first===null?f.time:Math.min(first,f.time);last=last===null?f.time:Math.max(last,f.time);}
    const name=f.symbol??f.coin;const id=String(f.instrumentId??name);
    const market=markets.get(id)??{name,volume:0,count:0};market.volume+=fromFixed(v);market.count++;markets.set(id,market);
    if(f.oid!==undefined)orders.add(String(f.oid));
    if(f.hash && /^0x[a-fA-F0-9]{64}$/.test(f.hash)) hashes.add(f.hash);
  }
  return {rows,volume:fromFixed(volume),fees:fromFixed(fees),closedPnl:fromFixed(closedPnl),activeDays:days.size,days:[...days].sort(),markets:[...markets.values()].sort((a,b)=>b.volume-a.volume),orders:orders.size,hashes:hashes.size,hashCoverage:rows.filter(f=>f.hash && /^0x[a-fA-F0-9]{64}$/.test(f.hash)).length,makers,takers,otherFeeCount,first,last};
}
