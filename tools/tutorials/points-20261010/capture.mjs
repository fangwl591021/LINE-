// Operation footage from the published UI. All identities, camera and API writes are isolated fixtures.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.TUTORIAL_PLAYWRIGHT||'playwright');
const revision='04b670bff685336439b7cf38d848c1c776f358c9';
const live='https://fangwl591021.github.io/LINE-/';
const raw='https://raw.githubusercontent.com/fangwl591021/LINE-/'+revision+'/';
const assets=new Map(),hashes={},network=[],errors=[],runs=[];
async function source(path){
  if(!assets.has(path))assets.set(path,(async()=>{
    const [a,b]=await Promise.all([fetch(live+path+'?points-tutorial='+revision),fetch(raw+path)]);
    assert.equal(a.status,200,path);assert.equal(b.status,200,'Git blob '+path);
    const bytes=Buffer.from(await a.arrayBuffer()),blob=Buffer.from(await b.arrayBuffer());
    assert.ok(bytes.equals(blob),'Live source drift: '+path);hashes[path]=createHash('sha256').update(bytes).digest('hex');return bytes;
  })());return assets.get(path);
}
const original=(await source('index.html')).toString(),auth=(await source('js/auth.js')).toString(),core=(await source('js/core.js')).toString();
function slice(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i,a);return s.slice(i,j);}
const html=original.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(tag,attrs,body)=>attrs.includes('cdn.tailwindcss.com')||body.includes('tailwind.config =')?tag:'');
const member='U'+'b'.repeat(32),store='U'+'a'.repeat(32),phone='0900000001';
const state=()=>({balance:500,writes:[],requests:new Map(),lostResponse:false});
const lessons={gift:state(),redeem:state()};
const fixtureAuth=slice(auth,'let storePointRewardScan = null;','window.claimDailyPointCheckin =');
const fixtureCore=slice(core,'    window.escapeHTML =','    // 載入動畫');
const server=createServer(async(req,res)=>{
  try{
    assert.equal(req.method,'GET');const u=new URL(req.url,'http://localhost');
    res.setHeader('Content-Type',u.pathname.endsWith('.css')?'text/css':u.pathname.endsWith('.js')||u.pathname.endsWith('.mjs')?'text/javascript':u.pathname.endsWith('.svg')?'image/svg+xml':u.pathname.endsWith('.png')?'image/png':'text/html');
    if(u.pathname==='/')return res.end(html);
    if(u.pathname==='/fixture-auth.js')return res.end(fixtureAuth);
    if(u.pathname==='/fixture-core.js')return res.end(fixtureCore);
    const p=decodeURIComponent(u.pathname).slice(1);assert.ok(!p.includes('..'));res.end(await source(p));
  }catch(e){errors.push({message:e.message});res.statusCode=404;res.end('Fixture asset failed');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://localhost:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.TUTORIAL_CHROME?{executablePath:process.env.TUTORIAL_CHROME}:{channel:'chrome'})});
async function setup(role){
  mkdirSync(role,{recursive:true});const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'zh-TW',timezoneId:'Asia/Taipei',recordVideo:{dir:role,size:{width:390,height:844}}});
  const started=Date.now(),page=await ctx.newPage(),run={role,ctx,page,started,timeline:[]};runs.push(run);
  page.on('pageerror',e=>errors.push({role,message:e.message}));
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin===base&&u.pathname==='/fixture-api'){
      assert.equal(req.method(),'POST');const {action,payload:p}=req.postDataJSON(),s=lessons[role];
      const actor=p.lineAccessToken==='synthetic-'+role+'-store'?'store':p.lineAccessToken==='synthetic-'+role+'-member'?'member':'';
      assert.ok(actor,'Isolated identity');network.push({lesson:role,actor,action,intercepted:true});let result;
      const id=actor==='member'?member:store;
      if(action==='queryPointBalanceFast')result={success:true,data:{balance:actor==='member'?s.balance:1000,source:'mother',queriedLineUserId:id,requestedLineUserId:id}};
      else if(action==='queryUserPoints')result={success:true,data:{queriedLineUserId:id,requestedLineUserId:id,list:actor==='member'?s.writes.slice().reverse().map(w=>({event_name:w.mode==='reward'?'店家贈送點數':'店家消費折抵',get_point:w.points,event_content:w.mode==='reward'?'教學測試店家贈送點數':'消費 NT$100｜折抵30點｜應收NT$70',child_shop_name:'教學測試店家',created_at:w.createdAt})):[]}};
      else if(action==='getStorePointCustomer'){
        assert.equal(actor,'store');assert.ok([phone,member].includes(p.customerUserId));
        result={success:true,data:{customerPointUserId:member,name:'教學示範會員',phone,balance:s.balance,canAdjust:true,balanceSource:'mother',cashierSessionId:'synthetic-session',avatarUrl:base+'/assets/points-logo-transparent-20260916.png'}};
      }else if(action==='prepareStorePointCashierSession')result={success:true,data:{cashierSessionId:'synthetic-session',expiresAt:Date.now()+180000}};
      else if(action==='storeAdjustCustomerPoints'){
        assert.equal(actor,'store');assert.equal(p.customerUserId,member);assert.ok(p.requestId);
        if(s.requests.has(p.requestId))result=s.requests.get(p.requestId);
        else{
          const direct=p.mode==='reward'&&p.rewardPoints!==undefined;
          const changed=p.mode==='reward'?(direct?p.rewardPoints:p.amount):p.deductPoints;
          assert.ok(Number.isSafeInteger(changed)&&changed>0);assert.ok(p.mode==='reward'||changed<=s.balance&&changed<=p.amount);
          const points=p.mode==='reward'?changed:-changed;s.balance+=points;
          const row={mode:p.mode,amount:direct?0:p.amount,points,payableAmount:p.mode==='redeem'?p.amount-changed:0,customerName:'教學示範會員',createdAt:'2026-10-10T10:00:00+08:00',requestId:p.requestId};s.writes.push(row);
          result={success:true,transactionStatus:'succeeded',data:{...row,changedPoints:changed,customerPointSource:'mother'}};s.requests.set(p.requestId,result);
          if(s.lostResponse){s.lostResponse=false;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:'教學測試：回應遺失，請先查詢原交易結果'})});}
        }
      }else if(action==='getStoreCashierRequest')result=s.requests.get(p.requestId)||{success:false,transactionStatus:'not_found'};
      else if(action==='listStorePointCashierLogs')result={success:true,data:{list:s.writes.slice().reverse()}};
      else throw Error('Unexpected isolated action '+action);
      return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    }
    if(u.origin===base&&u.pathname==='/v1/store-shop'&&req.method()==='GET')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,shops:[],next:null})});
    if(u.origin===base&&req.method()==='GET')return route.continue();
    if(['cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)&&['script','stylesheet','font'].includes(req.resourceType()))return route.continue();
    // Never allow a real business service, token or point transaction to leave the fixture.
    return route.abort();
  });return run;
}
async function actor(run,which,home=false){
  const {page,role}=run;await page.goto(base+'/?lesson='+role+'&actor='+which,{waitUntil:'networkidle'});
  await page.evaluate(({base,role,which,member,store})=>{
    window.Config={WORKER_URL:base+'/fixture-api',API_URL:base};window.currentPage='home';window.userRole=which==='store'?'store':'user';
    window.currentUserProfile={userId:which==='store'?store:member,displayName:which==='store'?'教學測試店主':'教學示範會員',pictureUrl:base+'/assets/points-logo-transparent-20260916.png'};
    window.currentUser={name:currentUserProfile.displayName,role:userRole};window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-'+role+'-'+which};
    window.resolvePointUserIdForCurrentProfile=id=>id;window.pointWalletStatus='idle';window.pointWalletData=null;
    window.fetchAPI=async(action,payload={})=>{const response=await fetch(Config.WORKER_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{...payload,lineAccessToken:liff.getAccessToken()}})});return response.json();};
    window.refreshPointBalanceBadge=async()=>{};window.formatDisplayTime=value=>String(value||'').replace('T',' ').slice(0,16);
    window.goPage=p=>{window.currentPage=p;document.querySelectorAll('[id^="page-"]').forEach(n=>n.classList.add('hidden'));document.getElementById('page-'+p)?.classList.remove('hidden');document.body.classList.toggle('store-shop-page',p==='store-shop');document.body.classList.toggle('home-page',p==='home');window.scrollTo(0,0);};
    document.getElementById('loading-screen')?.remove();document.getElementById('top-nav').classList.add('hidden');document.getElementById('bottom-nav').classList.add('hidden');
    document.querySelectorAll('[id="home-profile-name"]').forEach(n=>n.textContent=currentUserProfile.displayName);
    document.querySelectorAll('[id="home-profile-avatar"]').forEach(n=>n.src=currentUserProfile.pictureUrl);
    document.querySelectorAll('[id="home-profile-points"]').forEach(n=>n.textContent=which==='store'?'1,000':'500');
    const cursor=document.createElement('div');cursor.id='tutorial-pointer';cursor.style.cssText='position:fixed;left:-50px;top:-50px;width:22px;height:22px;border:3px solid #ff8b23;border-radius:50%;background:#ff8b2333;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%)';document.body.append(cursor);
    document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});window.goPage('home');
  },{base,role,which,member,store});
  for(const p of ['fixture-core.js','fixture-auth.js','js/modules/safe-cashier.js','js/vendor/jsQR.js','js/modules/store-shop-entry.js'])await page.addScriptTag({url:base+'/'+p});
  await page.addStyleTag({content:'[data-tutorial-target]{outline:3px solid #ff8b23!important;outline-offset:3px!important}'});
  if(!home){await page.evaluate(()=>window.openStoreShop());await page.locator('[data-home-qr] svg').waitFor();}
}
async function click(run,locator){
  await locator.scrollIntoViewIfNeeded();await locator.evaluate(n=>n.setAttribute('data-tutorial-target',''));
  const b=await locator.boundingBox();await run.page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await run.page.waitForTimeout(450);await locator.click();
  await run.page.evaluate(()=>document.querySelectorAll('[data-tutorial-target]').forEach(n=>n.removeAttribute('data-tutorial-target')));
}
async function scene(run,id,title,tip,text,action){
  const from=(Date.now()-run.started)/1000;if(action)await action();await run.page.waitForTimeout(350);
  const to=(Date.now()-run.started)/1000,shot=run.role+'/'+id+'.png';await run.page.screenshot({path:shot});
  run.timeline.push({id,title,tip,text,shot,from:action?from:undefined,to});await run.page.waitForTimeout(800);
}
let qrImage;
async function camera(run){await run.page.evaluate(image=>{
  window.__cameraStops=0;navigator.mediaDevices.getUserMedia=async()=>{
    const img=new Image();img.src=image;await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=640;
    const start=Date.now(),ctx=canvas.getContext('2d');const paint=()=>{ctx.fillStyle='white';ctx.fillRect(0,0,640,640);if(Date.now()-start>2000)ctx.drawImage(img,60,60,520,520);ctx.fillStyle='#103f37';ctx.font='22px sans-serif';ctx.fillText('教學測試相機',235,617);};paint();const timer=setInterval(paint,80),stream=canvas.captureStream(12);
    for(const track of stream.getTracks()){const stop=track.stop.bind(track);track.stop=()=>{window.__cameraStops++;clearInterval(timer);stop();};}return stream;
  };
},qrImage);}
try{
  const g=await setup('gift');await actor(g,'store',true);
  await scene(g,'intro','店家贈點｜操作教學','測試店主與會員；不異動正式點數','這支影片示範店家如何透過會員手機，贈送一百點。請用已開通贈點權限的帳號登入。畫面使用測試會員和隔離點數，不會異動正式帳本。',async()=>{await g.page.getByRole('button',{name:'開啟店家商城',exact:true}).scrollIntoViewIfNeeded();});
  await scene(g,'entry','01｜首頁進入「店家商城」','店主使用商家版工作台','登入後，從首頁進入店家商城。店主會看到商家版工作台，以及贈送點數和折抵點數兩個入口。若看不到贈點入口，請先確認帳號權限。',async()=>{await click(g,g.page.getByRole('button',{name:'開啟店家商城',exact:true}));await g.page.locator('[data-do="point-reward"]').waitFor();});
  await scene(g,'gift','02｜點「贈送點數」','開啟入口不會直接贈點','點贈送點數，再選擇確認會員的方式。這次採用電話贈點。若要掃碼辨識，也可以選掃描會員錢包 QR；掃碼方式會進入消費贈點畫面。',async()=>{await click(g,g.page.locator('[data-do="point-reward"]'));await g.page.locator('[data-method="phone"]').waitFor();});
  await scene(g,'phone','03｜選「輸入行動電話查找」','電話贈點只填點數，不填消費金額','選輸入行動電話查找。電話贈點只需要填會員手機及贈送點數，不需要填消費金額。電話必須能對應到已綁定的有效會員。',async()=>{await click(g,g.page.locator('[data-method="phone"]'));await g.page.locator('#store-phone-reward-phone').waitFor();});
  await scene(g,'search','04｜搜尋會員，核對姓名與手機','本片手機號碼為虛構測試資料','輸入會員完整手機號碼，按搜尋會員。找到後，先核對姓名與手機，避免送錯人。查不到時，請會員登入平台確認手機，或改用會員錢包 QR。',async()=>{await g.page.locator('#store-phone-reward-phone').fill(phone);await click(g,g.page.locator('[data-search]'));await g.page.locator('[data-member-name]').filter({hasText:'教學示範會員'}).waitFor();assert.equal(lessons.gift.writes.length,0);});
  await scene(g,'points','05｜填寫贈送點數','範例：100 點；送出前再次核對','在贈送點數欄填一百。這裡輸入的是要送給會員的點數，不是消費金額。再次核對會員與點數，確認無誤後才送出。',async()=>{await g.page.locator('#store-phone-reward-points').fill('100');});
  await scene(g,'send','06｜按「確認贈點」','看到成功訊息才算完成','按確認贈點後，等待結果，不要連續重按。本例顯示已成功贈送一百點，才代表系統回報完成。若結果不明，先查詢原交易結果，不要重建另一筆贈點。',async()=>{await click(g,g.page.locator('[data-send]'));await g.page.locator('[data-phone-status]').filter({hasText:'已成功贈送 100 點'}).waitFor();assert.equal(lessons.gift.balance,600);assert.equal(lessons.gift.writes.length,1);});
  await scene(g,'member','07｜會員端查看「點數紀錄」','會員查看自己的入帳明細','贈點完成後，會員可在自己帳號的點數通頁面，點底部點數紀錄。這是會員本人紀錄，不是店主自己的點數。核對贈點來源和一百點明細。',async()=>{await actor(g,'member');await click(g,g.page.locator('.shop-bottom-nav [data-do="spending-history"]'));await g.page.locator('.store-history-popup [data-list]').filter({hasText:'店家贈送點數'}).waitFor();});
  await scene(g,'summary','贈點｜重點複習','查會員 → 核對 → 填點數 → 確認 → 查明細','重點是先找到正確會員，再填贈送點數，確認後等待成功訊息。手機查不到不能直接送點。交易結果不明時，先查原交易，避免重複贈點。');
  const r=await setup('redeem');await actor(r,'member',true);
  await scene(r,'intro','點數折抵｜會員與店家操作','示範 100 元消費，折抵 30 點','這支影片示範會員出示點數 QR，以及店家掃碼折抵。範例消費一百元，折抵三十點，剩餘應收七十元。本片不是活動報到，也不是網路訂單收款。',async()=>{await r.page.getByRole('button',{name:'開啟店家商城',exact:true}).scrollIntoViewIfNeeded();});
  await scene(r,'member-entry','01｜會員進入「店家商城」','使用自己的原會員帳號登入','會員先登入自己的帳號，再進入店家商城。這裡使用共用點數錢包碼，不是名片專屬 QR，也不是活動報名 QR。',async()=>{await click(r,r.page.getByRole('button',{name:'開啟店家商城',exact:true}));await r.page.locator('.shop-bottom-nav [data-do="wallet"]').waitFor();});
  await scene(r,'qr','02｜會員點底部「點數 QR」','出示「我的共用點數」，讓店家掃描','點底部點數 QR，開啟我的共用點數。保持整張 QR 清楚顯示，讓店家掃描。會員不需要開自己的掃描器，也不要把錢包 QR 隨意轉傳。',async()=>{await click(r,r.page.locator('.shop-bottom-nav [data-do="wallet"]'));await r.page.locator('.store-wallet-popup [data-qr] svg').waitFor();});
  qrImage=await r.page.locator('.store-wallet-popup [data-qr] svg').evaluate(async svg=>{const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg.outerHTML);await img.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=640;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,640,640);c.drawImage(img,0,0,640,640);if(window.jsQR(c.getImageData(0,0,640,640).data,640,640)?.data!==svg.parentElement.dataset.uid)throw Error('Wallet QR decode mismatch');return canvas.toDataURL('image/png');});
  await scene(r,'merchant','03｜店家點「折抵點數」','改由有扣點權限的店家帳號操作','接著改由店家操作。店家使用有扣點權限的帳號登入，進入商家版，點折抵點數。一般會員和只有贈點權限的帳號，不能替店家執行扣點。',async()=>{await actor(r,'store');await click(r,r.page.locator('[data-do="point-redeem"]'));await r.page.locator('[data-method="scan"]').waitFor();});
  await camera(r);
  await scene(r,'scan','04｜選「掃描會員錢包 QR」','正式操作需允許相機；本片為測試相機','選掃描會員錢包 QR，允許相機，對準會員出示的錢包碼。本片使用測試相機，實際經過 QR 解碼。掃到會員只是辨識身分，這時還沒有扣點。',async()=>{await click(r,r.page.locator('[data-method="scan"]'));await r.page.locator('#store-point-customer-name').filter({hasText:'教學示範會員'}).waitFor();assert.equal(lessons.redeem.writes.length,0);assert.equal(await r.page.evaluate(()=>__cameraStops),1);});
  await scene(r,'amount','05｜核對會員，填消費金額','教學示範會員｜目前可用 500 點','先核對會員姓名與目前可用點數，再填消費金額一百元。請保持折抵扣點模式；不要切到消費贈點。顯示的餘額供核對，送出時仍由系統重新驗證。',async()=>{await r.page.locator('#store-point-customer-card').scrollIntoViewIfNeeded();await r.page.locator('#store-point-amount').fill('100');});
  await scene(r,'deduct','06｜填「本次折抵點數」','30 點折抵；預估應收 NT$70','本次折抵點數填三十。核對預覽：折抵三十點，預估應收七十元。折抵點數不能超過可用餘額或本次消費金額；不確定時先不要送出。',async()=>{await r.page.locator('#store-point-deduct').fill('30');await r.page.locator('#store-point-preview').scrollIntoViewIfNeeded();await r.page.locator('#store-point-preview').filter({hasText:'預估應收 NT$70'}).waitFor();});
  await scene(r,'send','07｜按「確認送出」','等待「已完成折抵」；不重複送出','確認會員、金額與點數無誤後，按確認送出。看到已完成折抵三十點，應收七十元，母站已入帳，才算系統回報完成。應收金額不代表平台已收款，店家仍需實際收取剩餘款項。',async()=>{await click(r,r.page.locator('#btn-store-point-submit'));await r.page.locator('#toast-container').filter({hasText:'已完成折抵：30 點'}).waitFor();assert.equal(lessons.redeem.writes.length,1);assert.equal(lessons.redeem.balance,470);});
  await scene(r,'logs','08｜店家查看「最近收銀紀錄」','消費 100 元｜應收 70 元｜扣除 30 點','在最近收銀紀錄確認這筆會員交易。核對消費一百元、應收七十元，以及扣除三十點。本例只有一筆扣點，店家操作費不另扣點。',async()=>{await r.page.locator('#store-point-cashier-log-list').scrollIntoViewIfNeeded();await r.page.locator('#store-point-cashier-log-list').filter({hasText:'消費折抵'}).waitFor();});
  await scene(r,'history','09｜會員查看自己的「點數紀錄」','確認扣點來源與 -30 點明細','會員可以回自己的點數通頁面，點底部點數紀錄，核對折抵來源與扣除三十點的明細。遇到未能確認交易的訊息時，請店家查詢原交易，不要重新掃碼建立另一筆。',async()=>{await actor(r,'member');await click(r,r.page.locator('.shop-bottom-nav [data-do="spending-history"]'));await r.page.locator('.store-history-popup [data-list]').filter({hasText:'店家消費折抵'}).waitFor();});
  await scene(r,'summary','折抵｜重點複習','會員出示 → 店家掃碼 → 核對 → 確認 → 查明細','重點是會員出示自己的錢包 QR，店家使用平台內掃描入口。掃碼不會直接扣點。填好金額與折抵點數，確認送出並看到成功結果後，再核對明細及收取應收款項。');
  assert.deepEqual(errors,[]);assert.equal(lessons.gift.writes.length,1);assert.equal(lessons.redeem.writes.length,1);
  for(const run of runs)assert.ok(await run.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
}catch(e){for(const run of runs)await run.page.screenshot({path:run.role+'/failure.png'}).catch(()=>{});throw e;}
finally{
  for(const run of runs){const video=run.page.video();await run.ctx.close();run.video=await video.path();writeFileSync(run.role+'/capture-evidence.json',JSON.stringify({role:run.role,video:run.video,timeline:run.timeline,sourceCommit:revision,sourceAssets:hashes,realPublishedUi:true,syntheticIdentity:true,syntheticCamera:true,productionWrites:0,syntheticWrites:lessons[run.role].writes,network,errors},null,2));}
  await browser.close();server.close();
}
console.log(JSON.stringify({result:'PASS',roles:runs.map(r=>({role:r.role,scenes:r.timeline.length,video:r.video})),productionWrites:0,errors}));
