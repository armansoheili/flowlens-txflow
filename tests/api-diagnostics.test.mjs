import test from 'node:test';
import assert from 'node:assert/strict';
import {rpcRead} from '../lib/txflow.ts';
import worker from '../dist/worker.mjs';

test('403 diagnostics retain the upstream reference and gateway code without raw denial content',async()=>{
 const fetcher=async()=>new Response('<html><span class="cf-error-code">1020</span><p>Your IP: 192.0.2.123; cookie=private-value</p></html>',{
  status:403,headers:{'cf-ray':'a56c4ff53ec4f8e7-WAW','cf-mitigated':'challenge'},
 });
 await assert.rejects(rpcRead('testnet',{type:'userFills'},fetcher),error=>{
  assert.equal(error.status,403);assert.match(error.message,/Reference: a56c4ff53ec4f8e7-WAW/);
  assert.match(error.message,/Upstream code: 1020/);assert.match(error.message,/Gateway challenge required/);
  assert.doesNotMatch(error.message,/192\.0\.2\.123|private-value|<html/);
  return true;
 });
});

test('provider JSON codes and request IDs are retained while messages and unsafe values are excluded',async()=>{
 await assert.rejects(rpcRead('mainnet',{},async()=>Response.json({code:'ACCESS_DENIED',message:'token=secret',ip:'192.0.2.123'},{status:403,headers:{'x-request-id':'trace-123'}})),error=>{
  assert.match(error.message,/Reference: trace-123/);assert.match(error.message,/Upstream code: ACCESS_DENIED/);
  assert.doesNotMatch(error.message,/secret|192\.0\.2\.123/);return true;
 });
 await assert.rejects(rpcRead('mainnet',{},async()=>Response.json({code:'<script>private</script>'},{status:403,headers:{'x-request-id':'invalid reference with spaces'}})),error=>{
  assert.doesNotMatch(error.message,/private|invalid reference/);return true;
 });
});

test('the denial body inspection is bounded and cancels an unfinished stream',async()=>{
 let cancelled=false;
 const body=new ReadableStream({
  start(controller){controller.enqueue(new TextEncoder().encode('error code: 1020 '+'.'.repeat(20000)));},
  cancel(){cancelled=true;},
 });
 await assert.rejects(rpcRead('mainnet',{},async()=>new Response(body,{status:403})),/Upstream code: 1020/);
 assert.equal(cancelled,true);
});

test('the deployed wallet endpoint exposes the upstream reference on a denial',async(t)=>{
 t.mock.method(globalThis,'fetch',async()=>new Response('error code: 1020',{status:403,headers:{'cf-ray':'a56c4ff53ec4f8e7-WAW'}}));
 const response=await worker.fetch(new Request('https://example.com/api/wallet?address=0x'+'1'.repeat(40)),{});
 assert.equal(response.status,403);
 const data=await response.json();
 assert.match(data.error,/Reference: a56c4ff53ec4f8e7-WAW/);assert.match(data.error,/Upstream code: 1020/);
 assert.equal(data.fills,undefined);
});
