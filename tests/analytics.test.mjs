import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize,appendPage,parsePage,rpcRead,windowStart,parseRanking,getVolumeRanking} from '../lib/txflow.ts';
const base={coin:'BTC',px:'0.1',sz:'0.2',time:Date.UTC(2026,10,6),side:'B',fee:'0.1',feeToken:'USDC',closedPnl:'-0.3',tradeSide:'Taker',instrumentId:1};
test('decimal totals, maker roles, and duplicate fills are counted correctly',()=>{
 const rows=[{...base,tid:1,oid:1},{...base,tid:1,oid:1},{...base,tid:2,oid:1,tradeSide:'Maker'}];
 const s=summarize(rows);
 assert.equal(s.volume,0.04);assert.equal(s.fees,0.2);assert.equal(s.closedPnl,-0.6);assert.equal(s.rows.length,2);assert.equal(s.orders,1);assert.equal(s.takers,1);assert.equal(s.makers,1);
});
test('UTC days and fee currencies are not mixed',()=>{
 const s=summarize([{...base,tid:1,time:Date.UTC(2026,10,5,23,59)},{...base,tid:2,feeToken:'ETH',time:Date.UTC(2026,10,6,0,1)}]);
 assert.equal(s.activeDays,2);assert.equal(s.fees,0.1);assert.equal(s.otherFeeCount,1);
});
test('paging preserves raw cursor count, completeness and optional total',()=>{
 const p=appendPage({data:[1,2],hasMore:true,total:3},{data:[3],hasMore:false});
 assert.deepEqual(p,{data:[1,2,3],hasMore:false,total:3});
 assert.throws(()=>parsePage({success:true,data:[]}),/format/);
 assert.deepEqual(parsePage({data:{data:[],hasMore:false,total:0}}),{data:[],hasMore:false,total:0});
});
test('official API errors cannot become empty wallet results',async()=>{
 await assert.rejects(()=>rpcRead('mainnet',{},async()=>new Response('Forbidden',{status:403})),/HTTP 403/);
 await assert.rejects(()=>rpcRead('mainnet',{},async()=>Response.json({success:false,code:10000})),/API/);
 await assert.rejects(()=>rpcRead('mainnet',{},async()=>new Response('{}',{status:429})),/rate limit/);
});
test('read requests use pinned API version and readonly path',async()=>{
 await rpcRead('testnet',{type:'userFills'},async(url,init)=>{assert.equal(url,'https://rpc.txflow-testnet.xyz/info');assert.equal(init.headers['x-api-version'],'2026-08-16');assert.equal(init.method,'POST');return Response.json({success:true,code:0,data:{data:[],hasMore:false}})});
 assert.equal(windowStart('7D',864000000),259200000);assert.equal(windowStart('ALLTIME',1),undefined);
});

test('volume percentile uses the full cohort, not the address-filtered count',()=>{
 const address='0x'+'1'.repeat(40);
 const result=parseRanking({data:{total:1000,lastUpdated:1700000000000}},{data:{total:1,data:[{rank:19,userName:address,volume:'40569391.36678'}],lastUpdated:1700000000000}},address,'alltime');
 assert.equal(result.topPercent,1.9);assert.equal(result.rank,19);assert.equal(result.total,1000);assert.equal(result.volume,'40569391.36678');
});
test('unranked wallets and stale snapshot pairs never get a fabricated percentile',()=>{
 const all={data:{total:1000,lastUpdated:1700000000000}};
 assert.equal(parseRanking(all,{data:{data:[],lastUpdated:1700000000000}},'0xabc','alltime').topPercent,null);
 assert.throws(()=>parseRanking(all,{data:{data:[],lastUpdated:1700000000001}},'0xabc','alltime'),/snapshots/);
});
test('ranking selects volume sort and keeps testnet cohort separate',async()=>{
 const address='0x'+'1'.repeat(40);
 const requests=[];
 const fetcher=async(url,init)=>{const body=JSON.parse(init.body);requests.push({url,body});return Response.json({success:true,code:0,data:body.queryAddress?{total:1,data:[{rank:4,userName:address,volume:'100'}],lastUpdated:1700000000000}:{total:20,data:[],lastUpdated:1700000000000}})};
 const r=await getVolumeRanking('testnet',address,'30D',fetcher);
 assert.equal(r.topPercent,20);assert.equal(requests.length,2);
 requests.forEach(({url,body})=>{assert.equal(url,'https://rpc.txflow-testnet.xyz/info');assert.equal(body.sortBy,'volume');assert.equal(body.sortDirection,'desc');assert.equal(body.period,'30d')});
 assert.equal((await getVolumeRanking('mainnet',address,'90D',fetcher)).status,'unsupported');assert.equal(requests.length,2);
});
