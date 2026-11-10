// Isolated browser acceptance: real mall routing/renderers/CSS; all network is intercepted.
// No production identity, AI, messages, order writes or point transactions are permitted.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const ROOT=resolve(new URL('../..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
const OUT=resolve(ROOT,'../shop-reference-browser');mkdirSync(OUT,{recursive:true});
const ORIGIN='https://shop-reference.invalid';
const OWNER='U'+'a'.repeat(32),OTHER='U'+'b'.repeat(32);
const id=n=>`${String(n).padStart(8,'0')}-1111-4111-8111-111111111111`;
const shops=[
  {id:id(1),name:'Bravo 生活選物',category:'購',address:'新北市板橋區合成路1號'},
  {id:id(2),name:'Alpha 咖啡與合成長名稱版面測試',category:'食',address:'新北市板橋區合成路2號'},
  {id:id(3),name:'Delta 合成旅宿',category:'宿',address:'宜蘭縣礁溪鄉合成路3號'},
  {id:id(4),name:'Charlie 專業服務',category:'服務',address:'臺北市合成路4號'},
  {id:id(5),name:'Echo 休閒旅行',category:'遊',address:'臺中市合成路5號'},
  {id:id(6),name:'Foxtrot 交通服務',category:'行',address:'高雄市合成路6號'}
].map(s=>({...s,description:'僅供隔離瀏覽器驗證的合成店家資料。實際服務及折抵依各店設定，無固定比例。',image_url:ORIGIN+'/assets/storefront/lifestyle-cafe-v1.jpg',status:'active',version:1,merchant_enabled:1,has_active_products:1}));
const ownShop={...shops[0],name:'合成測試本人店家',version:3};
const product={id:id(50),shop_id:ownShop.id,title:'合成商品',description:'隔離測試商品',image_url:ownShop.image_url,category:'購',price_cents:10000,shipping_fee_cents:0,status:'active',version:1,purchase_mode:'in_store',redeem_type:'percent',redeem_value:10};
const files=new Set([
  'js/navigation.js','js/modules/store-shop.js','js/modules/store-shop-entry.js',
  'js/modules/store-points-home.js','js/modules/store-explore-view.js','js/modules/store-cooperation-plans.mjs',
  'js/modules/store-wallet-popup.js','js/vendor/qrcode-generator-2.0.4.mjs','js/modules/reward-units.js',
  'js/modules/store-shop-sales.js','css/store-shop.css','css/store-explore-view.css',
  'css/store-merchant-workbench.css','css/store-reference-shell.css',
  'assets/points-logo-transparent-20260916.png','assets/home-discover-shops-20261110.webp',
  'assets/storefront/lifestyle-cafe-v1.jpg'
]);
const stubs={
  'js/modules/store-point-operation.js':`export function openStorePointOperationPopup(o){window.__fixtureCalls.push({action:'point-operation',mode:o.mode||'choose'});}`,
  'js/modules/store-history-popup.js':`export function openStoreHistoryPopup(){window.__fixtureCalls.push({action:'spending-history'});}`,
  'js/modules/store-commerce.js':`export async function mountCommerce(root,o){window.__fixtureCalls.push({action:'commerce',mode:o.mode});root.innerHTML='<p data-test-commerce>隔離測試：'+o.mode+'</p>';}`,
  'js/modules/store-consumption-journal.js':`export function openStoreConsumptionJournal(){window.__fixtureCalls.push({action:'consumption-journal'});}`
};
function plan(role){return role==='admin'?{id:'admin',label:'平台管理員',productLimit:null,canManage:true,canOnline:true}:role==='reward'?{id:'reward',label:'贈點單位',productLimit:0,canManage:false,canOnline:false}:role==='redeem'?{id:'redeem',label:'折抵店家',productLimit:1,canManage:true,canOnline:true}:role==='store'?{id:'full',label:'雙向完整版',productLimit:20,canManage:true,canOnline:true}:{id:'member',label:'一般會員',productLimit:0,canManage:false,canOnline:false};}
const shellStyle=/<style id="store-shop-shell-layout">([\s\S]*?)<\/style>/.exec(readFileSync(join(ROOT,'index.html'),'utf8'))?.[0]||'';

export async function createFixture(browser,{role='user',width=390,section='',balance=9970,wallet='success',directory='success',walletHold=false,directoryHold=false,profileHold=false,stats='success'}={}){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage();
  const state={role,balance,wallet,directory,walletHold,directoryHold,profileHold,stats,requests:[],apiCalls:[],blocked:[],errors:[],writes:[],releaseWallet:null,releaseDirectory:null,releaseProfile:null};
  page.on('pageerror',error=>state.errors.push(error.message));
  page.on('dialog',dialog=>{state.errors.push('Unexpected native dialog: '+dialog.message());return dialog.dismiss();});
  await page.exposeFunction('__fixtureApi',async(action,data)=>{
    state.apiCalls.push({action,data});
    if(action!=='queryPointBalanceFast')throw Error('Unexpected action '+action);
    if(state.walletHold)await new Promise(resolve=>{state.releaseWallet=()=>{state.walletHold=false;resolve();};});
    if(state.wallet==='failure')return {success:false,error:'合成錢包讀取失敗'};
    return {success:true,data:{balance:state.balance,source:'mother',queriedLineUserId:state.wallet==='wrong-owner'?OTHER:OWNER,requestedLineUserId:data.pointUserId||OWNER}};
  });
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url()),pathname=url.pathname.slice(1);
    if(url.origin!==ORIGIN){state.blocked.push(request.url());return route.abort();}
    if(url.pathname==='/'){
      return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商城參考版型・隔離驗證</title>${shellStyle}<style>body{margin:0;font:16px Arial;background:#f5faf8}.hidden{display:none!important}#top-nav{position:fixed;top:0;left:0;height:96px;width:100%;background:#fee}#main{padding:112px 16px 128px}#bottom-nav,#bottom-nav-admin{position:fixed;bottom:0;left:0;right:0;height:64px;background:#fee}</style><link id="store-shop-css" rel="stylesheet" href="/css/store-shop.css"><body><header id="top-nav">原系統標頭</header><main id="main"><section id="page-home" class="hidden">原系統首頁</section><section id="page-customers" class="hidden">本人的客戶聯絡人</section><section id="page-store-shop"></section></main><nav id="bottom-nav">原系統底部</nav><nav id="bottom-nav-admin" class="hidden">原管理員底部</nav><script>
      window.currentPage='store-shop';window.previousPage='home';window.currentViewMode='user';window.__fixtureCalls=[];window.userRole=${JSON.stringify(role)};window.currentUserProfile={userId:'${OWNER}',displayName:'合成測試使用者'};window.currentUser={userId:'${OWNER}',role:${JSON.stringify(role)},name:'合成測試使用者'};window.Config={WORKER_URL:location.origin};window.WORKER_URL=location.origin;window.fixtureToken='synthetic-'+${JSON.stringify(role)};window.liff={isLoggedIn:()=>!!fixtureToken,getAccessToken:()=>fixtureToken,getProfile:async()=>({userId:currentUserProfile.userId})};window.fetchAPI=(action,data)=>window.__fixtureApi(action,data);window.resolvePointUserIdForCurrentProfile=owner=>owner;window.requestIdleCallback=()=>0;window.openTutorialCenter=id=>__fixtureCalls.push({action:'tutorial',id});window.initCustomersPage=()=>__fixtureCalls.push({action:'customers'});window.loadUserActivities=()=>__fixtureCalls.push({action:'home'});window.showToast=()=>{};window.canUseStorePointCashier=()=>['store','reward','redeem','admin'].includes(userRole);window.isRewardOnlyPointCashier=()=>userRole==='reward';window.isRedeemOnlyPointCashier=()=>userRole==='redeem';</script><script src="/js/navigation.js"></script><script>goPage('store-shop',true);</script><script src="/js/modules/store-shop.js"></script><script>StoreShop.mount(document.getElementById('page-store-shop'),false,'','','',${JSON.stringify(section)});</script></body></html>`});
    }
    if(Object.hasOwn(stubs,pathname))return route.fulfill({contentType:'text/javascript',body:stubs[pathname]});
    if(files.has(pathname)){
      const file=join(ROOT,pathname);if(!existsSync(file)){state.blocked.push('Missing local asset '+pathname);return route.abort();}
      const type=pathname.endsWith('.css')?'text/css':/\.m?js$/.test(pathname)?'text/javascript':pathname.endsWith('.png')?'image/png':pathname.endsWith('.webp')?'image/webp':'image/jpeg';
      return route.fulfill({contentType:type,body:readFileSync(file)});
    }
    state.requests.push({path:url.pathname,query:Object.fromEntries(url.searchParams),method:request.method()});
    if(request.method()!=='GET'){state.writes.push({path:url.pathname,method:request.method()});return route.abort();}
    let data;
    if(url.pathname==='/v1/store-shop'){
      if(state.directoryHold)await new Promise(resolve=>{state.releaseDirectory=()=>{state.directoryHold=false;resolve();};});
      if(state.directory==='failure')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'合成目錄讀取失敗'})});
      if(url.searchParams.has('shop'))data={success:true,shop:shops.find(s=>s.id===url.searchParams.get('shop'))||ownShop,products:[product],product_next:''};
      else{
        const q=url.searchParams.get('q')||'',category=url.searchParams.get('category')||'';
        let visible=shops.filter(s=>(!q||[s.name,s.address,s.description].some(v=>v.includes(q)))&&(!category||s.category===category));
        if(url.searchParams.get('discovery')==='newest')visible=shops.slice(0,3);
        data={success:true,shops:visible,next:''};
      }
    }else if(url.pathname==='/v1/store-shop/manage'){
      if(state.profileHold)await new Promise(resolve=>{state.releaseProfile=()=>{state.profileHold=false;resolve();};});
      const p=plan(state.role);data={success:true,shop:ownShop,products:[product],product_count:state.role==='redeem'?1:6,product_limit:p.productLimit,product_next:'',cooperation_plan:p};
    }else if(url.pathname==='/v1/store-shop/sales'){
      if(state.stats==='failure')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'合成業績讀取失敗'})});
      data={success:true,start:url.searchParams.get('start'),end:url.searchParams.get('end'),page:0,hasNext:false,summary:{count:3,amount:3000,points:1275,payable:1725},records:[]};
    }else if(url.pathname==='/v1/reward-units')data={success:true,units:[],next:''};
    else if(url.pathname==='/v1/store-commerce/settings')data={success:true,release_enabled:false,cooperation_plan:plan(state.role),settings:{enabled:false,version:0}};
    else{state.blocked.push(request.url());return route.abort();}
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(ORIGIN+'/',{waitUntil:'domcontentloaded'});
  return {context,page,state,close:()=>context.close()};
}

async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function waitRelease(state,key){for(let i=0;i<1000&&!state[key];i++)await new Promise(r=>setTimeout(r,10));assert.equal(typeof state[key],'function','fixture reached '+key);}
async function assertClean(f){assert.deepEqual(f.state.errors,[],'no page errors');assert.deepEqual(f.state.blocked,[],'unknown or external requests blocked');assert.deepEqual(f.state.writes,[],'zero API writes');}
async function assertLayout(page,{directory=false}={}){
  await settle(page);
  const result=await page.evaluate(({directory})=>{
    const root=document.querySelector('#page-store-shop'),style=n=>getComputedStyle(n),visible=n=>n.getBoundingClientRect().width>0&&n.getBoundingClientRect().height>0&&style(n).visibility!=='hidden';
    const controls=[...root.querySelectorAll('button')].filter(visible).map(n=>({action:n.dataset.do||n.textContent.trim(),w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height}));
    const grid=root.querySelector('.shop-explore-grid'),cards=grid?[...grid.children].filter(visible):[];
    const top=document.querySelector('#top-nav'),oldBottom=document.querySelector('#bottom-nav');
    const stats=[...root.querySelectorAll('.mw-stat')].filter(visible).map(n=>{const value=n.querySelector('strong'),cell=n.getBoundingClientRect(),text=value.getBoundingClientRect();return {value:value.textContent,cellLeft:cell.left,cellRight:cell.right,textLeft:text.left,textRight:text.right};});
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,sharedHeaderHidden:style(top).display==='none',sharedBottomHidden:style(oldBottom).display==='none',controls,stats,columns:cards.length>1?Math.abs(cards[0].getBoundingClientRect().top-cards[1].getBoundingClientRect().top)<2:null,images:directory?[...root.querySelectorAll('.shop-explore-photo img')].map(n=>style(n).objectFit):[]};
  },{directory});
  assert.equal(result.overflow,false,'no horizontal overflow');assert.equal(result.sharedHeaderHidden,true,'shared header hidden in mall');assert.equal(result.sharedBottomHidden,true,'shared bottom does not cover reference layout');
  const small=result.controls.filter(n=>n.h<43.5||n.w<43.5);assert.deepEqual(small,[],'visible buttons keep 44px touch targets');
  if(directory){assert.equal(result.columns,true,'shop cards use two columns');assert.ok(result.images.every(fit=>fit==='contain'),'shop images preserve complete content');}
  else assert.deepEqual(result.stats.filter(s=>s.textLeft<s.cellLeft-.5||s.textRight>s.cellRight+.5),[],'merchant values and units remain inside their own stat cells');
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await settle(page);
  const overlap=await page.evaluate(()=>{
    const nav=document.querySelector('.shop-bottom-nav'),last=document.querySelector('.shop-explore-footnote,.mw-plan-details');
    if(!nav||!last||getComputedStyle(nav).position!=='fixed')return false;
    return last.getBoundingClientRect().bottom>nav.getBoundingClientRect().top+1;
  });assert.equal(overlap,false,'last content remains above fixed mall navigation');
  await page.evaluate(()=>scrollTo(0,0));return result;
}
const rootAction=(page,action)=>page.locator('.shop-content [data-do="'+action+'"]').first();

async function run(){
  const browser=await playwright.chromium.launch({headless:true,channel:'chrome'}),results=[],layoutIssues=[];
  try{
    for(const width of [320,390,1280]){
      const f=await createFixture(browser,{width,role:'user',balance:9970});
      try{
        await f.page.locator('.shop-explore-view').waitFor();await f.page.locator('.shop-explore-card').first().waitFor();await f.page.locator('[data-explore-balance]').filter({hasText:'9,970'}).waitFor();
        await f.page.screenshot({path:join(OUT,`explore-${width}.png`),fullPage:true});try{await assertLayout(f.page,{directory:true});}catch(error){layoutIssues.push({view:'explore',width,message:error.message,actual:error.actual});}
        assert.equal(await f.page.getByText('依店家設定',{exact:true}).count(),shops.length,'no invented redemption percentages');
        await assertClean(f);results.push({view:'explore',width,overflow:false,twoColumns:true});
      }finally{await f.close();}
      const m=await createFixture(browser,{width,role:'store'});
      try{
        await m.page.locator('.merchant-workbench').waitFor();await m.page.locator('[data-merchant-name]').filter({hasText:ownShop.name}).waitFor();await m.page.locator('[data-merchant-stat="monthlyRedemptionPoints"]').filter({hasText:'1,275'}).waitFor();
        assert.match(await m.page.locator('[data-merchant-plan-label]').innerText(),/雙向完整版/);assert.equal(await m.page.locator('[data-merchant-expiry]').innerText(),'依合作方案');
        assert.equal(await m.page.locator('[data-merchant-stat="productCount"]').innerText(),'6');assert.match(await m.page.locator('[data-merchant-stat="monthlyRedemptionCount"]').innerText(),/^3/);
        await m.page.screenshot({path:join(OUT,`merchant-${width}.png`),fullPage:true});try{await assertLayout(m.page);}catch(error){layoutIssues.push({view:'merchant',width,message:error.message,actual:error.actual});}
        await assertClean(m);results.push({view:'merchant',width,overflow:false,realFixtureStats:true});
      }finally{await m.close();}
    }
    // Existing roles continue to determine available actions; the reference image grants no powers.
    for(const role of ['reward','redeem','admin']){
      const f=await createFixture(browser,{role});try{
        await f.page.locator('.merchant-workbench').waitFor();
        assert.equal(await rootAction(f.page,'point-reward').count(),role==='redeem'?0:1);
        assert.equal(await rootAction(f.page,'point-redeem').count(),role==='reward'?0:1);
        assert.equal(await rootAction(f.page,'online-manage').count(),role==='reward'?0:1);
        assert.equal(await rootAction(f.page,'manage').count(),role==='reward'?0:1);
        const operation=role==='redeem'?'point-redeem':'point-reward';await rootAction(f.page,operation).click();
        await f.page.waitForFunction(()=>__fixtureCalls.some(x=>x.action==='point-operation'));
        assert.deepEqual(await f.page.evaluate(()=>__fixtureCalls.filter(x=>x.action==='point-operation').at(-1)),{action:'point-operation',mode:role==='redeem'?'redeem':'reward'});
        await assertClean(f);results.push({role,permissions:true});
      }finally{await f.close();}
    }
    for(const [wallet,balance,expected]of [['success',0,'0 點'],['failure',0,'暫時無法讀取']]){
      const f=await createFixture(browser,{wallet,balance});try{
        await f.page.locator('[data-explore-balance]').filter({hasText:expected}).waitFor();assert.equal(await f.page.locator('[data-explore-balance]').innerText(),expected);
        if(wallet==='failure')assert.equal(await f.page.locator('[data-explore-balance]').innerText()==='0 點',false);
        await assertClean(f);results.push({wallet,zeroIsAuthoritative:wallet==='success'});
      }finally{await f.close();}
    }
    const directoryFailure=await createFixture(browser,{directory:'failure'});try{
      await directoryFailure.page.locator('[data-explore-balance]').filter({hasText:'9,970'}).waitFor();await directoryFailure.page.locator('.shop-explore-empty').filter({hasText:'店家暫時無法載入'}).waitFor();
      await rootAction(directoryFailure.page,'wallet').click();await directoryFailure.page.locator('.store-wallet-popup [data-balance]').filter({hasText:'9,970'}).waitFor();await assertClean(directoryFailure);results.push({failedDirectoryDoesNotBlockWallet:true});
    }finally{await directoryFailure.close();}
    const f=await createFixture(browser,{role:'user'});try{
      await f.page.locator('.shop-explore-view').waitFor();
      await f.page.locator('form[data-form="search"] input[name="q"]').fill('板橋');await f.page.locator('form[data-form="search"]').evaluate(form=>form.requestSubmit());
      await f.page.waitForFunction(()=>document.querySelectorAll('.shop-explore-card').length===2);
      await f.page.locator('[data-do="search-category"][data-category="購"]').click();await f.page.waitForFunction(()=>document.querySelectorAll('.shop-explore-card').length===1);
      assert.ok(f.state.requests.some(r=>r.query.q==='板橋'&&r.query.category==='購'),'category retains real query');
      await f.page.locator('form[data-form="search"] input[name="q"]').fill('');await f.page.locator('form[data-form="search"]').evaluate(form=>form.requestSubmit());
      await f.page.locator('.shop-explore-more > summary').click();await f.page.locator('[data-do="search-category"][data-category=""]').click();await f.page.waitForFunction(()=>document.querySelectorAll('.shop-explore-card').length===6);
      await f.page.locator('[data-do="explore-filter"][data-filter="newest"]').click();await f.page.waitForFunction(()=>document.querySelector('[data-filter="newest"]')?.getAttribute('aria-pressed')==='true');
      assert.ok(f.state.requests.some(r=>r.query.discovery==='newest'),'newest uses actual published-order endpoint');
      await f.page.locator('[data-do="explore-filter"][data-filter="all"]').click();await f.page.locator('.shop-explore-card').first().waitFor();
      await f.page.locator('[data-explore-sort]').selectOption('name');
      const names=await f.page.locator('.shop-explore-card-name').allTextContents();assert.deepEqual(names,names.slice().sort((a,b)=>a.localeCompare(b,'zh-TW')),'sort is explicitly this page');
      await f.page.locator('[data-do="explore-favorite"]').first().click();await f.page.locator('[data-do="explore-filter"][data-filter="favorites"]').click();
      await f.page.locator('.shop-explore-filter-note').waitFor();assert.equal(await f.page.locator('.shop-explore-card').count(),1);assert.match(await f.page.locator('.shop-explore-filter-note').innerText(),/目前裝置|本機/);
      await f.page.reload();await f.page.locator('.shop-explore-card').first().waitFor();await f.page.locator('[data-do="explore-filter"][data-filter="favorites"]').click();await f.page.waitForFunction(()=>document.querySelectorAll('.shop-explore-card').length===1&&document.querySelector('[data-filter="favorites"]')?.getAttribute('aria-pressed')==='true');assert.equal(await f.page.locator('.shop-explore-card').count(),1,'local favorites survive reload');
      await rootAction(f.page,'wallet').click();await f.page.locator('.store-wallet-popup').waitFor();await f.page.locator('.store-wallet-popup [data-balance]').filter({hasText:'9,970'}).waitFor();await f.page.getByRole('button',{name:'關閉點數視窗',exact:true}).click();
      await rootAction(f.page,'spending-history').click();await f.page.waitForFunction(()=>__fixtureCalls.some(x=>x.action==='spending-history'));assert.ok(await f.page.evaluate(()=>__fixtureCalls.some(x=>x.action==='spending-history')));
      await rootAction(f.page,'online-orders').click();await f.page.locator('[data-test-commerce]').waitFor();assert.ok(await f.page.evaluate(()=>__fixtureCalls.some(x=>x.action==='commerce'&&x.mode==='orders')));
      await f.page.locator('#page-store-shop [data-do="exit"]:visible').first().click();assert.equal(await f.page.locator('#top-nav').isVisible(),true,'exit action restores original header');assert.ok(await f.page.evaluate(()=>__fixtureCalls.some(x=>x.action==='home')));
      await assertClean(f);results.push({directoryQueries:true,newest:true,localFavorites:true,pageSort:true,consumerActions:true});
    }finally{await f.close();}
    const delayed=await createFixture(browser,{role:'user',walletHold:true,balance:7654321});try{
      await delayed.page.locator('.shop-explore-view').waitFor();await waitRelease(delayed.state,'releaseWallet');
      await delayed.page.evaluate(other=>{window.currentUserProfile={userId:other};window.fixtureToken='new-synthetic-token';},OTHER);delayed.state.releaseWallet();await settle(delayed.page);
      assert.doesNotMatch(await delayed.page.locator('body').innerText(),/7,654,321/,'late old-owner balance never appears');await assertClean(delayed);results.push({lateWalletOwnerIsolated:true});
    }finally{await delayed.close();}
    const stale=await createFixture(browser,{role:'store',section:'list',directoryHold:true});try{
      await waitRelease(stale.state,'releaseDirectory');await stale.page.locator('[data-explore-balance]').filter({hasText:'9,970'}).waitFor();await stale.page.locator('.points-view-switch[data-do="merchant-home"]').click();await stale.page.locator('.merchant-workbench').waitFor();
      stale.state.releaseDirectory();await settle(stale.page);assert.equal(await stale.page.locator('.merchant-workbench').count(),1,'late directory cannot overwrite merchant view');assert.equal(await stale.page.locator('.shop-explore-view').count(),0);await assertClean(stale);results.push({lateDirectoryIsolated:true});
    }finally{await stale.close();}
    const profile=await createFixture(browser,{role:'store',profileHold:true});try{
      await profile.page.locator('.merchant-workbench').waitFor();await waitRelease(profile.state,'releaseProfile');await profile.page.locator('.points-view-switch[data-do="points-view"]').click();await profile.page.locator('.shop-explore-view').waitFor();
      profile.state.releaseProfile();await settle(profile.page);assert.equal(await profile.page.locator('.shop-explore-view').count(),1,'late private shop response cannot replace public directory');await assertClean(profile);results.push({lateMerchantProfileIsolated:true});
    }finally{await profile.close();}
    const failedStats=await createFixture(browser,{role:'store',stats:'failure'});try{
      await failedStats.page.locator('[data-merchant-name]').filter({hasText:ownShop.name}).waitFor();await failedStats.page.locator('[data-merchant-stat="monthlyRedemptionPoints"]').filter({hasText:'尚無資料'}).waitFor();
      assert.doesNotMatch(await failedStats.page.locator('[data-merchant-stat="monthlyRedemptionPoints"]').innerText(),/^0/);await assertClean(failedStats);results.push({failedStatsNotZero:true});
    }finally{await failedStats.close();}
    const merchant=await createFixture(browser,{role:'store'});try{
      await merchant.page.locator('.merchant-workbench').waitFor();
      await rootAction(merchant.page,'point-reward').click();await rootAction(merchant.page,'point-redeem').click();
      await rootAction(merchant.page,'merchant-tutorial').click();assert.ok(await merchant.page.evaluate(()=>__fixtureCalls.some(x=>x.action==='tutorial'&&x.id==='merchant')));
      await rootAction(merchant.page,'sales').click();await merchant.page.locator('.shop-sales-summary').waitFor();assert.ok(merchant.state.requests.some(r=>r.path==='/v1/store-shop/sales'));
      await merchant.page.locator('.shop-content [data-do="manage"]').first().click();await merchant.page.locator('form[data-form="store"]').waitFor();assert.equal(await merchant.page.locator('form[data-form="store"] input[name="name"]').inputValue(),ownShop.name);
      await rootAction(merchant.page,'online-manage').click();await merchant.page.locator('[data-test-commerce]').waitFor();assert.ok(await merchant.page.evaluate(()=>__fixtureCalls.some(x=>x.action==='commerce'&&x.mode==='merchant')));
      await merchant.page.locator('.shop-bottom-nav [data-do="points-home"]').click();await merchant.page.locator('.merchant-workbench').waitFor();
      await rootAction(merchant.page,'merchant-members').click();await merchant.page.getByText('本人的客戶聯絡人',{exact:true}).waitFor();assert.ok(await merchant.page.evaluate(()=>__fixtureCalls.some(x=>x.action==='customers')),'customer hook keeps private contacts');
      assert.equal(await merchant.page.locator('#top-nav').isVisible(),true,'shared header restored after mall exit');await assertClean(merchant);results.push({merchantActions:true,tutorial:true,privateCustomers:true,exitShellRestored:true});
    }finally{await merchant.close();}
    assert.deepEqual(layoutIssues,[],'all reference layouts and touch targets pass');
    console.log(JSON.stringify({passed:true,results,screenshots:OUT,productionRequests:0,apiWrites:0}));
  }finally{await browser.close();}
}
if(process.argv.includes('--fixture-only'))console.log('Fixture ready; integration run pending: '+OUT);
else await run();
