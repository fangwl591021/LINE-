// Real editor + server-shared pure schema in Chromium. Synthetic configuration
// storage only: no LINE send, wallet lookup/write, check-in or click analytics.
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {defaultCheckinDashboardConfig,normalizeCheckinDashboardConfig,buildCheckinDashboardMessage} from '../../worker/checkin-chat-dashboard-render.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const workspace=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(workspace,'../checkin-chat-dashboard-preview');mkdirSync(output,{recursive:true});
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成卡片編輯驗收</title><link rel="stylesheet" href="/css/checkin-chat-dashboard.css"><style>body{margin:22px;background:#f5f8f6}.hidden{display:none!important}@media(max-width:600px){body{margin:8px}}</style><button id="open" onclick="loadAdminCheckinChatDashboard()">開啟卡片設定</button><script>let adminRole='admin';const WORKER_URL='https://fixture.invalid';window.testToken='synthetic-admin';window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken};</script><section id="tab-checkin-chat-dashboard"><div id="checkin-chat-dashboard-content"></div></section><script src="/js/modules/checkin-chat-dashboard.js"></script></html>`;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function waitFor(predicate){for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,5));}throw Error('Synthetic request did not arrive');}
async function fixture(width=1440){
 const context=await browser.newContext({viewport:{width,height:1100}}),page=await context.newPage(),calls=[],forbidden=[],held=[],keys=new Map();
 const state={template:{key:'member_checkin',draftRevision:1,publishedRevision:0,draftConfig:defaultCheckinDashboardConfig(),publishedConfig:defaultCheckinDashboardConfig(),updatedAt:'2026-10-25T04:00:00Z',publishedAt:null},hold:'',conflict:false,dropDraft:false,dropPublish:false,deny:false};
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='127.0.0.1'){
   if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:html});return;}
   if(['/css/checkin-chat-dashboard.css','/js/modules/checkin-chat-dashboard.js'].includes(url.pathname)){await route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:readFileSync(join(workspace,url.pathname),'utf8')});return;}
  }
  if(url.hostname==='image.example'){await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#bde6d2"/><text x="50" y="210" font-size="44" fill="#1d7553">Synthetic image</text></svg>'});return;}
  if(url.hostname!=='fixture.invalid'||!url.pathname.startsWith('/v1/checkin-chat-dashboard')){forbidden.push(request.url());await route.abort();return;}
  const path=url.pathname.slice('/v1/checkin-chat-dashboard'.length),body=request.method()==='POST'?request.postDataJSON():null;calls.push({path,method:request.method(),body,authorization:request.headers().authorization});
  if(state.hold&&(state.hold===path||state.hold==='GET'&&request.method()==='GET'))await new Promise(r=>held.push(r));
  if(state.deny){await route.fulfill({status:403,json:{success:false,error:'合成管理權限已撤銷'}});return;}
  if(request.method()==='GET'){await route.fulfill({json:{success:true,template:structuredClone(state.template)}}).catch(()=>{});return;}
  if(!['/draft','/publish','/preview'].includes(path)){forbidden.push(path);await route.abort();return;}
  if(path==='/preview'){
   try{const config=normalizeCheckinDashboardConfig(body.config),message=buildCheckinDashboardMessage({LIFF_ID:'1660923784-vViMTZ1y'},'00000000-0000-4000-8000-000000000001',null,Date.now(),config);await route.fulfill({json:{success:true,message}});}catch(error){await route.fulfill({status:400,json:{success:false,error:error.message}});}return;
  }
  const fingerprint=JSON.stringify(body);
  if(keys.has(body.requestKey)){assert.equal(keys.get(body.requestKey).fingerprint,fingerprint,'same idempotency key cannot carry different content');await route.fulfill({json:{...keys.get(body.requestKey).result,replayed:true}});return;}
  if(state.conflict||body.expectedDraftRevision!==state.template.draftRevision||path==='/publish'&&body.expectedPublishedRevision!==state.template.publishedRevision){await route.fulfill({status:409,json:{success:false,code:'REVISION_CONFLICT',error:'內容已更新，請重新載入',currentDraftRevision:state.template.draftRevision,currentPublishedRevision:state.template.publishedRevision}});return;}
  try{
   if(path==='/draft'){state.template.draftConfig=normalizeCheckinDashboardConfig(body.config);state.template.draftRevision++;}
   else {state.template.publishedConfig=structuredClone(state.template.draftConfig);state.template.publishedRevision++;state.template.publishedAt=new Date().toISOString();}
   const result={success:true,template:structuredClone(state.template)};keys.set(body.requestKey,{fingerprint,result});
   if(path==='/draft'&&state.dropDraft){state.dropDraft=false;await route.abort();return;}if(path==='/publish'&&state.dropPublish){state.dropPublish=false;await route.abort();return;}
   await route.fulfill({json:result});
  }catch(error){await route.fulfill({status:400,json:{success:false,error:error.message}});}
 });
 await page.goto('http://127.0.0.1/');
 const open=async()=>{await page.click('#open');await page.locator('[data-save]').waitFor();await page.waitForFunction(()=>!window.adminCheckinChatDashboardController.isBusy());};
 const posts=path=>calls.filter(call=>call.method==='POST'&&(!path||call.path===path));
 return {context,page,state,calls,forbidden,open,posts,waiting:()=>held.length,release(){while(held.length)held.shift()();},async close(){while(held.length)held.shift()();assert.deepEqual(forbidden,[]);await context.close();}};
}
async function status(page,pattern){await page.waitForFunction(source=>new RegExp(source).test(document.querySelector('[data-status]')?.textContent||''),pattern.source);}
try{
 {
  const f=await fixture();await f.open();assert.equal(f.calls.length,1);assert.equal(f.posts().length,0);assert.equal(await f.page.locator('.ccd-card').count(),2);assert.match(await f.page.locator('.ccd-dynamic').innerText(),/依登入會員即時查詢/);assert.equal(await f.page.locator('[name=balance],[name=points],[name=enabled],[name=heroImageUrl]').count(),0);assert.equal(await f.page.locator('[data-list-page=wallet] [data-remove-page],[data-list-page=wallet] [data-move-page]').count(),0);assert.equal(await f.page.locator('[name=title]').getAttribute('maxlength'),'60');assert.equal(await f.page.locator('[name=altText]').getAttribute('maxlength'),'120');
  assert.equal(await f.page.locator('[data-dirty]').innerText(),'目前使用預設版本');
  await f.page.locator('[data-preview-page=wallet][data-select-field=title]').click();assert.equal(await f.page.evaluate(()=>document.activeElement.name),'title');await f.page.locator('[name=title]').fill('我的購物金服務');assert.match(await f.page.locator('[data-page-id=wallet]').innerText(),/我的購物金服務/);assert.equal(await f.page.locator('[data-publish]').isDisabled(),true);assert.equal(f.posts().length,0);
  await f.page.locator('[data-preview-page=wallet][data-select-field="button:shop"]').click();await f.page.locator('[name=buttonLabel][data-button-id=shop]').fill('逛逛合作商城');assert.match(await f.page.locator('[data-page-id=wallet]').innerText(),/逛逛合作商城/);assert.equal(await f.page.locator('[name=buttonTarget] option').evaluateAll(nodes=>nodes.every(n=>['mall','details'].includes(n.value))),true);await f.page.locator('[name=buttonTarget][data-button-id=shop]').selectOption('details');assert.deepEqual(await f.page.locator('[name=buttonTarget]').evaluateAll(nodes=>nodes.map(n=>n.value)),['details','mall']);assert.equal(f.posts().length,0);
  await f.page.locator('[data-preview-check]').click();await status(f.page,/檢查通過/);assert.equal(f.posts('/preview').length,1);assert.equal(f.state.template.draftRevision,1);assert.equal(f.state.template.publishedRevision,0);await f.page.locator('[data-save]').click();await status(f.page,/草稿已儲存/);assert.equal(f.state.template.draftRevision,2);assert.equal(f.state.template.publishedRevision,0);assert.equal(f.state.template.draftConfig.pages[0].title,'我的購物金服務');await f.page.locator('[data-publish]').click();await status(f.page,/卡片已發布/);assert.equal(f.state.template.publishedRevision,1);assert.equal(f.state.template.publishedConfig.pages[0].buttons[0].label,'逛逛合作商城');assert.ok(f.calls.every(call=>call.authorization==='Bearer synthetic-admin'));await f.close();console.log('PASS click-to-edit live preview, protected wallet, built-in button targets, pure preview, separate draft and publish');
 }
 {
  const f=await fixture();await f.open();for(let i=0;i<2;i++)await f.page.locator('[data-add-page]').click();await f.page.locator('[name=title]').fill('第三個說明 <script>不可執行</script>');const ids=await f.page.locator('[data-list-page]').evaluateAll(nodes=>nodes.map(n=>n.dataset.listPage));assert.equal(ids.length,4);assert.ok(ids.every(value=>/^[a-z][a-z0-9_-]{0,39}$/.test(value)));await f.page.locator(`[data-move-page="${ids[3]}"][data-offset="-1"]`).click();assert.deepEqual(await f.page.locator('[data-list-page]').evaluateAll(nodes=>nodes.map(n=>n.dataset.listPage)),[ids[0],ids[1],ids[3],ids[2]]);await f.page.locator('[data-add-button]').click();await f.page.locator('[data-add-button]').click();await f.page.locator('[data-add-button]').click();assert.equal(await f.page.locator('[data-add-button]').isDisabled(),true);assert.equal(await f.page.locator('[name=buttonLabel]').count(),3);await f.page.locator('[name=heroImageUrl]').fill('javascript:alert(1)');await f.page.locator('[data-save]').click();await status(f.page,/HTTPS/);assert.equal(f.posts().length,0);await f.page.locator('[name=heroImageUrl]').fill('https://image.example/hero.svg#bad');await f.page.locator('[data-save]').click();assert.equal(f.posts().length,0);await f.page.locator('[name=heroImageUrl]').fill('https://image.example/hero.svg');await f.page.locator('.ccd-card-image').waitFor();assert.equal(await f.page.locator('.ccd-card script').count(),0);await f.page.locator('[data-save]').click();await status(f.page,/草稿已儲存/);assert.equal(f.state.template.draftConfig.pages.length,4);assert.equal(f.state.template.draftConfig.pages[2].id,ids[3]);assert.equal(f.state.template.draftConfig.pages[2].buttons.length,3);await f.close();console.log('PASS stable page/button IDs, reorder, button limit, safe image URLs and escaped text');
 }
 {
  const f=await fixture();await f.open();for(let i=0;i<10;i++)await f.page.locator('[data-add-page]').click();assert.equal(await f.page.locator('[data-list-page]').count(),12);assert.equal(await f.page.locator('[data-add-page]').isDisabled(),true);const selected=await f.page.locator('[data-list-page][data-active=true]').getAttribute('data-list-page');await f.page.locator(`[data-remove-page="${selected}"]`).click();assert.equal(await f.page.locator('[data-list-page]').count(),11);assert.equal(await f.page.locator('[data-list-page]').first().getAttribute('data-list-page'),'wallet');assert.equal(f.posts().length,0);await f.close();console.log('PASS maximum12 pages, protected first page, deletion without an implicit save');
 }
 {
  const f=await fixture();await f.open();await f.page.locator('[name=title]').fill('我的未儲存草稿');f.state.conflict=true;f.state.template.draftRevision=2;f.state.template.draftConfig.pages[0].title='另一位管理員的版本';await f.page.locator('[data-save]').click();await status(f.page,/本機編輯仍保留/);assert.equal(await f.page.locator('[name=title]').inputValue(),'我的未儲存草稿');assert.equal(await f.page.locator('[data-conflict]').isVisible(),true);assert.equal(f.state.template.draftConfig.pages[0].title,'另一位管理員的版本');assert.equal(f.posts('/draft').length,1);f.state.conflict=false;await f.page.locator('[data-reload]').click();await f.page.waitForFunction(()=>document.querySelector('[name=title]').value==='另一位管理員的版本');await f.close();console.log('PASS revision conflict retains local content and cannot overwrite remote version without an explicit reload');
 }
 for(const operation of ['draft','publish']){
  const f=await fixture();await f.open();if(operation==='draft'){await f.page.locator('[name=title]').fill('不確定回覆時保留的草稿');f.state.dropDraft=true;}else f.state.dropPublish=true;await f.page.locator(operation==='draft'?'[data-save]':'[data-publish]').click();await f.page.waitForFunction(()=>!window.adminCheckinChatDashboardController.isBusy());assert.equal(f.posts('/'+operation).length,1);await f.page.locator(operation==='draft'?'[data-save]':'[data-publish]').click();await status(f.page,operation==='draft'?/草稿已儲存/:/卡片已發布/);assert.deepEqual(f.posts('/'+operation)[0].body,f.posts('/'+operation)[1].body);assert.equal(operation==='draft'?f.state.template.draftRevision:f.state.template.publishedRevision,operation==='draft'?2:1);await f.close();console.log('PASS '+operation+' uncertain network response retries with identical requestKey and content');
 }
 {
  const f=await fixture();await f.open();await f.page.locator('[data-select-page=guide]').click();await f.page.locator('[name=body]').fill('第一行\n第二行，這份草稿要保留');await f.page.locator('[name=body]').focus();await f.page.locator('[name=body]').evaluate(node=>node.setSelectionRange(2,5));await f.page.locator('[data-properties]').evaluate(node=>node.scrollTop=120);const before=await f.page.locator('[data-properties]').evaluate(node=>node.scrollTop),requests=f.calls.length;await f.page.evaluate(()=>document.getElementById('tab-checkin-chat-dashboard').classList.add('hidden'));await f.page.evaluate(()=>document.getElementById('tab-checkin-chat-dashboard').classList.remove('hidden'));await f.page.click('#open');assert.equal(f.calls.length,requests);assert.equal(await f.page.locator('[name=body]').inputValue(),'第一行\n第二行，這份草稿要保留');assert.equal(await f.page.locator('[data-properties]').evaluate(node=>node.scrollTop),before);assert.deepEqual(await f.page.locator('[name=body]').evaluate(node=>[node.selectionStart,node.selectionEnd]),[2,5]);assert.equal(await f.page.evaluate(()=>window.adminCheckinChatDashboardController.hasUnsavedChanges()),true);await f.close();console.log('PASS tab re-entry reuses the editor and retains unsaved text, selection and property scroll');
 }
 for(const action of ['role','token']){
  const f=await fixture();await f.open();await f.page.locator('[name=title]').fill('不可套到其他身分的內容');f.state.hold='/draft';await f.page.locator('[data-save]').click();await waitFor(()=>f.waiting()>0);await f.page.evaluate(action=>{if(action==='role')adminRole='user';else window.testToken='different-token';},action);await f.page.waitForTimeout(600);f.release();await f.page.waitForTimeout(20);assert.equal(await f.page.locator('[data-save]').count(),0);assert.doesNotMatch(await f.page.locator('#checkin-chat-dashboard-content').innerText(),/不可套到其他身分/);await f.close();console.log('PASS '+action+' change disposes editor and rejects late mutation response');
 }
 {
  const f=await fixture();await f.open();await f.page.locator('[name=title]').fill('權限撤銷後不可發布');f.state.deny=true;await f.page.locator('[data-save]').click();await f.page.getByText('管理權限或登入已變更，請重新登入。',{exact:true}).waitFor();assert.equal(await f.page.locator('[data-publish]').count(),0);assert.equal(f.state.template.draftRevision,1);await f.close();console.log('PASS server403 stops the editor without changing a revision');
 }
 {
  const f=await fixture();f.state.hold='GET';await f.page.click('#open');await waitFor(()=>f.waiting()>0);await f.page.click('#open');assert.equal(f.calls.length,1);f.release();await f.page.locator('[data-save]').waitFor();await f.page.waitForFunction(()=>!window.adminCheckinChatDashboardController.isBusy());await f.close();console.log('PASS repeated entry while loading shares one mount and one read');
 }
 for(const width of [1440,375]){
  const f=await fixture(width);await f.open();assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await f.page.screenshot({path:join(output,'checkin-chat-dashboard-'+width+'.png'),fullPage:true});if(width===375){await f.page.locator('[data-preview-page=wallet][data-select-field=title]').click();await f.page.locator('[name=title]').fill('手機也能編輯');assert.equal(await f.page.locator('[data-panel=properties]').isVisible(),true);await f.page.locator('[data-mobile=preview]').click();assert.match(await f.page.locator('[data-page-id=wallet]').innerText(),/手機也能編輯/);assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}await f.close();console.log('PASS responsive editor '+width+'px, no page overflow');
 }
 assert.deepEqual(errors,[]);console.log('PASS dashboard editor; productionWrites=0, LINE/check-in/wallet/clickOperations=0; screenshots '+output);
}finally{await browser.close();}
