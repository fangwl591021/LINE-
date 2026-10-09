// Real published UI, synthetic actors/API/camera. No production writes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {createHash,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.TUTORIAL_PLAYWRIGHT||'playwright');
const revision='4a4b94785df0388d3ec0121b90e9ca0c17b1da70';
const origin='https://fangwl591021.github.io/LINE-/';
const assets=new Map(),hashes={};
async function source(path){
  if(!assets.has(path))assets.set(path,(async()=>{
    const r=await fetch(new URL(path+'?tutorial='+revision,origin));assert.equal(r.status,200,path);
    const b=Buffer.from(await r.arrayBuffer());hashes[path]=createHash('sha256').update(b).digest('hex');return b;
  })());return assets.get(path);
}
const original=(await source('index.html')).toString();assert.ok(original.includes('member-hosted-events.js?v=8'));
const html=original.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(tag,attrs,body)=>attrs.includes('cdn.tailwindcss.com')||body.includes('tailwind.config =')?tag:'');
const eid='e7e4d736-bdf9-4ac7-aa50-0887178ad76a';
const event={id:eid,title:'教學示範｜創新商業交流',description:'會員自建活動核銷示範。虛構資料，不會建立正式報名或核銷。',category:'活動',status:'active',visibility:'platform',startsAt:'2026-10-09T06:00:00Z',endsAt:'2026-10-09T09:00:00Z',registrationClosesAt:'2026-10-09T06:00:00Z',location:'教學示範會議室',organizerName:'教學主辦人',feeText:'免費',capacity:20,revision:1};
let checkedInAt=null,currentTicket='',qrPng;
const network=[],errors=[];
const server=createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,'http://localhost');assert.equal(req.method,'GET');
    if(u.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
    if(u.pathname==='/fixture-qr.png'){res.setHeader('Content-Type','image/png');return res.end(qrPng);}
    const p=decodeURIComponent(u.pathname).slice(1);assert.ok(!p.includes('..'));
    res.setHeader('Content-Type',p.endsWith('.css')?'text/css':p.endsWith('.js')||p.endsWith('.mjs')?'text/javascript':p.endsWith('.svg')?'image/svg+xml':p.endsWith('.png')?'image/png':'application/octet-stream');res.end(await source(p));
  }catch(e){res.statusCode=404;res.end('Missing fixture asset');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://localhost:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.TUTORIAL_CHROME?{executablePath:process.env.TUTORIAL_CHROME}:{})});
const runs=[];
async function setup(role){
  const dir=role;mkdirSync(dir,{recursive:true});
  const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,timezoneId:'Asia/Taipei',locale:'zh-TW',recordVideo:{dir,size:{width:390,height:844}}});
  const started=Date.now(),page=await ctx.newPage(),timeline=[];
  const uid='U'+(role==='owner'?'a':'b').repeat(32);
  const registration=()=>({status:'registered',registeredAt:'2026-10-08T03:00:00Z',checkedInAt});
  const project=()=>({...event,isOwner:role==='owner',registrationCount:1,checkedInCount:checkedInAt?1:0,cancelledCount:1});
  page.on('pageerror',e=>errors.push({role,message:e.message}));
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.pathname.startsWith('/v1/member-events')){
      assert.equal(req.headers().authorization,'Bearer synthetic-'+role);const path=u.pathname.replace('/v1/member-events','');
      network.push({role,method:req.method(),path,intercepted:true});let result={success:true};
      if(req.method()==='GET'&&path==='/overview')Object.assign(result,{sessions:[project()],hosting:role==='owner'?[project()]:[],my:role==='guest'?[{...project(),registrationStatus:'registered',registeredAt:registration().registeredAt,checkedInAt}]:[]});
      else if(req.method()==='GET'&&path==='/'+eid)Object.assign(result,{event:project(),registration:role==='guest'?registration():null});
      else if(req.method()==='GET'&&path==='/'+eid+'/registrations'){
        assert.equal(role,'owner');Object.assign(result,{event:project(),registrations:[{displayName:'示範報名者',...registration()},{displayName:'示範已取消報名',status:'cancelled',registeredAt:'2026-10-07T03:00:00Z'}],nextOffset:null});
      }else if(req.method()==='POST'&&path==='/'+eid+'/ticket'){
        assert.equal(role,'guest');currentTicket=randomBytes(32).toString('base64url');Object.assign(result,{ticket:currentTicket,expiresAt:'2026-10-09T07:05:00Z'});
      }else if(req.method()==='POST'&&path==='/'+eid+'/redeem'){
        assert.equal(role,'owner');assert.equal(req.postDataJSON().ticket,currentTicket);result.duplicate=Boolean(checkedInAt);checkedInAt='2026-10-09T07:00:00Z';result.checkedInAt=checkedInAt;
      }else{errors.push({role,message:'Unexpected API '+req.method()+' '+path});return route.abort();}
      return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    }
    if(u.origin===base&&req.method()==='GET')return route.continue();
    if(['cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com'].includes(u.hostname)&&['script','stylesheet','font'].includes(req.resourceType()))return route.continue();
    return route.abort();
  });
  await page.goto(base,{waitUntil:'networkidle'});
  await page.clock.setFixedTime(new Date('2026-10-09T15:00:00+08:00'));
  await page.evaluate(({base,uid,role})=>{
    window.Config={API_URL:base};window.WORKER_URL=base;
    window.currentUserProfile={userId:uid,displayName:role==='owner'?'教學主辦人':'示範報名者',pictureUrl:base+'/assets/points-logo-transparent-20260916.png'};
    window.currentUser={name:currentUserProfile.displayName,role:'user',networkId:'synthetic-network',points:0,phone:''};window.userRole='user';window.currentViewMode='user';window.currentNetworkId='synthetic-network';window.allActivities=[];
    window.pointWalletData={status:'ready',balance:0};window.pointWalletStatus='ready';
    window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-'+role};
    window.fetchAPI=async action=>{(window.fixtureApiCalls||=[]).push(action);if(!['getPublicActivities','getMyActivities','listPersonalTasks'].includes(action))throw Error('Unexpected legacy API '+action);return [];};
    window.escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    window.escapeJS=v=>String(v??'').replace(/'/g,"\\'");window.formatDisplayTime=v=>String(v??'').replace('T',' ').slice(0,16);
    window.appConfirm=async()=>true;window.showToast=()=>{};
    document.getElementById('loading-screen')?.remove();document.getElementById('home-profile-name').textContent=currentUserProfile.displayName;
    document.querySelectorAll('[id="home-profile-points"]').forEach(el=>el.textContent='0');document.querySelectorAll('[id="home-profile-avatar"]').forEach(el=>el.src=currentUserProfile.pictureUrl);
    document.querySelectorAll('[id^="page-"]').forEach(el=>el.classList.add('hidden'));
    const badge=document.createElement('div');badge.textContent='教學示範｜虛構會員・非正式核銷';badge.style.cssText='position:fixed;left:0;right:0;bottom:0;height:22px;background:#103f37;color:white;font:11px/22px system-ui;text-align:center;z-index:2147483647;pointer-events:none';document.body.append(badge);
    const cursor=document.createElement('div');cursor.id='tutorial-pointer';cursor.style.cssText='position:fixed;left:-50px;top:-50px;width:22px;height:22px;border:3px solid #ff8b23;border-radius:50%;background:#ff8b2333;z-index:2147483647;pointer-events:none;transform:translate(-50%,-50%)';document.body.append(cursor);
    document.addEventListener('mousemove',e=>{cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';});
  },{base,uid,role});
  for(const p of ['js/navigation.js','js/modules/home.js','js/modules/activity-checkin.js','js/modules/member-hosted-events.js'])await page.addScriptTag({content:(await source(p)).toString()});
  await page.addStyleTag({content:(await source('css/member-hosted-events.css')).toString()+'\n[data-tutorial-target]{outline:3px solid #ff8b23!important;outline-offset:3px!important}'});
  await page.evaluate(async()=>{window.goPage('home',true);await window.loadUserActivities();await window.loadHomeMemberEvents({force:true});window.renderHomeActivities();});
  const run={role,dir,page,ctx,started,timeline};runs.push(run);return run;
}
async function click(run,locator){await locator.scrollIntoViewIfNeeded();await locator.evaluate(el=>el.setAttribute('data-tutorial-target',''));
  const b=await locator.boundingBox();await run.page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:12});await run.page.waitForTimeout(450);await locator.click();await locator.evaluate(el=>el.removeAttribute('data-tutorial-target')).catch(()=>{});}
async function scene(run,id,title,tip,text,action){
  const from=(Date.now()-run.started)/1000;if(action)await action();await run.page.waitForTimeout(350);
  const to=(Date.now()-run.started)/1000,shot=run.dir+'/'+id+'.png';await run.page.screenshot({path:shot});
  run.timeline.push({id,title,tip,text,shot,from:action?from:undefined,to});await run.page.waitForTimeout(950);
}
try{
  const g=await setup('guest');
  await scene(g,'intro','報名者｜接受核銷','登入原報名帳號，現場出示 QR','這支影片示範報名者如何出示報名 QR，接受本場主辦人的核銷。畫面使用虛構會員與測試資料，不會異動正式報名紀錄。');
  await scene(g,'mine','01｜首頁點「我的報名」','近期活動左側，先找自己的報名','登入平台後，向下找到近期活動。點最左邊的我的報名。不要點專屬 QR，也不要出示商城點數 QR，這裡要使用活動的報名 QR。',async()=>{await click(g,g.page.locator('#home-activity-filters').getByRole('button',{name:'我的報名',exact:true}));await g.page.locator('#home-member-registration-link').waitFor();});
  await scene(g,'member','02｜查看會員活動／課程報名','會員自建活動與官方紀錄分開','在活動報名紀錄區，點查看會員活動、課程報名。這次示範的是會員自建活動，因此要從這個入口查詢。',async()=>{await click(g,g.page.locator('#home-member-registration-link'));await g.page.locator('.me-card').first().waitFor();});
  await scene(g,'detail','03｜選本場活動，點查看活動','核對活動名稱、日期與地點','在我的報名中找到本場活動，點查看活動。先核對活動名稱、日期和地點，避免拿錯場次的報名碼。',async()=>{await click(g,g.page.locator('.me-card').first().getByRole('button',{name:'查看活動',exact:true}));await g.page.getByRole('button',{name:'出示報名 QR',exact:true}).waitFor();});
  await scene(g,'qr','04｜點「出示報名 QR」','讓主辦人掃這張報名碼','點出示報名 QR。把手機螢幕交給本場主辦人掃描，並保持 QR 完整顯示。主辦人必須使用平台內的核銷掃描器。',async()=>{await click(g,g.page.getByRole('button',{name:'出示報名 QR',exact:true}));await g.page.locator('.me-qr svg').waitFor();});
  await scene(g,'renew','05｜過期時重新產生 QR','五分鐘有效；重發後舊碼失效','報名 QR 五分鐘有效。如果等待太久或畫面顯示已到期，點重新產生 QR。重發後，舊碼會失效，請不要拿舊截圖繼續核銷。',async()=>{const old=currentTicket;await click(g,g.page.getByRole('button',{name:'重新產生 QR',exact:true}));await g.page.waitForTimeout(300);assert.notEqual(currentTicket,old);});
  qrPng=await g.page.locator('.me-qr svg').screenshot();writeFileSync('fixture-qr.png',qrPng);
  await scene(g,'present','06｜現場出示，等待核銷結果','調亮螢幕；不用自己開掃描器','出示 QR 時，保持畫面不被遮住，必要時調亮螢幕。報名者不需要自己開掃描器，等待主辦人看到核銷成功即可。');
  const o=await setup('owner');
  await scene(o,'intro','主辦人｜核銷報名者','使用本場主辦帳號登入','這支影片示範主辦人如何掃描報名者的 QR，完成核銷並查看名冊。請使用本場活動的主辦帳號登入，一般會員不能代替主辦人核銷。');
  await scene(o,'calendar','01｜首頁進入個人行事曆','核銷入口在平台內，不是 LINE 一般掃描器','登入平台後，從首頁點個人行事曆。這次示範會員自建活動的核銷，不是商城點數，也不是 LINE 內建的一般掃描器。',async()=>{await click(o,o.page.locator('#home-primary-shortcuts button').filter({hasText:'個人行事曆'}));await o.page.locator('.me-agenda-entry').waitFor();await o.page.locator('.me-agenda-entry').scrollIntoViewIfNeeded();});
  await scene(o,'hosting','02｜點「我辦的活動」','先找到自己主辦的這一場','在會員辦活動區，點我辦的活動。找到正確的活動卡片，核對本場活動名稱及日期，再進入報名名冊。',async()=>{await click(o,o.page.locator('.me-agenda-entry').getByRole('button',{name:'我辦的活動',exact:true}));await o.page.getByRole('button',{name:'報名名冊',exact:true}).waitFor();});
  await scene(o,'roster','03｜點「報名名冊」','有效報名、已核銷、未到與已取消','點報名名冊，就能看到有效報名、已核銷、未到及已取消的人數。下方保留報名姓名與時間。已結束活動也能查名冊，但不能繼續核銷。',async()=>{await click(o,o.page.getByRole('button',{name:'報名名冊',exact:true}));await o.page.getByRole('button',{name:'開啟核銷掃描器',exact:true}).waitFor();});
  await scene(o,'scanner','04｜開啟核銷掃描器','只在活動開始至結束期間可核銷','點開啟核銷掃描器。核銷必須在本場活動開始到結束之間進行。活動未開始、已結束或報名已取消，都不能核銷。',async()=>{await click(o,o.page.getByRole('button',{name:'開啟核銷掃描器',exact:true}));await o.page.getByRole('button',{name:'開始掃描',exact:true}).waitFor();});
  await o.page.evaluate(async base=>{
    const image=new Image();image.src=base+'/fixture-qr.png';await image.decode();const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;
    const c=canvas.getContext('2d');const paint=()=>{c.fillStyle='white';c.fillRect(0,0,640,640);c.drawImage(image,60,60,520,520);c.fillStyle='#103f37';c.font='22px sans-serif';c.fillText('教學測試相機',250,618);};paint();const timer=setInterval(paint,80);
    window.__cameraStops=0;navigator.mediaDevices.getUserMedia=async()=>{const stream=canvas.captureStream(12);for(const t of stream.getTracks()){const stop=t.stop.bind(t);t.stop=()=>{window.__cameraStops++;clearInterval(timer);stop();};}return stream;};
  },base);
  await scene(o,'scan','05｜開始掃描，對準報名 QR','正式使用需允許相機；本片採測試相機','點開始掃描，正式操作時請允許相機權限，並對準報名者出示的 QR。這裡使用測試相機畫面，實際按鈕和 QR 讀取流程與平台相同。',async()=>{await click(o,o.page.getByRole('button',{name:'開始掃描',exact:true}));await o.page.locator('[data-scan-status]').filter({hasText:'核銷成功'}).waitFor();});
  await scene(o,'success','06｜看到「核銷成功」才算完成','不要只以掃到 QR 作為完成依據','掃描後要看到核銷成功及核銷時間，才算完成。只看到 QR 內容或一般掃描器的結果，不代表系統已核銷。');
  await scene(o,'manual','07｜相機不可用時改貼 QR 內容','從「無法使用相機？」開啟備用欄位','若相機無法開啟，可以展開無法使用相機，貼上完整 QR 內容，再點核銷貼上的 QR。本例再次核銷同一張票證，會提示已核銷，未重複計算。',async()=>{await click(o,o.page.getByText('無法使用相機？',{exact:true}));await o.page.locator('[data-ticket-input]').fill(currentTicket);await click(o,o.page.getByRole('button',{name:'核銷貼上的 QR',exact:true}));await o.page.locator('[data-scan-status]').filter({hasText:'已核銷，未重複計算'}).waitFor();});
  await scene(o,'updated','08｜查看更新名單','已核銷＋1，未到人數同步減少','點查看更新名單。核對報名者是否標示已核銷，以及上方已核銷和未到人數。關閉或返回後，系統會停止使用相機。',async()=>{await click(o,o.page.getByRole('button',{name:'查看更新名單',exact:true}));await o.page.locator('.me-body').filter({hasText:'有效報名 1 · 已核銷 1 · 未到 0'}).waitFor();assert.equal(await o.page.evaluate(()=>__cameraStops),1);});
  await scene(o,'summary','主辦人核銷｜重點複習','本場主辦・活動期間・成功訊息・更新名冊','重點是使用本場主辦帳號，在活動期間開啟平台內核銷掃描器。看到核銷成功後，再檢查更新名冊。過期、錯場或已取消的 QR，請勿當作完成核銷。');
  await scene(g,'done','07｜返回活動，確認已核銷','已核銷後不需要重複出示 QR','主辦人完成核銷後，返回活動詳細頁，重新開啟即可查看已核銷時間。如果主辦人畫面出現錯誤，請先確認票證是否過期、拿錯場次或活動不在核銷時段。',async()=>{await click(g,g.page.getByRole('button',{name:'‹ 返回',exact:true}));await g.page.locator('.me-body').filter({hasText:'已核銷'}).waitFor();assert.equal(await g.page.getByRole('button',{name:'出示報名 QR',exact:true}).count(),0);});
  await scene(g,'summary','報名者接受核銷｜重點複習','原報名帳號・本場 QR・五分鐘有效','重點是登入原報名帳號，找到正確活動，現場開啟報名 QR。QR 五分鐘有效，過期時重新產生；由本場主辦人掃描，最後核對已核銷紀錄。');
  assert.deepEqual(errors,[]);assert.ok(checkedInAt);assert.equal(network.filter(r=>r.method==='POST'&&r.path.endsWith('/ticket')).length,2);assert.equal(network.filter(r=>r.method==='POST'&&r.path.endsWith('/redeem')).length,2);
}finally{
  for(const r of runs){const video=r.page.video();await r.ctx.close();r.video=await video.path();writeFileSync(r.dir+'/capture-evidence.json',JSON.stringify({role:r.role,video:r.video,timeline:r.timeline,sourceCommit:revision,sourceAssets:hashes,realPublishedUi:true,syntheticIdentity:true,syntheticCamera:true,productionWrites:0,network,errors},null,2));}
  await browser.close();server.close();
}
console.log(JSON.stringify({result:'PASS',roles:runs.map(r=>({role:r.role,scenes:r.timeline.length,video:r.video})),productionWrites:0,errors}));
