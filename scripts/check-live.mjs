import {getReport,summarize,SAMPLE_WALLET,historyPage,appendPage} from '../lib/txflow.ts';
import assert from 'node:assert/strict';
const report=await getReport('testnet',SAMPLE_WALLET,'ALLTIME',Date.now());
let page=report.fills;
while(page.hasMore){assert.ok(page.data.length<10000);page=appendPage(page,await historyPage('testnet',SAMPLE_WALLET,'ALLTIME',report.end,'fills',page.data.length));}
const stats=summarize(page.data);
assert.ok(stats.rows.length>0,'Documented testnet account should have fills');
assert.ok(report.overview,'Official account summary is available');
assert.ok(stats.volume>0,'Returned fills produce positive notional');
assert.equal(stats.rows.length,page.total);
assert.equal(report.ranking.status,'ranked');
assert.ok(report.ranking.rank>=1 && report.ranking.rank<=report.ranking.total);
assert.equal(report.ranking.topPercent,report.ranking.rank/report.ranking.total*100);
console.log(JSON.stringify({network:'testnet',fills:stats.rows.length,computedVolume:stats.volume,officialVolume:report.overview.volume,summaryMatchesFills:Math.abs(stats.volume-Number(report.overview.volume))<0.02,pagingComplete:!page.hasMore,activeDays:stats.activeDays,ledgerLoaded:report.ledger!==null,ranking:report.ranking}));
