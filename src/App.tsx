"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Clipboard, Clock3, Copy, Download, ExternalLink, Fingerprint, Globe2, LayoutDashboard, Loader2, Trophy, Search, ShieldCheck, Sparkles, Wallet, X } from "lucide-react";
import { appendPage, MAX_OFFSET, notional, SAMPLE_WALLET, summarize } from "../lib/txflow";
import type { Fill, Ledger, Network, Page, Period, Report, VolumeRanking } from "../lib/txflow";

const money=(value:number,decimals=2)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:decimals}).format(value);
const metricMoney=(value:number)=>Math.abs(value)>=1e6?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:2}).format(value):money(value);
const number=(value:number)=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value);
const date=(value:number|null,short=false)=>value===null?'—':new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',...(short?{}:{year:'numeric'}),timeZone:'UTC'}).format(value);
const shortAddress=(address:string)=>address.slice(0,6)+'…'+address.slice(-4);
const periodLabels:Record<Period,string>={ALLTIME:'All time','7D':'7D','30D':'30D','90D':'90D'};
const palette=['#7cff6b','#47b96c','#a9ecc4','#82a291','#52665b'];

function Logo(){return <span className="brand"><img src="/brand/txflow-logo.png" width="160" height="28" alt="TXFLOW"/><small>WALLET ANALYTICS <span>by FlowLens</span></small></span>}

function VolumeChart({fills,end,period,hasReport}:{fills:Fill[];end:number;period:Period;hasReport:boolean}){
  const [selected,setSelected]=useState<number|null>(null);
  const bins=useMemo(()=>{
    const span=period==='7D'?7:period==='30D'?30:period==='90D'?90:Math.max(30,Math.ceil((end-(fills.length?Math.min(...fills.slice(-2000).map(f=>f.time)):end))/86400000));
    const count=Math.min(30,span),step=span*86400000/count,start=end-span*86400000;
    const result=Array.from({length:count},(_,i)=>({time:start+i*step,volume:0,count:0}));
    fills.forEach(f=>{const i=Math.min(count-1,Math.floor((f.time-start)/step));if(i>=0){result[i].volume+=notional(f);result[i].count++;}});
    return result;
  },[fills,end,period]);
  const max=Math.max(1,...bins.map(b=>b.volume));
  const active=selected===null?null:bins[selected];
  return <div className="chart-wrap" dir="ltr">
    <div className="chart-tooltip" aria-live="polite">{active?<><b>{money(active.volume)}</b><span>{date(active.time,true)} · {number(active.count)} fills</span></>:<><span className="legend-dot"/> <span>Executed notional · USDC</span></>}</div>
    <div className="chart-main">
      <div className="chart-axis">{[1,.75,.5,.25,0].map(n=><span key={n}>{hasReport?new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(max*n):'—'}</span>)}</div>
      <div className="chart-plot">
        <div className="grid-lines">{[0,1,2,3,4].map(n=><i key={n}/>)}</div>
        <div className="bars">{bins.map((b,i)=><button key={i} className={'bar-slot '+(selected===i?'selected':'')} aria-label={`${date(b.time)}: ${money(b.volume)}, ${b.count} fills`} onMouseEnter={()=>setSelected(i)} onMouseLeave={()=>setSelected(null)} onFocus={()=>setSelected(i)} onBlur={()=>setSelected(null)}><span style={{height: b.volume?`${Math.max(2,b.volume/max*100)}%`:'2px'}} className={b.volume?'filled-bar':'zero-bar'}/></button>)}</div>
        {!hasReport&&<div className="chart-empty"><BarChart3 size={30}/><p>Your trading journey, at a glance</p><span>Search a wallet to bring its trading history into view.</span></div>}
        {hasReport&&!fills.length&&<div className="chart-empty"><Activity size={27}/><p>No trades in this time range</p><span>Try a different time range or network.</span></div>}
      </div>
    </div>
    <div className="chart-dates"><span>{date(bins[0].time,true)}</span><span>{date(bins[Math.floor(bins.length/2)].time,true)}</span><span>{date(end,true)}</span></div>
  </div>
}

function MarketDonut({markets}:{markets:{name:string;volume:number;count:number}[]}){
  const total=markets.reduce((s,m)=>s+m.volume,0);
  const slices=markets.slice(0,4);
  if(markets.length>4)slices.push({name:'Other markets',volume:markets.slice(4).reduce((s,m)=>s+m.volume,0),count:0});
  let offset=0;
  return <><div className="donut-box"><svg viewBox="0 0 180 180" role="img" aria-label="Market share of retrieved trading volume"><circle cx="90" cy="90" r="69" fill="none" stroke="#252c28" strokeWidth="16"/>{slices.map((s,i)=>{const percent=s.volume/total*100;const node=<circle key={s.name} cx="90" cy="90" r="69" pathLength="100" fill="none" stroke={palette[i]} strokeWidth="16" strokeDasharray={`${Math.max(0,percent-.8)} ${100-percent+.8}`} strokeDashoffset={-offset} transform="rotate(-90 90 90)"/>;offset+=percent;return node;})}</svg><div className="donut-label"><strong>{markets.length?number(markets.length):'—'}</strong><span>markets traded</span></div></div><div className="market-list">{slices.length?slices.map((m,i)=><div key={m.name}><span><i style={{background:palette[i]}}/><b dir="auto">{m.name.replace('-USDC','')}</b></span><span dir="ltr">{number(m.volume/total*100)}<small>%</small></span></div>):<p className="muted center">Your market breakdown will appear here.</p>}</div></>
}

function RankingCircle({ranking,hasReport}:{ranking:VolumeRanking|undefined;hasReport:boolean}){
  const ranked=ranking?.status==='ranked';
  const percent=ranked?Math.ceil(ranking.topPercent!*100)/100:null;
  const progress=ranked?100-ranking.topPercent!:0;
  const caption=!hasReport?'Your next milestone starts here.':ranking?.status==='unranked'?'This wallet is not in the ranked cohort.':ranking?.status==='unsupported'?'Choose All time, 30D or 7D for rankings.':ranking?.status==='unavailable'?'The official leaderboard is temporarily unavailable.':'Your position among ranked traders.';
  return <section className="panel rank-panel" id="standing" aria-label="Volume percentile ranking"><div className="panel-heading"><div><h2>Your volume standing</h2><p>Official TXFLOW leaderboard</p></div><Trophy size={19}/></div><div className={'rank-orbit '+(ranked?'ranked':'')}><svg viewBox="0 0 260 260" role="img" aria-label={ranked?`Top ${percent}% by volume. Rank ${ranking.rank} of ${ranking.total} traders.`:'Volume percentile unavailable until ranked data is available'}><defs><linearGradient id="rank-green" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7cff6b"/><stop offset="100%" stopColor="#37ab53"/></linearGradient></defs><circle cx="130" cy="130" r="115" fill="none" stroke="#354036" strokeWidth="2" strokeDasharray="1 9.5"/><circle cx="130" cy="130" r="95" fill="none" stroke="#202923" strokeWidth="12"/><circle cx="130" cy="130" r="95" fill="none" stroke="url(#rank-green)" strokeWidth="12" pathLength="100" strokeDasharray={`${progress} ${100-progress}`} transform="rotate(-90 130 130)" strokeLinecap="round"/></svg><div className="rank-center"><img src="/brand/txflow-icon.svg" width="32" height="32" alt=""/><span>{ranked?'YOU ARE IN THE TOP':'VOLUME STANDING'}</span><strong>{percent!==null?`${number(percent)}%`:'—'}</strong><small>{ranked?'of ranked traders':!hasReport?'Waiting for your wallet':ranking?.status==='unranked'?'Not ranked':'Not available'}</small></div></div><p className="rank-caption">{ranked?<><strong>#{number(ranking.rank!)}</strong> of <b>{number(ranking.total!)}</b> ranked traders</>:caption}</p>{ranked&&<div className="rank-source"><span>Leaderboard volume <b>{money(Number(ranking.volume))}</b></span><span>Snapshot {date(ranking.asOf)} · {new Date(ranking.asOf!).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} UTC</span></div>}<a className="rank-link" href={`https://app.txflow.com/leaderboard?period=${ranking?.period??'alltime'}&sortBy=volume&sortDirection=desc`} target="_blank" rel="noreferrer">View official leaderboard<ArrowUpRight size={14}/></a></section>
}

function ActivityMap({fills,end}:{fills:Fill[];end:number}){
  const counts=new Map<string,number>();
  fills.forEach(f=>{const d=new Date(f.time).toISOString().slice(0,10);counts.set(d,(counts.get(d)??0)+1)});
  const dayEnd=Math.floor(end/86400000)*86400000;
  return <div className="heatmap-wrap"><div className="heatmap" dir="ltr">{Array.from({length:84},(_,i)=>{const t=dayEnd-(83-i)*86400000;const c=counts.get(new Date(t).toISOString().slice(0,10))??0;return <span key={i} tabIndex={0} title={`${date(t)}: ${number(c)} fills`} aria-label={`${date(t)}: ${number(c)} fills`} style={{background:c===0?'#242a26':c<3?'#285c34':c<8?'#43a956':'#7cff6b'}}/>})}</div><div className="heatmap-label"><span>Last 12 weeks · UTC</span><div><span>Less</span>{['#242a26','#285c34','#43a956','#7cff6b'].map(c=><i key={c} style={{background:c}}/>)}<span>More</span></div></div></div>
}

async function requestData<T>(params:Record<string,string>,signal:AbortSignal):Promise<T>{
  const response=await fetch('/api/wallet?'+new URLSearchParams(params),{signal});
  let json:Record<string,unknown>;
  try{json=await response.json() as Record<string,unknown>}catch{throw new Error('The server returned an unreadable response. Please try again.')}
  if(!response.ok)throw new Error(typeof json.error==='string'?json.error:'Could not retrieve wallet data.');
  return json as T;
}

export default function Home(){
  const [address,setAddress]=useState('');
  const [network,setNetwork]=useState<Network>('mainnet');
  const [period,setPeriod]=useState<Period>('ALLTIME');
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(false);
  const [scanning,setScanning]=useState(false);
  const [error,setError]=useState('');
  const [scanError,setScanError]=useState('');
  const [guide,setGuide]=useState(false);
  const [copied,setCopied]=useState('');
  const [tab,setTab]=useState<'fills'|'ledger'>('fills');
  const [filter,setFilter]=useState('all');
  const [page,setPage]=useState(0);
  const controller=useRef<AbortController|null>(null);
  const guideRef=useRef<HTMLDialogElement|null>(null);
  const stats=useMemo(()=>summarize(report?.fills.data??[]),[report?.fills.data]);
  const isPartial=report?.fills.hasMore??false;
  const rows=stats.rows.filter(f=>filter==='all'||(f.symbol??f.coin)===filter);
  const displayed=tab==='fills'?rows:report?.ledger?.data??[];
  const totalPages=Math.max(1,Math.ceil(displayed.length/8));
  const volume=stats.volume;
  const volumeMismatch=!!report?.overview&&!isPartial&&Math.abs(Number(report.overview.volume)-stats.volume)>.02;
  const fillsCount=report?.fills.total??stats.rows.length;

  useEffect(()=>{if(guide){guideRef.current?.showModal()}else{guideRef.current?.close()}},[guide]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);const a=params.get('address');if(a&&/^0x[a-fA-F0-9]{40}$/.test(a)){const n=params.get('network')==='testnet'?'testnet':'mainnet';const p=['7D','30D','90D'].includes(params.get('period')??'')?params.get('period') as Period:'ALLTIME';setAddress(a);setNetwork(n);setPeriod(p);void run(a,n,p);}return()=>controller.current?.abort();},[]); // initial deep link only

  async function scanMore(base:Report,signal:AbortSignal,kind:'fills'|'ledger'='fills'){
    let current=base;
    const initial=kind==='fills'?current.fills:current.ledger;
    if(!initial)return;
    const stopAt=initial.data.length+20000;
    setScanning(true);setScanError('');
    try{
      while((kind==='fills'?current.fills:current.ledger)?.hasMore){
        const cursor=(kind==='fills'?current.fills:current.ledger)!.data.length;
        if(cursor>MAX_OFFSET||cursor>=stopAt)break;
        const next=await requestData<Page<Fill|Ledger>>({address:current.address,network:current.network,period:current.period,end:String(current.end),kind,offset:String(cursor)},signal);
        if(next.hasMore&&!next.data.length)throw new Error('The API reports more history, but returned an empty page. This report is incomplete.');
        current=kind==='fills'?{...current,fills:appendPage(current.fills,next as Page<Fill>)}:{...current,ledger:appendPage(current.ledger!,next as Page<Ledger>)};
        if(!signal.aborted)setReport(current);
      }
    }catch(e){if(!signal.aborted)setScanError(e instanceof Error?e.message:'Could not load the remaining history.');}
    finally{if(!signal.aborted)setScanning(false)}
  }

  async function run(a=address,n=network,p=period){
    const cleaned=a.trim();
    if(!/^0x[a-fA-F0-9]{40}$/.test(cleaned)){setError('Enter a valid wallet address: 0x followed by 40 hexadecimal characters.');return;}
    controller.current?.abort();const c=new AbortController();controller.current=c;
    setLoading(true);setScanning(false);setReport(null);setError('');setScanError('');setPage(0);setFilter('all');
    try{
      const r=await requestData<Report>({address:cleaned,network:n,period:p},c.signal);
      if(c.signal.aborted)return;
      setReport(r);setLoading(false);
      const url=new URL(window.location.href);url.search=new URLSearchParams({address:cleaned.toLowerCase(),network:n,period:p}).toString();window.history.replaceState({},'',url);
      await scanMore(r,c.signal);
    }catch(e){if(!c.signal.aborted){setError(e instanceof Error?e.message:'Could not retrieve wallet data.');setLoading(false)}}
  }

  function changePeriod(p:Period){setPeriod(p);setPage(0);if(report)void run(report.address,report.network,p)}
  function sample(){setAddress(SAMPLE_WALLET);setNetwork('testnet');void run(SAMPLE_WALLET,'testnet',period)}
  async function copy(value:string,key:string){try{await navigator.clipboard.writeText(value);setCopied(key);setTimeout(()=>setCopied(''),2000)}catch{setError('Copy failed. Please copy the address manually.')}}
  async function paste(){try{setAddress((await navigator.clipboard.readText()).trim());setError('')}catch{document.getElementById('wallet-address')?.focus();setError('Paste the address with Ctrl+V or your device menu.')}}
  function exportCsv(){if(!report)return;const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+@\t\r]/,"'$&").replaceAll('"','""')+'"';const header=tab==='fills'?['time_UTC','market','side','price','size','notional_USDC','fee','fee_token','closed_pnl_USDC','transaction_hash','order_id','fill_id']:['time_UTC','type','amount','chain','status','hash'];const data=tab==='fills'?rows.map(f=>[new Date(f.time).toISOString(),f.symbol??f.coin,f.side,f.px,f.sz,notional(f),f.fee,f.feeToken,f.closedPnl,f.hash,f.oid,f.tid]):(report.ledger?.data??[]).map(l=>[new Date(l.time).toISOString(),l.delta.type,l.delta.amount,l.delta.chain,l.delta.status,l.hash]);const csv='\uFEFF'+[header,...data].map(r=>r.map(cell).join(',')).join('\r\n');const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));link.download=`flowlens-${report.network}-${report.address}-${tab}-${report.period}${(tab==='fills'?report.fills.hasMore:report.ledger?.hasMore)?'-partial':''}.csv`;link.click();URL.revokeObjectURL(link.href)}
  function continueHistory(){if(!report||scanning)return;controller.current?.abort();const c=new AbortController();controller.current=c;void scanMore(report,c.signal,tab)}

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="logo-link" href="#top" aria-label="TXFLOW wallet analytics home"><Logo/></a>
      <div className="sidebar-caption">YOUR WORKSPACE</div>
      <nav aria-label="Main navigation"><a className="nav-item active" href="#overview"><LayoutDashboard size={19}/>Overview<span className="nav-indicator"/></a><a className="nav-item" href="#standing"><Trophy size={19}/>Your standing</a><a className="nav-item" href="#history"><Activity size={19}/>Activity history</a><button className="nav-item" onClick={()=>setGuide(true)}><CircleHelp size={19}/>About the data<ArrowUpRight size={15}/></button></nav>
      <div className="sidebar-note"><span className="note-icon"><Fingerprint size={23}/></span><h3>An address is all it takes.</h3><p>Explore public wallet activity. No wallet connection or signature needed.</p><span><ShieldCheck size={13}/>Read-only analytics</span></div>
      <div className="sidebar-bottom"><a href="https://docs.txflow.com/api" target="_blank" rel="noreferrer">TXFLOW documentation<ExternalLink size={14}/></a><span><i/>Built for the onchain curious</span></div>
    </aside>

    <main id="top" className="main">
      <header className="topbar"><div className="mobile-brand"><Logo/></div><div className="breadcrumb"><span>FlowLens</span><ChevronRight size={13}/><b>TXFLOW</b></div><div className="topbar-right"><span className="network-label"><img className="network-mark" src="/brand/txflow-icon.svg" width="26" height="26" alt=""/>TXFLOW L1</span><span className="top-divider"/><button className="help-button" onClick={()=>setGuide(true)} aria-label="Data methodology"><CircleHelp size={19}/></button></div></header>

      <section className="hero" id="overview"><div><div className="eyebrow"><span/> TXFLOW WALLET CHECKER</div><h1>Your wallet. <span>In full view.</span></h1><p>Trading volume, activity and your place on TXFLOW. One address, a clearer picture.</p></div><div className="hero-stamp" aria-hidden="true"><img src="/brand/txflow-icon.svg" width="82" height="82" alt=""/><span>PUBLIC DATA.<br/>CLEAR PICTURE.</span></div></section>

      <section className="search-panel" aria-label="Wallet address search"><form onSubmit={e=>{e.preventDefault();void run()}}><label htmlFor="wallet-address">Public wallet address</label><div className="search-row"><div className={'address-field '+(error?'has-error':'')}><Search size={20}/><input id="wallet-address" value={address} onChange={e=>{setAddress(e.target.value);setError('')}} placeholder="0x…" dir="ltr" autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby="address-help address-error"/><button type="button" className="icon-button" onClick={()=>void paste()} aria-label="Paste address"><Clipboard size={17}/></button></div><select className="network-select" value={network} onChange={e=>setNetwork(e.target.value as Network)} aria-label="Choose network"><option value="mainnet">Mainnet</option><option value="testnet">Testnet</option></select><button className="primary-button" type="submit" disabled={loading}>{loading?<Loader2 size={18} className="spin"/>:<Search size={17}/>} {loading?'Analyzing…':'Analyze wallet'}{!loading&&<ArrowRight size={17}/>}</button></div><div className="search-bottom"><span id="address-help"><ShieldCheck size={14}/>No wallet connection. No signature.</span><button type="button" onClick={sample} disabled={loading}><Sparkles size={14}/>Explore a real testnet wallet<ArrowUpRight size={13}/></button></div>{error&&<p id="address-error" className="error-message" role="alert">{error}</p>}</form></section>

      <div className="report-heading"><div><h2>Wallet overview</h2>{report?<><span className={'pill '+(report.network==='testnet'?'testnet':'')}><i/>{report.network==='testnet'?'Testnet data':'Mainnet data'}</span><span className="scope-label">Perpetuals</span></>:<span className="scope-label">Perpetual trading</span>}</div><div className="period-picker" aria-label="Time range">{(['ALLTIME','90D','30D','7D'] as Period[]).map(p=><button key={p} aria-pressed={period===p} className={period===p?'selected':''} disabled={loading||scanning} onClick={()=>changePeriod(p)}>{periodLabels[p]}</button>)}</div></div>
      {report&&<div className="wallet-strip"><div><span className="wallet-avatar"><Wallet size={16}/></span><span dir="ltr" className="mono">{shortAddress(report.address)}</span><button className="small-icon" onClick={()=>void copy(report.address,'address')} aria-label="Copy address">{copied==='address'?<Check size={14}/>:<Copy size={14}/>}</button></div><span className="sync-status">{scanning?<><Loader2 size={13} className="spin"/>Syncing history · {number(stats.rows.length)} fills</>:<><CheckCheck size={14}/>{date(report.fetchedAt)} · {new Date(report.fetchedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})} UTC</>}</span><button className="share-link" onClick={()=>void copy(window.location.href,'share')}>{copied==='share'?<Check size={13}/>:<Copy size={13}/>} {copied==='share'?'Link copied':'Share report'}</button></div>}
      {report?.network==='testnet'&&<div className="info-banner"><Globe2 size={16}/><span>You are viewing testnet activity. Switch to Mainnet to check real trading activity.</span></div>}
      {(isPartial||scanError||report?.warnings.length||volumeMismatch)?<div className="warning-banner" role="status"><CircleHelp size={17}/><div>{isPartial&&<p>History is still loading. Volume, fees, charts, active days and markets are based on {number(stats.rows.length)} retrieved fills. Volume is currently a lower bound.</p>}{volumeMismatch&&<p>The official account summary (<b dir="ltr">{money(Number(report!.overview!.volume))}</b>) differs from the returned fills. This report calculates volume from fills; the API does not explain the difference.</p>}{scanError&&<p>{scanError}</p>}{report?.warnings.map(w=><p key={w}>{w}</p>)}</div></div>:null}

      <section className={'stats-grid '+(loading?'is-loading':'')} aria-label="Wallet statistics" aria-busy={loading}>
        <article className="stat-card featured"><div className="stat-top"><span>Trading volume</span><ArrowUpRight size={20}/></div><strong dir="ltr" title={report?money(volume):undefined}>{report?`${isPartial?'≥ ':''}${metricMoney(volume)}`:'$ —'}</strong><div className="stat-bottom"><span>Sum of price × size · USDC</span><BarChart3 size={17}/></div></article>
        <article className="stat-card"><div className="stat-top"><span>Trade executions</span><Activity size={19}/></div><strong dir="ltr">{report?`${isPartial&&report.fills.total===undefined?'≥ ':''}${number(fillsCount)}`:'—'}</strong><div className="stat-bottom"><span>Every execution counts as one fill</span><span className="tiny-label">FILLS</span></div></article>
        <article className="stat-card"><div className="stat-top"><span>Active days</span><Clock3 size={19}/></div><strong dir="ltr">{report?`${isPartial?'≥ ':''}${number(stats.activeDays)}`:'—'}<small>{report?'days':''}</small></strong><div className="stat-bottom"><span>Days with executed trades · UTC</span><span className="tiny-label">ACTIVITY</span></div></article>
        <article className="stat-card"><div className="stat-top"><span>Trading fees</span><Wallet size={19}/></div><strong dir="ltr">{report?metricMoney(stats.fees):'$ —'}</strong><div className="stat-bottom"><span>Trade fees denominated in USDC</span><span className="tiny-label">FEES</span></div></article>
      </section>

      <div className="analytics-grid"><section className="panel volume-panel"><div className="panel-heading"><div><h2>Volume over time</h2><p>Your executed volume over time</p></div><span className="quiet-tag">{periodLabels[period]}<BarChart3 size={13}/></span></div><VolumeChart fills={stats.rows} end={report?.end??Date.now()} period={period} hasReport={!!report}/></section><RankingCircle ranking={report?.ranking} hasReport={!!report}/></div>

      <div className="secondary-grid"><section className="panel activity-panel"><div className="panel-heading"><div><h2>Activity pulse</h2><p>One square. One day of trading.</p></div><span className="quiet-tag">{report?number(stats.activeDays):'—'} active days in range</span></div><ActivityMap fills={stats.rows} end={report?.end??Date.now()}/></section><section className="panel market-panel"><div className="panel-heading"><div><h2>Market breakdown</h2><p>Share of retrieved trading volume</p></div><span className="square-icon"><Globe2 size={18}/></span></div><MarketDonut markets={stats.markets}/></section><section className="panel performance-panel"><div className="performance-header"><span>Account PnL</span><span className="square-icon"><ArrowUpRight size={17}/></span></div><strong dir="ltr" className={report&&Number(report.overview?.pnl??stats.closedPnl)<0?'negative':'positive'}>{report?metricMoney(Number(report.overview?.pnl??stats.closedPnl)):'$ —'}</strong><div className="performance-details"><span>{report?.overview?'Official account summary for this period':'Sum of retrieved closed PnL'}</span><b>Current equity <span dir="ltr">{report?.overview?money(Number(report.overview.totalEquity)):'—'}</span></b></div></section></div>

      <section className="panel detail-metrics" aria-label="More wallet insights"><div><span>Unique trade transactions</span><strong dir="ltr">{report?(stats.hashCoverage===0&&stats.rows.length?'—':`${isPartial||stats.hashCoverage<stats.rows.length?'≥ ':''}${number(stats.hashes)}`):'—'}</strong><small>Fills with a valid transaction hash</small></div><div><span>Executed orders</span><strong dir="ltr">{report?`${isPartial?'≥ ':''}${number(stats.orders)}`:'—'}</strong><small>Unique order IDs in retrieved history</small></div><div><span>First retrieved trade</span><strong className="date-metric">{date(stats.first)}</strong><small>{isPartial?'Earlier activity may exist':'In available API history'}</small></div><div><span>Latest retrieved trade</span><strong className="date-metric">{date(stats.last)}</strong><small>Selected time range · UTC</small></div></section>

      <section id="history" className="panel history-panel"><div className="history-heading"><div><h2>Activity explorer</h2><p>Every fill, right here. Filter, inspect, export.</p></div><button className="secondary-button" onClick={exportCsv} disabled={!report||!displayed.length}><Download size={15}/>Export CSV</button></div><div className="table-toolbar"><div className="table-tabs"><button className={tab==='fills'?'selected':''} onClick={()=>{setTab('fills');setPage(0)}}>Trades<span>{report?number(fillsCount):'—'}</span></button><button className={tab==='ledger'?'selected':''} onClick={()=>{setTab('ledger');setPage(0)}}>Deposits & withdrawals</button></div>{tab==='fills'&&<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0)}} aria-label="Filter market"><option value="all">All markets</option>{stats.markets.map(m=><option key={m.name} value={m.name}>{m.name}</option>)}</select>}</div>
        {tab==='ledger'&&report?.ledger?.hasMore&&<div className="table-notice">Only part of the deposit and withdrawal history has loaded. Use Load more below to continue.</div>}
        <div className="table-scroll"><table data-kind={tab}><thead><tr>{(tab==='fills'?['Market / Side','Time · UTC','Volume · USDC','Price','Fee','Transaction hash']:['Activity','Time · UTC','Amount','Network','Status','Transaction hash']).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
          {displayed.slice(page*8,page*8+8).map((item,i)=>{if(tab==='fills'){const f=item as Fill;const buy=['B','Buy'].includes(f.side);return <tr key={`${f.tid??i}-${f.instrumentId??f.coin}`}><td><div className="trade-market"><span className={'trade-icon '+(buy?'buy':'sell')}>{buy?<ArrowDownLeft size={15}/>:<ArrowUpRight size={15}/>}</span><span><b dir="ltr">{f.symbol??f.coin}</b><small className={buy?'positive':'negative'}>{buy?'Buy':'Sell'}<span> · {f.tradeSide??'—'}</span></small></span></div></td><td><div className="table-time">{date(f.time)}<small dir="ltr">{new Date(f.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})}</small></div></td><td dir="ltr" className="numeric">{money(notional(f))}</td><td dir="ltr" className="numeric">{money(Number(f.px))}</td><td dir="ltr" className="numeric">{f.fee!==undefined?`${number(Number(f.fee))} ${f.feeToken??''}`:'—'}</td><td>{f.hash?<button className="hash-button" title={f.hash} onClick={()=>void copy(f.hash!,'hash'+i)} dir="ltr">{copied==='hash'+i?'Copied':shortAddress(f.hash)}<Copy size={11}/></button>:'—'}</td></tr>;}const l=item as Ledger;return <tr key={`${l.hash}-${l.time}-${i}`}><td><span className="ledger-type">{l.delta.type==='deposit'?'Deposit':l.delta.type==='withdraw'?'Withdrawal':l.delta.type}</span></td><td>{date(l.time)}</td><td className="numeric" dir="ltr">{l.delta.amount??'—'}</td><td>{l.delta.chain??'—'}</td><td>{l.delta.status??'—'}</td><td>{l.hash?<button className="hash-button" dir="ltr" title={l.hash} onClick={()=>void copy(l.hash!,'ledger'+i)}>{copied==='ledger'+i?'Copied':shortAddress(l.hash)}<Copy size={11}/></button>:'—'}</td></tr>})}
        </tbody></table>{!displayed.length&&<div className="table-empty">{loading?<Loader2 size={28} className="spin"/>:<Search size={28}/>}<h3>{loading?'Reading public wallet activity…':!report?'Your next insight starts here.':tab==='ledger'&&report.ledger===null?'Deposit and withdrawal history is unavailable.':'No activity found in this range.'}</h3><p>{!report?'Enter a wallet address above or explore the real testnet sample.':'Check the selected network and time range.'}</p></div>}</div>
        <div className="table-footer"><span>{report?`${number(displayed.length)} rows loaded${(tab==='fills'?report.fills.hasMore:report.ledger?.hasMore)?' · partial history':' · all available pages loaded'}`:'Waiting for a wallet address'}</span><div>{report&&(tab==='fills'?report.fills.hasMore:report.ledger?.hasMore)&&<button onClick={continueHistory} disabled={scanning||((tab==='fills'?report.fills:report.ledger)?.data.length??0)>MAX_OFFSET}>{scanning?'Loading…':'Load more history'}</button>}<span>{number(page+1)} / {number(totalPages)}</span><button aria-label="Previous page" disabled={page===0} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/></button><button aria-label="Next page" disabled={page+1>=totalPages} onClick={()=>setPage(p=>p+1)}><ChevronRight size={16}/></button></div></div>
      </section>

      <div className="data-footnote"><ShieldCheck size={15}/><p>Trade executions are not all-chain transactions. This report covers perpetuals; spot and prediction markets are excluded.</p><button onClick={()=>setGuide(true)}>How it is calculated<ArrowUpRight size={13}/></button></div>
      <footer className="footer"><span dir="ltr">flowlens <span>© {new Date().getUTCFullYear()}</span></span><p>Independent TXFLOW checker. Not affiliated with TXFLOW.</p><a href="https://docs.txflow.com/api/info/userFills" target="_blank" rel="noreferrer">Powered by public TXFLOW data<ExternalLink size={12}/></a></footer>
    </main>

    <dialog ref={guideRef} className="guide-dialog" onCancel={()=>setGuide(false)} onClick={e=>{if(e.target===e.currentTarget)setGuide(false)}} aria-labelledby="guide-title"><div className="guide-content"><button className="close-dialog icon-button" onClick={()=>setGuide(false)} aria-label="Close methodology"><X size={20}/></button><span className="guide-symbol"><ShieldCheck size={29}/></span><div className="eyebrow">TRANSPARENT BY DESIGN</div><h2 id="guide-title">Clear definitions. Clearer insights.</h2><p>FlowLens reads public information from TXFLOW. Your searched address is sent to the public API. No wallet connection or signing is required.</p><dl><dt>Report scope</dt><dd>Perpetual trades on the selected network and time range. Spot, prediction markets, airdrop points and all-chain transaction counts are excluded. Volume rankings use the official leaderboard cohort for a supported period.</dd><dt>Trading volume</dt><dd>Report volume is the sum of absolute price × size for each retrieved fill. If the official account summary disagrees after all pages load, both sources are clearly distinguished. Opening and closing positions both create volume. Volume is not deposited capital.</dd><dt>Executions and active days</dt><dd>Fill count comes from the official total or deduplicated executions. One order can have multiple fills. An active day is a UTC calendar day with at least one fill.</dd><dt>Fees and profit</dt><dd>Fees sum the USDC fee field. Builder fees, funding and bridge costs are excluded. PnL comes from the official account summary; the fallback is closedPnl, which is not net account profit or open PnL.</dd><dt>Volume percentile</dt><dd>The top percentage is official volume rank divided by the total number of traders in the same leaderboard cohort, multiplied by 100. The wallet and cohort use the same network, period and snapshot. The leaderboard is periodically updated; its volume may lag current fills. This is a trader-cohort ranking, not a percentage of every wallet on the blockchain. Unranked or unavailable results never receive an invented percentile. The official leaderboard does not support 90D.</dd><dt>Data coverage</dt><dd>History is read in 500-row pages with a fixed end timestamp. Up to 20,000 additional rows are loaded per pass; Load more continues after that. The official maximum offset is 200,000. Partial reports are marked. API errors are never converted to zero activity.</dd><dt>Deposits & withdrawals</dt><dd>This table shows only the deposit and withdraw records returned by the official API. It does not represent every transfer on every chain. Indexed history may lag live activity.</dd></dl><a className="secondary-button" href="https://docs.txflow.com/api" target="_blank" rel="noreferrer">Read the official documentation<ExternalLink size={15}/></a></div></dialog>
  </div>
}
