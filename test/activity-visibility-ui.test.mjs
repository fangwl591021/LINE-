import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{try{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}catch{playwright=null;}}
// CI has no browser dependencies. Static wiring still runs; actual browser acceptance runs where Playwright is installed.
const browserTest=(name,fn)=>test(name,{skip:!playwright&&'需要 Playwright 與 Chrome；本機另做實際瀏覽器驗收'},fn);
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const between=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start)+start.length));
const popup=read('js/modules/activity-visibility.js'),css=read('css/activity-visibility.css');
const out=join(tmpdir(),'line-activity-visibility-20261008');mkdirSync(out,{recursive:true});

browserTest('real browser popup: yes/no/cancel, Escape/abort/identity changes, focus return and phone layout',async t=>{
  const browser=await playwright.chromium.launch({headless:true,channel:'chrome'});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.setContent('<button id="opener">發布活動</button>');
  await page.addStyleTag({content:css});await page.addScriptTag({content:popup});
  const open=async current=>{await page.locator('#opener').focus();await page.evaluate(current=>{window.choice='pending';window.valid=true;window.abort=new AbortController();window.chooseActivityVisibility({current,signal:window.abort.signal,isCurrent:()=>window.valid}).then(v=>window.choice=v);},current);await page.locator('.activity-visibility-dialog').waitFor();};
  for(const [scope,result]of [['platform','platform'],['network','network'],['cancel',null]]){
    await open('network');await page.locator(scope==='cancel'?'.av-cancel':`[data-scope="${scope}"]`).click();
    await page.waitForFunction(()=>window.choice!=='pending');assert.equal(await page.evaluate(()=>window.choice),result);assert.equal(await page.evaluate(()=>document.activeElement.id),'opener');
  }
  await open();await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.choice),null);
  await open();await page.evaluate(()=>window.abort.abort());assert.equal(await page.evaluate(()=>window.choice),null);
  await open();await page.evaluate(()=>window.valid=false);await page.locator('[data-scope="platform"]').click();assert.equal(await page.evaluate(()=>window.choice),null);
  for(const width of [320,390,1440]){
    await page.setViewportSize({width,height:844});await open('network');
    const overflow=await page.locator('.activity-visibility-dialog').evaluate(d=>{const r=d.getBoundingClientRect();return r.left<0||r.right>innerWidth||d.scrollWidth>d.clientWidth+1;});assert.equal(overflow,false);
    await page.screenshot({path:join(out,`popup-${width}.png`)});await page.locator('.av-cancel').click();
  }
});

async function indexPage(browser){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('**/*',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')}):route.abort());
  // Real index form markup; omit unrelated boot scripts and all external network activity.
  await page.goto('http://localhost/visibility-fixture',{waitUntil:'domcontentloaded'});
  await page.addStyleTag({content:css+'\n.hidden{display:none}'});await page.addScriptTag({content:popup});
  await page.evaluate(()=>{
    window.calls=[];window.currentUserProfile={userId:'synthetic-owner'};window.currentUser={role:'admin',networkId:'admin'};window.userRole='admin';
    window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-token'};window.showToast=()=>{};window.goPage=()=>{};window.openActivityShareModal=()=>{};
    window.fetchAPI=async(action,payload)=>{window.calls.push({action,payload});return action==='uploadImageToR2'?{url:'https://fixture.invalid/dm.png'}:{success:true,data:{activityId:'synthetic-activity'}};};
    window.alert=()=>{};
  });
  return page;
}
browserTest('actual mobile activity submit cancels before upload, blocks double submit, and saves chosen visibility',async t=>{
  const browser=await playwright.chromium.launch({headless:true,channel:'chrome'});t.after(()=>browser.close());
  const page=await indexPage(browser);await page.addScriptTag({content:read('js/modules/activities.js')});
  await page.evaluate(()=>{document.getElementById('f-name').value='測試活動';document.getElementById('in-image-url-full').value='data:image/png;base64,AAAA';});
  const submit=async()=>{await page.evaluate(()=>{void window.submitActivityForm('full');void window.submitActivityForm('full');});await page.locator('.activity-visibility-dialog').waitFor();};
  await submit();await page.locator('.av-cancel').click();assert.equal(await page.evaluate(()=>window.calls.length),0);assert.equal(await page.locator('#btn-submit-full').isDisabled(),false);
  await submit();await page.locator('[data-scope="network"]').click();await page.waitForFunction(()=>window.calls.some(c=>c.action==='bulkAddRegistrants'));
  const calls=await page.evaluate(()=>window.calls);assert.deepEqual(calls.map(c=>c.action),['uploadImageToR2','bulkAddRegistrants']);assert.equal(calls[1].payload.visibility,'network');
  await page.evaluate(()=>{window.calls=[];});await submit();await page.evaluate(()=>window.currentUserProfile.userId='switched-user');await page.locator('[data-scope="platform"]').click();assert.equal(await page.evaluate(()=>window.calls.length),0);
});

browserTest('mobile uncertain create retries reuse the chosen scope, stable ID and uploaded image',async t=>{
  const browser=await playwright.chromium.launch({headless:true,channel:'chrome'});t.after(()=>browser.close());
  const page=await indexPage(browser);await page.addScriptTag({content:read('js/modules/activities.js')});
  await page.evaluate(()=>{
    document.getElementById('f-name').value='送出快照';document.getElementById('in-image-url-full').value='data:image/png;base64,AAAA';
    const initial=window.fetchAPI;window.fetchAPI=async(action,payload)=>action==='bulkAddRegistrants'?(window.calls.push({action,payload}),{success:false,error:'合成逾時'}):initial(action,payload);
    void window.submitActivityForm('full');
  });
  await page.locator('[data-scope=network]').click();await page.waitForFunction(()=>!document.getElementById('btn-submit-full').disabled);
  await page.evaluate(()=>{document.getElementById('f-name').value='重試不應覆蓋';void window.submitActivityForm('full');});
  await page.waitForFunction(()=>window.calls.filter(c=>c.action==='bulkAddRegistrants').length===2);
  const calls=await page.evaluate(()=>window.calls);assert.equal(calls.filter(c=>c.action==='uploadImageToR2').length,1);
  const creates=calls.filter(c=>c.action==='bulkAddRegistrants');assert.deepEqual(creates[0].payload,creates[1].payload);
  assert.equal(creates[0].payload.createOnly,true);assert.equal(creates[0].payload.visibility,'network');assert.equal(await page.locator('.activity-visibility-dialog').count(),0);
});

browserTest('actual member review POP precedes file preparation and API; retry retains same scope/request key',async t=>{
  const browser=await playwright.chromium.launch({headless:true,channel:'chrome'});t.after(()=>browser.close());
  const page=await indexPage(browser);const requests=[];let loseFirst=true;
  const event={id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',title:'範例活動',description:'交流合作內容',location:'台北範例場地',startsAt:'2026-10-20T06:00:00Z',endsAt:'2026-10-20T08:00:00Z',registrationClosesAt:'2026-10-20T06:00:00Z',capacity:0,feeText:'免費',coverUrl:'',status:'active',revision:0,isOwner:true,organizerName:'範例主辦',registrationCount:0,visibility:'network'};
  await page.unroute('**/*');await page.route('**/*',async route=>{
    const headers={'access-control-allow-origin':'*','access-control-allow-headers':'Authorization, Content-Type','access-control-allow-methods':'GET, POST, OPTIONS'};
    const req=route.request(),url=new URL(req.url());if(req.method()==='OPTIONS')return route.fulfill({status:204,headers,body:''});if(req.method()==='POST'&&url.pathname===`/v1/member-events/${event.id}/update`){
      requests.push(req.postDataJSON());return route.fulfill({headers,contentType:'application/json',body:JSON.stringify(loseFirst?{success:false,error:'合成逾時；重試同一筆'}:{success:true,event:{id:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',visibility:req.postDataJSON().visibility}})});
    }return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({success:true,event,registration:null,sessions:[],hosting:[],my:[]})});
  });
  await page.evaluate(()=>{
    window.prepared=0;window.prepareMemberEventDmFile=async()=>{window.prepared++;return {type:'image/png',data:'data:image/png;base64,AAAA'};};
  });
  await page.addStyleTag({content:read('css/member-hosted-events.css')});await page.addScriptTag({content:read('js/modules/member-hosted-events.js')});
  await page.evaluate(id=>window.openMemberEvents('hosting',id),event.id);await page.getByRole('button',{name:'編輯活動',exact:true}).click();await page.locator('.me-form').waitFor();
  await page.locator('[data-media-file]').setInputFiles({name:'sample.png',mimeType:'image/png',buffer:Buffer.from('synthetic')});
  const publish=page.locator('.me-form button[type=submit]');await publish.click();await page.locator('.activity-visibility-dialog').waitFor();await page.locator('.av-cancel').click();
  assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>window.prepared),0);
  await publish.click();await page.locator('[data-scope="platform"]').click();await page.getByText('合成逾時；重試同一筆',{exact:true}).waitFor();assert.equal(requests.length,1);assert.equal(requests[0].visibility,'platform');
  await page.locator('[name=title]').fill('不應覆蓋已送出的快照');await publish.click();await page.waitForFunction(()=>document.querySelector('.me-status').textContent.includes('合成逾時'));
  await page.waitForTimeout(50);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.equal(await page.evaluate(()=>window.prepared),1);
  assert.equal(await page.locator('.activity-visibility-dialog').count(),0);loseFirst=false;
  await page.locator('.me-dialog [data-close]').click();
});

browserTest('admin create and edit paths carry chosen visibility, cancellation does not save, and same pending payload retries',async t=>{
  const browser=await playwright.chromium.launch({headless:true,channel:'chrome'});t.after(()=>browser.close());
  const page=await browser.newPage();await page.route('**/*',route=>route.request().resourceType()==='document'?route.fulfill({contentType:'text/html',body:read('admin.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')}):route.abort());
  await page.goto('http://localhost/admin-visibility-fixture',{waitUntil:'domcontentloaded'});
  await page.addStyleTag({content:css+'\n.hidden{display:none}'});await page.addScriptTag({content:popup});
  await page.evaluate(()=>{
    window.adminRole='admin';window.adminProfile={userId:'synthetic-manager'};window.liff={getAccessToken:()=> 'synthetic-token'};
    window.allActivitiesData=[];document.querySelectorAll('.hidden').forEach(n=>n.classList.remove('hidden'));document.getElementById('loading-screen')?.remove();
    window.calls=[];window.failCreate=true;window.showToast=()=>{};window.createConfirm=async()=>true;
    window.fetchAPI=async(action,payload)=>{window.calls.push({action,payload});return action==='getAllActivities'?[]:action==='bulkAddRegistrants'&&window.failCreate?{success:false}:{success:true,data:{activityId:'synthetic'}};};
    window.renderActivitySectionRows=()=>'';window.closeActivityEditModal=()=>{};window.loadActivities=async()=>{};window.normalizeActivityImageRatioForAdmin_=v=>v;
  });
  await page.addScriptTag({content:read('js/modules/admin-activity-registration.js')});
  await page.evaluate(()=>window.AdminActivityRegistration.load());await page.locator('[data-aar=create]').click();
  await page.locator('[name=activityName]').fill('後台活動');await page.locator('[name=startTime]').fill('2026-10-20T14:00');
  await page.locator('#aar-create-submit').click();await page.locator('.av-cancel').click();assert.equal((await page.evaluate(()=>window.calls)).filter(c=>c.action==='bulkAddRegistrants').length,0);
  await page.locator('#aar-create-submit').click();await page.locator('[data-scope=network]').click();await page.locator('#aar-create-submit').filter({hasText:'重試同一筆建立'}).waitFor();
  await page.locator('#aar-create-submit').click();await page.waitForTimeout(100);const calls=await page.evaluate(()=>window.calls.filter(c=>c.action==='bulkAddRegistrants'));assert.equal(calls.length,2);assert.deepEqual(calls[0].payload,calls[1].payload);assert.equal(calls[0].payload.visibility,'network');
  await page.locator('#aar-create-dialog [data-create-close]').first().click();
  await page.addScriptTag({content:between(read('admin.html'),'    async function saveActivityFromMonitor(','    function safeStringForPrompt_(')});
  await page.evaluate(()=>{
    window.AdminActivityRegistration.canSaveEditDm=()=>true;
    for(const [id,value]of Object.entries({'edit-a-id':'synthetic','edit-a-name':'修改活動','edit-a-type':'活動','edit-a-start':'2026-10-20T14:00','edit-a-end':'2026-10-20T16:00'}))document.getElementById(id).value=value;
    document.getElementById('modal-activity-edit').classList.remove('hidden');document.getElementById('modal-activity-edit').style.display='block';
    void saveActivityFromMonitor();
  });
  await page.locator('.av-cancel').click();assert.equal((await page.evaluate(()=>window.calls)).filter(c=>c.action==='updateActivity').length,0);
  await page.evaluate(()=>{void saveActivityFromMonitor();});await page.locator('[data-scope=platform]').click();await page.waitForFunction(()=>window.calls.some(c=>c.action==='updateActivity'));
  assert.equal(await page.evaluate(()=>window.calls.find(c=>c.action==='updateActivity').payload.data.visibility),'platform');
});

test('homepage global vs affiliation predicate keeps current-member scope independent from URL network',()=>{
  const home=read('js/modules/home.js'),start=home.indexOf('    function getPublicActivityId_'),end=home.indexOf('    window.homeActivityFilter',start);
  const src=home.slice(start,end);assert.ok(src.includes("activity.visibility === 'platform'"));assert.ok(src.includes("activity.visibility === 'network'"));
  for(const path of ['index.html','admin.html']){assert.ok(read(path).includes('js/modules/activity-visibility.js?v=1'));assert.ok(read(path).includes('css/activity-visibility.css?v=1'));}
  for(const path of ['js/modules/activities.js','js/modules/admin.js','js/modules/member-hosted-events.js','js/modules/admin-activity-registration.js','admin.html'])assert.ok(read(path).includes('chooseActivityVisibility'),path);
});
