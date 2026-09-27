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
const scripts=new Set(['js/config.js','js/login-bootstrap.js','js/core.js','js/navigation.js','js/modules/activities.js','js/modules/admin.js','js/modules/home.js','js/modules/activity-entry.js','js/auth.js']);
const actor='U'+'a'.repeat(32),ref='U'+'b'.repeat(32),id='ACT_fcfc401d-d559-4d0e-bbf4-73ff21973e09';
const query=`?a=${id}&r=${ref}&n=admin&v=a`;
const activity={activityId:id,networkId:'admin',status:'上架',activityName:'秋日交流活動',activityType:'交流',startTime:'2026-10-01T10:00',price:100,description:'測試活動內容 <img src=x onerror=alert(1)>'};
const browser=await playwright.chromium.launch({headless:true,channel:'chrome'});
const page=await browser.newPage({viewport:{width:390,height:844}});
const out=join(tmpdir(),'activity-direct-entry-20260928');mkdirSync(out,{recursive:true});
const calls=[],errors=[],blocked=[];
let holdMember=true,releaseMember,failActivity=false,holdActivity=false,releaseActivity;
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(({actor})=>{
  window.__pages=[];
  localStorage.setItem('ACTMASTER_USER_'+actor,JSON.stringify({savedAt:Date.now(),info:{userId:actor,role:'admin'}}));
}, {actor});
await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:tailwind});
  if(url.hostname==='static.line-scdn.net')return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>true,getProfile:async()=>({userId:'${actor}',displayName:'合成會員'}),getAccessToken:()=>'synthetic-token',getFriendship:async()=>({friendFlag:true})};`});
  if(req.method()==='POST'&&url.hostname==='line-engine.fangwl591021.workers.dev') {
    const {action,payload}=req.postDataJSON();calls.push({action,payload});
    assert.equal(payload.lineAccessToken,'synthetic-token');assert.equal(payload.userId,actor);
    let data;
    if(action==='checkUser') {
      if(holdMember){holdMember=false;await new Promise(resolve=>{releaseMember=resolve;});}
      data={isRegistered:true,info:{userId:actor,name:'合成會員',role:'user',networkId:'other-network'}};
    } else if(action==='getActivityById') {
      assert.equal(payload.activityId,id);assert.equal(payload.networkId,'admin');
      if(holdActivity){holdActivity=false;await new Promise(resolve=>{releaseActivity=resolve;});}
      if(failActivity)return route.fulfill({contentType:'application/json',body:JSON.stringify({success:false,error:'合成網路失敗'})});
      data=activity;
    } else {blocked.push(action);return route.abort();}
    return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  }
  if(req.resourceType()==='image')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  if(url.hostname==='localhost') {
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
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
  assert.equal(await page.locator('#my-act-detail-content img').count(),0,'description is escaped');
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
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
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  assert.ok(calls.every(x=>['checkUser','getActivityById'].includes(x.action)));
  console.log(JSON.stringify({result:'PASS',widths:[320,390,1440],apis:[...new Set(calls.map(x=>x.action))],automaticWrites:0,screenshots:out}));
} finally {await browser.close();}
