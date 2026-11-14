// Real admin shell with synthetic session and intercepted API; no live writes.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const files=new Set(['/js/modules/admin-activity-registration.js','/js/modules/admin-bonus-performance-date.mjs','/js/modules/admin-bonus-order-sequence.mjs']);
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}),origin='https://bonus-date-test.invalid';
  let reads=0,writes=0,mode='ok',data=null,version=0,resolvePost,resolveCandidate,sequenceWrites=0,sequenceMode='ok',sequenceSaved=null,sequenceBody=null;
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin){
    if(url.pathname==='/admin.html'){
     const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
     const marker='document.addEventListener("DOMContentLoaded", initAdmin);';
     assert.equal(html.split(marker).length,2);
     return route.fulfill({contentType:'text/html; charset=utf-8',body:html.replace(marker,'/* synthetic session only */')});
    }
    if(files.has(url.pathname))return route.fulfill({contentType:'text/javascript; charset=utf-8',body:fs.readFileSync(path.join(root,url.pathname.slice(1)))});
    return route.abort();
   }
   if(url.hostname==='line-engine.fangwl591021.workers.dev' && url.pathname==='/v1/admin/bonus-order-sequence'){
    assert.equal(req.headers().authorization,'Bearer synthetic-a');
    const item={orderId:'ORD-synthetic-1',buyerName:'合成會員',recruiterUid:'synthetic-recruiter',performanceDate:{precision:'month',value:'2026-10'},hasSnapshot:true,reviewed:false,signedApplicationVerified:false,confirmed:false};
    const item2={...item,orderId:'ORD-synthetic-2',buyerName:'合成會員二',performanceDate:null};
    if(req.method()==='GET'){
     if(url.searchParams.has('batches')){const next=url.searchParams.has('after');return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,batches:!next&&sequenceSaved?[{...sequenceSaved,recordedAt:'2026-11-14'}]:[],hasMore:!next,nextCursor:next?'':'synthetic-cursor'})});}
     if(url.searchParams.has('batch_id'))return route.fulfill({contentType:'application/json',body:JSON.stringify(sequenceSaved)});
     if(sequenceMode==='pending-read')await new Promise(resolve=>{resolveCandidate=resolve;});
     const next=url.searchParams.has('after');return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,items:[next?item2:item],hasMore:!next,nextCursor:next?'':'ORD-synthetic-1',completenessProven:false})});
    }
    sequenceWrites++;const input=req.postDataJSON();assert.deepEqual(input.orderIds,['ORD-synthetic-2','ORD-synthetic-1']);assert.equal(input.confirmedComplete,true);assert.equal(input.evidenceRef,'合成核對依據');
    if(sequenceMode==='conflict')return route.fulfill({status:409,contentType:'application/json',body:'{"success":false}'});
    if(sequenceMode==='disabled'){sequenceBody=input;return route.fulfill({status:503,contentType:'application/json',body:'{"success":false,"code":"FEATURE_DISABLED","error":"業績日期與排序功能暫未開放"}'});}
    if(sequenceMode==='unknown')assert.deepEqual(input,sequenceBody,'a disabled request must keep the same key when retried');
    if(sequenceMode==='retry')assert.deepEqual(input,sequenceBody,'retry must use identical request key and payload');
    else {assert.equal(input.expectedVersion,sequenceSaved?.version||0);sequenceBody=input;sequenceSaved={success:true,batchId:input.batchId,version:input.expectedVersion+1,periodFrom:input.periodFrom,periodTo:input.periodTo,evidenceRef:input.evidenceRef,snapshotAt:'2026-11-14T00:00:00.000Z',status:'review_required',canConfirm:false,items:input.orderIds.map((id,i)=>({...([item,item2].find(it=>it.orderId===id)),position:i+1,existingAwards:[],reviewReasons:['UPLINE_HISTORY_UNVERIFIED'],proposedAwards:null}))};}
    if(sequenceMode==='unknown')return route.fulfill({status:503,contentType:'application/json',body:'{"success":false}'});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(sequenceSaved)});
   }
   if(url.hostname==='line-engine.fangwl591021.workers.dev' && url.pathname==='/v1/admin/bonus-performance-date'){
    assert.equal(req.headers().authorization,'Bearer synthetic-a');
    if(req.method()==='GET'){
     reads++;if(mode==='read-fail')return route.fulfill({status:503,contentType:'application/json',body:'{"success":false}'});
     return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,orderId:url.searchParams.get('order_id'),version,current:data?{...data,recordedAt:'2026-11-14T00:00:00Z'}:null,editable:mode!=='locked',lockReason:'已結算，無法直接調整'})});
    }
    writes++;const input=req.postDataJSON();assert.equal(input.orderId,'ORD-synthetic-1');assert.equal(input.expectedVersion,version);assert.match(input.requestKey,/^[0-9a-f-]{36}$/i);
    if(mode==='disabled')return route.fulfill({status:503,contentType:'application/json',body:'{"success":false,"code":"FEATURE_DISABLED","error":"業績日期與排序功能暫未開放"}'});
    if(input.precision==='none')assert.equal(input.value,'');else {assert.equal(input.precision,'month');assert.equal(input.value,'2026-10');}
    if(mode==='pending'){await new Promise(resolve=>{resolvePost=resolve;});}
    if(mode==='conflict')return route.fulfill({status:409,contentType:'application/json',body:'{"success":false,"error":"資料已變動"}'});
    data=input.precision==='none'?null:{precision:input.precision,value:input.value,reason:input.reason};version++;
    return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,orderId:input.orderId,version,current:data?{...data,recordedAt:'2026-11-14T00:00:00Z'}:null})});
   }
   return route.abort();
  });
  await page.addInitScript(()=>{window.syntheticToken='synthetic-a';window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.syntheticToken};});
  await page.goto(origin+'/admin.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   adminRole='admin';adminProfile={userId:'synthetic-admin'};
   window.fetchAPI=async action=>action==='mlmListOrders'?new Promise(()=>{}):[];
   document.getElementById('nav-bonus').click();
   allBonusOrdersData=[{orderId:'ORD-synthetic-1',tenantId:'synthetic',tenantName:'合成會員',status:'paid',fee:6300,bv:3000,createdAt:'2026-11-09T00:00:00Z'}];
   bonusOrderListReady=true;renderBonusOrders();
  });
  await page.waitForSelector('[data-bonus-date-open]');
  assert.equal(reads,0,'list must not issue one request per row');
  await page.getByRole('button',{name:'查看／調整業績日期'}).click();
  await page.getByText('尚未登錄業績歸屬日期。').waitFor();
  assert.match(await page.locator('dialog').innerText(),/獎金與截止日須待成交順序核對，尚不會建立對帳/);
  assert.equal(await page.getByRole('button',{name:'撤回業績日期'}).isDisabled(),true);
  await page.locator('dialog input[name=value]').fill('2026-10');
  await page.locator('dialog textarea[name=reason]').fill('手寫資料待核');
  mode='disabled';
  await page.getByRole('button',{name:'儲存業績日期'}).click();
  await page.getByText('業績日期與排序功能暫未開放；請稍後重新讀取確認。').waitFor();
  assert.equal(await page.getByRole('button',{name:'儲存業績日期'}).isDisabled(),true);
  mode='ok';
  await page.getByRole('button',{name:'重新讀取'}).click();
  await page.getByText('已重新讀取目前紀錄；先核對上方資料，再決定是否重新儲存。').waitFor();
  await page.locator('dialog input[name=value]').fill('2026-10');
  await page.locator('dialog textarea[name=reason]').fill('手寫資料待核');
  await page.getByRole('button',{name:'儲存業績日期'}).click();
  await page.getByText('日期已登錄；獎金與截止日須待成交順序核對，尚未建立對帳。').waitFor();
  assert.equal(writes,2);
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  await page.getByRole('button',{name:'批次排序與待核預覽'}).click();
  await page.getByText(/系統無法證明歷史訂單完整/).waitFor();
  await page.getByText(/已有訂單快照.*簽署及推薦核對：待核/).waitFor();
  await page.getByRole('button',{name:'加入排序'}).click();
  await page.getByRole('button',{name:'讀取下一頁候選'}).click();
  await page.getByText(/目前候選頁已讀完/).waitFor();
  await page.getByRole('button',{name:'加入排序',exact:true}).last().click();
  await page.getByRole('button',{name:'上移'}).last().click();
  await page.getByLabel('起始月份').fill('2026-10');
  await page.getByLabel('結束月份').fill('2026-10');
  await page.getByLabel('核對依據').fill('合成核對依據');
  await page.getByRole('button',{name:'儲存排序草稿／查看待核'}).click();
  assert.equal(sequenceWrites,0,'must explicitly acknowledge completeness');
  await page.getByLabel('已人工核對完整性').check();
  await page.getByRole('button',{name:'儲存排序草稿／查看待核'}).click();
  await page.getByText('排序草稿已儲存；請查看試算或待核原因，本次未確認、未建立對帳、未核發或付款。').waitFor();
  await page.getByText('受領人、獎金金額及預估截止日：待核').first().waitFor();
  assert.equal(await page.getByText(/待核依據：上線歷史關係待核/).first().evaluate(node=>getComputedStyle(node).color),'rgb(185, 28, 28)');
  assert.equal(sequenceWrites,1);
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  await page.getByRole('button',{name:'批次排序與待核預覽'}).click();
  await page.getByRole('button',{name:'讀取既有草稿'}).click();
  await page.getByText(/草稿尚有下一頁/).waitFor();
  await page.getByRole('button',{name:'讀取下一頁草稿'}).click();
  await page.getByText('草稿僅供核對，尚未建立對帳。').waitFor();
  await page.getByRole('button',{name:new RegExp(sequenceSaved.batchId)}).click();
  await page.getByText('已讀取草稿；重新核對後可儲存變更。').waitFor();
  assert.equal(await page.getByLabel('已人工核對完整性').isChecked(),false);
  await page.getByLabel('已人工核對完整性').check();
  sequenceMode='conflict';
  await page.getByRole('button',{name:'儲存排序草稿／查看待核'}).click();
  await page.getByText('草稿或權限已變動，請重新讀取草稿並核對。').waitFor();
  await page.getByRole('button',{name:'儲存排序草稿／查看待核'}).click();
  await page.getByText('請先重新讀取草稿並核對，或關閉後建立新草稿。').waitFor();
  assert.equal(sequenceWrites,2,'409 must require reload before another write');
  await page.getByRole('button',{name:'讀取既有草稿'}).click();
  await page.getByRole('button',{name:new RegExp(sequenceSaved.batchId)}).click();
  await page.getByText('已讀取草稿；重新核對後可儲存變更。').waitFor();
  await page.getByLabel('已人工核對完整性').check();
  sequenceMode='disabled';
  await page.getByRole('button',{name:'儲存排序草稿／查看待核'}).click();
  await page.getByText(/業績日期與排序功能暫未開放（批次/).waitFor();
  assert.equal(await page.getByLabel('核對依據').isDisabled(),true);
  sequenceMode='unknown';
  await page.getByRole('button',{name:'儲存排序草稿／查看待核'}).click();
  await page.getByText(/儲存結果尚未確認/).waitFor();
  assert.equal(await page.getByLabel('核對依據').isDisabled(),true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   adminRole='admin';adminProfile={userId:'synthetic-admin'};
   window.fetchAPI=async action=>action==='mlmListOrders'?new Promise(()=>{}):[];
   document.getElementById('nav-bonus').click();
   allBonusOrdersData=[{orderId:'ORD-synthetic-1',tenantId:'synthetic',tenantName:'合成會員',status:'paid',fee:6300,bv:3000,createdAt:'2026-11-09T00:00:00Z'}];
   bonusOrderListReady=true;renderBonusOrders();
  });
  await page.getByRole('button',{name:'批次排序與待核預覽'}).click();
  await page.getByText(/前次送出結果尚未確認/).waitFor();
  await page.getByText(/ORD-synthetic-2（等待原送出結果確認）/).waitFor();
  sequenceMode='retry';
  await page.getByRole('button',{name:'儲存排序草稿／查看待核'}).click();
  await page.getByText('排序草稿已儲存；請查看試算或待核原因，本次未確認、未建立對帳、未核發或付款。').waitFor();
  sequenceSaved={...sequenceSaved,status:'preview',calculation:{status:'preview'},canConfirm:false,qualificationResetFrom:'2026-10',items:sequenceSaved.items.map((it,i)=>({...it,reviewReasons:[],ordinal:i+1,proposedAwards:[{beneficiaryUid:'synthetic-beneficiary',bonusType:'direct',amount:3000}],proposedStatementDueAt:'2026-11-01T16:00:00.000Z'}))};
  await page.getByRole('button',{name:'讀取既有草稿'}).click();
  await page.getByRole('button',{name:new RegExp(sequenceSaved.batchId)}).click();
  await page.getByText('獎金試算預覽（本次未確認、未建立對帳、未核發或付款）').waitFor();
  await page.getByText(/資料快照時間：2026\/11\/14 08:00:00（台北時間）/).waitFor();
  await page.getByText(/試算：受領人 synthetic-beneficiary.*金額 3,000/).first().waitFor();
  await page.getByText(/預估對帳截止：2026\/11\/02 00:00/).first().waitFor();
  sequenceSaved.items[0].proposedAwards[0].amount=-1;
  await page.getByRole('button',{name:new RegExp(sequenceSaved.batchId)}).click();
  await page.getByText('受領人、獎金金額及預估截止日：待核').first().waitFor();
  sequenceSaved.items[0].proposedAwards[0].amount=3000;
  sequenceSaved.status='review_required';
  sequenceSaved.items[0].reviewReasons=['RECRUITER_QUALIFICATION_UNVERIFIED','FUTURE_NEW_REASON'];
  await page.getByRole('button',{name:new RegExp(sequenceSaved.batchId)}).click();
  await page.getByText('排序草稿預覽：資格、獎金與截止日待核').waitFor();
  assert.equal(await page.getByText(/試算：受領人 synthetic-beneficiary/).count(),0,'review-required responses must never expose speculative numbers as preview');
  const explanation=page.getByText(/推薦人資格待核、其他資料待核，請聯繫管理員核對（代碼：FUTURE_NEW_REASON）/);
  assert.equal(await explanation.evaluate(node=>getComputedStyle(node).color),'rgb(185, 28, 28)');
  sequenceSaved.status='preview';sequenceSaved.items[0].reviewReasons=[];sequenceSaved.snapshotAt=null;
  await page.getByRole('button',{name:new RegExp(sequenceSaved.batchId)}).click();
  await page.getByText('資料快照時間無法確認，請重新讀取。').waitFor();
  assert.equal(await page.getByText(/試算：受領人 synthetic-beneficiary/).count(),0,'missing snapshot time must suppress preview numbers');
  await page.evaluate(()=>{window.syntheticToken='synthetic-b';});
  await page.waitForFunction(()=>!document.querySelector('dialog.bonus-sequence'));
  await page.evaluate(()=>{window.syntheticToken='synthetic-a';});
  sequenceMode='pending-read';
  const pendingRequest=page.waitForRequest(req=>req.url().includes('/v1/admin/bonus-order-sequence?candidates=1'));
  await page.getByRole('button',{name:'批次排序與待核預覽'}).click();
  await pendingRequest;
  for(let i=0;i<100&&!resolveCandidate;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(typeof resolveCandidate,'function');
  await page.evaluate(()=>{window.syntheticToken='synthetic-b';});
  await page.waitForFunction(()=>!document.querySelector('dialog.bonus-sequence'));
  resolveCandidate();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('dialog.bonus-sequence').count(),0,'late old-session response must not reopen data');
  await page.evaluate(()=>{window.syntheticToken='synthetic-a';});
  await page.waitForTimeout(1200);
  mode='locked';
  await page.getByRole('button',{name:'查看／調整業績日期'}).click();
  await page.getByText('已結算，無法直接調整').waitFor();
  assert.equal(await page.getByRole('button',{name:'儲存業績日期'}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'撤回業績日期'}).isDisabled(),true);
  await page.getByRole('button',{name:'關閉',exact:true}).click();
  mode='read-fail';
  await page.getByRole('button',{name:'查看／調整業績日期'}).click();
  await page.getByText('無法讀取日期，請重新讀取。').waitFor();
  assert.equal(await page.getByRole('button',{name:'儲存業績日期'}).isDisabled(),true);
  mode='ok';
  await page.getByRole('button',{name:'重新讀取'}).click();
  await page.getByText(/目前登錄：2026-10/).waitFor();
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'撤回業績日期'}).click();
  assert.equal(writes,2,'cancelled withdrawal must not write');
  mode='conflict';
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'撤回業績日期'}).click();
  await page.getByText('資料已變動，請重新讀取後再確認。').waitFor();
  assert.equal(await page.getByRole('button',{name:'撤回業績日期'}).isDisabled(),true);
  mode='ok';
  await page.getByRole('button',{name:'重新讀取'}).click();
  await page.getByText('已重新讀取目前紀錄；先核對上方資料，再決定是否重新儲存。').waitFor();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'撤回業績日期'}).click();
  await page.getByText('業績日期已撤回；獎金與截止日仍須依資料核對。').waitFor();
  assert.equal(writes,4);
  assert.equal(version,2,'withdrawal preserves increasing version');
  assert.equal(await page.getByRole('button',{name:'撤回業績日期'}).isDisabled(),true);
  await page.evaluate(()=>{window.syntheticToken='synthetic-b';});
  await page.waitForFunction(()=>!document.querySelector('dialog.bonus-date-dialog'));
  await page.evaluate(()=>{adminRole='store';window.syntheticToken='synthetic-a';renderBonusOrders();});
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('[data-bonus-date-open]').count(),0,'non-admin must not see editor');
  console.log('PASS real admin shell: month precision, reconciliation pending, explicit withdrawal, locks and user-switch isolation');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
