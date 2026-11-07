import test from 'node:test';
import assert from 'node:assert/strict';
import {requestWalletData, getVolumeRanking} from '../lib/txflow.ts';

const address='0x'+'1'.repeat(40);
const end=1700000000000;
const fill={coin:'BTC',px:'5',sz:'10',time:end,side:'B',tid:1};

test('a browser report reads the official network directly without a hosting proxy or credentials',async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{
  const body=JSON.parse(init.body);calls.push({url,body,init});
  return Response.json(body.type==='userOverview'?{code:0,volume:'50',pnl:'1',totalEquity:'100'}
   :body.type==='growthGeneralPublic'?{success:true,code:0,data:body.queryAddress?{data:[{rank:2,userName:address,volume:'50'}],lastUpdated:end}:{total:100,data:[],lastUpdated:end}}
   :{success:true,code:0,data:{data:body.type==='userFills'?[fill]:[],hasMore:false,total:body.type==='userFills'?1:0}});
 };
 const report=await requestWalletData({address,network:'mainnet',period:'ALLTIME',end:String(end)},new AbortController().signal,fetcher);
 assert.equal(report.fills.total,1);assert.equal(report.ranking.topPercent,2);
 assert.equal(calls.length,5);
 for(const call of calls){assert.equal(call.url,'https://rpc.txflow.com/info');assert.equal(call.init.credentials,'omit');assert.equal(call.init.headers['x-api-version'],'2026-08-16');assert.equal(call.init.headers['User-Agent'],undefined);}
});

test('later history pages keep the selected network, snapshot, offset, and page size',async()=>{
 const result=await requestWalletData({address,network:'testnet',period:'7D',kind:'fills',offset:'500',end:String(end)},new AbortController().signal,async(url,init)=>{
  const body=JSON.parse(init.body);
  assert.equal(url,'https://rpc.txflow-testnet.xyz/info');
  assert.equal(body.offset,500);assert.equal(body.limit,500);assert.equal(body.endTimeMs,end);assert.equal(body.startTimeMs,end-7*86400000);
  return Response.json({success:true,code:0,data:{data:[fill],hasMore:false,total:501}});
 });
 assert.equal(result.data.length,1);assert.equal(result.total,501);
});

test('switching wallets cancels in-flight official API reads',async()=>{
 const controller=new AbortController();let active=0;
 const pending=requestWalletData({address,network:'mainnet'},controller.signal,async(url,init)=>{
  active++;
  return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));
 });
 assert.equal(active,5);controller.abort();
 await assert.rejects(pending,{name:'AbortError'});
});

test('access denials stay errors and never retry through a different network or proxy',async()=>{
 const calls=[];
 await assert.rejects(requestWalletData({address,network:'mainnet',kind:'fills'},new AbortController().signal,async(url)=>{
  calls.push(url);return new Response('Forbidden',{status:403});
 }),error=>error.status===403&&/HTTP 403/.test(error.message));
 assert.deepEqual(calls,['https://rpc.txflow.com/info']);
 let rankCalls=0;
 const ranking=await getVolumeRanking('mainnet',address,'ALLTIME',async()=>{rankCalls++;return new Response('Forbidden',{status:403});});
 assert.equal(ranking.status,'unavailable');assert.equal(rankCalls,2);
});

test('invalid query parameters never leave the browser',async()=>{
 let calls=0;
 await assert.rejects(requestWalletData({address,network:'other'},new AbortController().signal,async()=>{calls++;}),error=>error.status===400);
 assert.equal(calls,0);
});
