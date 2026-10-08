/* Local-only tutorial capture. Uses real UI source, synthetic identity and intercepted APIs. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join,extname} from 'node:path';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const out='C:/Users/User/AppData/Local/Temp/activity-tutorial-20261008';
const dmPath='C:/Users/User/Downloads/1182056.jpg';
mkdirSync(out,{recursive:true});
const source=p=>readFileSync(join(root,p),'utf8');
const original=source('index.html');
const html=original.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi,(tag,attrs,body)=>attrs.includes('cdn.tailwindcss.com')||body.includes('tailwind.config =')?tag:'');
const server=createServer((req,res)=>{
  if(req.method!=='GET'){res.writeHead(405);res.end('No writes allowed');return;}
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return;}
  try{const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root+'\\')&&!path.startsWith(root+'/'))throw Error('not local');const body=readFileSync(path);res.writeHead(200,{'Content-Type':({'.css':'text/css','.js':'text/javascript','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp'}[extname(path)]||'application/octet-stream')});res.end(body);}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://localhost:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,timezoneId:'Asia/Taipei',locale:'zh-TW',recordVideo:{dir:out,size:{width:390,height:844}}});
const page=await context.newPage();
const started=Date.now(),timeline=[],network=[],errors=[];
const eventId='aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',mediaId='bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
let event=null;
const bodyHeaders={'access-control-allow-origin':'*','access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'GET, POST, OPTIONS'};
const draft={activityName:'創新商業模式實戰分享會',scheduleText:'10月8日（四）14:00 至 16:00',startTime:'2026-10-08T14:00',endTime:'2026-10-08T16:00',location:'臺北市中正區忠孝東路1段15號10樓（捷運善導寺站6號出口往回走30秒）',description:'用購物金串聯人潮、資源與商機，一起創造更多消費與業績！\n實際操作、現場體驗：購物金應用價值、多元產業適用、合作模式、案例分享與現場操作。',price:150,timeStatus:'single',confidenceNote:'教學示範資料（模擬辨識回應，非正式 AI 呼叫）。DM 未標示年分，採當年 2026；請核對日期、地點、時間、費用後再套用。',batches:[]};
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname.startsWith('/v1/member-events')){
    network.push({timeMs:Date.now()-started,method:req.method(),path:url.pathname,intercepted:true,kind:'local-mock'});
    if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:bodyHeaders,body:''});
    if(url.pathname.includes('/media/'))return route.fulfill({contentType:'image/jpeg',headers:bodyHeaders,body:readFileSync(dmPath)});
    let result={success:true};
    if(url.pathname.endsWith('/eligibility'))result.canHost=true;
    else if(url.pathname.endsWith('/dm-draft')){await new Promise(r=>setTimeout(r,1400));result.draft=draft;}
    else if(url.pathname.endsWith('/events')&&req.method()==='POST'){
      const value=req.postDataJSON();network.at(-1).visibility=value.visibility;network.at(-1).hasDm=Boolean(value.dmFile);
      event={...value,id:eventId,dmFile:undefined,coverUrl:base+`/v1/member-events/${eventId}/media/${mediaId}.jpg`,status:'active',revision:1,isOwner:true,organizerName:'教學示範店主',registrationCount:0};result.event=event;
    }else if(url.pathname.endsWith('/update')){const value=req.postDataJSON();network.at(-1).visibility=value.visibility;event={...event,...value,dmFile:undefined,revision:event.revision+1};result.event=event;}
    else if(url.pathname.endsWith('/overview'))Object.assign(result,{sessions:event?[event]:[],hosting:event?[event]:[],my:[]});
    else Object.assign(result,{event,registration:null});
    return route.fulfill({contentType:'application/json',headers:bodyHeaders,body:JSON.stringify(result)});
  }
  if(url.origin===base)return route.continue();
  if(['cdn.tailwindcss.com','fonts.googleapis.com','fonts.gstatic.com','cdnjs.cloudflare.com'].includes(url.hostname)&&['script','stylesheet','font'].includes(req.resourceType()))return route.continue();
  network.push({timeMs:Date.now()-started,method:req.method(),url:url.origin+url.pathname,intercepted:true,kind:'external-blocked'});return route.abort();
});
await page.goto(base,{waitUntil:'networkidle'});
await page.clock.setFixedTime(new Date('2026-10-08T09:00:00+08:00'));
await page.evaluate(base=>{
  window.Config={API_URL:base};window.WORKER_URL=base;
  window.currentUserProfile={userId:'synthetic-tutorial-owner',displayName:'教學示範店主',pictureUrl:base+'/assets/points-logo-transparent-20260916.png'};
  window.currentUser={name:'教學示範店主',role:'store',networkId:'synthetic-tutorial-owner',points:0,phone:'',industry:'教學示範'};
  window.userRole='store';window.currentViewMode='user';window.currentNetworkId='synthetic-tutorial-owner';window.allActivities=[];
  window.pointWalletData={status:'ready',balance:0};window.pointWalletStatus='ready';
  window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-tutorial-token'};
  window.fetchAPI=async action=>{(window.fixtureApiCalls||=[]).push(action);return [];};
  window.escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.escapeJS=v=>String(v??'').replace(/'/g,"\\'");window.formatDisplayTime=v=>String(v??'').replace('T',' ').slice(0,16);
  window.appConfirm=async()=>true;window.showToast=()=>{};
  document.getElementById('loading-screen')?.remove();
  document.getElementById('home-profile-name').textContent='教學示範店主';
  document.querySelectorAll('[id="home-profile-points"]').forEach(el=>el.textContent='0');
  document.querySelectorAll('[id="home-profile-avatar"]').forEach(el=>el.src=base+'/assets/points-logo-transparent-20260916.png');
  document.querySelectorAll('[id^="page-"]').forEach(el=>el.classList.add('hidden'));
  const badge=document.createElement('div');badge.textContent='教學示範｜模擬會員・活動資料';badge.style.cssText='position:fixed;left:0;right:0;bottom:0;height:22px;background:#123e37;color:white;font:11px/22px system-ui,sans-serif;text-align:center;z-index:2147483647;pointer-events:none';document.body.append(badge);
},base);
for(const p of ['js/navigation.js','js/modules/home.js','js/modules/member-event-dm.js','js/modules/activity-visibility.js','js/modules/member-hosted-events.js'])await page.addScriptTag({content:source(p)});
for(const p of ['css/activity-visibility.css','css/member-hosted-events.css'])await page.addStyleTag({content:source(p)});
await page.evaluate(async()=>{window.goPage('home',true);await window.loadUserActivities();window.renderHomeActivities();});
await page.waitForTimeout(1500);
async function hold(label,seconds=2.5,shot=''){
  timeline.push({label,startMs:Date.now()-started,holdSeconds:seconds,screenshot:shot?join(out,shot+'.png'):null});
  if(shot)await page.screenshot({path:join(out,shot+'.png')});await page.waitForTimeout(seconds*1000);
}
async function point(locator){await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();if(box)await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:14});}
try{
  await hold('首頁入口：個人行事曆',3,'01-home-entry');
  const calendar=page.locator('#home-primary-shortcuts button').filter({hasText:'個人行事曆'});await point(calendar);await calendar.click();
  await page.locator('#personal-agenda-panel').waitFor();await hold('跟進行事曆：新增行程',3,'02-calendar');
  const add=page.getByRole('button',{name:'新增',exact:true});await point(add);await add.click();
  await page.locator('#agenda-host-activity').check();await page.locator('[data-dm-file]').first().waitFor({state:'visible'});
  await hold('新增行程，勾選辦活動',3,'03-host-mode');
  await page.locator('#personal-agenda-form [data-dm-file]').setInputFiles(dmPath);
  await page.locator('#personal-agenda-form [data-dm-read]').scrollIntoViewIfNeeded();
  await hold('選 DM 圖片：1182056.jpg；尚未發布',3,'04-dm-selected');
  await page.locator('#personal-agenda-form [data-dm-read]').click();await page.locator('#personal-agenda-form [data-dm-result]').waitFor({state:'visible'});
  await page.locator('#personal-agenda-form [data-dm-result]').scrollIntoViewIfNeeded();
  await hold('模擬 AI 回應：核對名稱、2026 年、時段、地點及費用',4,'05-draft-check');
  await page.locator('#personal-agenda-form [data-dm-warning]').scrollIntoViewIfNeeded();await hold('未標示年分以當年 2026 為準；仍需人工核對',3);
  await page.locator('#personal-agenda-form [data-dm-apply]').click();
  await page.locator('#agenda-start').scrollIntoViewIfNeeded();await hold('帶入草稿：行事曆日期確實更新為 2026/10/08 14:00–16:00',4,'06-date-updated');
  const save=page.getByRole('button',{name:'儲存行程',exact:true});await point(save);await save.click();await page.locator('.me-form').waitFor();
  await page.locator('.me-form [name=title]').scrollIntoViewIfNeeded();await hold('確認活動草稿，可修改名稱、分類、日期、地點及活動內容',4,'07-review-fields');
  await page.locator('.me-media-review').scrollIntoViewIfNeeded();await hold('確認 DM 將同時用於外層縮圖與明細全圖',3);
  const publish=page.getByRole('button',{name:'確認發布活動',exact:true});await point(publish);await publish.click();await page.locator('.activity-visibility-dialog').waitFor();
  await hold('公開選擇 POP：是＝全平台會員；否＝歸屬會員；取消＝不送出',5,'08-visibility-popup');
  await page.locator('.av-cancel').click();await hold('示範取消：返回草稿，沒有建立活動',2.5);
  await publish.click();await page.locator('[data-scope=network]').click();await page.getByRole('button',{name:'編輯活動',exact:true}).waitFor();
  await page.locator('.me-dialog .me-body').evaluate(el=>el.scrollTop=0);await hold('示範否：發布後標示僅歸屬會員可見',3);
  await page.getByRole('button',{name:'編輯活動',exact:true}).click();await page.getByRole('button',{name:'確認儲存修改',exact:true}).click();await page.locator('.activity-visibility-dialog').waitFor();
  await hold('修改時也可選公開範圍',2.5);await page.locator('[data-scope=platform]').click();await page.getByRole('button',{name:'編輯活動',exact:true}).waitFor();
  await hold('示範是：更新後全平台登入會員可見',2.5);
  await page.locator('.me-dialog [data-close]').click();await page.evaluate(async()=>{window.goPage('home',true);await window.loadUserActivities();await window.loadHomeMemberEvents({force:true});window.renderHomeActivities();});
  await page.locator('[data-home-member-event]').first().scrollIntoViewIfNeeded();await page.locator('.me-thumbnail-image').waitFor({state:'visible'});
  await hold('首頁近期活動：已出現外層縮圖、詳細、分享與報名入口',4,'09-home-thumbnail');
  await page.locator('[data-home-member-event]').getByRole('button',{name:'詳細',exact:true}).click();await page.locator('.me-cover-button').waitFor();
  await page.locator('.me-cover-button').click();await page.locator('.me-full-dm').waitFor({state:'visible'});await hold('明細點 DM：完整原圖；可返回活動明細',5,'10-full-dm');
}finally{
  const video=page.video();await context.close();const videoPath=await video.path();await browser.close();server.close();
  writeFileSync(join(out,'capture-evidence.json'),JSON.stringify({root,output:out,video:videoPath,dmPath,syntheticIdentity:true,actualUiSources:['index.html','js/navigation.js','js/modules/home.js','js/modules/member-event-dm.js','js/modules/member-hosted-events.js','js/modules/activity-visibility.js'],fixedDate:'2026-10-08T09:00:00+08:00',productionWrites:0,aiCalls:0,network,timeline,errors},null,2));
  console.log(JSON.stringify({video:videoPath,timeline:join(out,'capture-evidence.json'),screenshots:timeline.filter(s=>s.screenshot).map(s=>s.screenshot),errors},null,2));
}
