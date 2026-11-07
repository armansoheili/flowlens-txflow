import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/worker.mjs';

const address='0x'+'1'.repeat(40);
const env={ASSETS:{fetch:async()=>new Response('<html lang="en">FlowLens</html>',{headers:{'Content-Type':'text/html'}})}};

test('static requests are delegated to the asset binding',async()=>{
 const r=await worker.fetch(new Request('https://example.com/'),env);
 assert.match(await r.text(),/FlowLens/);
});
test('health and API method validation do not require upstream calls',async()=>{
 assert.equal((await worker.fetch(new Request('https://example.com/api/health'),env)).status,200);
 const bad=await worker.fetch(new Request('https://example.com/api/wallet?address=no'),env);
 assert.equal(bad.status,400);
 const post=await worker.fetch(new Request('https://example.com/api/wallet',{method:'POST'}),env);
 assert.equal(post.status,405);assert.equal(post.headers.get('Allow'),'GET');
 assert.equal((await worker.fetch(new Request('https://example.com/api/unknown'),env)).status,404);
});
test('portable worker serves wallet analytics and a real-cohort percentile',async(t)=>{
 const calls=[];
 t.mock.method(globalThis,'fetch',async(url,init)=>{
  const b=JSON.parse(init.body);calls.push({url,body:b});
  const result=b.type==='userOverview'?{code:0,volume:'50',pnl:'1',totalEquity:'100',roe:'1',maxDrawdown:'0'}
   :b.type==='growthGeneralPublic'?{success:true,code:0,data:b.queryAddress?{total:1,data:[{rank:2,userName:address,volume:'50'}],lastUpdated:1700000000000}:{total:100,data:[],lastUpdated:1700000000000}}
   :{success:true,code:0,data:{data:b.type==='userFills'?[{coin:'BTC',px:'5',sz:'10',time:1700000000000,side:'B',tid:1}]:[],hasMore:false,total:b.type==='userFills'?1:0}};
  return Response.json(result);
 });
 const r=await worker.fetch(new Request('https://example.com/api/wallet?address='+address+'&network=mainnet&period=ALLTIME'),env);
 assert.equal(r.status,200);const body=await r.json();
 assert.equal(body.ranking.topPercent,2);assert.equal(body.fills.total,1);
 assert.equal(calls.length,5);assert.ok(calls.every(c=>c.url==='https://rpc.txflow.com/info'));
 assert.equal(calls.find(c=>c.body.type==='userFills').body.limit,500);
});
test('upstream outages remain errors instead of zero-activity reports',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('Unavailable',{status:503}));
 const r=await worker.fetch(new Request('https://example.com/api/wallet?address='+address),env);
 assert.equal(r.status,502);assert.match((await r.json()).error,/HTTP 503/);
});
