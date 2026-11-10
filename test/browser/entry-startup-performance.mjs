// Isolated startup comparison. Every request is fulfilled locally; no live API is contacted.
// Candidate changes only bottom local classic script tags to defer in the served index.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,extname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
let playwright;
try{playwright=require('playwright');}
catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=resolve(ROOT,'../entry-speed');
const ORIGIN='https://entry-speed.invalid';
const UID='U'+'a'.repeat(32);
const TOKEN='synthetic-entry-token-no-authority';
const RUNS=Number(process.argv.find(arg=>arg.startsWith('--runs='))?.split('=')[1]||3);
assert.ok(Number.isInteger(RUNS)&&RUNS>0&&RUNS<=10,'--runs must be 1 to 10');
mkdirSync(OUT,{recursive:true});

// Snapshot scripts once, so a concurrent source edit cannot bias one arm of the comparison.
const sources=new Map();
function snapshot(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){
  const file=join(dir,entry.name);
  if(entry.isDirectory())snapshot(file);
  else if(/\.(?:js|mjs|css|json)$/.test(entry.name))sources.set(relative(ROOT,file).split(sep).join('/'),readFileSync(file));
}}
snapshot(join(ROOT,'js'));snapshot(join(ROOT,'css'));
const index=readFileSync(join(ROOT,'index.html'),'utf8');
const bottomStart=index.indexOf('<script src="js/app-notify.js');
assert.ok(bottomStart>index.indexOf('</head>'),'bottom script boundary exists');
const head=index.slice(0,bottomStart),bottom=index.slice(bottomStart);
const changed=[];
const candidate=head+bottom.replace(/<script\b([^>]*\bsrc="(js\/[^\"]+)"[^>]*)><\/script>/g,(tag,attrs,src)=>{
  if(/\b(?:defer|async)\b|\btype\s*=/.test(attrs))return tag;
  changed.push(new URL(src,ORIGIN).pathname.slice(1));
  return '<script'+attrs+' defer></script>';
});
assert.ok(changed.length>30,'candidate changes the bottom local classic scripts');
assert.equal(candidate.slice(0,bottomStart),head,'head inline, config and login bootstrap are unchanged');
const classicOrder=changed.filter(path=>/\.(?:js|mjs)$/.test(path));
const fingerprint=createHash('sha256').update(index);
for(const [name,body]of [...sources].sort(([a],[b])=>a.localeCompare(b)))fingerprint.update(name).update(body);
const sourceSha256=fingerprint.digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function scriptDelay(path){let hash=0;for(const c of path)hash=(hash*31+c.charCodeAt(0))>>>0;return 150+hash%151;}
function pool(limit){let active=0,max=0;const queue=[];return {
  async run(task){await new Promise(resolve=>{queue.push(resolve);drain();});try{return await task();}finally{active--;drain();}},
  get max(){return max;}
};function drain(){while(active<limit&&queue.length){active++;max=Math.max(max,active);queue.shift()();}}}

const sdk=`(() => {
const e=window.__entrySpeed, pause=ms=>new Promise(r=>setTimeout(r,ms));
const timed=async(name,ms,value)=>{e.note(name+'Start');await pause(ms);e.note(name+'End');return value;};
window.liff={
 init:()=>timed('liff',300,undefined),isLoggedIn:()=>true,isInClient:()=>true,isApiAvailable:()=>false,
 getAccessToken:()=>${JSON.stringify(TOKEN)},getIDToken:()=>'',getContext:()=>({type:'external'}),
 getProfile:()=>timed('profile',450,{userId:${JSON.stringify(UID)},displayName:'合成啟動測試會員'}),
 getFriendship:()=>timed('friendship',200,{friendFlag:true}),
 login:()=>{throw Error('Unexpected login redirect');},logout:()=>{},closeWindow:()=>{},
 requestFriendship:()=>{throw Error('Unexpected friendship prompt');}
};})();`;

async function run(browser,mode,ordinal,{cachedRole=null}={}){
  const context=await browser.newContext({viewport:{width:390,height:900},serviceWorkers:'block'});
  const page=await context.newPage(),lane=pool(6);
  const state={mode,ordinal,cachedRole,requests:[],api:[],blocked:[],writes:[],errors:[],consoleErrors:[],scriptNetwork:[]};
  page.on('pageerror',error=>state.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')state.consoleErrors.push(message.text());});
  page.on('dialog',dialog=>{state.errors.push('Unexpected dialog: '+dialog.message());return dialog.dismiss();});
  await context.addInitScript(({uid,cachedRole})=>{
    const e=window.__entrySpeed={marks:{},execution:[],longTasks:[],note(name){if(this.marks[name]===undefined)this.marks[name]=performance.now();}};
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries())e.longTasks.push({start:entry.startTime,duration:entry.duration});}).observe({type:'longtask',buffered:true});}catch{}
    if(cachedRole)localStorage.setItem('ACTMASTER_USER_'+uid,JSON.stringify({info:{userId:uid,name:'合成舊快取',role:cachedRole,networkId:'admin'},savedAt:Date.now()}));
    document.addEventListener('DOMContentLoaded',()=>e.note('domReady'));
    const ready=()=>{
      if(e.marks.firstInteractive!==undefined||e.marks.checkUserEnd===undefined)return;
      const loading=document.getElementById('loading-screen'),home=document.getElementById('page-home');
      if(window.currentUser?.role!=='user'||window.currentUser?.userId!==uid||!loading?.classList.contains('hidden')||home?.classList.contains('hidden')||typeof window.toggleHomeRecurringTaskPanel!=='function')return;
      requestAnimationFrame(()=>{if(window.currentUser?.role==='user')e.note('firstInteractive');});
    };
    new MutationObserver(ready).observe(document,{childList:true,subtree:true,attributes:true});
    setInterval(ready,20);
    document.addEventListener('DOMContentLoaded',()=>{
      // SDK styles are deliberately stubbed; the fixture supplies only visibility utilities.
      const style=document.createElement('style');style.textContent='.hidden{display:none!important}.flex{display:flex}.fixed{position:fixed}';document.head.append(style);
    });
  },{uid:UID,cachedRole});

  const readActions=new Set(['checkUser','getInboxCount','getExchangeZoneAccess','getSubsiteHome','getStoreSettings','getActivities','listActivities','getUserActivities','getPublicActivities','getAllActivities','getSystemTicker','getSystemTickerLiveStats','listAnnouncements','listPersonalTasks','getAiMatchInterestSummary','getCardContacts','getCrmContacts','getMemberChatUnread','getMemberChatUnreadCount','queryPointBalanceFast','queryUserPoints']);
  async function api(route,body){
    const action=String(body.action||''),payload=body.payload||{};
    state.api.push({action,at:Date.now(),hasSyntheticToken:payload.lineAccessToken===TOKEN});
    if(!readActions.has(action)){
      state.writes.push(action||'unknown');
      return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({success:false,error:'Isolated fixture blocked action '+action})});
    }
    let data=[];
    if(action==='checkUser'){
      assert.equal(payload.userId,UID);assert.equal(payload.lineAccessToken,TOKEN);
      await page.evaluate(()=>window.__entrySpeed.note('checkUserStart'));await pause(300);
      await page.evaluate(()=>window.__entrySpeed.note('checkUserEnd'));
      data={isRegistered:true,info:{userId:UID,role:'user',retailSellerEligible:false,networkId:'admin',name:'合成啟動測試會員'}};
    }else if(action==='getInboxCount')data={unread:0};
    else if(action==='getExchangeZoneAccess')data={access:{mode:'open',allowed:true,canPublish:false}};
    else if(action==='getSubsiteHome')data={user:{userId:UID,role:'user',name:'合成啟動測試會員'},role:'user',wallet:{status:'ready',balance:0},cards:{recentCards:[],hasMyCard:false},storePointCashier:{logs:[]},activities:[]};
    else if(action==='getStoreSettings')data={};
    else if(action==='getSystemTickerLiveStats')data={};
    else if(action==='getAiMatchInterestSummary')data={items:[],count:0};
    else if(action==='queryPointBalanceFast'||action==='queryUserPoints')data={balance:0,queriedLineUserId:UID,requestedLineUserId:UID};
    return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  }
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    state.requests.push({method:request.method(),origin:url.origin,path:url.pathname,type:request.resourceType()});
    if(request.method()==='POST'){
      let body={};try{body=request.postDataJSON()||{};}catch{}
      return api(route,body);
    }
    if(!['GET','HEAD'].includes(request.method())){state.writes.push(request.method());return route.abort();}
    if(url.origin!==ORIGIN){
      // All third-party SDKs, fonts, images and API reads terminate here.
      if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:sdk});
      if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={config:{}};'});
      if(url.hostname==='code.jquery.com')return route.fulfill({contentType:'text/javascript',body:'window.jQuery=window.$=function(){throw Error("jQuery UI is outside this startup fixture");};'});
      if(url.pathname.endsWith('/cropper.min.js'))return route.fulfill({contentType:'text/javascript',body:'window.Cropper=class {};'});
      if(url.pathname==='/v1/member-events/overview')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data:{hosting:[],my:[],catalog:[]}})});
      if(request.resourceType()==='stylesheet')return route.fulfill({contentType:'text/css',body:''});
      if(request.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'});
      state.blocked.push({origin:url.origin,path:url.pathname,type:request.resourceType()});return route.abort();
    }
    if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:mode==='candidate'?candidate:index});
    const path=decodeURIComponent(url.pathname).replace(/^\/+/,''),file=resolve(ROOT,path);
    if(!file.startsWith(ROOT+sep)){state.blocked.push(path);return route.abort();}
    if(sources.has(path)){
      const body=sources.get(path),extension=extname(path);
      if(extension==='.js'||extension==='.mjs'){const requested=Date.now();return lane.run(async()=>{
        const received=Date.now();await pause(scriptDelay(path));
        state.scriptNetwork.push({path,delay:scriptDelay(path),requested,received,fulfilled:Date.now(),queueWaitMs:received-requested});
        const marker='globalThis.__entrySpeed?.execution.push({path:'+JSON.stringify(path)+',at:performance.now()});\n';
        return route.fulfill({contentType:'text/javascript; charset=utf-8',body:marker+body.toString('utf8')});
      });}
      return route.fulfill({contentType:extension==='.css'?'text/css; charset=utf-8':'application/json',body});
    }
    if(existsSync(file)&&!path.startsWith('.'))return route.fulfill({path:file});
    state.blocked.push(path);return route.fulfill({status:404,body:'Missing local fixture asset'});
  });
  try{
    await page.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:60000});
    await page.waitForFunction(()=>window.__entrySpeed?.marks.firstInteractive!==undefined,{},{timeout:30000});
    // A real existing home control must still execute its actual handler after fresh role data.
    await page.evaluate(()=>document.getElementById('home-recurring-task-toggle').click());
    assert.equal(await page.locator('#home-recurring-task-toggle').getAttribute('aria-expanded'),'true');
    await page.evaluate(()=>document.getElementById('home-recurring-task-toggle').click());
    assert.equal(await page.locator('#home-recurring-task-toggle').getAttribute('aria-expanded'),'false');
    await page.waitForTimeout(350);
    const measured=await page.evaluate(()=>({
      marks:window.__entrySpeed.marks,execution:window.__entrySpeed.execution,longTasks:window.__entrySpeed.longTasks,
      role:window.userRole,currentRole:window.currentUser?.role,
      init:window.__actmasterLiffInit?.ready,
      hooks:{scanner:window.__A_KAFFIT_FULL_CARD_WORKFLOW__===true,
        industryBridge:/cardIndustryFilter/.test(String(window.filterCards)),
        tutorial:typeof window.openTutorialCenter==='function',
        store:typeof window.openStoreShop==='function',
        home:typeof window.loadHomeData==='function',
        activity:typeof window.submitActivityForm==='function'}
    }));
    Object.assign(state,measured,{maxConcurrentLocalScripts:lane.max});
    const executedAt=path=>state.execution.find(entry=>entry.path===path)?.at;
    state.initializationOrder={
      settingsCoreBeforeAuth:executedAt('js/modules/settings-core.js')<executedAt('js/auth.js'),
      settingsQuotaRuntimeBeforeAuth:executedAt('js/modules/settings-card-quota-runtime.js')<executedAt('js/auth.js'),
      scannerBeforeCards:executedAt('js/modules/a-kaffit-card-scanner-adapter.js')<executedAt('js/modules/cards.js')
    };
    assert.equal(state.api.filter(call=>call.action==='checkUser').length,1,'exactly one fresh checkUser');
    assert.equal(state.marks.liffStart<state.marks.domReady,true,'head LIFF initialization starts before DOMReady');
    assert.equal(state.marks.checkUserEnd<=state.marks.firstInteractive,true,'first interactive requires fresh checkUser');
    assert.equal(state.role,'user');assert.equal(state.currentRole,'user');assert.equal(state.init,true);
    assert.deepEqual(state.errors,[],'no script/runtime errors');assert.deepEqual(state.writes,[],'no write actions requested');
    const actual=state.execution.map(item=>item.path).filter(path=>classicOrder.includes(path));
    assert.deepEqual(actual,classicOrder,'bottom classic execution order is preserved');
    for(const [hook,value]of Object.entries(state.hooks))assert.equal(value,true,hook+' initialization survives');
    assert.ok(lane.max<=6);
    state.status='pass';
  }catch(error){
    state.status='fail';state.failure=error.stack;
    try{Object.assign(state,await page.evaluate(()=>({marks:window.__entrySpeed?.marks,execution:window.__entrySpeed?.execution,role:window.userRole,loading:document.getElementById('loading-text')?.textContent})));}catch{}
    await page.screenshot({path:join(OUT,mode+'-'+ordinal+'-failure.png'),fullPage:false}).catch(()=>{});
  }finally{await context.close();}
  writeFileSync(join(OUT,mode+'-'+ordinal+(cachedRole?'-cached':'')+'.json'),JSON.stringify(state,null,2));
  console.log(JSON.stringify({mode,ordinal,cachedRole,status:state.status,marks:state.marks,hooks:state.hooks,initializationOrder:state.initializationOrder,errors:state.errors,writes:state.writes,blocked:state.blocked,failure:state.failure?.split('\n').slice(0,3).join('\n')}));
  return state;
}

const browser=await playwright.chromium.launch({channel:'chrome',headless:true});
const results=[];
try{
  for(let ordinal=1;ordinal<=RUNS;ordinal++)for(const mode of ordinal%2?['baseline','candidate']:['candidate','baseline'])results.push(await run(browser,mode,ordinal));
  // Warm cache is a compatibility smoke; it must not be used as fresh role authority.
  for(const mode of ['baseline','candidate'])results.push(await run(browser,mode,0,{cachedRole:'admin'}));
}finally{await browser.close();}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;};
const comparison={};
for(const metric of ['domReady','liffStart','liffEnd','profileStart','profileEnd','checkUserStart','checkUserEnd','firstInteractive']){
  const arms={};for(const mode of ['baseline','candidate'])arms[mode]=median(results.filter(result=>result.mode===mode&&!result.cachedRole).map(result=>result.marks?.[metric]??NaN));
  comparison[metric]={...arms,savedMs:arms.baseline-arms.candidate,savedPercent:(arms.baseline-arms.candidate)/arms.baseline*100};
}
const compatibility={
  startupSmokePassed:results.every(result=>result.status==='pass'),
  baselineSettingsAlwaysBeforeAuth:results.filter(result=>result.mode==='baseline').every(result=>result.initializationOrder?.settingsQuotaRuntimeBeforeAuth),
  candidateSettingsAlwaysBeforeAuth:results.filter(result=>result.mode==='candidate').every(result=>result.initializationOrder?.settingsQuotaRuntimeBeforeAuth),
  limitation:'Smoke covers ordinary home startup, fresh role reconciliation and selected hooks only, not every direct entry or fast SDK response. defer changes settings.js document.write into non-blocking dynamic loading and reorders module/classic execution.',
  recommendation:'Do not adopt bottom-defer-only on the basis of this fixture; modest simulated gain does not justify changed initialization ordering.'
};
const report={sourceSha256,runs:RUNS,candidateChangedScripts:changed,conditions:{localScriptLatency:'deterministic 150–300 ms by path',maxConcurrentLocalScripts:6,liffInitMs:300,profileMs:450,friendshipMs:200,checkUserMs:300,cache:'fresh browser context per run; separate stale admin cache smoke',firstInteractive:'fixture-specific readiness, not standardized TTI: fresh checkUser applied as user + home visible + loading hidden + home task toggle handler exists; next animation frame',network:'all routes locally intercepted, SDK and remote data synthetic; no route.continue'},compatibility,comparison,results};
writeFileSync(join(OUT,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({sourceSha256,comparison,compatibility,report:join(OUT,'report.json')},null,2));
assert.ok(results.every(result=>result.status==='pass'),'all startup and stale-cache compatibility runs must pass');
