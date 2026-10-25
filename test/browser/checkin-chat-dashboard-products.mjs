// Real Chromium editor with synthetic public-catalog/configuration storage.
// Every network request is intercepted: no real LINE, catalog, wallet or click write.
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {defaultCheckinDashboardConfig,normalizeCheckinDashboardConfig,buildCheckinDashboardMessage} from '../../worker/checkin-chat-dashboard-render.mjs';
import {normalizeDashboardProduct} from '../../worker/checkin-dashboard-products.mjs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const workspace=fileURLToPath(new URL('../../',import.meta.url)),output=resolve(workspace,'../checkin-chat-dashboard-preview');mkdirSync(output,{recursive:true});
const shopA='00000000-0000-4000-8000-000000000001',shopB='00000000-0000-4000-8000-000000000002';
const catalog=Array.from({length:45},(_,i)=>normalizeDashboardProduct({shopId:i<41?shopA:shopB,productId:'product-'+String(i+1).padStart(3,'0'),title:i===0?'光動能按摩機':i===41?'展示商品 <script>window.bad=1</script>':'已上架商品 '+String(i+1).padStart(2,'0'),shopName:i<41?'合成數位商店':'合成公開展示店',imageUrl:'https://image.example/product.svg',priceCents:i===0?1180000:10000+i*100,purchaseMode:'online',merchantEnabled:i<41,redeemType:'percent',redeemValue:50,version:1,shopVersion:1}));
const key=item=>item.shopId+'/'+item.productId,ref=(item,id)=>({id,kind:'product',shopId:item.shopId,productId:item.productId});
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成商品卡片驗收</title><link rel="stylesheet" href="/css/checkin-chat-dashboard.css"><style>body{margin:22px;background:#f5f8f6}.hidden{display:none!important}@media(max-width:600px){body{margin:8px}}</style><button id="open" onclick="loadAdminCheckinChatDashboard()">開啟卡片設定</button><script>let adminRole='admin';const WORKER_URL='https://fixture.invalid';window.testToken='synthetic-admin';window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken};</script><section id="tab-checkin-chat-dashboard"><div id="checkin-chat-dashboard-content"></div></section><script src="/js/modules/checkin-chat-dashboard.js"></script></html>`;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
async function fixture({width=1440,pages=[]}={}){
 const context=await browser.newContext({viewport:{width,height:1100}}),page=await context.newPage(),calls=[],forbidden=[],held=[];
 const config=defaultCheckinDashboardConfig();config.pages.push(...pages);
 const state={template:{key:'member_checkin',draftRevision:1,publishedRevision:0,draftConfig:config,publishedConfig:structuredClone(config),updatedAt:'2026-10-25T04:00:00Z',publishedAt:null},missing:new Set(),publishError:'',holdQuery:null,holdAll:false,deny:false};
 const metadata=config=>{
  const refs=config.pages.filter(p=>p.kind==='product'),products=[],unavailableProducts=[];
  for(const r of refs){const item=catalog.find(p=>key(p)===key(r));if(item&&!state.missing.has(key(r)))products.push(structuredClone(item));else unavailableProducts.push({shopId:r.shopId,productId:r.productId,reason:'not_public'});}
  return {products,unavailableProducts};
 };
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='127.0.0.1'){
   if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:html});return;}
   if(['/css/checkin-chat-dashboard.css','/js/modules/checkin-chat-dashboard.js'].includes(url.pathname)){await route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:readFileSync(join(workspace,url.pathname),'utf8')});return;}
  }
  if(url.hostname==='image.example'){await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="#bde6d2"/><text x="50" y="210" font-size="44" fill="#1d7553">Synthetic product</text></svg>'});return;}
  if(url.hostname!=='fixture.invalid'||!url.pathname.startsWith('/v1/checkin-chat-dashboard')){forbidden.push(request.url());await route.abort();return;}
  const path=url.pathname.slice('/v1/checkin-chat-dashboard'.length),body=request.method()==='POST'?request.postDataJSON():null;calls.push({path,method:request.method(),body,query:Object.fromEntries(url.searchParams),authorization:request.headers().authorization});
  if(path==='/catalog'&&(state.holdAll||state.holdQuery!==null&&url.searchParams.get('q')===state.holdQuery))await new Promise(r=>held.push(r));
  const respond=async(status,json)=>route.fulfill({status,json}).catch(()=>{});
  if(state.deny){await respond(403,{success:false,error:'管理權限已變更'});return;}
  if(path==='/catalog'){
   const view=url.searchParams.get('view'),shop=url.searchParams.get('shop')||'',q=url.searchParams.get('q')||'',after=url.searchParams.get('after')||'';
   if(view==='shops'){const shops=[{id:shopA,name:'合成數位商店'},{id:shopB,name:'合成公開展示店'}].filter(s=>s.id>after);await respond(200,{success:true,shops:shops.slice(0,1),next:shops.length>1?shops[0].id:''});return;}
   const items=catalog.filter(p=>(!shop||p.shopId===shop)&&(!q||(p.title+p.shopName).includes(q))&&p.productId>after&&!state.missing.has(key(p)));
   await respond(200,{success:true,products:items.slice(0,40),next:items.length>40?items[39].productId:''});return;
  }
  if(request.method()==='GET'){await respond(200,{success:true,template:structuredClone(state.template),...metadata(state.template.draftConfig)});return;}
  if(!['/preview','/draft','/publish'].includes(path)){forbidden.push(path);await route.abort();return;}
  if(path==='/publish'&&state.publishError){await respond(409,{success:false,code:state.publishError,error:state.publishError==='PRODUCT_UNAVAILABLE'?'選取商品目前不可用':'商品資料已更新，請重新核對'});return;}
  try{
   const selected=normalizeCheckinDashboardConfig(path==='/publish'?state.template.draftConfig:body.config),data=metadata(selected);
   if(path==='/preview'){
    const snapshots=selected.pages.filter(p=>p.kind==='product').map(p=>({pageId:p.id,shopId:p.shopId,productId:p.productId,available:!state.missing.has(key(p)),product:data.products.find(item=>key(item)===key(p))}));
    await respond(200,{success:true,...data,message:buildCheckinDashboardMessage({LIFF_ID:'1660923784-vViMTZ1y'},shopA,null,Date.now(),selected,snapshots)});return;
   }
   assert.match(body.requestKey,/^[0-9a-f-]{36}$/);assert.equal(body.expectedDraftRevision,state.template.draftRevision);
   if(path==='/draft'){state.template.draftConfig=selected;state.template.draftRevision++;}
   else {assert.equal(body.expectedPublishedRevision,state.template.publishedRevision);state.template.publishedConfig=selected;state.template.publishedRevision++;}
   await respond(200,{success:true,template:structuredClone(state.template),...data});
  }catch(error){await respond(400,{success:false,error:error.message});}
 });
 await page.goto('http://127.0.0.1/');
 const open=async()=>{await page.click('#open');await page.locator('[data-save]').waitFor();await page.waitForFunction(()=>!window.adminCheckinChatDashboardController.isBusy());};
 const picker=async()=>{await page.locator('.ccd-actions [data-open-picker]').click();await page.waitForFunction(()=>document.querySelector('[data-picker-status]')?.textContent.includes('本次顯示'));await page.waitForFunction(()=>!document.querySelector('[data-picker-more-shops]')?.disabled);};
 const posts=path=>calls.filter(c=>c.method==='POST'&&(!path||c.path===path));
 const choices=()=>page.locator('[data-picker-choice]');
 const check=async item=>page.locator(`[data-picker-choice="${key(item)}"]`).check();
 return {page,state,calls,posts,choices,check,open,picker,held,release(){while(held.length)held.shift()();},async close(){while(held.length)held.shift()();assert.deepEqual(forbidden,[]);assert.ok(calls.every(c=>c.authorization==='Bearer synthetic-admin'));await context.close();}};
}
async function status(page,pattern){await page.waitForFunction(source=>new RegExp(source).test(document.querySelector('[data-status]')?.textContent||''),pattern.source);}
async function pickerStatus(page,pattern){await page.waitForFunction(source=>new RegExp(source).test(document.querySelector('[data-picker-status]')?.textContent||''),pattern.source);}
async function save(f){await f.page.locator('[data-save]').click();await status(f.page,/草稿已儲存/);return f.state.template.draftConfig;}
async function selectedCardFullyVisible(page,expectedId){
 try{await page.waitForFunction(id=>{const track=document.querySelector('[data-carousel]'),card=document.querySelector('[data-page-id="'+id+'"]');if(!track||!card)return false;const t=track.getBoundingClientRect(),c=card.getBoundingClientRect();return c.left>=t.left+11&&c.right<=t.right-11&&document.querySelector('[data-list-page="'+id+'"]')?.dataset.active==='true';},expectedId,{timeout:3000});}catch(error){console.error('Selected card bounds',await page.evaluate(id=>{const track=document.querySelector('[data-carousel]'),card=document.querySelector('[data-page-id="'+id+'"]');return {id,scrollLeft:track.scrollLeft,track:track.getBoundingClientRect().toJSON(),card:card.getBoundingClientRect().toJSON(),active:document.querySelector('[data-list-page][data-active=true]')?.dataset.listPage};},expectedId));throw error;}
}
try{
 {
  const f=await fixture();await f.open();await f.picker();assert.equal(f.posts().length,0);assert.equal(await f.choices().count(),40);await f.check(catalog[0]);await f.page.locator('[data-picker-more]').click();await f.page.waitForFunction(()=>document.querySelectorAll('[data-picker-choice]').length===45);await f.check(catalog[40]);await f.page.locator('[data-picker-more-shops]').click();await f.page.waitForFunction(()=>document.querySelectorAll('[data-picker-shop] option').length===3);await f.page.locator('[data-picker-shop]').selectOption(shopB);await f.page.waitForFunction(()=>document.querySelectorAll('[data-picker-choice]').length===4);await f.check(catalog[41]);assert.match(await f.page.locator('[data-picker-count]').innerText(),/3/);await f.page.locator('[name=pickerQuery]').fill('展示商品');await f.page.getByRole('button',{name:'搜尋商品',exact:true}).click();await f.page.waitForFunction(()=>document.querySelectorAll('[data-picker-choice]').length===1);assert.equal(await f.page.locator('[data-picker-choice]').isChecked(),true);assert.equal(await f.page.locator('[data-product-picker] script').count(),0);await f.page.locator('[data-picker-apply]').click();assert.equal(f.posts().length,0);assert.equal(await f.page.locator('[data-list-page]').count(),5);const config=await save(f);assert.deepEqual(config.pages.slice(2).map(p=>[p.shopId,p.productId]),[catalog[0],catalog[40],catalog[41]].map(p=>[p.shopId,p.productId]));assert.ok(config.pages.slice(2).every(p=>Object.keys(p).sort().join(',')==='id,kind,productId,shopId'));assert.equal(f.state.template.publishedRevision,0);await f.page.locator('[data-preview-check]').click();await status(f.page,/檢查通過/);await f.page.locator('[data-publish]').click();await status(f.page,/卡片已發布/);assert.equal(f.state.template.publishedRevision,1);assert.deepEqual(catalog.map(p=>p.version),Array(45).fill(1));await f.close();console.log('PASS 40+ catalog pagination, store/query filters, cross-filter selection and strict refs, draft/publish separation');
 }
 {
  const f=await fixture({pages:[ref(catalog[0],'featured_a'),ref(catalog[1],'featured_b')]});await f.open();await f.page.locator('[data-select-page=featured_b]').click();assert.equal(await f.page.locator('[name=title],[name=body],[name=heroImageUrl],[name=buttonLabel]').count(),0);assert.match(await f.page.locator('[data-product-info]').innerText(),/不修改原商品/);const before=f.calls.length;await f.page.locator('[data-page-id=featured_b] .ccd-card-buttons button').click();assert.equal(f.calls.length,before);assert.equal(new URL(f.page.url()).hostname,'127.0.0.1');await f.page.locator('[data-replace-product=featured_b]').click();await pickerStatus(f.page,/本次顯示/);assert.equal(await f.page.locator(`[data-picker-choice="${key(catalog[0])}"]`).isDisabled(),true);await f.check(catalog[2]);await f.page.locator('[data-picker-apply]').click();await f.page.locator('[data-move-page=featured_b][data-offset="-1"]').click();await f.picker();await f.page.locator(`[data-picker-choice="${key(catalog[0])}"]`).uncheck();await f.check(catalog[3]);await f.page.locator('[data-picker-apply]').click();const config=await save(f);assert.deepEqual(config.pages.slice(0,3).map(p=>p.id),['wallet','guide','featured_b']);assert.equal(config.pages[2].productId,catalog[2].productId);assert.equal(config.pages[3].productId,catalog[3].productId);assert.equal(config.pages.some(p=>p.id==='featured_a'),false);await f.close();console.log('PASS product fields readonly, CTA never navigates/tracks, duplicate-free replacement retains ID/position, bulk removal and ordering');
 }
 {
  const f=await fixture();await f.open();await f.picker();for(let i=0;i<10;i++)await f.check(catalog[i]);assert.equal(await f.page.locator(`[data-picker-choice="${key(catalog[10])}"]`).isDisabled(),true);assert.equal(await f.page.locator(`[data-picker-choice="${key(catalog[0])}"]`).isDisabled(),false);await f.page.locator('[data-picker-apply]').click();assert.equal(await f.page.locator('[data-list-page]').count(),12);assert.equal(await f.page.locator('[data-add-page]').isDisabled(),true);await f.picker();await f.page.locator('[data-picker-close]').first().click();assert.equal(await f.page.locator('[data-list-page]').count(),12);assert.equal(f.posts().length,0);await f.close();console.log('PASS 12-page capacity accounts for protected wallet/custom pages, checked rows remain removable, cancel makes no writes');
 }
 {
  const f=await fixture({pages:[ref(catalog[0],'featured_a')]});f.state.missing.add(key(catalog[0]));await f.open();assert.match(await f.page.locator('[data-page-id=featured_a]').innerText(),/目前不可用/);assert.equal(await f.page.locator('[data-publish]').isDisabled(),true);await f.page.locator('[data-select-page=guide]').click();await f.page.locator('[name=title]').fill('保留失效引用的草稿');const config=await save(f);assert.equal(config.pages[2].id,'featured_a');assert.equal(config.pages[2].productId,catalog[0].productId);assert.equal(await f.page.locator('[data-publish]').isDisabled(),true);f.state.missing.clear();await f.page.locator('[data-preview-check]').click();await status(f.page,/檢查通過/);assert.match(await f.page.locator('[data-page-id=featured_a]').innerText(),/光動能按摩機/);assert.equal(await f.page.locator('[data-publish]').isDisabled(),false);await f.close();console.log('PASS unavailable products stay in place/draft, block publish, recover only after authoritative preview resolution');
 }
 for(const code of ['PRODUCT_UNAVAILABLE','PRODUCT_CHANGED','REQUEST_CONFLICT']){
  const f=await fixture({pages:[ref(catalog[0],'featured_a')]});await f.open();f.state.publishError=code;await f.page.locator('[data-publish]').click();await f.page.waitForFunction(()=>!window.adminCheckinChatDashboardController.isBusy());const text=await f.page.locator('[data-status]').innerText();assert.doesNotMatch(text,/內容版本已更新/);assert.equal(await f.page.locator('[data-conflict]').isVisible(),false);assert.equal(f.state.template.draftConfig.pages[2].id,'featured_a');assert.equal(f.state.template.publishedRevision,0);if(code!=='REQUEST_CONFLICT')assert.match(text,/本機內容已保留/);await f.close();console.log('PASS '+code+' is not mislabeled as a revision conflict and cannot overwrite local refs');
 }
 {
  const f=await fixture({pages:[ref(catalog[41],'display_only')]});await f.open();const text=await f.page.locator('[data-page-id=display_only]').innerText();assert.match(text,/店面展示，未開放交易/);assert.doesNotMatch(text,/網購商品|最高折抵/);assert.equal(await f.page.locator('[data-page-id=display_only] script').count(),0);assert.equal(await f.page.evaluate(()=>window.bad),undefined);await f.close();console.log('PASS merchant-disabled product respects server display policy and HTML text is inert');
 }
 {
  const f=await fixture();await f.open();await f.picker();f.state.holdQuery='舊查詢';await f.page.locator('[name=pickerQuery]').fill('舊查詢');await f.page.getByRole('button',{name:'搜尋商品',exact:true}).click();await f.page.waitForFunction(()=>document.querySelector('[data-picker-status]').textContent.includes('讀取'));await f.page.locator('[name=pickerQuery]').fill('按摩');await f.page.getByRole('button',{name:'搜尋商品',exact:true}).click();await f.page.waitForFunction(()=>document.querySelectorAll('[data-picker-choice]').length===1);f.release();await f.page.waitForTimeout(40);assert.match(await f.page.locator('[data-picker-products]').innerText(),/光動能按摩機/);await f.page.keyboard.press('Escape');assert.equal(await f.page.locator('[data-product-picker]').count(),0);assert.equal(f.posts().length,0);await f.close();console.log('PASS stale catalog search cannot replace latest results; Escape closes without applying');
 }
 for(const identity of ['token','role']){
  const f=await fixture();await f.open();f.state.holdAll=true;await f.page.locator('.ccd-actions [data-open-picker]').click();await f.page.waitForTimeout(35);assert.equal(f.held.length,2);await f.page.evaluate(identity=>{if(identity==='token')window.testToken='changed-token';else adminRole='user';},identity);await f.page.waitForTimeout(600);f.release();await f.page.waitForTimeout(40);assert.equal(await f.page.locator('[data-product-picker]').count(),0);assert.equal(await f.page.locator('[data-save]').count(),0);assert.equal(f.posts().length,0);await f.close();console.log('PASS '+identity+' change disposes picker and drops late catalog responses');
 }
 {
  const f=await fixture();await f.open();f.state.deny=true;await f.page.locator('.ccd-actions [data-open-picker]').click();await f.page.getByText('管理權限或登入已變更，請重新登入。',{exact:true}).waitFor();assert.equal(await f.page.locator('[data-product-picker]').count(),0);assert.equal(f.posts().length,0);await f.close();console.log('PASS server403 from catalog stops activity without any writes');
 }
 for(const width of [1440,375]){
  const f=await fixture({width,pages:[ref(catalog[0],'featured_a'),ref(catalog[41],'display_only')]});await f.open();if(width===375){await selectedCardFullyVisible(f.page,'wallet');await f.page.screenshot({path:join(output,'checkin-products-wallet-375.png'),fullPage:true});}await f.picker();assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await f.page.locator('[data-product-picker]').evaluate(node=>node.scrollWidth<=node.clientWidth+1));await f.page.screenshot({path:join(output,'checkin-products-picker-'+width+'.png'),fullPage:true});await f.page.keyboard.press('Escape');if(width===375){await selectedCardFullyVisible(f.page,'wallet');await f.page.locator('[data-next]').click();await f.page.locator('[data-next]').click();}else await f.page.locator('[data-select-page=featured_a]').click();await selectedCardFullyVisible(f.page,'featured_a');await f.page.screenshot({path:join(output,'checkin-products-editor-'+width+'.png'),fullPage:true});if(width===375){await f.page.locator('.ccd-actions [data-open-picker]').click();await pickerStatus(f.page,/本次顯示/);await f.page.locator('[data-picker-apply]').click();await selectedCardFullyVisible(f.page,'featured_a');await f.page.locator('[data-mobile=properties]').click();await f.page.locator('[data-mobile=preview]').click();await selectedCardFullyVisible(f.page,'featured_a');}assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await f.close();console.log('PASS product picker/editor '+width+'px without horizontal overflow and selected card fully visible');
 }
 assert.deepEqual(errors,[]);console.log('PASS product dashboard browser regression; productionWrites=0, catalogWrites=0, LINE/wallet/check-in/clickOperations=0; screenshots '+output);
}finally{await browser.close();}
