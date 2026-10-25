// Self-contained loopback-only regression. All members, cards and messages are synthetic.
// Run: node test/browser/business-island.mjs (PLAYWRIGHT_PATH may select an installed package).
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve, sep, join } from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require(process.env.PLAYWRIGHT_PATH || 'playwright'); }
catch (error) {
  if (process.env.PLAYWRIGHT_PATH) throw error;
  playwright = require(join(process.env.USERPROFILE || process.env.HOME || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
}
const { chromium } = playwright;
const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = process.env.BUSINESS_ISLAND_BROWSER_OUTPUT || fileURLToPath(new URL('../../../business-island-browser/', import.meta.url));
const THREAD = '00000000-0000-4000-8000-000000000001';
const UID = 'U' + 'a'.repeat(32), OTHER_UID = 'U' + 'f'.repeat(32);
const unsafeName = '<img src=x onerror="window.__xss=1">';
const picture = 'https://fixture.invalid/avatar.png';
const allMembers = [
  { handle:'card-b',name:'陳小商',company:'晨光合作工作室',title:'合作顧問',memberNumber:'20261025001',avatarUrl:picture,industry:'餐飲食品',match:{score:80,source:'ai'} },
  { handle:'card-c',name:unsafeName,company:'安全字元 <script>window.__xss=2</script>',title:'合成會員',memberNumber:'20261025002',avatarUrl:'javascript:alert(1)',industry:'科技資訊',match:null },
  { handle:'card-d',name:'黃測試',company:'星光商行',title:'服務夥伴',memberNumber:'20261025003',avatarUrl:'https://fixture.invalid/missing.png',industry:'餐飲食品',match:null },
  { handle:'card-e',name:'周新頁',company:'Demo Supply',title:'供應夥伴',memberNumber:'20261025004',avatarUrl:'',industry:'零售電商',match:{score:40,source:'rules'} }
];
const manyMembers=Array.from({length:18},(_,index)=>({handle:'many-'+String(index+1).padStart(2,'0'),name:'多名單會員'+String(index+1).padStart(2,'0'),company:'合成合作工作室 '+(index+1),title:'商務交流夥伴',memberNumber:'20261025'+String(index+10).padStart(3,'0'),avatarUrl:index%2?picture:'',industry:'科技資訊',match:null}));
const calls = [], messages = [], pending = new Map();
let holdNextPage = false, randomBatch = 0, holdNextRandom = '', failNextRandom = false;
const checks = [], errors = [], outside = [];
const record = name => { checks.push(name); console.log('PASS ' + name); };
const messageWrites = () => calls.filter(call => call.method === 'POST' && call.path.endsWith('/messages'));
const threadWrites = () => calls.filter(call => call.method === 'POST' && call.path === '/v1/member-chat/threads');
const respond = (res, body, status = 200) => { if (!res.destroyed && !res.writableEnded) { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(body)); } };
const ok = (res, data = {}) => respond(res, {success:true,...data});
const waitUntil = async predicate => { const end=Date.now()+10000;while(!predicate()){assert.ok(Date.now()<end,'local fixture condition timed out');await new Promise(resolve=>setTimeout(resolve,10));} };

const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商務交流島・合成測試</title><style>
*{box-sizing:border-box}html,body{margin:0;width:100%;max-width:100%;height:100%;font:16px system-ui}body{display:flex;justify-content:center;overflow:hidden;background:#eef2f3}.hidden{display:none!important}button,input,select{font:inherit}
/* Mirror index.html's Tailwind app shell without loading unrelated production scripts. */
#app{width:100%;max-width:448px;height:100dvh;position:relative;display:flex;flex-direction:column;overflow:hidden;background:#fff}
#top-nav{position:fixed;top:0;left:50%;transform:translateX(-50%);width:100%;max-width:448px;min-height:96px;padding:12px 20px;display:flex;align-items:center;background:#fff;border-bottom:1px solid #ddd;z-index:40}
#main{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:112px 16px 128px}
#page-business-island,#page-business-richman{margin-left:-16px;margin-right:-16px}
#bottom-nav,#bottom-nav-admin{position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:448px;height:76px;padding:8px;display:flex;justify-content:space-evenly;align-items:center;background:#fff;border-top:1px solid #ddd;z-index:40}
#bottom-nav button,#bottom-nav-admin button{min-height:44px;padding:8px 20px}
body.store-shop-page #top-nav{display:none!important}body.store-shop-page #main{padding-top:0!important}body.store-shop-page #page-store-shop{margin-top:0!important}
#page-home{padding:20px}.fixture-post{max-width:calc(100vw - 30px)}.material-symbols-outlined{font-size:0!important}.material-symbols-outlined::before{content:'◉';font:24px system-ui}
</style></head><body><div id="app"><nav id="top-nav">原本會員頁首・合成外框</nav>
<main id="main"><section id="page-home"><button id="fixture-open" onclick="window.openBusinessRichman()">開啟商務交流島</button></section><section id="page-business-island" class="hidden"></section><section id="page-business-richman" class="hidden"></section><section id="page-store-shop" class="hidden"></section><section id="page-admin-settings" class="hidden"></section></main>
<nav id="bottom-nav"><button id="fixture-bottom-home" onclick="window.goPage('home')">首頁</button><button onclick="window.openBusinessRichman()">交流島</button></nav><nav id="bottom-nav-admin" class="hidden"><button onclick="window.goPage('home')">管理返回</button></nav></div>
<script>
window.currentPage='home';window.currentViewMode='user';window.currentUserProfile={userId:'${UID}',displayName:'合成登入會員',pictureUrl:'${picture}'};window.__fixtureEvents=[];window.__xss=0;window.__token='synthetic-token-a';
window.Config={WORKER_URL:location.origin};window.WORKER_URL=location.origin;window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.__token};window.loadUserActivities=()=>{};window.showToast=()=>{};
window.fixtureSwitchAccount=()=>{window.currentUserProfile={userId:'${OTHER_UID}',displayName:'另一合成會員'};window.__token='synthetic-token-f';};
window.fetchAPI=async(action,payload)=>{const response=await fetch('/fixture/actions',{method:'POST',headers:{Authorization:'Bearer '+window.__token,'Content-Type':'application/json'},body:JSON.stringify({action,payload})});return response.json();};
window.openMyCardSettings=()=>{window.__fixtureEvents.push({kind:'my-card'});window.goPage('admin-settings',true);};
window.openExchangeZone=async options=>{window.__fixtureEvents.push({kind:'exchange',...options});if(options.tab==='threads'){const module=await import('/js/modules/member-chat.js?v=14');module.openMemberChat({base:location.origin,threadId:options.threadId||''});}};
window.openExchangeZonePost=async handle=>{window.__fixtureEvents.push({kind:'post',handle});const popup=document.createElement('dialog');popup.className='fixture-post';popup.innerHTML='<h2>原交流詳情合成入口</h2><p>已刊登合作內容</p><button>關閉</button>';popup.querySelector('button').onclick=()=>{popup.close();popup.remove();};document.body.append(popup);popup.showModal();};
window.openStoreShop=async(...args)=>{window.__fixtureEvents.push({kind:'store',id:args[4]});window.goPage('store-shop',true);const root=document.getElementById('page-store-shop');root.innerHTML='<h2>原商城合成入口</h2><button id="fixture-store-back">返回棋盤</button>';root.querySelector('button').onclick=()=>args[5]?.onBack?.();};
</script>
<script src="/js/navigation.js?v=8.04"></script><script src="/js/modules/business-richman.js?v=1.3"></script><script src="/js/modules/store-richman.js?v=1"></script><script src="/js/modules/business-island.js?v=1"></script>
</body></html>`;

const server = createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://127.0.0.1');
    if (url.pathname === '/') {res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html);return;}
    if (url.pathname === '/favicon.ico') {res.writeHead(204);res.end();return;}
    if (url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/') || url.pathname.startsWith('/assets/')) {
      const file=resolve(repo,'.'+url.pathname);assert.ok(file.startsWith(repo.endsWith(sep)?repo:repo+sep));
      const types={js:'text/javascript',mjs:'text/javascript',css:'text/css',webp:'image/webp',png:'image/png'};
      const body=await readFile(file);res.writeHead(200,{'Content-Type':types[file.split('.').at(-1)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);return;
    }
    let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):null;
    calls.push({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),body,authorization:req.headers.authorization});
    if (url.pathname === '/v1/store-shop') {ok(res,url.searchParams.has('shop')?{shop:{id:THREAD,name:'合成商城',status:'active',category:'測試'}}:{shops:[{id:THREAD,name:'合成商城',status:'active',category:'測試'}]});return;}
    assert.match(req.headers.authorization||'',/^Bearer synthetic-token-[af]$/,'fixture APIs require synthetic bearer tokens');
    if (url.pathname === '/fixture/actions') {
      assert.equal(body.action,'listExchangeZonePosts');ok(res,{access:{allowed:true},posts:[{postHandle:'post-one',title:'尋找公開合作夥伴',excerpt:'這是已刊登的合成需求',author:{name:'公開作者'}}]});return;
    }
    if (url.pathname === '/v1/member-chat/members') {
      const q=url.searchParams.get('q')||'',industry=url.searchParams.get('industry')||'';
      if(url.searchParams.get('sort')==='random'&&holdNextRandom) {
        const key=holdNextRandom;holdNextRandom='';
        pending.set(key,()=>ok(res,{items:[{...allMembers[0],handle:'stale-'+key,name:'舊骰子回應不得呈現 '+key}],next:'',industries:['餐飲食品','科技資訊','零售電商']}));return;
      }
      if(url.searchParams.get('sort')==='random'&&failNextRandom) {failNextRandom=false;respond(res,{success:false,error:'合成骰子暫時失敗'},503);return;}
      if(q==='多名單') {ok(res,{items:manyMembers,next:'',industries:['科技資訊']});return;}
      if(q.startsWith('late-')) {pending.set(q,()=>ok(res,{items:[{...allMembers[0],name:'舊回應不得呈現 '+q}],next:'',industries:['餐飲食品','科技資訊','零售電商']}));return;}
      let rows=allMembers.filter(row=>(!q||[row.name,row.company,row.title].join(' ').toLowerCase().includes(q.toLowerCase()))&&(!industry||row.industry===industry));
      if(url.searchParams.get('sort')==='random') {
        if(url.searchParams.has('after')) {respond(res,{success:false,error:'Random batches do not use cursors'},400);return;}
        const offset=rows.length?randomBatch++%rows.length:0;
        const batch=[...rows.slice(offset),...rows.slice(0,offset)].slice(0,3);
        ok(res,{items:batch.map(({industry,...row})=>row),next:'',industries:['餐飲食品','科技資訊','零售電商']});return;
      }
      if(url.searchParams.get('sort')==='match') rows=rows.toSorted((a,b)=>(b.match?.score??-1)-(a.match?.score??-1));
      const page=url.searchParams.get('after')?rows.slice(3):rows.slice(0,3);
      if(holdNextPage&&url.searchParams.has('after')){holdNextPage=false;pending.set('pagination',()=>ok(res,{items:page.map(({industry,...row})=>row),next:'',industries:['餐飲食品','科技資訊','零售電商']}));return;}
      ok(res,{items:page.map(({industry,...row})=>row),next:!url.searchParams.get('after')&&rows.length>3?'page-2':'',industries:['餐飲食品','科技資訊','零售電商']});return;
    }
    if (/^\/v1\/member-chat\/members\/[^/]+\/card$/.test(url.pathname)) {ok(res,{card:{name:'合成公開名片',companyName:'公開工作室',title:'公開合作夥伴',description:'<script>window.__xss=3</script> 僅文字展示',imageUrl:'https://fixture.invalid/card.png',buttons:[{label:'安全網站',url:'https://fixture.invalid/contact'},{label:'不安全',url:'javascript:alert(1)'}]}});return;}
    if (url.pathname === '/v1/member-chat/me') {ok(res,{accepting:true,notifications:false});return;}
    if (url.pathname === '/v1/member-chat/threads') {
      if(req.method==='POST'){assert.ok(allMembers.some(row=>row.handle===body.cardHandle));ok(res,{id:THREAD});}
      else ok(res,{items:[{id:THREAD,name:'陳小商',preview:'合成對話',unread:0,createdAt:'2026-10-25T00:00:00Z'}],next:''});return;
    }
    if (url.pathname === `/v1/member-chat/threads/${THREAD}/messages`) {
      if(req.method==='POST'){const item={seq:messages.length+1,body:body.body,mine:true,clientId:body.clientId,createdAt:'2026-10-25T00:00:00Z',read:false};messages.push(item);ok(res,{item});}
      else {const after=Number(url.searchParams.get('after')||0);ok(res,{items:messages.filter(item=>item.seq>after),more:false,peer:{name:'陳小商'},blocked:false,blockedByMe:false,lastRead:0});}return;
    }
    if(url.pathname===`/v1/member-chat/threads/${THREAD}/read`){ok(res,{through:body.through});return;}
    throw Error('Unexpected fixture API '+req.method+' '+url.pathname);
  } catch(error) {errors.push('fixture: '+error.message);respond(res,{success:false,error:'Synthetic fixture failure'},500);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===base){await route.continue();return;}
  if(url.hostname==='fixture.invalid'){
    if(url.pathname==='/missing.png'){await route.fulfill({status:404,body:'synthetic missing image'});return;}
    const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/i1sAAAAASUVORK5CYII=','base64');
    await route.fulfill({status:200,contentType:'image/png',body:png});return;
  }
  outside.push(url.origin);await route.abort('blockedbyclient');
});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
const island=()=>page.locator('#page-business-island');
const waitMembers=async(count=3)=>{await page.waitForFunction(count=>document.querySelectorAll('#page-business-island .bi-list .bi-member').length===count&&!document.querySelector('[data-bi-action="roll"]')?.disabled&&!document.querySelector('[data-bi-action="more"]')?.disabled,count);};
const enter=async()=>{await page.evaluate(()=>window.openBusinessIsland());await waitMembers();};
const selectZone=value=>page.locator(`.bi-tabs [data-bi-zone="${value}"]`).click();
const submit=async(q='')=>{await page.locator('#bi-query').fill(q);await page.locator('.bi-search button[type=submit]').click();};
const selectedHandle=()=>page.locator('.bi-list .bi-member-select[aria-pressed="true"]').getAttribute('data-bi-member');
const memberCalls=()=>calls.filter(call=>call.path==='/v1/member-chat/members');
let failure, diagnosticPage=page;
try {
  await mkdir(output,{recursive:true});
  let moduleSeen=false,releaseModule;
  const moduleGate=new Promise(resolve=>releaseModule=resolve);
  await page.route('**/js/modules/member-chat.js?*',async route=>{moduleSeen=true;await moduleGate;await route.continue();});
  await page.goto(base);await page.waitForFunction(()=>typeof window.openBusinessIsland==='function');
  assert.equal(calls.length,0);record('startup performs no API requests');
  await page.locator('#fixture-open').click();await waitUntil(()=>moduleSeen);
  await page.evaluate(()=>{document.querySelector('.bi-tabs [data-bi-zone="board"]').click();document.querySelector('[data-bi-action="list"]').click();});
  assert.equal(await page.evaluate(()=>window.currentPage),'business-island');
  assert.doesNotMatch(await page.locator('[data-bi-status]').textContent(),/登入.*失效|重新進入 LINE/);
  releaseModule();await waitMembers();await page.unroute('**/js/modules/member-chat.js?*');
  const slowStyle=await context.newPage();slowStyle.on('pageerror',error=>errors.push(error.message));
  let styleSeen=false,releaseStyle;
  const styleGate=new Promise(resolve=>releaseStyle=resolve);
  await slowStyle.route('**/css/business-island.css?*',async route=>{styleSeen=true;await styleGate;await route.continue();});
  await slowStyle.goto(base);await slowStyle.locator('#fixture-open').click();await waitUntil(()=>styleSeen);
  await slowStyle.evaluate(()=>{document.querySelector('.bi-tabs [data-bi-zone="home"]').click();document.querySelector('[data-bi-action="list"]').click();});
  assert.doesNotMatch(await slowStyle.locator('[data-bi-status]').textContent(),/登入.*失效|重新進入 LINE/);
  releaseStyle();
  await slowStyle.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===3&&!document.querySelector('[data-bi-action="roll"]')?.disabled);
  await slowStyle.locator('[data-bi-action="list"]').click();assert.equal(await slowStyle.locator('#page-business-island').getAttribute('data-view'),'list');
  await slowStyle.close();record('fast controls during delayed module or CSS loading do not cancel initialization');
  assert.equal(await page.evaluate(()=>window.currentPage),'business-island');
  await page.waitForFunction(()=>document.querySelector('.bi-list [data-bi-member="card-b"] img')?.naturalWidth>0);
  assert.equal(await page.locator('.bi-list [data-bi-member="card-b"] img').isVisible(),true);
  assert.equal(await page.locator('.bi-list [data-bi-member="card-c"] img').count(),0);
  await page.waitForFunction(()=>!document.querySelector('.bi-list [data-bi-member="card-d"] img'));
  assert.equal(await page.locator('.bi-list [data-bi-member="card-d"] .bi-avatar').textContent(),'黃');
  assert.equal(await page.locator('.bi-list [data-bi-member="card-c"] strong').textContent(),unsafeName);
  assert.equal(await page.evaluate(()=>window.__xss),0);assert.equal(threadWrites().length,0);assert.equal(messageWrites().length,0);
  record('real module renders synthetic members, successful pictures, fallbacks and escaped names without writing');

  await page.locator('.bi-list [data-bi-member="card-c"]').click();
  assert.equal(await page.locator('.bi-selection h3').textContent(),unsafeName);
  assert.equal(threadWrites().length,0);assert.equal(messageWrites().length,0);
  await page.locator('.bi-selection [data-bi-action="card"]').click();await page.locator('.bi-card-dialog[open]').waitFor();
  assert.equal(await page.locator('.bi-card-body h3').textContent(),'合成公開名片');
  assert.equal(await page.locator('.bi-card-links a').count(),1);assert.equal(await page.evaluate(()=>window.__xss),0);
  assert.equal(threadWrites().length,0);assert.equal(messageWrites().length,0);
  await page.locator('.bi-card-dialog header button').click();record('member summary and public-card GET never create a conversation or send a message');

  assert.equal(await page.locator('#bi-sort').inputValue(),'random');
  assert.equal(memberCalls()[0].query.sort,'random');
  assert.equal(await page.locator('.bi-list article.bi-member').count(),3);
  assert.equal(await page.locator('.bi-list .bi-member-actions button').count(),6);
  assert.equal(await page.locator('[data-bi-action="more"]').isVisible(),true,'random batches remain explorable without a cursor');
  await page.locator('[data-bi-action="more"]').click();await waitMembers(4);
  assert.equal(await page.locator('.bi-list [data-bi-member="card-e"]').count(),1,'another random batch reaches members beyond the first batch');
  assert.equal(memberCalls().at(-1).query.sort,'random');
  assert.equal(memberCalls().at(-1).query.after,undefined);
  let previous=await selectedHandle();const rolled=[];
  for(let turn=0;turn<6;turn++) {
    const before=memberCalls().length;
    await page.locator('[data-bi-action="roll"]').scrollIntoViewIfNeeded();
    const rollScroll=await page.locator('#main').evaluate(element=>element.scrollTop);
    await page.locator('[data-bi-action="roll"]').click();await waitUntil(()=>memberCalls().length>before);
    await page.waitForFunction(()=>!document.querySelector('[data-bi-action="roll"]').disabled&&document.querySelector('.bi-list .bi-member-select[aria-pressed="true"]'));
    assert.ok(Math.abs(await page.locator('#main').evaluate(element=>element.scrollTop)-rollScroll)<=2,'dice rolls must keep the current scroll position');
    const handle=await selectedHandle();assert.ok(handle);assert.notEqual(handle,previous,'two or more candidates must not repeat the previous member');
    assert.equal(memberCalls().at(-1).query.sort,'random');assert.equal(memberCalls().at(-1).query.after,undefined);
    assert.equal(await page.locator('.bi-card-dialog[open]').count(),0);assert.equal(await page.evaluate(()=>window.currentPage),'business-island');
    rolled.push(handle);previous=handle;
  }
  assert.ok(new Set(rolled).size>1);assert.equal(threadWrites().length,0);assert.equal(messageWrites().length,0);
  assert.equal(calls.filter(call=>call.method==='POST').length,0,'dice exploration performs only read requests');
  record('default random batches and six dice rolls reach new members, avoid consecutive repeats and never open or write automatically');

  await submit('陳');await waitMembers(1);assert.equal(await page.locator('.bi-list .bi-member-select').getAttribute('data-bi-member'),'card-b');
  await page.locator('[data-bi-action="roll"]').click();await waitMembers(1);
  assert.equal(memberCalls().at(-1).query.q,'陳');assert.equal(memberCalls().at(-1).query.sort,'random');
  await submit();await waitMembers();await page.locator('#bi-industry').selectOption('餐飲食品');await waitMembers(2);
  assert.equal(calls.at(-1).query.industry,'餐飲食品');
  await page.locator('[data-bi-action="roll"]').click();await waitMembers(2);
  assert.equal(memberCalls().at(-1).query.industry,'餐飲食品');assert.equal(memberCalls().at(-1).query.sort,'random');
  await page.locator('#bi-sort').selectOption('match');await waitMembers(2);assert.equal(calls.at(-1).query.sort,'match');
  await page.locator('#bi-industry').selectOption('');await waitMembers();
  await page.locator('#bi-sort').selectOption('latest');await waitMembers();
  await page.locator('[data-bi-action="more"]').click();await waitMembers(4);
  assert.equal(await page.locator('.bi-list [data-bi-member="card-e"]').count(),1);assert.equal(calls.at(-1).query.after,'page-2');
  assert.equal(await page.locator('[data-bi-action="more"]').isVisible(),false);record('search, industry, ranking and pagination use the real controls');

  await submit();await waitMembers();holdNextPage=true;
  await page.locator('[data-bi-action="more"]').click();await waitUntil(()=>pending.has('pagination'));
  await selectZone('board');await page.locator('[data-bi-post="post-one"]').waitFor();
  await selectZone('people');await waitMembers();
  assert.equal(await page.locator('[data-bi-action="more"]').isEnabled(),true,'returning while an old page is pending must restore More');
  pending.get('pagination')();pending.delete('pagination');await page.waitForTimeout(75);await waitMembers();
  await page.locator('[data-bi-action="more"]').click();await waitMembers(4);
  record('switching zones during pagination ignores the old result and keeps More usable');

  await page.locator('.bi-list [data-bi-member="card-b"]').scrollIntoViewIfNeeded();
  const memberScroll=await page.locator('#main').evaluate(element=>element.scrollTop);
  await page.locator('.bi-list [data-bi-member="card-b"]').click();
  assert.ok(Math.abs(await page.locator('#main').evaluate(element=>element.scrollTop)-memberScroll)<=2,'selecting a member must not jump to the panel');
  await page.evaluate(()=>document.querySelector('#main').scrollTop=0);
  await selectZone('home');assert.equal(await page.locator('#main').evaluate(element=>element.scrollTop),0,'zone changes must not force the panel into view');
  await selectZone('people');await waitMembers(4);
  record('member and zone selection keep the single main scroll position');

  await page.locator('.bi-selection [data-bi-action="chat"]').scrollIntoViewIfNeeded();
  const chatScroll=await page.locator('#main').evaluate(element=>element.scrollTop), chatMember=await selectedHandle();
  await page.locator('.bi-selection [data-bi-action="chat"]').click();await page.locator('.member-chat[open] .mc-peer strong').waitFor();
  await page.waitForFunction(()=>document.querySelector('.mc-peer strong')?.textContent==='陳小商');
  assert.equal(threadWrites().length,1);assert.equal(messageWrites().length,0);
  await page.locator('#mc-body').fill('本機合成商務交流訊息');await page.locator('.mc-compose button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#mc-body')?.value==='');
  assert.equal(messageWrites().length,1);assert.equal(messages[0].body,'本機合成商務交流訊息');
  await page.locator('.member-chat[open] [data-action="close"]').click();assert.equal(await island().isVisible(),true);
  assert.equal(await page.evaluate(()=>window.currentPage),'business-island');assert.equal(await selectedHandle(),chatMember);
  assert.ok(Math.abs(await page.locator('#main').evaluate(element=>element.scrollTop)-chatScroll)<=2,'closing the original chat returns to the same island position');
  record('explicit Start Exchange creates one thread and opens the original working synthetic message composer');

  const restoredMember=await selectedHandle(), restoredSort=await page.locator('#bi-sort').inputValue();
  const restoredRows=await page.locator('.bi-list .bi-member-select').evaluateAll(elements=>elements.map(element=>element.dataset.biMember));
  const restoredScroll=await page.locator('#main').evaluate(element=>element.scrollTop);
  await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await waitMembers(4);
  assert.equal(await page.evaluate(()=>window.currentPage),'business-island');assert.equal(await selectedHandle(),restoredMember);
  assert.equal(await page.locator('#bi-sort').inputValue(),restoredSort);
  assert.deepEqual(await page.locator('.bi-list .bi-member-select').evaluateAll(elements=>elements.map(element=>element.dataset.biMember)),restoredRows);
  assert.ok(Math.abs(await page.locator('#main').evaluate(element=>element.scrollTop)-restoredScroll)<=2,'BFCache restoration keeps the island scroll position');
  await page.locator('.bi-list [data-bi-handle="card-b"][data-bi-action="card"]').click();await page.locator('.bi-card-dialog[open]').waitFor();
  assert.equal(calls.at(-1).path,'/v1/member-chat/members/card-b/card');
  await page.locator('.bi-card-dialog header button').click();
  assert.doesNotMatch(await page.locator('[data-bi-status]').textContent(),/重新進入 LINE|登入身分已變更/);
  assert.equal(threadWrites().length,1);assert.equal(messageWrites().length,1);
  record('BFCache pagehide/pageshow restores the same members and selected card with a usable authenticated read client');

  await selectZone('board');await page.locator('[data-bi-post="post-one"]').waitFor();
  assert.equal(await page.locator('.bi-post strong').textContent(),'尋找公開合作夥伴');
  await page.locator('[data-bi-post="post-one"]').click();await page.locator('.fixture-post[open]').waitFor();
  assert.ok(await page.evaluate(()=>window.__fixtureEvents.some(event=>event.kind==='exchange'&&event.tab==='public')));
  assert.ok(await page.evaluate(()=>window.__fixtureEvents.some(event=>event.kind==='post'&&event.handle==='post-one')));
  await page.locator('.fixture-post button').click();assert.equal(threadWrites().length,1);record('published cooperation data hands off to the original public-post detail entry');

  await selectZone('home');await page.locator('[data-bi-action="my-chats"]').click();await page.locator('.member-chat[open] .mc-contact').waitFor();
  assert.equal(await page.locator('.member-chat[open] .mc-contact strong').textContent(),'陳小商');
  await page.locator('.member-chat[open] [data-action="close"]').click();
  await page.locator('[data-bi-action="my-card"]').click();assert.equal(await page.evaluate(()=>window.currentPage),'admin-settings');
  assert.ok(await page.evaluate(()=>window.__fixtureEvents.some(event=>event.kind==='my-card')));
  await page.evaluate(()=>window.openBusinessIsland());await selectZone('people');await waitMembers(4);record('My Hut keeps the existing personal-card and chat entry points');

  await page.locator('[data-bi-action="list"]').click();assert.equal(await page.locator('.bi-map').isVisible(),false);
  assert.equal(await island().getAttribute('data-view'),'list');
  await page.locator('[data-bi-action="exit"]').click();assert.equal(await island().isVisible(),false);
  await page.evaluate(()=>window.openBusinessIsland());await waitMembers(4);
  assert.equal(await island().getAttribute('data-view'),'list');
  assert.equal(await page.locator('[data-bi-action="list"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-bi-action="list"]').textContent(),'回到島嶼');
  assert.equal(await page.locator('.bi-map').isVisible(),false);
  await page.locator('[data-bi-action="list"]').click();assert.equal(await page.locator('.bi-map').isVisible(),true);
  assert.equal(await page.locator('[data-bi-action="list"]').getAttribute('aria-pressed'),'false');
  record('quick list provides an equivalent non-map member view');
  const layouts=[];
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:width>900?1000:844});
    await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('#main').scrollTop=0;});
    const measure=await page.evaluate(()=>{
      const main=document.querySelector('#main'),panel=document.querySelector('.bi-panel'),map=document.querySelector('.bi-map'),list=document.querySelector('.bi-list'),explore=document.querySelector('.bi-explore');
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,appWidth:document.querySelector('#app').getBoundingClientRect().width,mainHeight:main.clientHeight,mainScrollHeight:main.scrollHeight,mainOverflowY:getComputedStyle(main).overflowY,topNavDisplay:getComputedStyle(document.querySelector('#top-nav')).display,bottomNavDisplay:getComputedStyle(document.querySelector('#bottom-nav')).display,bottomAdminDisplay:getComputedStyle(document.querySelector('#bottom-nav-admin')).display,rootWidth:document.querySelector('#page-business-island').getBoundingClientRect().width,mapWidth:map.clientWidth,mapScrollWidth:map.scrollWidth,mapBottom:map.getBoundingClientRect().bottom,exploreTop:explore.getBoundingClientRect().top,exploreBottom:explore.getBoundingClientRect().bottom,panelTop:panel.getBoundingClientRect().top,panelHeight:panel.clientHeight,panelScrollHeight:panel.scrollHeight,panelOverflowY:getComputedStyle(panel).overflowY,listHeight:list.clientHeight,listScrollHeight:list.scrollHeight,listOverflowY:getComputedStyle(list).overflowY,buttons:[...document.querySelectorAll('.bi-toolbar button,.bi-tabs button,.bi-selection button,.bi-search button,.bi-roll,.bi-member-select,.bi-member-actions button,.bi-hotspot,.bi-pin')].filter(element=>element.getClientRects().length).map(element=>({text:element.textContent.trim(),height:element.getBoundingClientRect().height,width:element.getBoundingClientRect().width}))};
    });
    assert.ok(measure.documentWidth<=width+1,JSON.stringify(measure));assert.ok(measure.buttons.length>=8);
    assert.ok(measure.buttons.every(button=>button.height>=44&&button.width>=44),JSON.stringify(measure));layouts.push(measure);
    assert.equal(measure.topNavDisplay,'none');assert.equal(measure.mainOverflowY,'auto');
    assert.equal(measure.bottomNavDisplay,'none');assert.equal(measure.bottomAdminDisplay,'none');
    assert.ok(measure.rootWidth<=1000+1,JSON.stringify(measure));assert.ok(measure.mapScrollWidth<=measure.mapWidth+1,JSON.stringify(measure));
    assert.ok(measure.mapBottom<=measure.exploreTop+1&&measure.exploreBottom<=measure.panelTop+1,'scene, dice and member content are ordered from top to bottom');
    assert.equal(measure.panelOverflowY,'visible');assert.equal(measure.listOverflowY,'visible');
    assert.ok(measure.panelScrollHeight<=measure.panelHeight+1&&measure.listScrollHeight<=measure.listHeight+1,JSON.stringify(measure));
    assert.ok(measure.mainScrollHeight>measure.mainHeight,JSON.stringify(measure));
    await page.locator('.bi-list .bi-member').last().scrollIntoViewIfNeeded();assert.ok(await page.locator('#main').evaluate(element=>element.scrollTop)>0);
    if(width===390)await page.screenshot({path:join(output,'business-island-390-panel.png'),fullPage:true});
    await page.locator('#main').evaluate(element=>element.scrollTop=0);
    await page.screenshot({path:join(output,`business-island-${width}.png`),fullPage:true});
  }
  await writeFile(join(output,'layout-metrics.json'),JSON.stringify(layouts,null,2));record('320/390/768/1440 layouts flow scene, dice and member cards vertically with one scroll container and at least 44px hit areas');

  const manyPage=await context.newPage();diagnosticPage=manyPage;manyPage.on('pageerror',error=>errors.push(error.message));
  await manyPage.goto(base);await manyPage.locator('#fixture-open').click();
  await manyPage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===3);
  await manyPage.locator('#bi-query').fill('多名單');await manyPage.locator('.bi-search button[type=submit]').click();
  await manyPage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===18&&!document.querySelector('[data-bi-action="more"]').disabled);
  const manyLayouts=[];
  for(const width of [390,701,730,1440]) {
    await manyPage.setViewportSize({width,height:width>900?1000:844});
    await manyPage.locator('#main').evaluate(element=>element.scrollTop=0);
    const measure=await manyPage.evaluate(()=>{
      const rect=element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};};
      const list=document.querySelector('.bi-list'),map=document.querySelector('.bi-map');
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,map:rect(map),pins:[...document.querySelectorAll('.bi-pin')].filter(element=>element.getClientRects().length).map(rect),hotspots:[...document.querySelectorAll('.bi-hotspot')].map(rect),cards:[...list.querySelectorAll('.bi-member')].map(element=>({handle:element.querySelector('.bi-member-select').dataset.biMember,actions:[...element.querySelectorAll('.bi-member-actions button')].map(button=>button.dataset.biAction)})),listOverflow:getComputedStyle(list).overflowY,panelOverflow:getComputedStyle(document.querySelector('.bi-panel')).overflowY};
    });
    assert.equal(measure.pins.length,width<=700?8:12,JSON.stringify(measure));
    assert.equal(measure.cards.length,18);assert.equal(new Set(measure.cards.map(row=>row.handle)).size,18);
    assert.ok(measure.cards.every(row=>row.actions.join(',')==='card,chat'),'every member keeps both explicit actions');
    assert.equal(measure.listOverflow,'visible');assert.equal(measure.panelOverflow,'visible');assert.ok(measure.documentWidth<=width+1);
    const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    for(let index=0;index<measure.pins.length;index++) {
      const pin=measure.pins[index];
      assert.ok(pin.left>=measure.map.left-1&&pin.right<=measure.map.right+1&&pin.top>=measure.map.top-1&&pin.bottom<=measure.map.bottom+1,'member pin stays inside the map');
      assert.ok(!measure.pins.slice(index+1).some(other=>overlap(pin,other)),'member pins must not cover each other at '+width+'px');
      assert.ok(!measure.hotspots.some(hotspot=>overlap(pin,hotspot)),'member pins must not cover zone controls at '+width+'px');
    }
    for(const card of await manyPage.locator('.bi-list .bi-member').all()) {
      await card.scrollIntoViewIfNeeded();
      assert.ok(await card.evaluate(element=>{const row=element.getBoundingClientRect(),main=document.querySelector('#main').getBoundingClientRect();return row.top>=main.top-1&&row.bottom<=main.bottom+1&&row.left>=main.left-1&&row.right<=main.right+1;}),'all 18 member cards are reachable through the main vertical scroll');
    }
    assert.ok(await manyPage.locator('#main').evaluate(element=>element.scrollTop)>0);
    if(width===390)await manyPage.screenshot({path:join(output,'business-island-many-390-last-cards.png'),fullPage:true});
    await manyPage.locator('#main').evaluate(element=>element.scrollTop=0);
    await manyPage.screenshot({path:join(output,`business-island-many-${width}.png`),fullPage:true});manyLayouts.push(measure);
  }
  await writeFile(join(output,'many-members-layout-metrics.json'),JSON.stringify(manyLayouts,null,2));
  await manyPage.close();diagnosticPage=page;record('18 synthetic member cards remain vertically reachable with both actions while 390px shows 8 pins and 701/730/1440px show 12 non-overlapping pins');

  const racePage=await context.newPage();diagnosticPage=racePage;racePage.on('pageerror',error=>errors.push(error.message));
  const raceReady=async(count=3)=>racePage.waitForFunction(count=>document.querySelectorAll('.bi-list .bi-member').length===count&&!document.querySelector('[data-bi-action="roll"]').disabled&&!document.querySelector('[data-bi-action="more"]').disabled,count);
  const releaseDice=async key=>{pending.get(key)();pending.delete(key);await racePage.waitForTimeout(500);};
  await racePage.goto(base);await racePage.locator('#fixture-open').click();await raceReady();
  holdNextRandom='dice-zone';await racePage.locator('[data-bi-action="roll"]').click();await waitUntil(()=>pending.has('dice-zone'));
  await racePage.locator('.bi-tabs [data-bi-zone="home"]').click();await releaseDice('dice-zone');
  assert.equal(await racePage.locator('[data-bi-title]').textContent(),'我的小屋');assert.equal(await racePage.locator('.bi-explore').isVisible(),false);
  await racePage.locator('.bi-tabs [data-bi-zone="people"]').click();await raceReady();
  assert.equal(await racePage.getByText('舊骰子回應不得呈現 dice-zone',{exact:true}).count(),0);
  const zoneRows=await racePage.locator('.bi-list .bi-member-select').evaluateAll(elements=>elements.map(element=>element.dataset.biMember));
  assert.ok(zoneRows.every(handle=>!handle.startsWith('stale-')));
  holdNextRandom='dice-query';await racePage.locator('[data-bi-action="roll"]').click();await waitUntil(()=>pending.has('dice-query'));
  await racePage.locator('#bi-query').fill('陳');await racePage.locator('.bi-search button[type=submit]').click();await raceReady(1);
  const queryResult=await racePage.locator('.bi-roll-result').textContent();await releaseDice('dice-query');
  assert.equal(await racePage.locator('.bi-list .bi-member-select').getAttribute('data-bi-member'),'card-b');
  assert.equal(await racePage.locator('#bi-query').inputValue(),'陳');assert.equal(await racePage.locator('.bi-roll-result').textContent(),queryResult);
  assert.equal(await racePage.getByText('舊骰子回應不得呈現 dice-query',{exact:true}).count(),0);
  holdNextRandom='dice-exit';await racePage.locator('[data-bi-action="roll"]').click();await waitUntil(()=>pending.has('dice-exit'));
  await racePage.evaluate(()=>window.goPage('home',true));await releaseDice('dice-exit');
  assert.equal(await racePage.evaluate(()=>window.currentPage),'home');assert.equal(await racePage.locator('#page-business-island').isVisible(),false);
  assert.equal(await racePage.getByText('舊骰子回應不得呈現 dice-exit',{exact:true}).count(),0);
  await racePage.evaluate(()=>window.openBusinessIsland());await raceReady(1);
  failNextRandom=true;await racePage.locator('[data-bi-action="roll"]').click();
  await racePage.waitForFunction(()=>document.querySelector('[data-bi-status]').textContent==='合成骰子暫時失敗'&&!document.querySelector('[data-bi-action="roll"]').disabled);
  assert.equal(await racePage.locator('[data-bi-retry]').isVisible(),true);
  await racePage.locator('[data-bi-action="roll"]').click();await raceReady(1);
  assert.notEqual(await racePage.locator('[data-bi-status]').textContent(),'合成骰子暫時失敗');
  assert.equal(await racePage.evaluate(()=>window.currentPage),'business-island');
  assert.equal(threadWrites().length,1);assert.equal(messageWrites().length,1);
  await racePage.close();diagnosticPage=page;record('delayed dice responses cannot overwrite a new zone, query or exited page, and failed dice requests leave the control retryable');

  await page.locator('[data-bi-action="exit"]').click();assert.equal(await page.evaluate(()=>window.currentPage),'home');
  assert.equal(await page.locator('#app').evaluate(element=>element.getBoundingClientRect().width),448);
  assert.equal(await page.locator('#top-nav').isVisible(),true);assert.equal(await page.locator('#bottom-nav').isVisible(),true);
  assert.equal(await page.locator('#main').evaluate(element=>getComputedStyle(element).paddingTop),'112px');
  await page.evaluate(()=>window.openStoreRichman());await page.locator('#business-richman-roll').waitFor();
  assert.equal(await page.locator('#app').evaluate(element=>element.getBoundingClientRect().width),448);assert.equal(await page.locator('#top-nav').isVisible(),true);
  await page.evaluate(()=>window.goPage('store-shop',true));assert.equal(await page.locator('#top-nav').isVisible(),false);assert.equal(await page.locator('#bottom-nav').isVisible(),true);
  assert.equal(await page.locator('#app').evaluate(element=>element.getBoundingClientRect().width),448);
  await page.locator('#fixture-bottom-home').click();assert.equal(await page.locator('#top-nav').isVisible(),true);
  await page.evaluate(()=>window.openBusinessIsland());await waitMembers(4);assert.ok(await island().evaluate(element=>element.getBoundingClientRect().width)<=1000);
  assert.equal(await page.locator('#bottom-nav').isVisible(),false);
  record('island suppresses accidental main-navigation exits and restores the original home and store navigation on explicit exit');

  await page.setViewportSize({width:390,height:844});await submit('late-leave');await waitUntil(()=>pending.has('late-leave'));
  await page.evaluate(()=>window.goPage('home',true));pending.get('late-leave')();pending.delete('late-leave');
  await page.waitForTimeout(75);assert.equal(await page.evaluate(()=>window.currentPage),'home');assert.equal(await island().isVisible(),false);
  assert.equal(await page.getByText('舊回應不得呈現 late-leave',{exact:true}).count(),0);
  await page.goto(base);await page.locator('#fixture-open').click();await waitMembers();
  await submit('late-account');await waitUntil(()=>pending.has('late-account'));await page.evaluate(()=>window.fixtureSwitchAccount());pending.get('late-account')();pending.delete('late-account');
  await page.waitForTimeout(75);assert.equal(await page.getByText('舊回應不得呈現 late-account',{exact:true}).count(),0);
  await page.locator('.bi-selection [data-bi-action="card"]').click();await page.waitForFunction(()=>document.querySelector('[data-bi-status]')?.textContent.includes('登入身分已變更'));
  assert.equal(await page.locator('.bi-list .bi-member').count(),0);record('leaving or changing account prevents stale member responses and actions');

  await page.goto(base);await page.locator('#fixture-open').click();await waitMembers();
  await page.evaluate(()=>window.openStoreRichman({onExit:()=>window.goPage('home',true)}));
  await page.locator('#business-richman-roll').waitFor();assert.equal(await page.evaluate(()=>window.currentPage),'business-richman');
  assert.match(await page.locator('#page-business-richman').innerText(),/商城大富翁/);
  await page.locator('#business-richman-roll').click();await page.locator('#fixture-store-back').waitFor({timeout:15000});
  assert.equal(await page.evaluate(()=>window.currentPage),'store-shop');await page.locator('#fixture-store-back').click();await page.locator('#business-richman-roll').waitFor();
  assert.equal(await page.evaluate(()=>window.currentPage),'business-richman');
  const savedBefore=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.endsWith(':store')));
  await page.evaluate(()=>window.openBusinessIsland());await waitMembers();
  assert.equal(await page.evaluate(()=>window.currentPage),'business-island');
  assert.deepEqual(await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.endsWith(':store'))),savedBefore);
  assert.equal(threadWrites().length,1);assert.equal(messageWrites().length,1);record('real store provider keeps dice, storefront return and independent progress after island integration');
  assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
} catch(error) {
  failure=error;await mkdir(output,{recursive:true});await diagnosticPage.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});
  console.error(error.stack);
} finally {
  for(const release of pending.values())release();
  await writeFile(join(output,'report.json'),JSON.stringify({checks,apiCalls:calls.length,threadWrites:threadWrites().length,messageWrites:messageWrites().length,outsideRequests:outside,errors,failure:failure?.message||null},null,2));
  await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
if(failure)throw failure;
console.log(`Business island browser regression passed: ${checks.length} checks; outputs ${output}`);
