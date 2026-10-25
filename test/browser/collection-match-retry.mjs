// Real Chromium regression with 41 synthetic cards, fake time and no network.
// No production/LINE/provider request, account, point or member write is made.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const script=name=>readFileSync(new URL('../../js/'+name,import.meta.url),'utf8');
const core=script('core.js'),start=core.indexOf('window.loadCardData = async function'),end=core.indexOf('// === 5. LIFF',start);
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function fixture(options={}){
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>route.abort());await page.clock.install({time:new Date('2026-10-25T01:00:00Z')});
 await page.setContent('<style>.hidden{display:none}</style><section id="page-card"><input id="search-card-input"><div id="card-list"></div></section>');
 await page.evaluate(options=>{
  window.testHidden=!!options.hidden;window.failureCode=options.failureCode||'provider';Object.defineProperty(document,'hidden',{configurable:true,get:()=>window.testHidden});
  window.currentUserProfile={userId:'TEST'};window.currentUser={userId:'TEST'};window.currentUserCard={自訂名片設定:'{}'};window.testToken='token-a';window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken};window.__reads=0;window.__refreshes=0;window.mode=options.mode||'recover';window.status=options.status||'failed';window.__delay=!!options.delay;
  const base={sourceType:'private_import',scannerUserId:'TEST',公司名稱:'合成公司',職稱:'合成業務'};
  window.harvestCards=Array.from({length:41},(_,i)=>({...base,rowId:'SYNTHETIC_'+i,姓名:'合成名片'+i,created_at:new Date(Date.now()-i*1000).toISOString(),aiMatch:i<5||options.allNew?{status:'pending',score:null,autoEligible:true}:{status:'completed',score:i===5?0:82,source:'ai',intentKey:'',basis:'previous',reason:'原本真實合成分數必須永久沿用'}}));window.allCards=window.harvestCards;
  if(options.seedLegacy)window.harvestCards.forEach(c=>{if(c.aiMatch.score===null)c.aiMatch={status:options.legacyStatus||'limited',failureCode:'quota',score:null,autoEligible:false,retryAt:new Date(Date.now()+86400000).toISOString(),reason:'今日額度已用完，明早08:00再試'};});
  window.showToast=()=>{};window.syncUserCardMatch=()=>{};
  window.fetchAPI=async(action)=>{
   if(action==='getCardHarvestContacts'){
    window.__reads++;
    if(options.readFailureCount&&window.__reads<=options.readFailureCount)throw Error('synthetic read unavailable');
    if(window.__delayRead)await new Promise(r=>window.__completeRead=r);
    return window.harvestCards.map(c=>c.aiMatch.score===null&&((!options.oldBackend&&(c.aiMatch.status==='limited'||c.aiMatch.failureCode==='quota'))||Date.parse(c.aiMatch.retryAt||'')<=Date.now())?{...c,aiMatch:{status:'pending',score:null,autoEligible:true}}:c);
   }
   if(action!=='refreshCardHarvestMatches')throw Error(action);window.__refreshes++;
   if(window.__delay)await new Promise(r=>window.__complete=r);
   if(window.mode==='transport')throw Error('synthetic offline');
   const fail=window.mode==='always_fail'||(window.mode!=='success'&&window.__refreshes===1);
   const targets=new Set(window.harvestCards.filter(c=>c.aiMatch.score===null&&c.aiMatch.autoEligible===true).slice(0,5).map(c=>c.rowId));
   const failureCode=window.status==='limited'?'quota':window.status==='processing'?'':window.failureCode;
   const cards=window.harvestCards.map(c=>targets.has(c.rowId)?{...c,aiMatch:fail?{status:window.status,score:null,autoEligible:false,failureCode,reason:'合成暫時失敗提示',retryAt:new Date(Date.now()+(window.status==='limited'?3600000:window.status==='processing'?120000:300000)).toISOString()}:{status:'completed',score:71,source:'ai',basis:'profile'}}:c.aiMatch.score===null?c:{...c,aiMatch:{status:'completed',score:99,source:'ai'}});
   return {processed:fail?0:targets.size,cards,...(fail?{failureCode,retryAt:cards.find(c=>targets.has(c.rowId))?.aiMatch.retryAt}: {})};
  };
 },options);
 for(const name of ['modules/cards.js','modules/collection-match-auto.js'])await page.addScriptTag({content:script(name)});await page.addScriptTag({content:core.slice(start,end)});
 if(!options.skipInitialRender)await page.evaluate(()=>window.renderCardList(window.harvestCards));
 return {page,close:()=>context.close()};
}
const state=page=>page.evaluate(()=>({reads:window.__reads,refreshes:window.__refreshes,status:window.harvestCards[0].aiMatch.status,score:window.harvestCards[0].aiMatch.score,zero:window.harvestCards[5].aiMatch.score,old:window.harvestCards[6].aiMatch.score,notice:document.getElementById('collection-match-retry-status')?.textContent}));
const failReady=page=>page.waitForFunction(()=>window.harvestCards[0].aiMatch.status!=='pending');
const complete=page=>page.waitForFunction(()=>window.harvestCards[0].aiMatch.status==='completed');
try{
 // Failed rows expire while the list stays visible: one authoritative read,
 // followed by a retry only for the five unscored cards.
 {
  const f=await fixture();await failReady(f.page);assert.deepEqual(await state(f.page),{reads:0,refreshes:1,status:'failed',score:null,zero:0,old:82,notice:''});
  for(let i=0;i<5;i++)await f.page.evaluate(()=>window.renderCardList(window.harvestCards));
  await f.page.clock.fastForward(299000);assert.equal((await state(f.page)).refreshes,1);await f.page.clock.fastForward(2000);await complete(f.page);
  const result=await state(f.page);assert.equal(result.reads,1);assert.equal(result.refreshes,2);assert.equal(result.score,71);assert.equal(result.zero,0);assert.equal(result.old,82);await f.page.clock.fastForward(3600000);assert.equal((await state(f.page)).refreshes,2);
  console.log('PASS 41 cards: visible expiry read/retry, zero/old scores permanent, completed list schedules no requests');await f.close();
 }
 // Leaving cancels the clock; returning after six minutes invalidates failed
 // cache and resumes immediately instead of keeping the old failed badge.
 {
  const f=await fixture();await failReady(f.page);await f.page.evaluate(()=>document.getElementById('page-card').classList.add('hidden'));await f.page.waitForTimeout(1);await f.page.clock.fastForward(360001);assert.equal((await state(f.page)).refreshes,1);
  await f.page.evaluate(()=>document.getElementById('page-card').classList.remove('hidden'));await complete(f.page);assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).refreshes,2);await f.close();console.log('PASS six-minute re-entry: no hidden calls, expired metadata re-read on visible return');
 }
 // A navigation load and the visibility observer share one pending read.
 {
  const f=await fixture();await failReady(f.page);await f.page.evaluate(()=>document.getElementById('page-card').classList.add('hidden'));await f.page.waitForTimeout(1);await f.page.clock.fastForward(360001);
  await f.page.evaluate(()=>{window.__delayRead=true;document.getElementById('page-card').classList.remove('hidden');window.__load=window.loadCardData({harvest:true,initPanels:false});});await f.page.waitForFunction(()=>typeof window.__completeRead==='function');assert.equal((await state(f.page)).reads,1);await f.page.evaluate(()=>window.__completeRead());await complete(f.page);assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).refreshes,2);await f.close();console.log('PASS navigation/visibility share one in-flight authoritative read');
 }
 // Hidden initial entry must not consume a cooldown. Resume can start at once.
 {
  const f=await fixture({hidden:true});assert.equal((await state(f.page)).refreshes,0);await f.page.clock.fastForward(10000);await f.page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await failReady(f.page);assert.equal((await state(f.page)).refreshes,1);await f.page.evaluate(()=>{window.testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});await f.page.clock.fastForward(360001);assert.equal((await state(f.page)).refreshes,1);await f.page.evaluate(()=>{window.testHidden=false;document.dispatchEvent(new Event('visibilitychange'));});await complete(f.page);await f.close();console.log('PASS document hidden/resume does not consume or block a first attempt');
 }
 // Late AI responses must never modify another login or a closed list.
 for(const change of ['owner','token','leave']){
  const f=await fixture({delay:true});await f.page.waitForFunction(()=>typeof window.__complete==='function');await f.page.evaluate(change=>{
   if(change==='owner')window.currentUserProfile={userId:'OTHER'};
   if(change==='token')window.testToken='token-b';
   if(change==='leave')document.getElementById('page-card').classList.add('hidden');
  },change);await f.page.waitForTimeout(1);await f.page.evaluate(()=>window.__complete());await f.page.waitForTimeout(1);assert.equal((await state(f.page)).status,'pending');await f.page.clock.fastForward(3600000);assert.equal((await state(f.page)).refreshes,1);await f.close();console.log('PASS discard late result after '+change);
 }
 // Provider failures are not an endless automatic request loop.
 {
  const f=await fixture({mode:'always_fail'});await failReady(f.page);
  for(let i=0;i<4;i++){await f.page.clock.fastForward(301000);await f.page.waitForTimeout(1);}
  const result=await state(f.page);assert.equal(result.refreshes,4);assert.equal(result.reads,3);assert.match(result.notice,/自動重試已暫停/);await f.page.clock.fastForward(3600000);assert.equal((await state(f.page)).refreshes,4);
  await f.page.evaluate(()=>window.refreshCollectedCardMatches());assert.equal((await state(f.page)).reads,4);assert.equal((await state(f.page)).refreshes,5,'manual refresh can resume after actual backend expiry');await f.close();console.log('PASS at most three timed retries, visible pause notice, explicit refresh resumes');
 }
 {
  const f=await fixture({mode:'transport'});await f.page.waitForFunction(()=>document.getElementById('collection-match-retry-status').textContent.includes('暫時無法讀取'));
  for(let i=0;i<4;i++){await f.page.clock.fastForward(61000);await f.page.waitForTimeout(1);}assert.equal((await state(f.page)).refreshes,4);assert.match((await state(f.page)).notice,/自動重試已暫停/);await f.page.clock.fastForward(3600000);assert.equal((await state(f.page)).refreshes,4);await f.close();console.log('PASS network errors have bounded one-minute backoff and no infinite loop');
 }
 // Retired local daily limits never wait for their cached tomorrow deadline.
 for(const legacyStatus of ['limited','failed']){
  const f=await fixture({seedLegacy:true,legacyStatus,allNew:true,mode:'success'});await f.page.waitForFunction(()=>window.harvestCards.every(c=>c.aiMatch.status==='completed'));assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).refreshes,9);assert.doesNotMatch(await f.page.locator('#card-list').innerText(),/今日額度|08:00|明早/);await f.close();console.log('PASS 41 cached '+legacyStatus+'/quota states recover immediately through one authoritative read');
 }
 {
  const f=await fixture({seedLegacy:true,mode:'success'});await complete(f.page);assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).zero,0);assert.equal((await state(f.page)).old,82);await f.close();console.log('PASS old quota recovery never recomputes existing zero or historical scores');
 }
 {
  const f=await fixture({seedLegacy:true,allNew:true,oldBackend:true,mode:'success'});await f.page.waitForFunction(()=>window.__reads===1);await f.page.waitForTimeout(1);for(let i=0;i<10;i++)await f.page.evaluate(()=>window.renderCardList(window.harvestCards));await f.page.clock.fastForward(86400001);assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).refreshes,0);assert.equal(await f.page.evaluate(()=>window.harvestCards[0].aiMatch.autoEligible),false);assert.match(await f.page.locator('#card-list').innerText(),/配對狀態更新中/);assert.doesNotMatch(await f.page.locator('#card-list').innerText(),/今日額度|08:00|明早/);await f.close();console.log('PASS a legacy server still returning limited causes no retry loop or invented eligibility');
 }
 {
  const f=await fixture({seedLegacy:true,allNew:true,oldBackend:true,skipInitialRender:true,mode:'success'});await f.page.evaluate(()=>window.loadCardData({harvest:true,initPanels:false}));await f.page.clock.fastForward(86400001);assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).refreshes,0);await f.close();console.log('PASS a core-first fresh read counts once when the legacy server still returns limited');
 }
 {
  const f=await fixture({seedLegacy:true,allNew:true,readFailureCount:1,mode:'success'});await f.page.waitForFunction(()=>window.__reads===1);await f.page.waitForTimeout(1);await f.page.clock.fastForward(59000);assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).refreshes,0);await f.page.clock.fastForward(2000);await f.page.waitForFunction(()=>window.harvestCards.every(c=>c.aiMatch.status==='completed'));assert.equal((await state(f.page)).reads,2);assert.equal((await state(f.page)).refreshes,9);await f.close();console.log('PASS failed legacy recovery read backs off one minute before rechecking server eligibility');
 }
 {
  const f=await fixture({status:'limited',allNew:true});await failReady(f.page);assert.match(await f.page.locator('#card-list').innerText(),/配對狀態更新中/);await f.page.clock.fastForward(1001);await f.page.waitForFunction(()=>window.harvestCards.every(c=>c.aiMatch.status==='completed'));assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).refreshes,10);await f.close();console.log('PASS an old quota response is refreshed immediately instead of blocking the collection until tomorrow');
 }
 for(const failureCode of ['provider','timeout','invalid_response']){
  const f=await fixture({allNew:true,failureCode});await failReady(f.page);await f.page.clock.fastForward(299000);assert.equal((await state(f.page)).refreshes,1,'a failed batch must not spend AI on the other 36 cards during backoff');assert.equal((await state(f.page)).reads,0);await f.page.clock.fastForward(2000);await f.page.waitForFunction(()=>window.harvestCards.every(c=>c.aiMatch.status==='completed'));assert.equal((await state(f.page)).reads,1);assert.equal((await state(f.page)).refreshes,10);await f.close();console.log('PASS whole-collection five-minute '+failureCode+' backoff covers all 41 unscored cards');
 }
 {
  const f=await fixture({status:'processing'});await failReady(f.page);await f.page.clock.fastForward(121000);await complete(f.page);assert.equal((await state(f.page)).reads,1);await f.close();console.log('PASS processing lease expiry is re-read and recovered');
 }
 // Real core loader rejects a late force-refresh after account/token change.
 for(const change of ['owner','token']){
  const f=await fixture({hidden:true});await f.page.evaluate(()=>{window.__delayRead=true;window.__load=window.loadCardData({harvest:true,force:true,render:false,initPanels:false,throwOnError:true}).catch(e=>window.__loadError=e.message);});await f.page.waitForFunction(()=>typeof window.__completeRead==='function');await f.page.evaluate(change=>{if(change==='owner')window.currentUserProfile={userId:'OTHER'};else window.testToken='token-b';window.__completeRead();},change);await f.page.waitForFunction(()=>!!window.__loadError);assert.match(await f.page.evaluate(()=>window.__loadError),/登入身份已變更/);await f.close();console.log('PASS core loader discards late force refresh after '+change);
 }
 assert.deepEqual(errors,[]);console.log('PASS all collection retry lifecycle regressions; production writes=0');
}finally{await browser.close();}
