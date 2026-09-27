// Full admin shell, synthetic LINE/auth/activity records; production API requests are blocked.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
await page.route('**/*', async route => {
  const req=route.request(),url=new URL(req.url());
  if(url.hostname==='cdn.tailwindcss.com') return route.fulfill({contentType:'text/javascript',body:tailwind});
  if(url.hostname==='static.line-scdn.net') return route.fulfill({contentType:'text/javascript',body:`window.liff={init:async()=>{},isLoggedIn:()=>true,isInClient:()=>false,getProfile:async()=>({userId:'synthetic-manager',displayName:'合成測試管理員'}),getAccessToken:()=>'synthetic-token'};`});
  if(req.method()==='POST' && url.hostname==='line-engine.fangwl591021.workers.dev') {
    const {action,payload}=req.postDataJSON(); calls.push({action,payload});
    assert.equal(payload.lineAccessToken,'synthetic-token');
    let result;
    if(action==='checkUser')result={info:{role:'store',networkId:'admin'}};
    else if(action==='getAllActivities')result=failList?null:activities;
    else if(action==='uploadImageToR2')result=failUpload?null:{url:'https://localhost/fixture-poster.png'};
    else if(action==='extractActivityDmDraft') {
      assert.ok(payload.base64Image.startsWith('data:image/png;base64,'));
      if(holdAi){holdAi=false;await new Promise(resolve=>{releaseAi=resolve;});}
      result=failAi?null:{provider:'OpenAI',draft:{activityName:'AI 活動草稿',activityType:'講座',location:'台北市合成會場',startTime:'2026-10-01T10:00',endTime:'2026-10-01T12:00',price:null,description:'活動亮點\n• <img src=x onerror=alert(1)>\n• 合成活動內容',confidenceNote:'費用不明，請人工確認。'}};
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
    } else if(action==='confirmPayment') { rows.find(row=>row.rowId===payload.rowId)['付款狀態']='已付款';result={rowId:payload.rowId}; }
    else { blocked.push(action); return route.abort(); }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(result===null?{success:false,error:'合成失敗'}:{success:true,data:result})});
  }
  if(req.resourceType()==='image')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  if(url.hostname==='localhost') {
    if(url.pathname==='/admin.html')return route.fulfill({contentType:'text/html',body:html});
    if(['/js/modules/admin-activity-registration.js','/css/admin-activity-registration.css'].includes(url.pathname)) return route.fulfill({contentType:url.pathname.endsWith('.js')?'text/javascript':'text/css',body:readFileSync(new URL('../../'+url.pathname.slice(1),import.meta.url),'utf8')});
    // Other admin modules are unrelated; do not initialize them in this fixture.
    return route.fulfill({contentType:'text/javascript',body:''});
  }
  if(/fonts\.(googleapis|gstatic)\.com|cdnjs\.cloudflare\.com/.test(url.hostname))return route.fulfill({body:''});
  blocked.push(url.href);return route.abort();
});
const btn=name=>page.getByRole('button',{name,exact:true});
const openA=async()=>{await page.locator('[data-registrants="A"]').click();await page.getByText('測試會員甲',{exact:true}).waitFor();};
try {
  await page.goto('http://localhost/admin.html?tab=activities',{waitUntil:'domcontentloaded'});
  await page.locator('#loading-screen').waitFor({state:'detached'});
  await page.locator('[data-registrants="A"]').waitFor();
  assert.equal(await page.locator('#page-title').textContent(),'活動報名管理');
  assert.equal(await page.locator('[data-registrants="A"]').textContent(),'查看報名名單');
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
  failAi=false;holdAi=true;await btn('AI 讀取 DM 並整理活動資料').click();
  assert.equal(await btn('建立活動').isDisabled(),true);
  assert.equal(await field('activityName').isDisabled(),true);
  while(!releaseAi)await new Promise(resolve=>setTimeout(resolve,10));releaseAi();
  await page.locator('#aar-ai-preview').waitFor();
  assert.equal(await page.locator('#aar-ai-content img').count(),0);
  assert.equal(await field('activityName').inputValue(),'原本手動名稱');assert.equal(createCount(),beforeAi);
  for(const width of [320,390,1440]) {
    await page.setViewportSize({width,height:800});await page.locator('#aar-ai-preview').scrollIntoViewIfNeeded();
    const overflow=await page.locator('#aar-create-dialog input, #aar-create-dialog button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width&&n.getBoundingClientRect().right>innerWidth+1).map(n=>n.id||n.name));assert.deepEqual(overflow,[]);
    await page.screenshot({path:join(out,`ai-preview-${width}.png`),fullPage:true});
  }
  await btn('套用草稿到下方表單').click();
  assert.equal(await field('activityName').inputValue(),'AI 活動草稿');assert.equal(await field('price').inputValue(),'');
  assert.match(await field('description').inputValue(),/活動地點：台北市合成會場/);
  await btn('建立活動').click();assert.equal(createCount(),beforeAi);
  await field('price').fill('350');await field('aiReviewed').check();
  await field('activityName').fill('人工確認的 AI 活動');assert.equal(await field('aiReviewed').isChecked(),false);
  await btn('建立活動').click();assert.equal(createCount(),beforeAi);
  await field('aiReviewed').check();await btn('建立活動').click();await page.locator('#aar-create-dialog').waitFor({state:'detached'});
  assert.equal(createCount(),beforeAi+1);
  const aiCreated=calls.filter(call=>call.action==='bulkAddRegistrants').at(-1);
  assert.equal(aiCreated.payload.activityName,'人工確認的 AI 活動');assert.equal(aiCreated.payload.price,350);assert.equal(aiCreated.payload.status,'上架');
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  console.log(JSON.stringify({passed:true,widths:[320,390,1440],apiActions:[...new Set(calls.map(call=>call.action))],realDataWrites:0,screenshots:out}));
} catch(error) {
  console.error(JSON.stringify({errors,blocked:[...new Set(blocked)].slice(0,20),actions:calls.map(call=>call.action)}));
  throw error;
} finally { await browser.close(); }
