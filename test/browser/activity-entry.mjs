// Real index/auth/core/navigation/activity rendering. Synthetic LIFF/API only; no production writes.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const tailwind=await (await fetch('https://cdn.tailwindcss.com',{signal:AbortSignal.timeout(20000)})).text();
const html=read('index.html').replace('</head>','<style>.material-symbols-outlined{font-size:0!important;display:inline-block;width:24px;min-width:24px;height:24px}</style></head>');
const scripts=new Set(['js/config.js','js/login-bootstrap.js','js/core.js','js/navigation.js','js/modules/activities.js','js/modules/admin.js','js/modules/home.js','js/modules/activity-registration.js','js/modules/activity-entry.js','js/auth.js']);
const actor='U'+'a'.repeat(32),ref='U'+'b'.repeat(32),id='ACT_fcfc401d-d559-4d0e-bbf4-73ff21973e09';
const query=`?a=${id}&r=${ref}&n=admin&v=a`;
const activity={activityId:id,networkId:'admin',status:'上架',activityName:'秋日交流活動',activityType:'交流',startTime:'2026-10-01T10:00',price:100,imageUrl:'https://fixture.invalid/dm.svg',description:'測試活動內容 <img src=x onerror=alert(1)>'};
const registrations=[
  {rowId:'latest',activityId:id,activityName:'最新報名',createdAt:'2026-09-28T03:00:00Z',startTime:'2026-10-01T03:00:00Z',status:'active'},
  {rowId:'middle',activityId:'B',activityName:'先前報名',createdAt:'2026-09-27T03:00:00Z',startTime:'2026-12-01T03:00:00Z',status:'checkedin'},
  {rowId:'oldest',activityId:'C',activityName:'最早報名',createdAt:'2026-09-26T03:00:00Z',startTime:'2026-11-01T03:00:00Z',status:'cancelled'}
];
const browser=await playwright.chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const out=join(tmpdir(),'activity-direct-entry-20260928');mkdirSync(out,{recursive:true});
const calls=[],errors=[],blocked=[];
const documents=[];
let holdMember=true,releaseMember,failActivity=false,holdActivity=false,releaseActivity;
let friendScenario=false;
let registrationMember=null,registrationFailure=false,registrationTimeout=false,joinFailure=false;
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(({actor})=>{
  window.__pages=[];
  localStorage.setItem('ACTMASTER_USER_'+actor,JSON.stringify({savedAt:Date.now(),info:{userId:actor,role:'admin'}}));
}, {actor});
await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:tailwind});
  if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{if(${friendScenario})history.replaceState(null,'',location.pathname);},isLoggedIn:()=>true,isInClient:()=>true,getProfile:async()=>({userId:'${actor}',displayName:'合成會員'}),getAccessToken:()=>'synthetic-token',getFriendship:async()=>{window.__friendReads=(window.__friendReads||0)+1;return {friendFlag:!${friendScenario}||sessionStorage.getItem('fixture-friend')==='1'};}};`});
  if(req.method()==='POST'&&url.hostname==='line-engine.fangwl591021.workers.dev') {
    const {action,payload}=req.postDataJSON();calls.push({action,payload});
    assert.equal(payload.lineAccessToken,'synthetic-token');assert.equal(payload.userId,actor);
    let data;
    if(action==='checkUser') {
      if(holdMember){holdMember=false;await new Promise(resolve=>{releaseMember=resolve;});}
      data=friendScenario?(registrationMember?{isRegistered:true,info:registrationMember}:{isRegistered:false,info:null}):{isRegistered:true,info:{userId:actor,name:'合成會員',role:'user',networkId:'other-network'}};
    } else if(action==='getActivityById') {
      assert.equal(payload.activityId,id);assert.equal(payload.networkId,'admin');
      if(holdActivity){holdActivity=false;await new Promise(resolve=>{releaseActivity=resolve;});}
      if(failActivity)return route.fulfill({contentType:'application/json',body:JSON.stringify({success:false,error:'合成網路失敗'})});
      data=activity;
    } else if(action==='registerUser') {
      assert.equal(payload.activityRegistration,true);assert.equal(payload.privacyAgreed,true);
      assert.equal(payload.activityId,id);assert.equal(payload.activityNetworkId,'admin');assert.equal(payload.referrerId,ref);
      if(registrationFailure)return route.fulfill({contentType:'application/json',body:JSON.stringify({success:false,error:'合成註冊失敗'})});
      registrationMember={userId:actor,name:payload.name,phone:payload.phone,networkId:payload.networkId,referrerId:payload.referrerId,role:'user'};
      if(registrationTimeout)return route.fulfill({contentType:'application/json',body:JSON.stringify({success:false,error:'合成回應逾時，請重試'})});
      data={isRegistered:true,info:registrationMember};
    } else if(action==='joinActivity') {
      assert.equal(payload.userName,registrationMember.name);assert.equal(payload.userPhone,registrationMember.phone);
      if(joinFailure)return route.fulfill({contentType:'application/json',body:JSON.stringify({success:false,error:'合成報名失敗'})});
      data={rowId:'latest',activityId:id,existed:false};
    } else if(action==='getMyActivities')data=registrations;
    else if(action==='listPersonalTasks')data=[];
    else {blocked.push(action);return route.abort();}
    return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  }
  if(url.href===activity.imageUrl)return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#eef7f2"/><rect width="600" height="80" fill="#007b62"/><text x="200" y="52" fill="white" font-size="40">DM TOP</text><text x="150" y="460" fill="#007b62" font-size="52">FULL POSTER</text><rect y="820" width="600" height="80" fill="#007b62"/><text x="140" y="875" fill="white" font-size="40">DM BOTTOM</text></svg>'});
  if(req.resourceType()==='image')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  if(url.hostname==='localhost') {
    if(url.pathname==='/'){documents.push(url.href);return route.fulfill({contentType:'text/html',body:html});}
    const path=url.pathname.slice(1);
    let body=scripts.has(path)?read(path):'';
    if(path==='js/navigation.js')body+='\nconst originalGoPage=window.goPage;window.goPage=function(...args){window.__pages.push(args[0]);return originalGoPage(...args);};';
    return route.fulfill({contentType:path.endsWith('.css')?'text/css':'text/javascript',body});
  }
  if(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com|code\.jquery\.com/.test(url.hostname))return route.fulfill({body:''});
  blocked.push(url.href);return route.abort();
});
try {
  await page.goto('http://localhost/'+query,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#activity-entry-status')?.textContent.includes('確認登入'));
  await page.locator('#loading-screen').waitFor({state:'hidden'});
  assert.equal(await page.locator('#page-home').isVisible(),false);
  assert.deepEqual(calls.map(x=>x.action),['checkUser']);
  assert.ok(releaseMember);releaseMember();
  await page.getByRole('button',{name:'我要報名',exact:true}).waitFor({timeout:7000});
  assert.deepEqual(calls.map(x=>x.action),['checkUser','getActivityById']);
  assert.equal(await page.evaluate(()=>currentUser.role),'user','confirmed session instead of admin cache');
  assert.equal(await page.evaluate(()=>currentNetworkId),'other-network');
  assert.equal(await page.evaluate(()=>__pages.includes('home')),false);
  assert.equal(await page.locator('#my-act-detail-content img').count(),1,'only DM image, description is escaped');
  assert.equal(await page.locator('#header-site-name').textContent(),'AI商脈');
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const dm=await page.getByAltText('活動 DM').boundingBox();assert.ok(Math.abs(dm.height/dm.width-1.5)<0.01,'full portrait DM ratio');
    await page.getByRole('button',{name:'我要報名',exact:true}).click({trial:true});
    await page.locator('#page-my-act-detail > div > button').click({trial:true});
    await page.screenshot({path:join(out,`activity-${width}.png`),fullPage:true});
  }
  failActivity=true;
  await page.goto('http://localhost/?liff.state='+encodeURIComponent(query),{waitUntil:'domcontentloaded'});
  await page.locator('#activity-entry-retry').waitFor({state:'visible'});
  assert.match(await page.locator('#activity-entry-status').textContent(),/無法讀取/);
  assert.equal(await page.getByRole('button',{name:'我要報名',exact:true}).count(),0);
  failActivity=false;await page.locator('#activity-entry-retry').click();
  await page.getByRole('button',{name:'我要報名',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>__pages.includes('home')),false);
  holdActivity=true;
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#activity-entry-status')?.textContent==='正在讀取活動內容…');
  // Use init navigation here to avoid unrelated home APIs; tests above use real auth/nav/rendering.
  await page.evaluate(()=>goPage('home',true));
  assert.ok(releaseActivity);releaseActivity();
  await page.waitForTimeout(150);
  assert.equal(await page.evaluate(()=>currentPage),'home');
  assert.equal(await page.locator('#page-my-act-detail').isVisible(),false);
  // Registration list keeps the API's newest-first order, and rendered controls target that row.
  await page.evaluate(()=>goPage('my-activities'));
  await page.waitForFunction(()=>document.querySelector('#my-activities-list')?.textContent.includes('最新報名'));
  await page.getByRole('button',{name:'活動報名紀錄'}).click();
  const list=page.locator('#my-activities-list');
  assert.deepEqual(await list.locator('.truncate').allTextContents(),registrations.map(r=>r.activityName));
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:844});
    await page.screenshot({path:join(out,`history-${width}.png`),fullPage:true});
  }
  await list.getByText('最新報名',{exact:true}).click();
  assert.equal(await page.locator('#my-act-detail-content h3').textContent(),'最新報名');
  await page.getByRole('button',{name:/出示核銷 QR/}).click();
  const verify=new URL(new URL(await page.locator('#qr-code-img').getAttribute('src')).searchParams.get('text'));
  assert.equal(verify.searchParams.get('verifyCheckin'),'latest');assert.equal(verify.searchParams.get('activityId'),id);
  await page.evaluate(()=>document.getElementById('qr-modal').classList.add('hidden'));
  // Cancel is declined, so this browser fixture cannot mutate any registration.
  await page.evaluate(()=>{window.__cancelPrompt='';window.appConfirm=async message=>{window.__cancelPrompt=message;return false;};});
  await page.getByRole('button',{name:'取消報名',exact:true}).click();
  assert.match(await page.evaluate(()=>__cancelPrompt),/最新報名/);
  // New/unregistered friend: real gate + Continue navigation with LIFF cleaning query parameters.
  friendScenario=true;
  for(const entry of [query+'&point_friend=1','?code=synthetic-code&liff.state='+encodeURIComponent(query)]) {
    await page.evaluate(()=>sessionStorage.removeItem('fixture-friend'));
    const before=calls.length;
    await page.goto('http://localhost/'+entry,{waitUntil:'domcontentloaded'});
    await page.locator('#point-friendship-modal').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>__pages.includes('home')),false);
    assert.equal(calls.length,before,'not a friend: no member or activity API, even with marker');
    await page.getByRole('button',{name:'已加入，繼續進入',exact:true}).click();
    await page.getByText('尚未確認加入，請先加入官方帳號後再按一次。',{exact:true}).waitFor();
    assert.equal(calls.length,before);
    await page.evaluate(()=>sessionStorage.setItem('fixture-friend','1'));
    await page.getByRole('button',{name:'已加入，繼續進入',exact:true}).click();
    await page.getByRole('button',{name:'我要報名',exact:true}).waitFor({timeout:7000});
    assert.deepEqual(calls.slice(before).map(c=>c.action),['checkUser','getActivityById']);
    assert.equal(await page.locator('#my-act-detail-content h3').textContent(),activity.activityName);
    assert.equal(await page.evaluate(()=>currentUser.isRegistered),false);
    assert.equal(await page.evaluate(()=>__pages.includes('home')),false);
    assert.ok(await page.evaluate(()=>__friendReads>=1),'returned page rechecks real friendship');
    const returned=new URL(documents.at(-1));
    assert.equal(returned.origin,'http://localhost');assert.equal(returned.searchParams.get('activityId'),id);
    assert.equal(returned.searchParams.get('net'),'admin');assert.equal(returned.searchParams.get('ref'),ref);
    assert.equal(returned.searchParams.get('via'),'a');assert.equal(returned.searchParams.get('point_friend'),'1');
    assert.deepEqual([...returned.searchParams.keys()].sort(),['activityId','net','point_friend','ref','via']);
  }
  assert.ok(calls.every(x=>['checkUser','getActivityById','getMyActivities','listPersonalTasks'].includes(x.action)),'opening pages never writes');
  const signup=page.getByRole('button',{name:'我要報名',exact:true});
  await signup.click();await page.locator('#activity-registration-modal').waitFor({state:'visible'});
  assert.equal(await page.locator('#activity-reg-name').inputValue(),'合成會員');
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:660});
    await page.getByRole('button',{name:'註冊並報名',exact:true}).click({trial:true});
    await page.getByRole('button',{name:'關閉報名資料',exact:true}).click({trial:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(out,`signup-${width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'取消',exact:true}).click();assert.ok(!calls.some(c=>c.action==='registerUser'));
  await signup.click();await page.locator('#activity-reg-name').fill('報名測試');await page.locator('#activity-reg-phone').fill('0912-345-678');
  await page.getByRole('button',{name:'註冊並報名',exact:true}).click();assert.ok(!calls.some(c=>c.action==='registerUser'),'explicit consent required');
  await page.locator('#activity-reg-agree').check();registrationFailure=true;
  await page.getByRole('button',{name:'註冊並報名',exact:true}).click();
  await page.locator('#activity-registration-modal [data-error]').filter({hasText:'合成註冊失敗'}).waitFor();assert.ok(!calls.some(c=>c.action==='joinActivity'));
  registrationFailure=false;registrationTimeout=true;
  await page.getByRole('button',{name:'註冊並報名',exact:true}).click();
  await page.locator('#activity-registration-modal [data-error]').filter({hasText:'合成回應逾時'}).waitFor();
  assert.ok(!calls.some(c=>c.action==='joinActivity'));
  const registrationsSent=calls.filter(c=>c.action==='registerUser').length;
  registrationTimeout=false;joinFailure=true;
  await page.getByRole('button',{name:'註冊並報名',exact:true}).click();
  await page.locator('#activity-registration-modal').waitFor({state:'detached'});
  await page.waitForFunction(()=>document.body.textContent.includes('會員資料已確認，但活動報名未完成'));
  assert.equal(calls.filter(c=>c.action==='registerUser').length,registrationsSent,'retry reads created member, no duplicate signup');
  joinFailure=false;await signup.click();await page.getByRole('button',{name:'返回報名資料',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>currentPage),'my-act-detail');assert.equal(await page.locator('#my-act-detail-content h3').textContent(),activity.activityName);
  assert.equal(await page.evaluate(()=>__pages.includes('home')),false);
  assert.equal(calls.filter(c=>c.action==='registerUser').length,registrationsSent);
  const completeDm=await page.getByAltText('活動 DM').boundingBox();assert.ok(Math.abs(completeDm.height/completeDm.width-1.5)<0.01);
  await page.evaluate(()=>applyStoreSettingsToHome({siteName:'AI工坊',networkId:currentNetworkId}));assert.equal(await page.locator('#header-site-name').textContent(),'AI商脈');
  await page.evaluate(()=>applyStoreSettingsToHome({siteName:'租戶自訂',networkId:currentNetworkId}));assert.equal(await page.locator('#header-site-name').textContent(),'租戶自訂');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log(JSON.stringify({result:'PASS',widths:[320,390,1440],apis:[...new Set(calls.map(x=>x.action))],automaticWrites:0,syntheticExplicitSignup:true,screenshots:out}));
} finally {await browser.close();}
