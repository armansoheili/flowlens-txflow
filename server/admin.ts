export function adminPage(): Response {
  const nonce = crypto.randomUUID().replaceAll('-', '');
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>FlowLens | Usage analytics</title>
<style nonce="${nonce}">
@font-face{font-family:Hanken;src:url('/fonts/hanken-regular.woff2') format('woff2');font-display:swap}*{box-sizing:border-box}body{margin:0;background:#080b09;color:#eef5ef;font-family:Hanken,system-ui,sans-serif;line-height:1.5}main{max-width:1180px;margin:auto;padding:32px 24px 48px}header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:24px;border-bottom:1px solid #2d4032}.brand{color:#7cff6b;font-size:24px;font-weight:700;letter-spacing:-1px}.eyebrow{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a4b6a9}h1{font-size:clamp(28px,4vw,42px);letter-spacing:-1px;margin:26px 0 4px}h2{font-size:18px;margin:0 0 14px}p{color:#aebdb2;margin:0 0 20px}a{color:#7cff6b;text-decoration:none}a:hover{text-decoration:underline}button,input,select{font:inherit;border-radius:9px;min-height:46px}button{cursor:pointer;border:1px solid #7cff6b;background:#7cff6b;color:#071008;padding:10px 18px;font-weight:700}button:hover{filter:brightness(1.08)}button:disabled{cursor:wait;opacity:.6}.secondary{background:transparent;color:#d6e4d8;border-color:#3d5544}input,select{background:#0b120e;border:1px solid #3d5544;color:#eef5ef;padding:10px 13px}input{width:100%}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:3px solid #7cff6b;outline-offset:4px}.panel{background:#101813;border:1px solid #2d4032;border-radius:16px;padding:24px}.login{max-width:500px;margin:44px auto 0}label{display:block;margin:0 0 8px;font-weight:600}.login button{margin-top:16px;width:100%}.help{font-size:13px;line-height:1.6;margin-top:12px}.status{min-height:25px;margin:16px 0;color:#d9ebdf}.status.error{color:#ffb09f}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:28px 0 20px}.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.controls label{margin:0;font-size:14px}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.metric{padding:22px;background:#101813;border:1px solid #2d4032;border-radius:14px}.metric.featured{background:#142b1b;border-color:#437b47}.metric span{display:block;color:#b6c9bc;font-size:14px}.metric strong{display:block;font-size:clamp(29px,4vw,43px);font-weight:600;line-height:1.2;margin-top:12px;font-variant-numeric:tabular-nums}.featured strong{color:#7cff6b}.metric small{display:block;color:#a6b8ac;margin-top:10px;min-height:19px;font-size:12px}.details{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0}.detail-row{display:flex;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid #26362b}.detail-row:last-child{border:0}.detail-row span{color:#b3c4b8}.detail-row b{font-variant-numeric:tabular-nums}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px;white-space:nowrap}th,td{text-align:right;padding:13px 14px;border-bottom:1px solid #293a2e;font-variant-numeric:tabular-nums}th{font-size:12px;font-weight:500;color:#a7bcad}th:first-child,td:first-child{text-align:left;padding-left:0}tbody tr:last-child td{border:0}.empty{text-align:center!important;color:#afc1b5;padding:32px!important}.note{font-size:13px;color:#9caf9f;margin:20px 0 0}.timestamp{font-size:13px;color:#b1c5b7}.top-actions{display:flex;gap:18px;align-items:center}.top-actions button{padding:8px 14px}.footer{margin-top:28px;padding-top:20px;border-top:1px solid #293a2e;font-size:12px;color:#9caf9f}[hidden]{display:none!important}@media(max-width:680px){main{padding:20px 16px 32px}header{align-items:flex-start}.eyebrow{letter-spacing:1px;font-size:10px}.brand{font-size:21px}.top-actions{gap:12px;font-size:13px}.top-actions button{font-size:13px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.metric{padding:17px 15px}.metric span{font-size:13px}.metric small{font-size:11px}.details{grid-template-columns:1fr}.panel{padding:20px}.controls{width:100%}.controls select{flex:1}.toolbar{gap:12px}.login{margin-top:28px}}
</style></head><body><main>
<header><div><div class="brand">FlowLens</div><div class="eyebrow">Private usage analytics</div></div><div class="top-actions"><a href="/">Open checker</a><button id="logout" class="secondary" hidden>Sign out</button></div></header>
<section id="login" class="panel login"><h1>See who is using it.</h1><p>View anonymous visits, checker users and report results.</p><form id="login-form"><label for="password">Admin password</label><input id="password" type="password" autocomplete="off" required maxlength="256"><button id="login-button" type="submit">Open analytics</button></form><p class="help">Use the password saved as the Cloudflare secret <b>ANALYTICS_ADMIN_TOKEN</b>. It stays in this tab while you are signed in.</p></section>
<div id="status" class="status" role="status" aria-live="polite"></div>
<section id="dashboard" hidden aria-label="Usage analytics dashboard">
<h1>Your checker, by the numbers.</h1><p>Visits and searches recorded since tracking was enabled.</p>
<div class="toolbar"><span id="updated" class="timestamp"></span><div class="controls"><label for="range">Time range</label><select id="range"><option value="all">All time</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option></select><button id="refresh" class="secondary">Refresh</button></div></div>
<div class="metrics">
<article class="metric"><span>Visitors</span><strong data-key="visitors">—</strong><small>Estimated unique browsers</small></article>
<article class="metric featured"><span>Checker users</span><strong data-key="checker_users">—</strong><small>Browsers that attempted a search</small></article>
<article class="metric"><span>Page views</span><strong data-key="page_views">—</strong><small>Includes repeat visits</small></article>
<article class="metric"><span>Searches started</span><strong data-key="search_starts">—</strong><small>Valid wallet searches</small></article>
<article class="metric"><span>Reports loaded</span><strong data-key="search_successes">—</strong><small>Initial wallet report displayed</small></article>
<article class="metric"><span>Failed searches</span><strong data-key="search_errors">—</strong><small>Searches that returned an error</small></article>
</div>
<div class="details"><section class="panel"><h2>Search networks</h2><div class="detail-row"><span>Mainnet</span><b data-key="mainnet_starts">—</b></div><div class="detail-row"><span>Testnet</span><b data-key="testnet_starts">—</b></div></section><section class="panel"><h2>How people explore</h2><div class="detail-row"><span>Sample wallet searches</span><b data-key="sample_starts">—</b></div><div class="detail-row"><span>Other wallet searches</span><b id="other-searches">—</b></div></section></div>
<section class="panel"><h2>Daily activity</h2><div class="table-wrap" tabindex="0" role="region" aria-label="Daily usage table"><table><thead><tr><th scope="col">Date · UTC</th><th scope="col">Visitors</th><th scope="col">Checker users</th><th scope="col">Views</th><th scope="col">Searches</th><th scope="col">Loaded</th><th scope="col">Failed</th></tr></thead><tbody id="daily"></tbody></table></div><p class="note">Showing up to 30 daily rows. All-time totals include the entire recorded history.</p></section>
<p class="note">Unique browsers are estimates, not verified people. Private browsing, cleared storage, bots and your own tests can affect counts. Closing a search or losing a tracking request can leave an attempt without a result. No searched wallet addresses or IP addresses are included in the events recorded by this feature.</p><p id="since" class="note"></p>
</section><footer class="footer">FlowLens · Owner dashboard · Refresh to load the latest recorded events.</footer>
</main><script nonce="${nonce}">
(function(){
  var token='',controller=null;
  var byId=function(id){return document.getElementById(id)};
  var format=function(value){return new Intl.NumberFormat('en-US').format(Number(value)||0)};
  function message(text,error){byId('status').textContent=text;byId('status').className='status'+(error?' error':'')}
  function busy(value){byId('refresh').disabled=value;byId('range').disabled=value;byId('login-button').disabled=value;byId('login-button').textContent=value?'Loading…':'Open analytics'}
  function render(data){
    document.querySelectorAll('[data-key]').forEach(function(node){node.textContent=format(data.totals[node.dataset.key])});
    byId('other-searches').textContent=format(Math.max(0,data.totals.search_starts-data.totals.sample_starts));
    var body=byId('daily');body.textContent='';
    data.daily.forEach(function(row){var tr=document.createElement('tr');['day','visitors','checker_users','page_views','search_starts','search_successes','search_errors'].forEach(function(key){var td=document.createElement('td');td.textContent=key==='day'?row.day:format(row[key]);tr.appendChild(td)});body.appendChild(tr)});
    if(!data.daily.length){var tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=7;td.className='empty';td.textContent='No events recorded yet. Open the checker and try a wallet.';tr.appendChild(td);body.appendChild(tr)}
    byId('updated').textContent='Updated '+new Date(data.updatedAt).toISOString().replace('T',' ').slice(0,19)+' UTC';
    byId('since').textContent='Tracking enabled '+new Date(data.trackingSince).toISOString().replace('T',' ').slice(0,19)+' UTC. Earlier activity is not included.';
    byId('login').hidden=true;byId('dashboard').hidden=false;byId('logout').hidden=false;
  }
  async function load(){
    if(!token)return;
    if(controller)controller.abort();controller=new AbortController();
    var active=token,signal=controller.signal;busy(true);message('Loading usage statistics…',false);
    try{
      var response=await fetch('/api/admin/usage?range='+byId('range').value,{headers:{Authorization:'Bearer '+active},credentials:'omit',cache:'no-store',signal:signal});
      var data=await response.json();
      if(active!==token||signal.aborted)return;
      if(!response.ok)throw new Error(data.error||'Could not load usage statistics.');
      render(data);message('Statistics loaded. Refresh after a new visit or search.',false);
    }catch(error){if(!signal.aborted&&active===token)message(error.message||'Could not load usage statistics.',true)}
    finally{if(active===token&&!signal.aborted)busy(false)}
  }
  byId('login-form').addEventListener('submit',function(event){event.preventDefault();token=byId('password').value;byId('password').value='';load()});
  byId('refresh').addEventListener('click',load);byId('range').addEventListener('change',load);
  byId('logout').addEventListener('click',function(){if(controller)controller.abort();token='';byId('dashboard').hidden=true;byId('logout').hidden=true;byId('login').hidden=false;byId('daily').textContent='';document.querySelectorAll('[data-key]').forEach(function(node){node.textContent='—'});busy(false);message('Signed out.',false);byId('password').focus()});
})();
</script></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`,
    },
  });
}
