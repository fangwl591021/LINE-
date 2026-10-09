// Full admin shell, synthetic LINE/auth/activity records; production API requests are blocked.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeActivityDraft } from '../../worker/activity-dm-ai.mjs';
const require = createRequire(import.meta.url);
let playwright; try { playwright = require('playwright'); } catch { playwright = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const tailwindResponse = await fetch('https://cdn.tailwindcss.com', {signal:AbortSignal.timeout(20000)});
assert.ok(tailwindResponse.ok);
const tailwind = await tailwindResponse.text();
// Reserve icon geometry without fetching third-party fonts in this fixture.
const html = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8').replace('</head>', '<style>.material-symbols-outlined{font-size:0!important;display:inline-block;width:24px;min-width:24px;height:24px}</style></head>');
const out = join(tmpdir(), 'admin-activity-registration-20260928'); mkdirSync(out, {recursive:true});
const browser = await playwright.chromium.launch({headless:true,channel:'chrome'});
const page = await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:'http://localhost'});
const errors=[], calls=[], blocked=[];
page.on('pageerror', error => errors.push(error.message));
page.on('dialog', dialog => dialog.accept());
const activities = [
  {'活動ID':'A','活動名稱':'秋日交流活動','歸屬網':'admin','開始時間':'2026-09-28 10:00','金額':100,'狀態':'上架'},
  {'活動ID':'B','活動名稱':'小型讀書會','歸屬網':'branch','開始時間':'2026-10-02 10:00','金額':0,'狀態':'下架'}
];
const rows = [
  {rowId:'r1',activityId:'A','姓名':'測試會員甲','手機':'0912345678','金額':100,'付款狀態':'待對帳','簽到':false},
  {rowId:'r2',activityId:'A','姓名':'已繳會員乙','手機':'0223456789','金額':100,'付款狀態':'已付款','簽到':true},
  {rowId:'r3',activityId:'A','姓名':'取消會員丙','金額':100,status:'cancelled'},
  {rowId:'r4',activityId:'A','姓名':'<img src=x onerror=alert(1)>','金額':0,'簽到':false}
];
let failList=false,failRoster=false,loseToggle=false,holdRoster=false,held;
let loseCreate=false,holdCreate=false,releaseCreate,failUpload=false;
let failAi=false,holdAi=false,releaseAi;
let multiSession=false;
let omitSessionRows=false;
let failLink=false,holdLink=false,releaseLink;
const shortUrl='https://line-engine.fangwl591021.workers.dev/a/AbCd0123456789_-';
await page.route('**/*', async route => {
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='cdn.tailwindcss.com') return route.fulfill({contentType:'text/javascript',body:tailwind});
  if(url.hostname==='static.line-scdn.net') return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>false,getProfile:async()=>({userId:'synthetic-manager',displayName:'合成測試管理員'}),getAccessToken:()=>'synthetic-token'};`});
  if(url.pathname==='/fixture-poster.png')return route.fulfill({headers:{'access-control-allow-origin':'*'},contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  if(req.method()==='POST' && url.hostname==='line-engine.fangwl591021.workers.dev') {
    const {action,payload}=req.postDataJSON(); calls.push({action,payload});
    assert.equal(payload.lineAccessToken,'synthetic-token');
    let result;
    if(action==='checkUser')result={info:{role:'store',networkId:'admin'}};
    else if(action==='getAllActivities')result=failList?null:activities;
    else if(action==='createActivityShareLink') {
      assert.equal(payload.activityId,'A');assert.equal(payload.networkId,'admin');
      assert.equal(payload.userId,'synthetic-manager');
      if(holdLink){holdLink=false;await new Promise(resolve=>{releaseLink=resolve;});}
      result=failLink?null:{url:shortUrl};
    }
    else if(action==='uploadImageToR2')result=failUpload?null:{url:'https://localhost/fixture-poster.png'};
    else if(action==='updateActivity') {
      assert.equal(payload.activityId,'A');
      Object.assign(activities.find(a=>a['活動ID']==='A'),payload.data);
      result={activityId:'A'};
    }
    else if(action==='extractActivityDmDraft') {
      assert.ok(payload.base64Image.startsWith('data:image/png;base64,'));
      if(holdAi){holdAi=false;await new Promise(resolve=>{releaseAi=resolve;});}
      result=failAi?null:{provider:'OpenAI',draft:normalizeActivityDraft({activityName:'AI 活動草稿',activityType:'講座',location:'台北市合成會場3樓之2',timeStatus:multiSession?'multiple':'single',scheduleText:multiSession?'2026/10/01、10/15 上午10:00–12:00':'2026/10/01 上午10:00–12:00',startTime:'2026-10-01T10:00',endTime:'2026-10-01T12:00',price:null,description:'• <img src=x onerror=alert(1)>\n• 合成活動內容：每位自我介紹 60 秒，限 20 位。',confidenceNote:'費用不明，請人工確認。',batches:multiSession?[{name:'早場',scheduleText:'2026/10/01 10:00',startTime:'2026-10-01T10:00',price:200},{name:'第二場',scheduleText:'2026/10/15 10:00',startTime:'2026-10-15T10:00',price:null},{name:'不確定場次',scheduleText:'10/30',startTime:'',price:null}]:[]})};
    }
    else if(action==='bulkAddRegistrants') {
      assert.deepEqual(payload.names,[]);assert.equal(payload.userId,'synthetic-manager');
      const item={'活動ID':payload.activityId,'活動名稱':payload.activityName,'歸屬網':'admin','開始時間':payload.startTime,'金額':payload.price,'狀態':payload.status};
      if(!activities.some(row=>row['活動ID']===payload.activityId))activities.push(item);
      if(holdCreate){holdCreate=false;await new Promise(resolve=>{releaseCreate=resolve;});}
      result=loseCreate?null:{activityId:payload.activityId};loseCreate=false;
    }
    else if(action==='getActivityRegistrants') {
      assert.ok(['A','B'].includes(payload.activityId));
      result=failRoster?null:payload.activityId==='A'?rows:[];
      if(holdRoster&&payload.activityId==='A') { holdRoster=false; await new Promise(resolve=>{held=resolve;}); }
    } else if(action==='toggleCheckin') {
      const row=rows.find(row=>row.rowId===payload.rowId);row['簽到']=!row['簽到'];
      result=loseToggle?null:{rowId:payload.rowId};loseToggle=false;
    } else if(action==='redeemActivityCheckin') {
      assert.equal(payload.activityId,'A');const row=rows.find(row=>row.rowId===payload.rowId);
      result=!row||row.status==='cancelled'?null:{rowId:payload.rowId,checkedIn:true,duplicate:!!row['簽到']};if(result)row['簽到']=true;
    } else if(action==='confirmPayment') { rows.find(row=>row.rowId===payload.rowId)['付款狀態']='已付款';result={rowId:payload.rowId}; }
    else { blocked.push(action); return route.abort(); }
    if(action==='extractActivityDmDraft' && omitSessionRows && result?.draft)result.draft.batches=[];
    return route.fulfill({contentType:'application/json',body:JSON.stringify(result===null?{success:false,error:'合成失敗'}:{success:true,data:result})});
  }
  if(req.resourceType()==='image')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  if(url.hostname==='localhost') {
    if(url.pathname==='/admin.html')return route.fulfill({contentType:'text/html',body:html});
    if(['/js/modules/admin-activity-registration.js','/css/admin-activity-registration.css','/js/modules/activity-checkin.js','/css/activity-checkin.css','/js/modules/activity-visibility.js','/css/activity-visibility.css','/js/vendor/jsQR.js','/js/vendor/qrcode-generator-2.0.4.mjs'].includes(url.pathname)) return route.fulfill({contentType:/\.m?js$/.test(url.pathname)?'text/javascript':'text/css',body:readFileSync(new URL('../../'+url.pathname.slice(1),import.meta.url),'utf8')});
    // Other admin modules are unrelated; do not initialize them in this fixture.
    return route.fulfill({contentType:'text/javascript',body:''});
  }
  if(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.hostname))return route.fulfill({body:''});
  blocked.push(url.href);return route.abort();
});
const btn=name=>name==='建立活動'?page.locator('#aar-create-submit'):page.getByRole('button',{name,exact:true});
const openA=async()=>{await page.locator('[data-registrants="A"]').click();await page.getByText('測試會員甲',{exact:true}).waitFor();};
try {
  await page.goto('http://localhost/admin.html?tab=activities',{waitUntil:'domcontentloaded'});
  // The visibility POP has its own interactive tests; choose public explicitly in this broad fixture.
  await page.evaluate(()=>new MutationObserver(()=>document.querySelector('.activity-visibility-dialog [data-scope="platform"]')?.click()).observe(document.body,{childList:true}));
  await page.locator('#loading-screen').waitFor({state:'detached'});
  await page.locator('[data-registrants="A"]').waitFor();
  assert.equal(await page.locator('#page-title').textContent(),'活動報名管理');
  assert.equal(await page.locator('[data-registrants="A"]').textContent(),'查看報名名單');
  // The real admin edit modal offers the same short URL without saving any form fields.
  const linkCount=()=>calls.filter(call=>call.action==='createActivityShareLink').length;
  const editModal=page.locator('#modal-activity-edit');
  await page.evaluate(()=>editActivityFromMonitor('A'));
  await page.waitForFunction(()=>document.getElementById('edit-a-link-copy').disabled===false);
  assert.equal(await page.locator('#edit-a-registration-link').inputValue(),shortUrl);
  assert.equal(await page.locator('#edit-a-registration-link').getAttribute('readonly'),'');
  assert.equal(await page.locator('#edit-a-link-open').getAttribute('href'),shortUrl);
  assert.equal(await page.locator('#edit-a-link-open').getAttribute('target'),'_blank');
  assert.equal(await page.locator('#edit-a-link-open').getAttribute('rel'),'noopener noreferrer');
  await btn('複製連結').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),shortUrl);
  await page.locator('#edit-a-name').fill('尚未儲存的名稱');
  const descriptionDraft='活動地點：新北市板橋區文化路一段486號3樓之2\n\n活動亮點：\n• 來認識人、聊資源、找合作、串商機\n• 小小交流，大大商機，歡迎參加\n\n當日流程：\n14:00 報到\n14:15 相見、相識\n14:45 合作交流\n16:30 交流結束';
  await page.locator('#edit-a-desc').fill(descriptionDraft);
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:800});
    await page.locator('#edit-a-registration-link').scrollIntoViewIfNeeded();
    await btn('複製連結').click({trial:true});
    const overflow=await editModal.locator('input, button, a').evaluateAll(nodes=>nodes.filter(n=>{
      const box=n.getBoundingClientRect();return box.width&&(box.right>innerWidth+1||box.x<0);
    }).map(n=>n.id||n.textContent));
    assert.deepEqual(overflow,[],`edit link controls fit ${width}px`);
    await page.screenshot({path:join(out,`edit-link-${width}.png`),fullPage:true});
    await page.locator('#btn-save-activity').click({trial:true});
    await editModal.getByRole('button',{name:'取消',exact:true}).click({trial:true});
    await page.locator('#edit-a-desc').scrollIntoViewIfNeeded();
    const descriptionStyle=await page.locator('#edit-a-desc').evaluate(node=>{
      const style=getComputedStyle(node),box=node.getBoundingClientRect();
      return {size:style.fontSize,color:style.color,weight:style.fontWeight,lineHeight:style.lineHeight,resize:style.resize,height:box.height,left:box.left,right:box.right};
    });
    assert.equal(descriptionStyle.size,'18px');assert.equal(descriptionStyle.color,'rgb(15, 23, 42)');
    assert.equal(descriptionStyle.weight,'500');assert.ok(parseFloat(descriptionStyle.lineHeight)>=29);
    assert.equal(descriptionStyle.resize,'vertical');assert.ok(descriptionStyle.height>=320);
    assert.ok(descriptionStyle.left>=0&&descriptionStyle.right<=width);
    assert.equal(await page.locator('#edit-a-desc').inputValue(),descriptionDraft);
    await page.screenshot({path:join(out,`edit-description-${width}.png`),fullPage:true});
    await page.locator('#btn-save-activity').click({trial:true});
    await editModal.getByRole('button',{name:'取消',exact:true}).click({trial:true});
  }
  await page.evaluate(()=>AdminActivityRegistration.loadEditLink());
  assert.equal(await page.locator('#edit-a-name').inputValue(),'尚未儲存的名稱');
  await page.evaluate(()=>closeActivityEditModal());
  // Existing uploaded poster can be re-read without selecting/uploading another file.
  await page.evaluate(()=>editActivityFromMonitor('A'));
  await page.locator('#edit-a-image').fill('http://localhost/fixture-poster.png');
  const uploadsBefore=calls.filter(c=>c.action==='uploadImageToR2').length;
  multiSession=true;await btn('重新辨識 DM').click();await page.locator('#edit-dm-preview').waitFor();
  assert.equal(await page.locator('#edit-dm-slots [data-slot-select]').count(),3);
  assert.equal(calls.filter(c=>c.action==='uploadImageToR2').length,uploadsBefore);
  // Editing cannot accidentally open a different registration form.
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:800});
    await btn('確認套用至本活動').click();assert.notEqual(await page.locator('#edit-a-name').inputValue(),'AI 活動草稿');
    assert.match(await page.locator('#edit-dm-action-status').textContent(),/僅可套用一個時段/);
    const notice=await page.locator('#edit-dm-action-status').boundingBox();assert.ok(notice.y>=0&&notice.y+notice.height<=800);
    assert.equal(await page.locator('#edit-dm-series').count(),0);
    assert.equal(await page.locator('#aar-create-dialog').count(),0);
    assert.equal(calls.filter(c=>c.action==='bulkAddRegistrants'||c.action==='updateActivity').length,0);
    await page.screenshot({path:join(out,`edit-no-new-form-${width}.png`)});
  }
  await page.locator('#edit-dm-slots [data-slot-select]').nth(1).uncheck();await page.locator('#edit-dm-slots [data-slot-select]').nth(2).uncheck();
  await btn('確認套用至本活動').click();assert.equal(await page.locator('#edit-a-start').inputValue(),'2026-10-01 10:00');
  await page.evaluate(()=>closeActivityEditModal());multiSession=false;
  const beforeDown=linkCount();await page.evaluate(()=>editActivityFromMonitor('B'));
  assert.equal(linkCount(),beforeDown);assert.equal(await btn('複製連結').isDisabled(),true);
  assert.equal(await page.locator('#edit-a-registration-link').inputValue(),'');
  assert.match(await page.locator('#edit-a-link-status').textContent(),/尚未上架/);
  await page.evaluate(()=>closeActivityEditModal());
  failLink=true;await page.evaluate(()=>editActivityFromMonitor('A'));
  await btn('重新取得').waitFor();assert.equal(await btn('複製連結').isDisabled(),true);
  failLink=false;await btn('重新取得').click();
  await page.waitForFunction(()=>!document.getElementById('edit-a-link-copy').disabled);
  await page.evaluate(()=>closeActivityEditModal());
  holdLink=true;await page.evaluate(()=>editActivityFromMonitor('A'));
  await page.waitForFunction(()=>document.getElementById('edit-a-link-status').textContent==='正在取得報名短網址…');
  await page.evaluate(()=>{closeActivityEditModal();editActivityFromMonitor('B');});
  while(!releaseLink)await new Promise(resolve=>setTimeout(resolve,10));releaseLink();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#edit-a-registration-link').inputValue(),'');
  assert.match(await page.locator('#edit-a-link-status').textContent(),/尚未上架/);
  await page.evaluate(()=>closeActivityEditModal());
  assert.equal(calls.filter(call=>call.action==='updateActivity').length,0);
  await page.locator('#aar-activity-query').fill('讀書');assert.equal(await page.locator('[data-registrants]').count(),1);
  await page.locator('#aar-activity-query').fill('');await page.locator('#act-tenant-filter').selectOption('branch');assert.equal(await page.locator('[data-registrants]').count(),1);
  await page.locator('#act-tenant-filter').selectOption('all');
  for(const width of [390,1440]) {
    await page.setViewportSize({width,height:1000});
    if(width<1024)await page.evaluate(()=>switchTab('activities'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:join(out,`activities-${width}.png`),fullPage:true});
  }
  await openA();
  assert.match(await page.locator('#aar-roster-stats').textContent(),/有效報名3已簽到1待付款1已取消1/);
  assert.equal(await page.locator('#aar-roster-body img').count(),0);
  assert.equal(await page.locator('tr').filter({hasText:'取消會員丙'}).getByRole('button').count(),0);
  await page.locator('#aar-roster-state').selectOption('checked');assert.equal(await page.locator('#aar-roster-body tr').count(),1);
  await page.locator('#aar-roster-state').selectOption('all');await page.locator('#aar-roster-query').fill('0912');
  const downloadPromise=page.waitForEvent('download');await btn('匯出篩選名單 CSV').click();const download=await downloadPromise;
  const csv=readFileSync(await download.path(),'utf8');assert.ok(csv.includes('0912345678'));assert.ok(!csv.includes('已繳會員乙'));
  await page.locator('#aar-roster-query').fill('');
  loseToggle=true;
  await page.locator('[data-row="r1"][data-mutation="toggleCheckin"]').click();
  await page.waitForFunction(()=>document.querySelector('[data-row="r1"][data-mutation="toggleCheckin"]')?.textContent==='取消簽到');
  assert.match(await page.locator('#aar-roster-status').textContent(),/不會自動重送/);
  assert.equal(calls.filter(call=>call.action==='toggleCheckin').length,1);
  await page.locator('[data-row="r1"][data-mutation="confirmPayment"]').click();
  await page.locator('[data-row="r1"][data-mutation="confirmPayment"]').waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('[data-aar="back"]')?.disabled===false);
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:1000});
    if(width<1024)await page.evaluate(()=>switchTab('activities'));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await btn('← 返回活動列表').isVisible(),true);
    assert.equal(await btn('重新整理名單').isVisible(),true);
    const overflow = await page.locator('#admin-activity-registrants > .aar-head button, #admin-activity-registrants .aar-filters input, #admin-activity-registrants .aar-filters select').evaluateAll(nodes => nodes.map(node=>({label:node.textContent||node.id,right:node.getBoundingClientRect().right})).filter(item=>item.right>innerWidth+1));
    assert.deepEqual(overflow,[],`controls fit ${width}px viewport`);
    await btn('重新整理名單').click({trial:true});
    await btn('← 返回活動列表').click({trial:true});
    await page.screenshot({path:join(out,`roster-${width}.png`),fullPage:true});
  }
  failRoster=true;await btn('重新整理名單').click();await page.getByText('名單讀取失敗，請使用上方重新整理',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-mutation]').count(),0);assert.equal(await btn('匯出篩選名單 CSV').isDisabled(),true);
  failRoster=false;await btn('重新整理名單').click();await page.getByText('測試會員甲',{exact:true}).waitFor();
  await btn('← 返回活動列表').click();
  // Old A response cannot overwrite B after navigating away while request is pending.
  holdRoster=true;await page.locator('[data-registrants="A"]').click();
  await page.waitForFunction(()=>document.getElementById('aar-roster-status')?.textContent==='正在讀取名單…');
  await btn('← 返回活動列表').click();await page.locator('[data-registrants="B"]').click();
  await page.getByText('尚無報名者',{exact:true}).waitFor();
  assert.ok(held);held();await page.waitForTimeout(150);
  assert.equal(await page.locator('#admin-activity-registrants h2').textContent(),'小型讀書會');
  assert.equal(await page.getByText('測試會員甲',{exact:true}).count(),0);
  await btn('← 返回活動列表').click();failList=true;await btn('重新整理活動').click();await page.getByText('活動資料讀取失敗',{exact:true}).waitFor();
  failList=false;await btn('重新整理活動').click();await page.locator('[data-registrants="A"]').waitFor();
  // Create entry and cancellation: no write until an explicit valid submit.
  const createCount=()=>calls.filter(call=>call.action==='bulkAddRegistrants').length;
  await btn('＋新增活動').click();await page.locator('#aar-create-dialog').waitFor();
  await page.locator('#aar-create-form [name="activityName"]').fill('取消的活動');
  await page.locator('#aar-create-dialog').getByRole('button',{name:'取消',exact:true}).click();assert.equal(createCount(),0);
  await btn('＋新增活動').click();
  const field=name=>page.locator('#aar-create-form [name="'+name+'"]');
  assert.equal(await field('activityName').inputValue(),'');
  await field('activityName').fill('新增合成活動');await field('startTime').fill('2026-09-28T10:00');await field('endTime').fill('2026-09-28T09:00');
  await btn('建立活動').click();await page.getByText('結束時間必須晚於開始時間',{exact:true}).waitFor();assert.equal(createCount(),0);
  await field('endTime').fill('2026-09-28T12:00');await field('price').fill('200');
  const image={name:'poster.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')};
  failUpload=true;await field('imageFile').setInputFiles(image);await page.getByText('圖片上傳失敗，請重新選圖或填寫圖片網址後再建立。',{exact:true}).waitFor();
  await btn('建立活動').click();assert.equal(createCount(),0);
  failUpload=false;await field('imageFile').setInputFiles(image);await page.getByText('宣傳圖已上傳，請完成表單後按「建立活動」。',{exact:true}).waitFor();
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:800});
    await btn('建立活動').click({trial:true});
    await page.locator('#aar-create-dialog').getByRole('button',{name:'取消',exact:true}).click({trial:true});
    const bounds=await page.locator('#aar-create-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);
    await page.screenshot({path:join(out,`create-${width}.png`),fullPage:true});
  }
  // A persisted write with a lost response reuses the same id/snapshot; double-submit is locked.
  loseCreate=true;holdCreate=true;await btn('建立活動').click();
  await page.waitForFunction(()=>document.getElementById('aar-create-submit').disabled);
  assert.equal(await field('activityName').isDisabled(),true);
  await page.locator('#aar-create-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  while(!releaseCreate)await new Promise(resolve=>setTimeout(resolve,10));
  releaseCreate();await btn('重試同一筆建立').waitFor();assert.equal(createCount(),1);
  await page.locator('#aar-create-dialog').getByRole('button',{name:'取消',exact:true}).click();await btn('＋新增活動').click();
  assert.equal(await field('activityName').inputValue(),'新增合成活動');assert.equal(await field('activityName').isDisabled(),true);
  await btn('重試同一筆建立').click();await page.locator('#aar-create-dialog').waitFor({state:'detached'});
  const created=calls.filter(call=>call.action==='bulkAddRegistrants');assert.equal(created.length,2);assert.deepEqual(created[0].payload,created[1].payload);
  assert.equal(created[0].payload.feeType,'收費');assert.equal(created[0].payload.imageUrl,'https://localhost/fixture-poster.png');
  await page.locator('[data-registrants="'+created[0].payload.activityId+'"]').waitFor();
  assert.equal(activities.filter(row=>row['活動名稱']==='新增合成活動').length,1);
  await btn('＋新增活動').click();await field('activityName').fill('草稿合成活動');await field('startTime').fill('2026-10-01T10:00');await field('status').selectOption('下架');
  await btn('建立活動').click();await page.locator('#aar-create-dialog').waitFor({state:'detached'});
  const draft=calls.filter(call=>call.action==='bulkAddRegistrants').at(-1);assert.equal(draft.payload.status,'下架');assert.equal(draft.payload.feeType,'免費');
  assert.notEqual(draft.payload.activityId,created[0].payload.activityId);
  // Welfare-style AI DM flow: preview only, explicit apply, editable fields, mandatory review.
  const beforeAi=createCount();
  await btn('＋新增活動').click();assert.equal(await btn('AI 讀取 DM 並整理活動資料').isDisabled(),true);
  await field('activityName').fill('原本手動名稱');
  await field('imageFile').setInputFiles(image);await page.waitForFunction(()=>!document.getElementById('aar-ai-read').disabled);
  failAi=true;await btn('AI 讀取 DM 並整理活動資料').click();
  await page.getByText('AI 未完成辨識，原表單未變更。請重新辨識或手動填寫。',{exact:true}).waitFor();
  assert.equal(await field('activityName').inputValue(),'原本手動名稱');assert.equal(createCount(),beforeAi);
  failAi=false;holdAi=true;await btn('重新辨識 DM').click();
  assert.equal(await btn('建立活動').isDisabled(),true);
  assert.equal(await field('activityName').isDisabled(),true);
  while(!releaseAi)await new Promise(resolve=>setTimeout(resolve,10));releaseAi();
  await page.locator('#aar-ai-preview').waitFor();
  assert.deepEqual(await page.locator('#aar-ai-content dt').allTextContents(),['活動名稱','活動時間原文','開始時間','結束時間','活動地點','活動說明','類型','費用']);
  assert.equal(await page.locator('#aar-ai-content img').count(),0);
  assert.equal(await field('activityName').inputValue(),'原本手動名稱');assert.equal(createCount(),beforeAi);
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:800});await page.locator('#aar-ai-preview').scrollIntoViewIfNeeded();
    const overflow=await page.locator('#aar-create-dialog input, #aar-create-dialog button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().right>innerWidth+1).map(n=>n.id||n.name));assert.deepEqual(overflow,[]);
    await page.screenshot({path:join(out,`ai-preview-${width}.png`),fullPage:true});
  }
  await btn('套用草稿到下方表單').click();
  assert.equal(await field('activityName').inputValue(),'AI 活動草稿');assert.equal(await field('price').inputValue(),'');
  assert.equal(await field('location').inputValue(),'台北市合成會場3樓之2');
  assert.match(await field('description').inputValue(),/DM 活動時間原文：2026\/10\/01 上午10:00–12:00/);
  await btn('建立活動').click();assert.equal(createCount(),beforeAi);
  await field('price').fill('350');await field('aiReviewed').check();
  await field('location').fill('台北市人工確認會場5樓');assert.equal(await field('aiReviewed').isChecked(),false);
  await field('aiReviewed').check();
  await field('activityName').fill('人工確認的 AI 活動');assert.equal(await field('aiReviewed').isChecked(),false);
  await btn('建立活動').click();assert.equal(createCount(),beforeAi);
  await field('aiReviewed').check();await btn('建立活動').click();await page.locator('#aar-create-dialog').waitFor({state:'detached'});
  assert.equal(createCount(),beforeAi+1);
  const aiCreated=calls.filter(call=>call.action==='bulkAddRegistrants').at(-1);
  assert.equal(aiCreated.payload.activityName,'人工確認的 AI 活動');assert.equal(aiCreated.payload.price,350);assert.equal(aiCreated.payload.status,'上架');
  assert.match(aiCreated.payload.description,/活動地點：台北市人工確認會場5樓/);
  assert.doesNotMatch(aiCreated.payload.description,/台北市合成會場3樓之2/);
  assert.match(aiCreated.payload.description,/DM 活動時間原文：2026\/10\/01 上午10:00–12:00/);
  // Multiple sessions: select, correct, validate, publish only the selected rows.
  multiSession=true;const beforeMultiple=createCount();
  await btn('＋新增活動').click();await field('imageFile').setInputFiles(image);
  await page.waitForFunction(()=>!document.getElementById('aar-ai-read').disabled);
  await btn('AI 讀取 DM 並整理活動資料').click();await page.locator('#aar-ai-preview').waitFor();
  assert.match(await page.locator('#aar-ai-status').textContent(),/多個場次/);
  await btn('套用草稿到下方表單').click();
  assert.equal(await field('startTime').inputValue(),'');assert.equal(await field('endTime').inputValue(),'');
  assert.match(await field('description').inputValue(),/2026\/10\/01、10\/15/);
  assert.equal(await field('seriesMode').isChecked(),true);
  assert.equal(await page.locator('#aar-slot-list [data-slot]').count(),3);
  await field('aiReviewed').check();await btn('建立活動').click();
  assert.equal(createCount(),beforeMultiple);
  await page.locator('#aar-slot-list [data-slot]').nth(2).locator('[data-slot-select]').uncheck();
  await page.locator('#aar-slot-list [data-slot]').nth(1).locator('[data-slot-field="price"]').fill('100');
  await field('aiReviewed').check();await btn('建立活動').click();await page.locator('#aar-create-dialog').waitFor({state:'detached'});
  const series=calls.filter(c=>c.action==='bulkAddRegistrants').at(-1).payload;
  assert.equal(series.isBatch,true);assert.equal(series.batches.length,2);assert.equal(series.batches[1].price,100);
  // Edit re-recognition: local file fallback, retries preserve manual input; preview never saves.
  multiSession=false;await page.evaluate(()=>editActivityFromMonitor('A'));
  await page.locator('#edit-a-name').fill('編輯中的手動標題');await page.locator('#edit-dm-file').setInputFiles(image);
  await page.getByText('DM 已就緒，按「重新辨識 DM」。',{exact:true}).waitFor();
  failAi=true;await btn('重新辨識 DM').click();await page.getByText('辨識失敗，原表單未變更，可再次按「重新辨識 DM」。',{exact:true}).waitFor();
  assert.equal(await page.locator('#edit-a-name').inputValue(),'編輯中的手動標題');
  failAi=false;await btn('重新辨識 DM').click();await page.locator('#edit-dm-preview').waitFor();
  assert.equal(await page.locator('#edit-a-name').inputValue(),'編輯中的手動標題');
  await btn('確認套用至本活動').click();assert.equal(await page.locator('#edit-a-name').inputValue(),'AI 活動草稿');
  await page.locator('#btn-save-activity').click();assert.equal(calls.filter(c=>c.action==='updateActivity').length,0);
  await page.locator('#edit-a-price').fill('100');await page.locator('#edit-dm-reviewed').check();
  assert.equal(await page.evaluate(()=>AdminActivityRegistration.canSaveEditDm()),true);
  for(const width of [320,390,1440]) {await page.setViewportSize({width,height:800});await page.locator('#edit-dm-preview').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#edit-a-ai').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:join(out,`edit-dm-${width}.png`)});}
  holdAi=true;releaseAi=null;await btn('重新辨識 DM').click();
  while(!releaseAi)await new Promise(resolve=>setTimeout(resolve,10));
  await page.evaluate(()=>{closeActivityEditModal();editActivityFromMonitor('B');});releaseAi();await page.waitForTimeout(150);
  assert.equal(await page.locator('#edit-a-name').inputValue(),'小型讀書會');assert.equal(await page.locator('#edit-dm-preview').isVisible(),false);
  await page.evaluate(()=>closeActivityEditModal());
  // The existing activity and its six slots are one admin item, one URL, one multiselect form.
  multiSession=true;const beforeEditSeries=createCount();
  const root=activities.find(a=>a['活動ID']==='A');root.isBatch=true;
  const slots=Array.from({length:6},(_,i)=>({'活動ID':`A_B0${i+1}`,seriesId:'A',batchName:`第${i+1}梯次`,'活動名稱':`秋日交流活動｜第${i+1}梯次`,'歸屬網':'admin','開始時間':`2026-10-${String(7+i).padStart(2,'0')} 10:00`,'金額':100,'狀態':'上架'}));
  root.batches=slots;
  const slotsBefore=JSON.stringify(slots),rowsBefore=JSON.stringify(rows);
  await btn('重新整理活動').click();await page.getByText('同一張報名表 · 6 個梯次',{exact:true}).waitFor();
  assert.equal(await page.locator('[data-registrants^="A_B"]').count(),0);
  assert.equal(await page.locator('[data-registrants="A"]').count(),1);
  await page.locator('#aar-activity-query').fill('第6梯次');
  assert.equal(await page.locator('[data-registrants]').count(),1);
  await page.locator('#aar-activity-query').fill('');
  const formSummary=page.getByText('同一張報名表 · 6 個梯次',{exact:true});
  await formSummary.click();
  assert.equal(await formSummary.locator('..').locator('li').count(),6);
  await page.waitForTimeout(3500); // Let preceding fixture toasts clear before layout screenshots.
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:800});
    await formSummary.scrollIntoViewIfNeeded();
    await page.screenshot({path:join(out,`single-form-${width}.png`)});
  }
  await openA();assert.equal(await page.locator('#aar-roster-body tr').count(),rows.length);
  await btn('← 返回活動列表').click();
  await page.evaluate(()=>editActivityFromMonitor('A'));
  await page.waitForFunction(()=>!document.getElementById('edit-a-link-copy').disabled);
  assert.equal(await page.locator('#edit-a-registration-link').inputValue(),shortUrl);
  await page.locator('#edit-a-image-file').setInputFiles(image);
  await page.waitForFunction(()=>document.getElementById('edit-a-image').value==='https://localhost/fixture-poster.png');
  await btn('重新辨識 DM').click();await page.locator('#edit-dm-preview').waitFor();
  assert.equal(await page.locator('#edit-dm-slot-picker').isVisible(),false);
  assert.match(await page.locator('#edit-dm-status').textContent(),/原有梯次、報名網址及報名紀錄全部保留/);
  await btn('確認套用至本活動').click();
  assert.equal(await page.locator('#edit-a-start').inputValue(),root['開始時間']);
  await page.locator('#edit-dm-reviewed').check();await page.locator('#btn-save-activity').click();
  await page.waitForFunction(()=>document.getElementById('modal-activity-edit').classList.contains('hidden'));
  await page.getByText('同一張報名表 · 6 個梯次',{exact:true}).waitFor();
  assert.equal(createCount(),beforeEditSeries);assert.equal(calls.filter(c=>c.action==='updateActivity').length,1);
  assert.equal(calls.find(c=>c.action==='updateActivity').payload.data['宣傳圖'],'https://localhost/fixture-poster.png');
  assert.equal(JSON.stringify(slots),slotsBefore);assert.equal(JSON.stringify(rows),rowsBefore);
  // Mount the actual public selector: six checkboxes on ONE form, select two slots together.
  await page.addScriptTag({content:readFileSync(new URL('../../js/modules/activity-batches.js',import.meta.url),'utf8')});
  const chosen=await page.evaluate(async({root,slots})=>{
    const host=document.createElement('div');host.id='activity-batch-choices';document.body.append(host);
    await ActivityBatches.mount({...root,batches:slots},host);
    const choices=host.querySelectorAll('input[type="checkbox"]');
    if(choices.length!==6)throw Error('Expected all six slots on one form');
    choices[0].checked=true;choices[5].checked=true;
    const ids=ActivityBatches.selection(root);host.remove();return ids;
  },{root,slots});
  assert.deepEqual(chosen,['A_B01','A_B06']);
  // Empty AI candidates never become a dead-end or invented dates; manual rows remain available.
  root.isBatch=false;delete root.batches;activities.unshift(...slots.toReversed());await btn('重新整理活動').click();
  await page.locator('[data-registrants="A_B01"]').waitFor();
  omitSessionRows=true;await page.evaluate(()=>editActivityFromMonitor('A'));
  await page.locator('#edit-a-image').fill('http://localhost/fixture-poster.png');
  await btn('重新辨識 DM').click();await page.locator('#edit-dm-preview').waitFor();
  assert.match(await page.locator('#edit-dm-action-status').textContent(),/未取得可用梯次/);
  await btn('確認套用至本活動').click();assert.match(await page.locator('#edit-dm-action-status').textContent(),/僅可套用一個時段/);
  await btn('＋新增梯次').click();assert.equal(await page.locator('#edit-dm-slots [data-slot]').count(),1);
  await btn('確認套用至本活動').click();assert.equal(await page.locator('#edit-a-start').inputValue(),'');
  assert.match(await page.locator('#edit-dm-action-status').textContent(),/草稿已套用/);
  assert.equal(await page.evaluate(()=>AdminActivityRegistration.canSaveEditDm()),false);
  await page.locator('#edit-a-image').fill('https://localhost/another-poster.png');
  await btn('確認套用至本活動').click();assert.match(await page.locator('#edit-dm-action-status').textContent(),/宣傳圖已變更/);
  assert.equal(await page.locator('#aar-create-dialog').count(),0);
  await page.evaluate(()=>closeActivityEditModal());
  assert.equal(createCount(),beforeEditSeries);
  await openA();
  await btn('掃描活動／課程核銷 QR').click();
  await page.locator('.activity-checkin-dialog summary').click();
  const checkinUrl='https://liff.line.me/1660923784-vViMTZ1y?verifyCheckin=r1&activityId=A';
  await page.locator('.activity-checkin-dialog [data-ticket]').fill(checkinUrl);
  await btn('核銷貼上的 QR').click();
  await page.locator('.activity-checkin-dialog [data-status]').filter({hasText:/核銷成功|已核銷/}).waitFor();
  await page.locator('[data-row="r1"][data-mutation="toggleCheckin"]').filter({hasText:'取消簽到'}).waitFor();
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:800});
    const overflow=await page.locator('.activity-checkin-dialog button,.activity-checkin-dialog input').evaluateAll(nodes=>nodes.filter(n=>{const b=n.getBoundingClientRect();return b.width&&(b.x<0||b.right>innerWidth+1);}).map(n=>n.textContent));
    assert.deepEqual(overflow,[]);await page.screenshot({path:join(out,`activity-checkin-scanner-${width}.png`)});
  }
  await btn('‹ 返回名單').click();await page.locator('.activity-checkin-dialog').waitFor({state:'detached'});
  await btn('掃描活動／課程核銷 QR').click();await page.locator('.activity-checkin-dialog summary').click();
  await page.locator('.activity-checkin-dialog [data-ticket]').fill('https://evil.invalid/?verifyCheckin=r1');
  const scans=calls.filter(c=>c.action==='redeemActivityCheckin').length;
  await btn('核銷貼上的 QR').click();await page.locator('[data-status]').filter({hasText:'不是本平台'}).waitFor();
  assert.equal(calls.filter(c=>c.action==='redeemActivityCheckin').length,scans);
  await page.getByRole('button',{name:'關閉核銷掃描器',exact:true}).click();
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log(JSON.stringify({passed:true,widths:[320,390,1440],apiActions:[...new Set(calls.map(call=>call.action))],realDataWrites:0,screenshots:out}));
} catch(error) {
  console.error(JSON.stringify({errors,blocked:[...new Set(blocked)].slice(0,20),actions:calls.map(call=>call.action)}));
  throw error;
} finally { await browser.close(); }
