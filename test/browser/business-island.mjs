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
const islandKinds=[
  {key:'food',company:'合成餐飲食品公司',title:'餐廳主理人'},
  {key:'lodging',company:'合成旅宿飯店',title:'住宿服務經理'},
  {key:'leisure',company:'合成休閒遊樂園',title:'休閒活動企劃'},
  {key:'shopping',company:'合成零售電商',title:'購物通路主管'},
  {key:'mobility',company:'合成交通運輸物流',title:'運輸服務經理'},
  {key:'services',company:'合成專業服務顧問',title:'商務顧問'},
  {key:'manufacturing',company:'合成製造工廠',title:'工廠管理人'}
];
const manyMembers=Array.from({length:18},(_,index)=>{const theme=islandKinds[index%islandKinds.length];return {handle:'many-'+String(index+1).padStart(2,'0'),name:'多名單會員'+String(index+1).padStart(2,'0'),company:theme.company+' '+(index+1),title:theme.title,memberNumber:'20261025'+String(index+10).padStart(3,'0'),avatarUrl:index%2?picture:'',industry:'科技資訊',match:null};});
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
      if(q==='遠航'||q==='同島') {const far={...manyMembers[6],handle:'far-manufacturer',name:'遠航製造夥伴'};ok(res,{items:q==='遠航'?[far]:[far,{...far,handle:'near-manufacturer',name:'同島製造夥伴'}],next:'',industries:['製造']});return;}
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
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
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
const diceGeometry=worldPage=>worldPage.locator('.bi-3d-die').evaluateAll(dice=>dice.map(cube=>{
  const cubeMatrix=new DOMMatrix(getComputedStyle(cube).transform);
  const faces=[...cube.querySelectorAll('.bi-3d-face')].map(face=>{
    const normal=cubeMatrix.multiply(new DOMMatrix(getComputedStyle(face).transform)).transformPoint(new DOMPoint(0,0,1,0));
    return {side:['front','back','right','left','top','bottom'].find(side=>face.classList.contains(side)),pips:face.querySelectorAll('.bi-dot').length,z:normal.z};
  });
  return {value:Number(cube.dataset.value),preserve3d:getComputedStyle(cube).transformStyle,faces,frontPips:faces.toSorted((left,right)=>right.z-left.z)[0].pips};
}));
const assertDiceGeometry=geometry=>{
  assert.equal(geometry.length,2,'the dice control contains two real cubes');
  for(const cube of geometry){assert.equal(cube.preserve3d,'preserve-3d');assert.deepEqual(cube.faces.map(({side,pips})=>({side,pips})),[{side:'front',pips:1},{side:'back',pips:6},{side:'right',pips:3},{side:'left',pips:4},{side:'top',pips:5},{side:'bottom',pips:2}]);assert.equal(cube.frontPips,cube.value,'the face pointing toward the viewer must match the actual result');}
};
const readWorldState=worldPage=>worldPage.evaluate(()=>{
  const dice=document.querySelector('.bi-3d-dice-box'),player=document.querySelector('.bi-world-player'),world=document.querySelector('.bi-world'),matrix=new DOMMatrix(getComputedStyle(player).transform);
  return {metadata:{first:dice.dataset.dice1,second:dice.dataset.dice2,total:dice.dataset.total,step:player.dataset.step,steps:player.dataset.total,target:player.dataset.target??''},x:matrix.m41,y:matrix.m42,width:world.clientWidth,height:world.clientHeight};
});
const assertWorldState=(actual,expected,label)=>{
  assert.deepEqual(actual.metadata,expected.metadata,label+' preserves both dice and the walking metadata');
  assert.ok(Math.abs(actual.x-expected.x)<=.05&&Math.abs(actual.y-expected.y)<=.05,label+' preserves the character transform: '+JSON.stringify({actual,expected}));
  assert.equal(actual.width,expected.width);assert.equal(actual.height,expected.height);
};
// Delegate every operation to Chrome's real Web Audio graph, observing its output and cleanup.
function installAudioProbe() {
  const Native=window.AudioContext||window.webkitAudioContext;
  window.__audioProbe={contexts:[],sources:[],events:[],analysers:[]};
  if(!Native)return;
  const probe=window.__audioProbe,connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(target,...args){
    if(probe.contexts.some(context=>target===context.destination)&&!(this instanceof AnalyserNode)) {
      const analyser=this.context.createAnalyser();analyser.fftSize=2048;probe.analysers.push(analyser);
      connect.call(this,analyser,...args);connect.call(analyser,target);return target;
    }
    return connect.call(this,target,...args);
  };
  const realState=Object.getOwnPropertyDescriptor(BaseAudioContext.prototype,'state').get;
  window.AudioContext=class extends Native {
    constructor(...args) {
      super(...args);const context=this;probe.contexts.push(context);probe.events.push({kind:'create',at:performance.now(),gesture:navigator.userActivation.isActive});
      if(window.__rejectAudioResume)Object.defineProperty(context,'state',{get:()=>window.__rejectAudioResume?'suspended':realState.call(context)});
      for(const method of ['resume','suspend','close']) {
        const original=context[method].bind(context);
        context[method]=(...values)=>{probe.events.push({kind:method,at:performance.now(),gesture:navigator.userActivation.isActive});if(method==='resume'&&window.__rejectAudioResume)return Promise.reject(new DOMException('Synthetic audio policy rejection','NotAllowedError'));return original(...values);};
      }
      for(const method of ['createOscillator','createBufferSource']) {
        const original=context[method].bind(context);
        context[method]=(...values)=>{
          const node=original(...values),source={kind:method,context,started:false,ended:false,startAt:0,stopAt:Infinity};probe.sources.push(source);
          const start=node.start.bind(node),stop=node.stop.bind(node);
          node.start=(at=0)=>{source.started=true;source.startAt=at;probe.events.push({kind:'start',type:method,at:performance.now()});return start(at);};
          node.stop=at=>{source.stopAt=at??context.currentTime;probe.events.push({kind:'stop',type:method,at:performance.now(),immediate:at===undefined||at<=context.currentTime+.01});return at===undefined?stop():stop(at);};
          node.addEventListener('ended',()=>{source.ended=true;});return node;
        };
      }
    }
  };
}
const audioRms=audioPage=>audioPage.evaluate(()=>Math.max(0,...window.__audioProbe.analysers.map(analyser=>{const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,sample)=>sum+sample*sample,0)/samples.length);})));
const audioChannels=audioPage=>audioPage.evaluate(()=>window.__audioProbe.analysers.map(analyser=>{const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,sample)=>sum+sample*sample,0)/samples.length);}));
const peakAudio=async(audioPage,milliseconds=700)=>{let peak=0;const until=Date.now()+milliseconds;while(Date.now()<until){peak=Math.max(peak,await audioRms(audioPage));await audioPage.waitForTimeout(50);}return peak;};
const audioSnapshot=audioPage=>audioPage.evaluate(()=>({states:window.__audioProbe.contexts.map(context=>context.state),events:window.__audioProbe.events,started:window.__audioProbe.sources.filter(source=>source.started).length,active:window.__audioProbe.sources.filter(source=>source.started&&!source.ended&&source.stopAt>source.context.currentTime+.05).length}));
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
    // Exercise every settled face in the real UI; only this synthetic tab's random source is fixed.
    await page.evaluate(value=>{window.__nativeGetRandomValues??=window.crypto.getRandomValues.bind(window.crypto);window.crypto.getRandomValues=values=>values.fill(value);},Math.floor(([0,.99,.4,.6,.2,.8][turn])*4294967296));
    const before=memberCalls().length;
    await page.locator('[data-bi-action="roll"]').scrollIntoViewIfNeeded();
    const reducedStart=Date.now();
    await page.locator('[data-bi-action="roll"]').click();await waitUntil(()=>memberCalls().length>before);
    await page.waitForFunction(()=>!document.querySelector('[data-bi-action="roll"]').disabled&&document.querySelector('.bi-list .bi-member-select[aria-pressed="true"]'));
    assert.ok(Date.now()-reducedStart<1500,'reduced motion must arrive immediately instead of waiting for the full walk');
    const handle=await selectedHandle();assert.ok(handle);assert.notEqual(handle,previous,'two or more candidates must not repeat the previous member');
    const reducedResult=await page.evaluate(()=>{const dice=document.querySelector('.bi-3d-dice-box'),player=document.querySelector('.bi-world-player');return {first:Number(dice.dataset.dice1),second:Number(dice.dataset.dice2),total:Number(dice.dataset.total),step:Number(player.dataset.step),target:player.dataset.target,moving:player.dataset.moving};});
    assert.equal(reducedResult.total,reducedResult.first+reducedResult.second);assert.equal(reducedResult.step,reducedResult.total);assert.equal(reducedResult.target,handle);assert.equal(reducedResult.moving,'false');
    assertDiceGeometry(await diceGeometry(page));
    assert.equal(memberCalls().at(-1).query.sort,'random');assert.equal(memberCalls().at(-1).query.after,undefined);
    assert.equal(await page.locator('.bi-card-dialog[open]').count(),0);assert.equal(await page.evaluate(()=>window.currentPage),'business-island');
    rolled.push(handle);previous=handle;
  }
  await page.evaluate(()=>{window.crypto.getRandomValues=window.__nativeGetRandomValues;});
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

  const restoredMember=await selectedHandle(), restoredSort=await page.locator('#bi-sort').inputValue(), restoredWorld=await readWorldState(page);
  const restoredRows=await page.locator('.bi-list .bi-member-select').evaluateAll(elements=>elements.map(element=>element.dataset.biMember));
  const restoredScroll=await page.locator('#main').evaluate(element=>element.scrollTop);
  await page.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  await waitMembers(4);
  assert.equal(await page.evaluate(()=>window.currentPage),'business-island');assert.equal(await selectedHandle(),restoredMember);
  assert.equal(await page.locator('#bi-sort').inputValue(),restoredSort);
  assert.deepEqual(await page.locator('.bi-list .bi-member-select').evaluateAll(elements=>elements.map(element=>element.dataset.biMember)),restoredRows);
  await page.waitForFunction(position=>Math.abs(document.querySelector('#main').scrollTop-position)<=2,restoredScroll,{timeout:2000});
  assert.ok(Math.abs(await page.locator('#main').evaluate(element=>element.scrollTop)-restoredScroll)<=2,'BFCache restoration keeps the island scroll position');
  assertWorldState(await readWorldState(page),restoredWorld,'BFCache restoration');assertDiceGeometry(await diceGeometry(page));
  await page.locator('.bi-list [data-bi-handle="card-b"][data-bi-action="card"]').click();await page.locator('.bi-card-dialog[open]').waitFor();
  assert.equal(calls.at(-1).path,'/v1/member-chat/members/card-b/card');
  await page.locator('.bi-card-dialog header button').click();
  assert.doesNotMatch(await page.locator('[data-bi-status]').textContent(),/重新進入 LINE|登入身分已變更/);
  assert.equal(threadWrites().length,1);assert.equal(messageWrites().length,1);
  record('BFCache pagehide/pageshow restores the same members and selected card with a usable authenticated read client');

  const boardWorld=await readWorldState(page);
  await selectZone('board');await page.locator('[data-bi-post="post-one"]').waitFor();
  assert.equal(await page.locator('.bi-post strong').textContent(),'尋找公開合作夥伴');
  await page.locator('[data-bi-post="post-one"]').click();await page.locator('.fixture-post[open]').waitFor();
  assert.ok(await page.evaluate(()=>window.__fixtureEvents.some(event=>event.kind==='exchange'&&event.tab==='public')));
  assert.ok(await page.evaluate(()=>window.__fixtureEvents.some(event=>event.kind==='post'&&event.handle==='post-one')));
  await page.locator('.fixture-post button').click();assert.equal(threadWrites().length,1);record('published cooperation data hands off to the original public-post detail entry');
  await selectZone('people');await waitMembers(4);assertWorldState(await readWorldState(page),boardWorld,'board-to-people return');
  await selectZone('board');await page.locator('[data-bi-post="post-one"]').waitFor();
  await page.locator('[data-bi-action="exit"]').click();assert.equal(await page.evaluate(()=>window.currentPage),'home');
  await page.evaluate(()=>window.openBusinessIsland());await page.locator('[data-bi-post="post-one"]').waitFor();
  assert.equal(await page.locator('[data-bi-title]').textContent(),'合作告示板');
  await selectZone('people');await waitMembers(4);assertWorldState(await readWorldState(page),boardWorld,'hidden board exit and reopening');assertDiceGeometry(await diceGeometry(page));

  await selectZone('home');await page.locator('[data-bi-action="my-chats"]').click();await page.locator('.member-chat[open] .mc-contact').waitFor();
  assert.equal(await page.locator('.member-chat[open] .mc-contact strong').textContent(),'陳小商');
  await page.locator('.member-chat[open] [data-action="close"]').click();
  await page.locator('[data-bi-action="my-card"]').click();assert.equal(await page.evaluate(()=>window.currentPage),'admin-settings');
  assert.ok(await page.evaluate(()=>window.__fixtureEvents.some(event=>event.kind==='my-card')));
  await page.evaluate(()=>window.openBusinessIsland());await selectZone('people');await waitMembers(4);record('My Hut keeps the existing personal-card and chat entry points');

  const listWorld=await readWorldState(page);
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
  assertWorldState(await readWorldState(page),listWorld,'hidden quick-list reopen');assertDiceGeometry(await diceGeometry(page));
  record('quick-list reopening and board-to-people navigation preserve the dice and actual character position');
  const layouts=[];
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:width>900?1000:844});
    await page.evaluate(()=>{window.scrollTo(0,0);document.querySelector('#main').scrollTop=0;});
    const measure=await page.evaluate(()=>{
      const main=document.querySelector('#main'),panel=document.querySelector('.bi-panel'),map=document.querySelector('.bi-map'),list=document.querySelector('.bi-list'),explore=document.querySelector('.bi-explore');
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,appWidth:document.querySelector('#app').getBoundingClientRect().width,mainHeight:main.clientHeight,mainScrollHeight:main.scrollHeight,mainOverflowY:getComputedStyle(main).overflowY,topNavDisplay:getComputedStyle(document.querySelector('#top-nav')).display,bottomNavDisplay:getComputedStyle(document.querySelector('#bottom-nav')).display,bottomAdminDisplay:getComputedStyle(document.querySelector('#bottom-nav-admin')).display,rootWidth:document.querySelector('#page-business-island').getBoundingClientRect().width,mapWidth:map.clientWidth,mapScrollWidth:map.scrollWidth,mapTop:map.getBoundingClientRect().top,mapBottom:map.getBoundingClientRect().bottom,exploreTop:explore.getBoundingClientRect().top,exploreBottom:explore.getBoundingClientRect().bottom,panelTop:panel.getBoundingClientRect().top,panelHeight:panel.clientHeight,panelScrollHeight:panel.scrollHeight,panelOverflowY:getComputedStyle(panel).overflowY,listHeight:list.clientHeight,listScrollHeight:list.scrollHeight,listOverflowY:getComputedStyle(list).overflowY,buttons:[...document.querySelectorAll('.bi-toolbar button,.bi-tabs button,.bi-selection button,.bi-search button,.bi-roll,.bi-member-select,.bi-member-actions button,.bi-world-category,.bi-world-arrival-actions button,.bi-pin')].filter(element=>element.getClientRects().length).map(element=>({text:element.textContent.trim(),height:element.getBoundingClientRect().height,width:element.getBoundingClientRect().width}))};
    });
    assert.ok(measure.documentWidth<=width+1,JSON.stringify(measure));assert.ok(measure.buttons.length>=8);
    assert.ok(measure.buttons.every(button=>button.height>=44&&button.width>=44),JSON.stringify(measure));layouts.push(measure);
    assert.equal(measure.topNavDisplay,'none');assert.equal(measure.mainOverflowY,'auto');
    assert.equal(measure.bottomNavDisplay,'none');assert.equal(measure.bottomAdminDisplay,'none');
    assert.ok(measure.rootWidth<=1000+1,JSON.stringify(measure));assert.ok(measure.mapScrollWidth<=measure.mapWidth+1,JSON.stringify(measure));
    assert.ok((measure.mapBottom<=measure.exploreTop+1||measure.exploreBottom<=measure.mapTop+1)&&Math.max(measure.mapBottom,measure.exploreBottom)<=measure.panelTop+1,'dice, long scene and member content follow one vertical flow');
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
  for(const width of [320,390,430,768,1440]) {
    await manyPage.setViewportSize({width,height:width>900?1000:844});
    await manyPage.locator('#main').evaluate(element=>element.scrollTop=0);
    const measure=await manyPage.evaluate(()=>{
      const rect=element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,width:box.width,height:box.height};};
      const list=document.querySelector('.bi-list'),map=document.querySelector('.bi-map');
      return {width:innerWidth,documentWidth:document.documentElement.scrollWidth,map:rect(map),world:rect(document.querySelector('.bi-world')),islands:[...document.querySelectorAll('.bi-world-island')].map(section=>({key:section.dataset.island,...rect(section),image:section.querySelector('.bi-world-art').getAttribute('src')})),pins:[...document.querySelectorAll('.bi-world .bi-pin')].filter(element=>element.getClientRects().length).map(element=>({...rect(element),island:element.closest('.bi-world-island').dataset.island,handle:element.dataset.biMember})),cards:[...list.querySelectorAll('.bi-member')].map(element=>({handle:element.querySelector('.bi-member-select').dataset.biMember,actions:[...element.querySelectorAll('.bi-member-actions button')].map(button=>button.dataset.biAction)})),listOverflow:getComputedStyle(list).overflowY,panelOverflow:getComputedStyle(document.querySelector('.bi-panel')).overflowY};
    });
    assert.equal(measure.islands.length,7);assert.deepEqual(measure.islands.map(island=>island.key),islandKinds.map(theme=>theme.key));
    assert.ok(measure.world.height>=7*400,JSON.stringify(measure));assert.ok(measure.islands.every(island=>island.height>=400));
    assert.ok(measure.islands.every((island,index)=>!index||island.top>=measure.islands[index-1].bottom-1),'the seven islands stack from top to bottom');
    assert.equal(new Set(measure.islands.map(island=>island.image)).size,7,'each category has its own scene asset');
    assert.equal(measure.pins.length,18,JSON.stringify(measure));
    for(const pin of measure.pins){const memberIndex=manyMembers.findIndex(row=>row.handle===pin.handle);assert.ok(memberIndex>=0);assert.equal(pin.island,islandKinds[memberIndex%islandKinds.length].key,'public company/title places the member on the corresponding island');}
    assert.equal(measure.cards.length,18);assert.equal(new Set(measure.cards.map(row=>row.handle)).size,18);
    assert.ok(measure.cards.every(row=>row.actions.join(',')==='card,chat'),'every member keeps both explicit actions');
    assert.equal(measure.listOverflow,'visible');assert.equal(measure.panelOverflow,'visible');assert.ok(measure.documentWidth<=width+1);
    const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
    for(let index=0;index<measure.pins.length;index++) {
      const pin=measure.pins[index];
      assert.ok(pin.left>=measure.map.left-1&&pin.right<=measure.map.right+1&&pin.top>=measure.map.top-1&&pin.bottom<=measure.map.bottom+1,'member pin stays inside the map');
      assert.ok(!measure.pins.slice(index+1).some(other=>overlap(pin,other)),'member pins must not cover each other at '+width+'px');
    }
    for(const section of await manyPage.locator('.bi-world-island').all())await section.scrollIntoViewIfNeeded();
    await manyPage.waitForFunction(()=>[...document.querySelectorAll('.bi-world-art')].every(image=>image.complete&&image.naturalWidth>0));
    for(const card of await manyPage.locator('.bi-list .bi-member').all()) {
      await card.scrollIntoViewIfNeeded();
      assert.ok(await card.evaluate(element=>{const row=element.getBoundingClientRect(),main=document.querySelector('#main').getBoundingClientRect();return row.top>=main.top-1&&row.bottom<=main.bottom+1&&row.left>=main.left-1&&row.right<=main.right+1;}),'all 18 member cards are reachable through the main vertical scroll');
    }
    assert.ok(await manyPage.locator('#main').evaluate(element=>element.scrollTop)>0);
    if(width===390)await manyPage.screenshot({path:join(output,'business-island-many-390-last-cards.png'),fullPage:true});
    await manyPage.locator('#main').evaluate(element=>element.scrollTop=0);
    await manyPage.screenshot({path:join(output,`business-island-many-${width}.png`),fullPage:true});
    if(width===390)for(const section of await manyPage.locator('.bi-world-island').all()) {await section.scrollIntoViewIfNeeded();await section.screenshot({path:join(output,`business-island-world-390-${await section.getAttribute('data-island')}.png`)});}
    manyLayouts.push(measure);
  }
  await writeFile(join(output,'many-members-layout-metrics.json'),JSON.stringify(manyLayouts,null,2));
  await manyPage.close();diagnosticPage=page;record('18 public summaries populate seven distinct themed islands with real assets and vertically reachable cards across 320/390/430/768/1440px');

  const motionPage=await context.newPage();diagnosticPage=motionPage;motionPage.on('pageerror',error=>errors.push(error.message));
  await motionPage.emulateMedia({reducedMotion:'no-preference'});
  await motionPage.addInitScript(installAudioProbe);
  await motionPage.addInitScript(()=>{window.crypto.getRandomValues=values=>values.fill(0);});
  const enterMotion=async()=>{
    await motionPage.goto(base);await motionPage.locator('#fixture-open').click();
    await motionPage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===3&&!document.querySelector('[data-bi-action="roll"]').disabled);
    await motionPage.locator('#bi-query').fill('多名單');await motionPage.locator('.bi-search button[type=submit]').click();
    await motionPage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===18&&!document.querySelector('[data-bi-action="more"]').disabled);
    await motionPage.locator('#main').evaluate(element=>element.scrollTop=0);
  };
  await enterMotion();await motionPage.bringToFront();
  await motionPage.locator('[data-island="lodging"]').scrollIntoViewIfNeeded();
  await motionPage.waitForFunction(()=>document.querySelector('[data-island="lodging"]').dataset.visible==='true'&&document.querySelector('[data-island="manufacturing"]').dataset.visible==='false');
  const decorationSample=()=>motionPage.locator('[data-island="lodging"]').evaluate(section=>[...section.querySelectorAll('.bi-world-boat,.bi-pool-ripple,.bi-walker')].filter(element=>element.getClientRects().length).map(element=>{const style=getComputedStyle(element);return {name:style.animationName,state:style.animationPlayState,transform:style.transform,opacity:style.opacity};}));
  const movingBefore=await decorationSample();await motionPage.waitForTimeout(350);const movingAfter=await decorationSample();
  assert.ok(['bi-boat-sail','bi-pool-ripple','bi-wander'].every(name=>movingBefore.some(animation=>animation.name===name)),'the animation probe covers visible boats, pool ripples and residents');
  assert.ok(movingBefore.every(animation=>animation.name!=='none'&&animation.state==='running'));
  assert.ok(movingBefore.every((animation,index)=>animation.transform!==movingAfter[index].transform||animation.opacity!==movingAfter[index].opacity),'visible boats, ripples and residents really advance their animation');
  await motionPage.locator('[data-island="manufacturing"]').scrollIntoViewIfNeeded();
  await motionPage.waitForFunction(()=>document.querySelector('[data-island="lodging"]').dataset.visible==='false'&&document.querySelector('[data-island="manufacturing"]').dataset.visible==='true');
  const pausedBefore=await decorationSample();await motionPage.waitForTimeout(250);assert.deepEqual(await decorationSample(),pausedBefore,'offscreen islands freeze their decorative motion');
  assert.ok(pausedBefore.every(animation=>animation.state==='paused'));
  await motionPage.emulateMedia({reducedMotion:'reduce'});
  assert.ok(await motionPage.locator('.bi-world').evaluate(world=>[...world.querySelectorAll('.bi-world-boat,.bi-pool-ripple,.bi-walker')].every(element=>getComputedStyle(element).animationName==='none')),'reduced motion disables decorative animation on every island');
  await motionPage.emulateMedia({reducedMotion:'no-preference'});
  await motionPage.locator('#main').evaluate(element=>element.scrollTop=0);
  record('real CSS boats, pool ripples and residents animate only on visible islands, pause offscreen and stop for reduced motion');

  await motionPage.locator('#bi-query').fill('遠航');await motionPage.locator('.bi-search button[type=submit]').click();
  await motionPage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===1&&!document.querySelector('[data-bi-action="more"]').disabled);
  await motionPage.locator('#main').evaluate(element=>element.scrollTop=0);
  await motionPage.evaluate(()=>{
    window.__walkTrace={start:performance.now(),steps:[],phases:[],samples:[]};window.__walkPlayer=document.querySelector('.bi-world-player');
    window.__walkObserver=new MutationObserver(()=>{const step=Number(window.__walkPlayer.dataset.step),phase=window.__walkPlayer.dataset.phase;if(!window.__walkTrace.steps.length||window.__walkTrace.steps.at(-1).step!==step)window.__walkTrace.steps.push({step,at:performance.now()-window.__walkTrace.start,scroll:document.querySelector('#main').scrollTop});if(phase&&window.__walkTrace.phases.at(-1)!==phase)window.__walkTrace.phases.push(phase);});
    window.__walkObserver.observe(window.__walkPlayer,{attributes:true,attributeFilter:['data-step','data-phase']});
    window.__sailTimer=setInterval(()=>{const matrix=new DOMMatrix(getComputedStyle(window.__walkPlayer).transform);window.__walkTrace.samples.push({at:performance.now()-window.__walkTrace.start,x:matrix.m41,y:matrix.m42,scroll:document.querySelector('#main').scrollTop,phase:window.__walkPlayer.dataset.phase});},100);
  });
  await motionPage.locator('[data-bi-action="roll"]').click();
  await motionPage.waitForFunction(()=>document.querySelector('.bi-3d-dice-box').dataset.rolling==='true');
  const shake=await motionPage.locator('.bi-3d-die').evaluateAll(cubes=>cubes.map(cube=>({running:cube.classList.contains('rolling'),duration:cube.getAnimations()[0]?.effect.getTiming().duration})));
  assert.ok(shake.every(cube=>cube.running&&cube.duration===1100),'both cubes shake for the original 1100ms');
  await motionPage.waitForFunction(()=>document.querySelector('.bi-world-player').dataset.phase==='sailing',{},{timeout:10000});
  assert.equal(await motionPage.locator('.bi-world-player').getAttribute('data-travel'),'sailing');
  assert.equal(await motionPage.locator('.bi-player-ferry').isVisible(),true);
  assert.ok(await motionPage.locator('.bi-player-ferry [class*="hull"],.bi-player-ferry [class*="cabin"],.bi-player-ferry [class*="wake"]').count()>=3,'the travelling ferry has a hull, cabin and wake');
  await motionPage.waitForTimeout(800);await motionPage.screenshot({path:join(output,'business-island-ferry-sailing-390.png'),fullPage:true});
  const voyageAudio={peak:await peakAudio(motionPage,400),probe:await audioSnapshot(motionPage)};
  assert.ok(voyageAudio.peak>1e-5,'the voyage includes real, quiet synthesized audio');
  assert.ok(await motionPage.evaluate(()=>window.__audioProbe.sources.some(source=>source.kind==='createBufferSource'&&source.started)),'departure includes an actual locally generated water cue');
  await motionPage.waitForFunction(()=>!document.querySelector('[data-bi-action="roll"]').disabled&&document.querySelector('.bi-world-player').dataset.moving==='false',{},{timeout:30000});
  const landed=await motionPage.evaluate(()=>{
    window.__walkObserver.disconnect();clearInterval(window.__sailTimer);const player=document.querySelector('.bi-world-player'),pin=[...document.querySelectorAll('.bi-world .bi-pin')].find(element=>element.dataset.biMember===player.dataset.target),p=player.getBoundingClientRect(),target=pin.getBoundingClientRect(),dice=document.querySelector('.bi-3d-dice-box');
    return {steps:window.__walkTrace.steps.filter(item=>item.step>0),phases:window.__walkTrace.phases,samples:window.__walkTrace.samples,duration:Number(player.dataset.duration),distance:Number(player.dataset.distance),speed:Number(player.dataset.speed),first:Number(dice.dataset.dice1),second:Number(dice.dataset.dice2),total:Number(dice.dataset.total),step:Number(player.dataset.step),handle:player.dataset.target,selected:document.querySelector('.bi-list .bi-member-select[aria-pressed="true"]').dataset.biMember,pinSelected:pin.getAttribute('aria-pressed'),samePlayer:window.__walkPlayer===player,sideDistance:Math.abs(p.right-(target.left+target.width/2)),verticalDistance:Math.abs(p.top+p.height/2-target.top-target.height/2),scroll:document.querySelector('#main').scrollTop};
  });
  assert.equal(landed.first,1);assert.equal(landed.second,1);assert.equal(landed.total,2);assert.equal(landed.step,2);
  assert.deepEqual(landed.steps.map(item=>item.step),[1,2]);assert.ok(landed.duration>=12000&&landed.duration<25000,'two dice points cannot teleport through all seven islands');
  assert.ok(landed.distance>2400&&landed.speed>80&&landed.speed<=220,'long-distance travel retains a measured, human-readable speed');
  assert.deepEqual(landed.phases.filter(phase=>phase!=='cancelled'),['dice','walking','boarding','sailing','docking','walking','arrived']);
  const deltas=landed.samples.slice(1).map((sample,index)=>{const previous=landed.samples[index],dt=sample.at-previous.at;return {cameraPer100:Math.abs(sample.scroll-previous.scroll)*100/dt,playerSpeed:Math.hypot(sample.x-previous.x,sample.y-previous.y)*1000/dt};});
  assert.ok(deltas.length>100);assert.ok(Math.max(...deltas.map(sample=>sample.cameraPer100))<=80,'camera movement stays continuous rather than jumping whole islands');
  assert.ok(Math.max(...deltas.map(sample=>sample.playerSpeed))<=300,'the ferry never skips a large section of the sea route');
  assert.ok(landed.samePlayer);assert.equal(landed.handle,landed.selected);assert.equal(landed.pinSelected,'true');
  assert.ok(landed.sideDistance<=2&&landed.verticalDistance<=2,'the character arrives beside the selected member pin');assert.ok(landed.scroll>500,'the camera follows the walk into the long world');
  assertDiceGeometry(await diceGeometry(motionPage));
  assert.equal(await motionPage.locator('.bi-card-dialog[open]').count(),0);assert.equal(threadWrites().length,1);assert.equal(messageWrites().length,1);
  await motionPage.locator('.bi-world-arrival [data-bi-action="card"]').click();await motionPage.locator('.bi-card-dialog[open]').waitFor();
  assert.equal(calls.at(-1).path,'/v1/member-chat/members/'+encodeURIComponent(landed.handle)+'/card');
  await motionPage.locator('.bi-card-dialog header button').click();assert.equal(await motionPage.evaluate(()=>window.currentPage),'business-island');
  await writeFile(join(output,'world-motion-metrics.json'),JSON.stringify({shake,landed,voyageAudio,movingBefore,movingAfter,pausedBefore},null,2));
  await motionPage.screenshot({path:join(output,'business-island-world-arrival-390.png'),fullPage:true});
  record('two real dice drive an unhurried ferry voyage across seven islands with continuous camera motion and exact final progress, member and card action');

  const cancellationMetrics=[];
  for(const kind of ['query','zone','exit','account','background','cache']) {
    await enterMotion();await motionPage.locator('[data-bi-action="roll"]').click();
    await motionPage.waitForFunction(()=>document.querySelector('.bi-world-player').dataset.phase==='sailing',{},{timeout:10000});
    if(kind==='cache') {
      const {beforeCache,travel}=await motionPage.evaluate(()=>{
        const dice=document.querySelector('.bi-3d-dice-box'),player=document.querySelector('.bi-world-player'),world=document.querySelector('.bi-world'),matrix=new DOMMatrix(getComputedStyle(player).transform);
        const beforeCache={metadata:{first:dice.dataset.dice1,second:dice.dataset.dice2,total:dice.dataset.total,step:player.dataset.step,steps:player.dataset.total,target:player.dataset.target??''},x:matrix.m41,y:matrix.m42,width:world.clientWidth,height:world.clientHeight},travel=player.dataset.travel;
        window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));return {beforeCache,travel};
      });
      await motionPage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===18&&!document.querySelector('[data-bi-action="roll"]').disabled);
      assertWorldState(await readWorldState(motionPage),beforeCache,'mid-sailing BFCache restoration');
      assert.equal(await motionPage.locator('.bi-world-player').getAttribute('data-travel'),travel,'the frozen ferry is restored as a ferry');
    }
    else if(kind==='query') {await motionPage.locator('#bi-query').fill('陳');await motionPage.locator('.bi-search button[type=submit]').click();await motionPage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===1);}
    else if(kind==='zone') await motionPage.evaluate(()=>document.querySelector('.bi-tabs [data-bi-zone="home"]').click());
    else if(kind==='exit') await motionPage.evaluate(()=>window.goPage('home',true));
    else if(kind==='account') await motionPage.evaluate(()=>window.fixtureSwitchAccount());
    else await motionPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await motionPage.waitForTimeout(kind==='account'?750:100);
    const snapshot=()=>motionPage.evaluate(()=>{const player=document.querySelector('.bi-world-player');return {page:window.currentPage,scroll:document.querySelector('#main').scrollTop,step:player?.dataset.step??null,moving:player?.dataset.moving??null,target:player?.dataset.target??null,result:document.querySelector('.bi-roll-result')?.textContent??null,selected:document.querySelector('.bi-list .bi-member-select[aria-pressed="true"]')?.dataset.biMember??null,arrival:document.querySelector('.bi-world-arrival h4')?.textContent??null};});
    const frozen=await snapshot();await motionPage.waitForTimeout(900);const after=await snapshot();assert.deepEqual(after,frozen,'cancelled '+kind+' walking must not resume, select a member or move the camera later');
    assert.notEqual(after.moving,'true');assert.equal(await motionPage.locator('.bi-card-dialog[open]').count(),0);
    if(kind==='exit')assert.equal(after.page,'home');
    if(kind==='query')assert.equal(after.selected,'card-b');
    if(kind==='background') {assert.equal(await motionPage.locator('.bi-world').getAttribute('data-paused'),'true');await motionPage.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});}
    cancellationMetrics.push({kind,frozen,after});
  }
  assert.equal(threadWrites().length,1);assert.equal(messageWrites().length,1);
  await writeFile(join(output,'world-cancellation-metrics.json'),JSON.stringify(cancellationMetrics,null,2));
  await motionPage.close();diagnosticPage=page;record('search, zone, exit, account, background and mid-voyage BFCache cancel motion without late selection, dialogs or camera jumps');

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

  const AUDIO_KEY='business-island-audio-v1',audioPage=await context.newPage();diagnosticPage=audioPage;audioPage.on('pageerror',error=>errors.push(error.message));
  await audioPage.addInitScript(installAudioProbe);
  const audioReady=()=>audioPage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length>=3&&!document.querySelector('[data-bi-action="roll"]').disabled);
  await audioPage.goto(base);await audioPage.evaluate(key=>localStorage.removeItem(key),AUDIO_KEY);
  const otherStorage=await audioPage.evaluate(key=>Object.fromEntries(Object.entries(localStorage).filter(([name])=>name!==key)),AUDIO_KEY);
  await audioPage.locator('#fixture-open').click();await audioReady();
  assert.equal(await audioPage.locator('[data-bi-action="music"]').getAttribute('aria-pressed'),'true');assert.equal(await audioPage.locator('[data-bi-action="sound"]').getAttribute('aria-pressed'),'true');
  assert.equal((await audioSnapshot(audioPage)).states.length,0,'entering the island never creates or starts an audio context');
  assert.equal(await peakAudio(audioPage,200),0);
  await audioPage.locator('[data-bi-action="sound"]').click();await audioPage.locator('[data-bi-action="sound"]').click();
  assert.equal(await audioPage.locator('[data-bi-action="sound"]').getAttribute('aria-pressed'),'true');
  assert.equal((await audioSnapshot(audioPage)).states.length,0,'turning effects off and on before the first roll does not unlock background music');
  assert.equal(await peakAudio(audioPage,150),0);
  const audioHit=await audioPage.locator('[data-bi-action="music"],[data-bi-action="sound"]').evaluateAll(buttons=>buttons.map(button=>{const rect=button.getBoundingClientRect();return {width:rect.width,height:rect.height};}));
  assert.ok(audioHit.length===2&&audioHit.every(button=>button.width>=44&&button.height>=44));
  await audioPage.locator('[data-bi-action="roll"]').click();await audioReady();
  const defaultPeak=await peakAudio(audioPage);assert.ok(defaultPeak>1e-5);
  const unlocked=await audioSnapshot(audioPage);assert.equal(unlocked.states.length,1);assert.ok(unlocked.events.find(event=>event.kind==='create').gesture,'the first roll unlocks native audio in a real user gesture');
  await audioPage.locator('[data-bi-action="sound"]').click();await audioPage.locator('[data-bi-action="music"]').click();
  await audioPage.waitForTimeout(150);const mutedPeak=await peakAudio(audioPage,250);assert.ok(mutedPeak<1e-7,'both controls off produce actual silence');
  await audioPage.locator('[data-bi-action="music"]').click();const musicOnlyPeak=await peakAudio(audioPage,800);assert.ok(musicOnlyPeak>1e-5,'music plays while sound effects remain disabled');
  assert.equal(await audioPage.locator('[data-bi-action="sound"]').getAttribute('aria-pressed'),'false');
  await audioPage.locator('[data-bi-action="music"]').click();await audioPage.waitForTimeout(150);assert.ok(await peakAudio(audioPage,250)<1e-7);
  await audioPage.locator('[data-bi-action="sound"]').click();const effectsBefore=(await audioSnapshot(audioPage)).started;
  await audioPage.locator('[data-bi-action="roll"]').click();await audioReady();const soundOnlyPeak=await peakAudio(audioPage,650);
  assert.ok(soundOnlyPeak>1e-5&&(await audioSnapshot(audioPage)).started>effectsBefore,'effects produce native PCM with music disabled');
  assert.deepEqual(await audioPage.evaluate(key=>JSON.parse(localStorage.getItem(key)),AUDIO_KEY),{music:false,sound:true});
  assert.deepEqual(await audioPage.evaluate(key=>Object.fromEntries(Object.entries(localStorage).filter(([name])=>name!==key)),AUDIO_KEY),otherStorage,'island preferences do not write other games or application storage');
  await audioPage.goto(base);await audioPage.locator('#fixture-open').click();await audioReady();
  assert.equal(await audioPage.locator('[data-bi-action="music"]').getAttribute('aria-pressed'),'false');assert.equal(await audioPage.locator('[data-bi-action="sound"]').getAttribute('aria-pressed'),'true');
  assert.equal((await audioSnapshot(audioPage)).states.length,0,'persisted enabled effects still wait for a fresh gesture after reload');
  await audioPage.locator('[data-bi-action="music"]').click();assert.ok(await peakAudio(audioPage,700)>1e-5);
  await audioPage.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await audioPage.waitForFunction(()=>window.__audioProbe.contexts.every(context=>context.state==='suspended'||context.state==='closed'));
  const hiddenAudio=await audioSnapshot(audioPage);assert.equal(hiddenAudio.active,0);await audioPage.waitForTimeout(350);assert.equal((await audioSnapshot(audioPage)).started,hiddenAudio.started,'hidden islands stop the music scheduler and sources');
  await audioPage.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});assert.ok(await peakAudio(audioPage,700)>1e-5);
  const resumedAudio=await audioSnapshot(audioPage);assert.ok(resumedAudio.states.every(state=>state==='running')&&resumedAudio.started>hiddenAudio.started,'visible return actually resumes the context and schedules new music');
  await audioPage.evaluate(()=>window.goPage('home',true));await audioPage.waitForFunction(()=>window.__audioProbe.contexts.every(context=>context.state==='closed'));
  const closedAudio=await audioSnapshot(audioPage);assert.equal(closedAudio.active,0);await audioPage.waitForTimeout(350);assert.equal((await audioSnapshot(audioPage)).started,closedAudio.started,'leaving closes audio and does not schedule new notes');
  await writeFile(join(output,'island-audio-metrics.json'),JSON.stringify({defaultPeak,mutedPeak,musicOnlyPeak,soundOnlyPeak,unlocked,hiddenAudio,resumedAudio,closedAudio},null,2));
  await audioPage.close();diagnosticPage=page;record('real Web Audio RMS proves gesture-only music and effects, independent persistent mute controls, background pause and full leave cleanup');

  const rejectedAudio=await context.newPage();diagnosticPage=rejectedAudio;rejectedAudio.on('pageerror',error=>errors.push(error.message));
  await rejectedAudio.addInitScript(installAudioProbe);await rejectedAudio.addInitScript(()=>{window.__rejectAudioResume=true;});
  await rejectedAudio.goto(base);await rejectedAudio.locator('#fixture-open').click();
  await rejectedAudio.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===3&&!document.querySelector('[data-bi-action="roll"]').disabled);
  const blockedBefore=await rejectedAudio.locator('.bi-list .bi-member-select[aria-pressed="true"]').getAttribute('data-bi-member');
  await rejectedAudio.locator('[data-bi-action="roll"]').click();
  await rejectedAudio.waitForFunction(()=>!document.querySelector('[data-bi-action="roll"]').disabled&&Number(document.querySelector('.bi-world-player').dataset.step)>0);
  const rejectedProbe=await audioSnapshot(rejectedAudio);assert.ok(rejectedProbe.events.some(event=>event.kind==='resume'));assert.equal(rejectedProbe.started,0);
  assert.notEqual(await rejectedAudio.locator('.bi-list .bi-member-select[aria-pressed="true"]').getAttribute('data-bi-member'),blockedBefore,'browser audio rejection cannot block member discovery');
  await rejectedAudio.evaluate(()=>{window.__rejectAudioResume=false;});await rejectedAudio.locator('[data-bi-action="roll"]').click();
  await rejectedAudio.waitForFunction(()=>!document.querySelector('[data-bi-action="roll"]').disabled);assert.ok(await peakAudio(rejectedAudio,700)>1e-5,'a later permitted gesture recovers audio');
  await rejectedAudio.evaluate(()=>window.goPage('home',true));await rejectedAudio.waitForFunction(()=>window.__audioProbe.contexts.every(context=>context.state==='closed'));
  await rejectedAudio.close();diagnosticPage=page;record('native AudioContext resume rejection leaves dice and member selection usable and a later gesture can recover sound');

  const cuePage=await context.newPage();diagnosticPage=cuePage;cuePage.on('pageerror',error=>errors.push(error.message));
  await cuePage.addInitScript(installAudioProbe);await cuePage.addInitScript(()=>{window.crypto.getRandomValues=values=>values.fill(0);});await cuePage.emulateMedia({reducedMotion:'no-preference'});
  await cuePage.goto(base);await cuePage.evaluate(key=>localStorage.setItem(key,JSON.stringify({music:true,sound:true})),AUDIO_KEY);
  await cuePage.locator('#fixture-open').click();await cuePage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===3&&!document.querySelector('[data-bi-action="roll"]').disabled);
  await cuePage.locator('#bi-query').fill('遠航');await cuePage.locator('.bi-search button[type=submit]').click();
  await cuePage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===1&&!document.querySelector('[data-bi-action="more"]').disabled);
  await cuePage.locator('[data-bi-action="roll"]').click();await cuePage.waitForFunction(()=>document.querySelector('.bi-world-player').dataset.phase==='boarding',{},{timeout:10000});
  const cueBefore=[0,0];for(let sample=0;sample<4;sample++){const channels=await audioChannels(cuePage);channels.forEach((value,index)=>cueBefore[index]=Math.max(cueBefore[index]||0,value));await cuePage.waitForTimeout(40);}
  assert.equal(cueBefore.length,2);assert.ok(cueBefore[0]>1e-5&&cueBefore[1]>1e-5,'boarding plays actual music and departure effects on separate native audio buses');
  const immediateStopsBefore=(await audioSnapshot(cuePage)).events.filter(event=>event.kind==='stop'&&event.immediate).length;
  // Submit the real form immediately; scrolling to the offscreen field could outlast the short cue.
  await cuePage.evaluate(()=>{document.querySelector('#bi-query').value='陳';document.querySelector('.bi-search').requestSubmit();});
  await cuePage.waitForFunction(()=>document.querySelectorAll('.bi-list .bi-member').length===1&&!document.querySelector('[data-bi-action="roll"]').disabled);
  await cuePage.waitForTimeout(150);const cueAfter=[0,0];for(let sample=0;sample<8;sample++){const channels=await audioChannels(cuePage);channels.forEach((value,index)=>cueAfter[index]=Math.max(cueAfter[index]||0,value));await cuePage.waitForTimeout(40);}
  const cancelledAudio=await audioSnapshot(cuePage);assert.ok(cancelledAudio.states.every(state=>state==='running'));
  assert.ok(cueAfter[0]>1e-5&&cueAfter[1]<1e-7,'cancelling a voyage stops its queued effects while the music keeps playing');
  assert.ok(cancelledAudio.events.filter(event=>event.kind==='stop'&&event.immediate).length>immediateStopsBefore,'the real query-cancel path immediately stops native scheduled sources');
  assert.equal(await cuePage.locator('.bi-world-player').getAttribute('data-phase'),'cancelled');
  await cuePage.evaluate(()=>window.goPage('home',true));await cuePage.waitForFunction(()=>window.__audioProbe.contexts.every(context=>context.state==='closed'));
  await writeFile(join(output,'island-cancel-audio-metrics.json'),JSON.stringify({cueBefore,cueAfter,immediateStopsBefore,cancelledAudio},null,2));
  await cuePage.close();diagnosticPage=page;record('first effects toggles stay locked and cancelling departure stops native sound-effect sources without muting the music');

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
