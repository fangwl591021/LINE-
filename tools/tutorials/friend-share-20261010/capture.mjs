// Published UI + synthetic invitation identity. No real LINE SDK, login or delivery.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.TUTORIAL_PLAYWRIGHT||'playwright');
const revision='53eaead91abe5db38d8088e533d30f55eba29316';
const live='https://fangwl591021.github.io/LINE-/',raw='https://raw.githubusercontent.com/fangwl591021/LINE-/'+revision+'/';
const assets=new Map(),hashes={},errors=[],blocked=[],timeline=[];
async function source(path){
  if(!assets.has(path))assets.set(path,(async()=>{
    const [a,b]=await Promise.all([fetch(live+path+'?share-tutorial='+revision),fetch(raw+path)]);
    assert.equal(a.status,200,path);assert.equal(b.status,200,'Git '+path);
    const bytes=Buffer.from(await a.arrayBuffer());assert.ok(bytes.equals(Buffer.from(await b.arrayBuffer())),'Live source drift '+path);
    hashes[path]=createHash('sha256').update(bytes).digest('hex');return bytes;
  })());return assets.get(path);
}
function slice(s,a,b){const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i,a);return s.slice(i,j);}
const original=(await source('index.html')).toString(),config=(await source('js/config.js')).toString(),core=(await source('js/core.js')).toString(),crm=(await source('js/modules/crm.js')).toString();
const html=original.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(tag,attrs,body)=>attrs.includes('cdn.tailwindcss.com')||body.includes('tailwind.config =')?tag:'');
const scripts={
  'fixture-invite.js':crm.slice(crm.indexOf('let storeInviteDialog = null;')),
  'fixture-config.js':slice(config,'window.buildPointLiffUrl =','// 舊版模組'),
  'fixture-toast.js':slice(core,'    window.showToast =','    // 載入動畫')
};
const server=createServer(async(req,res)=>{
  try{
    assert.equal(req.method,'GET');const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
    assert.ok(!path.includes('..'));res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.png')?'image/png':path.endsWith('.svg')?'image/svg+xml':'text/html');
    res.end(!path?html:scripts[path]||await source(path));
  }catch(e){errors.push(e.message);res.statusCode=404;res.end('Fixture asset failed');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://localhost:'+server.address().port;
mkdirSync('share',{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.TUTORIAL_CHROME?{executablePath:process.env.TUTORIAL_CHROME}:{channel:'chrome'})});
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'zh-TW',timezoneId:'Asia/Taipei',recordVideo:{dir:'share',size:{width:390,height:844}}});
const page=await ctx.newPage(),started=Date.now();page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin===base&&u.pathname==='/v1/store-shop/manage')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,shop:{id:'11111111-2222-4333-8444-555555555555',status:'active',name:'教學測試店家'}})});
  if(u.origin===base&&req.method()==='GET')return route.continue();
  if(u.hostname==='api.qrserver.com'&&req.method()==='GET')return route.continue();
  if(['cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com'].includes(u.hostname)&&['script','stylesheet','font'].includes(req.resourceType()))return route.continue();
  blocked.push({method:req.method(),host:u.hostname});return route.abort();
});
async function click(locator){
  await locator.scrollIntoViewIfNeeded();await locator.evaluate(n=>n.setAttribute('data-tutorial-target',''));
  const b=await locator.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await page.waitForTimeout(450);await locator.click();
  await page.evaluate(()=>document.querySelectorAll('[data-tutorial-target]').forEach(n=>n.removeAttribute('data-tutorial-target')));
}
async function scene(id,title,tip,text,action,diagram=false){
  const from=(Date.now()-started)/1000;if(action)await action();await page.waitForTimeout(400);
  const to=(Date.now()-started)/1000,shot='share/'+id+'.png';await page.screenshot({path:shot});
  timeline.push({id,title,tip,text,shot,from:action?from:undefined,to,diagram});await page.waitForTimeout(600);
}
try{
  await page.goto(base,{waitUntil:'networkidle'});
  await page.evaluate(base=>{
    window.currentPage='home';window.currentUserProfile={userId:'U'+'a'.repeat(32),displayName:'教學示範會員'};
    window.currentUser={name:'教學示範會員',role:'user',storeid:'test-network'};window.currentNetworkId='test-network';
    window.POINT_LIFF_ID='TUTORIAL-NOT-A-REAL-LIFF';window.LIFF_ID=POINT_LIFF_ID;window.Config={WORKER_URL:base};
    window.__shares=[];window.__copied=[];window.__pendingShare=null;
    window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-not-a-token',shareTargetPicker:messages=>{__shares.push(messages);return new Promise(resolve=>{__pendingShare=resolve;});}};
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>__copied.push(value)}});
    document.getElementById('loading-screen')?.remove();document.getElementById('app').style.display='block';
    document.getElementById('top-nav').classList.add('hidden');document.getElementById('bottom-nav').classList.add('hidden');document.getElementById('page-home').classList.remove('hidden');
    document.body.classList.add('home-page','shared-front-banner-page');document.getElementById('main').style.paddingTop='12px';
    document.querySelectorAll('[id="home-profile-name"]').forEach(el=>el.textContent='教學示範會員');
    document.querySelectorAll('[id="home-profile-avatar"]').forEach(el=>el.src=base+'/assets/points-logo-transparent-20260916.png');
    document.querySelectorAll('[id="home-profile-points"]').forEach(el=>el.textContent='500');
    window.goPage=()=>{};
    const cursor=document.createElement('div');cursor.style.cssText='position:fixed;left:-50px;top:-50px;width:22px;height:22px;border:3px solid #ff8b23;border-radius:50%;background:#ff8b2333;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%)';document.body.append(cursor);
    document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});
  },base);
  for(const path of ['fixture-toast.js','fixture-config.js','js/modules/store-invite-route.js','fixture-invite.js','js/modules/card-page-banner-shortcuts.js'])await page.addScriptTag({url:base+'/'+path});
  await page.addStyleTag({content:'[data-tutorial-target]{outline:3px solid #ff8b23!important;outline-offset:3px!important}'});
  await scene('intro','分享好友｜推薦邀請教學','專屬 QR 不是點數錢包碼','這支影片教您邀請好友加入平台。使用首頁專屬 QR，不是商城點數碼，也不是活動報名碼。本片使用虛構會員，LINE 選人畫面以流程示意呈現，不會真的傳訊。');
  await scene('qr','01｜首頁點「專屬 QR」','開啟「我的邀約連結」','先從 LINE 進入平台，用自己的帳號登入。點首頁上方專屬 QR，開啟我的邀約連結。這裡有原功能頁和店家商城兩種目的地。',async()=>{await click(page.locator('#home-profile-card [data-home-top-action="home"]'));await page.locator('#invite-qr-img').evaluate(img=>img.decode());});
  const originalUrl=await page.locator('#invite-link-input').inputValue();assert.equal(new URL(originalUrl).searchParams.get('ref'),'U'+'a'.repeat(32));
  await scene('destination','02｜一般邀請選「原功能頁」','現場也可以直接讓好友掃 QR','一般邀請朋友加入平台，保留原功能頁。邀請 QR、下方網址和分享訊息使用同一個推薦連結。若朋友在現場，可以讓他用 LINE 掃描這張邀請碼，再依平台提示登入。不要改動網址內的追蹤參數。',async()=>{await click(page.locator('#invite-destination-function'));});
  await scene('picker','03｜點「分享至 LINE」','接著勾選好友／群組，再按分享','點分享至 LINE，接著會開啟 LINE 的好友或群組選擇畫面。勾選要邀請的對象，再按分享。本段是流程示意，不是真實選人畫面；手機上的位置可能因 LINE 版本不同。',async()=>{await click(page.locator('#invite-share-button'));assert.equal(await page.evaluate(()=>__shares.length),1);},true);
  await scene('result','04｜送出後確認結果','本例回報由測試替身模擬','選人並確認送出後，再確認結果。系統收到分享成功回報時，會顯示邀約連結已發送。本片回報由測試替身模擬，並未真的送到任何聊天室。若取消選人，不應當作已發送。',async()=>{await page.evaluate(()=>__pendingShare({status:'success'}));await page.locator('#toast-container').filter({hasText:'邀約連結已發送'}).waitFor();});
  await scene('cancel','05｜取消選人，不算完成','沒選好友、沒確認，就沒有送出','如果按錯，可以在 LINE 選人畫面取消或返回。回到邀約視窗，不代表已傳送。若分享失敗，請先確認 LINE 登入及網路，或改用複製網址。',async()=>{await page.waitForTimeout(3200);await click(page.locator('#invite-share-button'));await page.evaluate(()=>__pendingShare(undefined));assert.equal(await page.locator('#toast-container').innerText(),'');});
  await scene('copy','06｜替代方式：複製網址','切回聊天室，貼上後再按傳送','按複製，看到邀約連結已複製後，切回 LINE 好友或群組聊天室，長按輸入欄貼上，再按傳送。複製只是放進剪貼簿，不會自動傳訊。本片攔截剪貼簿，不會改寫您的真實剪貼簿。',async()=>{await click(page.locator('#invite-copy-button'));assert.equal(await page.evaluate(()=>__copied[0]),originalUrl);});
  await scene('store','07｜要邀朋友逛店，改選店家商城','限已有公開店面的店主','如果您是店主，而且店面已建立並公開，可以改選店家商城。等待店面確認完成，再分享或複製。這個目的地會帶朋友進入您的公開店面；沒有公開店面時，不會產生可分享的商城邀請網址。',async()=>{await page.waitForTimeout(3200);await click(page.locator('#invite-destination-store'));await page.locator('#invite-destination-status').filter({hasText:'教學測試店家'}).waitFor();await page.locator('#invite-qr-img').evaluate(img=>img.decode());});
  await scene('summary','分享好友｜重點複習','選目的地 → 分享／掃 QR／複製','重點是先選對目的地，再讓好友掃碼、使用 LINE 選人分享，或複製後自行貼上傳送。QR 與網址都保留推薦來源；已存在的歸屬依平台規則，不會因分享而直接改寫。分享本身不保證好友已加入，也不代表任何點數已入帳。',async()=>{await click(page.locator('#invite-destination-function'));});
  assert.deepEqual(errors,[]);
  const fixtures=await page.evaluate(()=>({shares:__shares,copied:__copied}));assert.equal(fixtures.shares.length,2);assert.ok(fixtures.shares.every(s=>s[0].text.endsWith(originalUrl)));
  const video=page.video();await ctx.close();const videoPath=await video.path();
  writeFileSync('share/capture-evidence.json',JSON.stringify({sourceCommit:revision,hashes,errors,blocked,productionWrites:0,realLineMessagesSent:0,nativePickerCaptured:false,fixtures,video:videoPath,timeline},null,2));
  console.log(JSON.stringify({result:'PASS',scenes:timeline.length,productionWrites:0,realLineMessagesSent:0,video:videoPath}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
