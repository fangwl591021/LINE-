import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../js/modules/admin-activity-registration.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
const context = { window: {}, URL };
vm.runInNewContext(source, context);
const api = context.window.AdminActivityRegistration;
const plain = value => JSON.parse(JSON.stringify(value));

test('normalizes actual D1 and legacy phone/payment/checkin fields including false', () => {
  const a = api.registrant({rowId:'r','姓名':'甲','手機':'0912345678','簽到':false,checkedIn:true,'付款狀態':'已付款','金額':100});
  assert.equal(a.checked, false); assert.equal(a.paid, true); assert.equal(a.phone, '0912345678');
  const b = api.registrant({registrationId:'b',name:'乙',phone:'0212345678',checkinStatus:'TRUE','繳費狀態':'已繳費',amount:200});
  assert.equal(b.checked, true); assert.equal(b.paid, true); assert.equal(b.id, 'b');
  assert.equal(api.registrant({'簽到':'1'}).checked, true);
});
test('cancelled records never count as active, checked in or unpaid', () => {
  const rows = [api.registrant({checkedIn:true,amount:100,paymentStatus:'已付款'}), api.registrant({amount:200}),
    api.registrant({status:'cancelled',checkedIn:true,amount:500}), api.registrant({'報名狀態':'已取消'})];
  assert.deepEqual(plain(api.summary(rows)), {active:2,checked:1,unpaid:1,cancelled:2});
});
test('activity filters compose name/id, actual network, date and publication status', () => {
  const rows = [{activityId:'A',name:'教育課程',networkId:'網1',userId:'作者2',status:'上架',startTime:'2026-09-28T10:00'},
    {activityId:'B',name:'課程',networkId:'網2',status:'下架',startTime:'2026-10-01 10:00'}];
  assert.equal(api.filterActivities(rows,{query:'課程',network:'網1',status:'上架',from:'2026-09-28',to:'2026-09-28'}).length,1);
  assert.equal(api.filterActivities(rows,{network:'作者2'}).length,0);
  assert.equal(api.filterActivities(rows,{query:'b',status:'下架'}).length,1);
  assert.equal(api.filterActivities(rows,{from:'2026-10-02',to:'2026-09-28'}).length,0);
});
test('roster filters compose search, checkin and payment without including cancellations', () => {
  const rows = [api.registrant({name:'TONY',phone:'09123',amount:100}), api.registrant({name:'Tony',amount:100,status:'cancelled'}),
    api.registrant({name:'Amy',checkedIn:true,paymentStatus:'已繳費',amount:100}),api.registrant({name:'Free'})];
  assert.equal(api.filterRegistrants(rows,{query:'tony',state:'unchecked',payment:'unpaid'}).length,1);
  assert.equal(api.filterRegistrants(rows,{query:'091',state:'active'}).length,1);
  assert.equal(api.filterRegistrants(rows,{state:'checked',payment:'paid'}).length,1);
  assert.equal(api.filterRegistrants(rows,{state:'cancelled'}).length,1);
  assert.equal(api.filterRegistrants(rows,{payment:'free'}).length,1);
});
test('missing counts are unknown, never fabricated zero; real zero retained', () => {
  assert.equal(api.countFor({activityId:'x'}),null);
  assert.equal(api.countFor({activityId:'x',registrantCount:0}),0);
  assert.equal(api.countFor({activityId:'x','報名人數':'9'}),9);
  assert.equal(api.countFor({activityId:'x',registrantCount:'oops'}),null);
});
test('list failures and empty lists remain distinct', () => {
  for(const value of [null,undefined,{error:'failed'},{success:false,data:[]}]) assert.equal(api.list(value),null);
  assert.deepEqual(plain(api.list([])),[]);
  assert.deepEqual(plain(api.list({data:[]})),[]);
  assert.equal(api.list({registrations:[{rowId:'r'}]}).length,1);
});
test('CSV is UTF8 BOM, escapes quotes/formulas, preserves telephone text and includes cancellation', () => {
  const value = api.csv('課程', [api.registrant({name:'=SUM(1,2)',phone:'0912345678',identity:'"會員"',status:'cancelled'})]);
  assert.ok(value.startsWith('\ufeff'));
  assert.ok(value.includes('"\'=SUM(1,2)"'));
  assert.ok(value.includes('"\'0912345678"'));
  assert.ok(value.includes('""會員""'));
  assert.ok(value.includes('已取消'));
  assert.ok(api.csv('@event', []).includes('活動名稱'));
});
test('admin uses authenticated existing APIs, no public fallback, new tables or mobile module import', () => {
  const loader = html.slice(html.indexOf('    async function loadActivities()'),html.indexOf('    function normalizeListResponse'));
  assert.match(loader,/AdminActivityRegistration\.load/);
  assert.doesNotMatch(loader,/getPublicActivities/);
  assert.match(source,/fetchAPI\('getAllActivities'/);
  assert.match(source,/fetchAPI\('getActivityRegistrants', \{ activityId: id \}/);
  assert.match(source,/request !== state\.rosterRequest \|\| id !== state\.selected/);
  assert.match(source,/state\.busy \|\| !\['toggleCheckin','confirmPayment'\]/);
  assert.match(source,/row\.cancelled/);
  assert.match(html,/js\/modules\/admin-activity-registration\.js\?v=7/);
  assert.match(html,/get\('tab'\) === 'activities' \? 'activities' : 'users'/);
  assert.match(html,/data-registrants=/);
  assert.doesNotMatch(source,/localStorage|ACTMASTER_DB|CREATE TABLE/);
  assert.match(source,/fetch\(parsed.href,\{credentials:'omit',signal:controller.signal\}\)/);
});

test('creation maps the mobile payload, keeps a stable id, creates no registrations or points', () => {
  const data=api.creationPayload({activityName:' 新活動 ',activityType:'講座',startTime:'2026-09-28T10:00',endTime:'2026-09-28T12:00',price:'100',description:'活動地點',imageUrl:'https://example.com/poster.png',imageRatio:'2:3',status:'下架'},'ACT_unique');
  assert.equal(data.activityId,'ACT_unique');assert.equal(data.activityName,'新活動');
  assert.equal(data.startTime,'2026-09-28 10:00');assert.equal(data.endTime,'2026-09-28 12:00');
  assert.equal(data.feeType,'收費');assert.equal(data.price,100);assert.equal(data.status,'下架');
  assert.equal(data.imageRatio,'2:3');assert.equal(data.isBatch,false);assert.deepEqual(plain(data.names),[]);
  for(const key of ['userId','networkId','rewardPoints','points'])assert.equal(key in data,false);
});
test('creation accepts free published events and validates name, dates, integer price and image protocol', () => {
  const base={activityName:'活動',startTime:'2026-09-28T10:00',price:'0'};
  const result=api.creationPayload(base,'ACT_unique');assert.equal(result.feeType,'免費');assert.equal(result.status,'上架');
  for(const changes of [{activityName:' '},{startTime:''},{endTime:'2026-09-28T09:00'},{endTime:'bad'},{price:-1},{price:'1.5'},{price:''},{price:'NaN'},{imageUrl:'javascript:alert(1)'},{imageUrl:'data:image/png;base64,AA'},{imageUrl:'https://name:pass@example.com/img'}]){
    assert.throws(()=>api.creationPayload({...base,...changes},'ACT_unique'));
  }
});

test('core field form retains venue and raw schedule in the existing description only',()=>{
  const body=api.activityDescription('自我介紹 60 秒；限 20 人。','','2026/10/7、10/21 下午2點');
  const values={activityName:'雙週會',startTime:'2026-10-07T14:00',price:'200',location:'板橋文化路486號3樓之2',description:body};
  const payload=api.creationPayload(values,'ACT_core');
  assert.equal(payload.description,'活動地點：板橋文化路486號3樓之2\n\nDM 活動時間原文：2026/10/7、10/21 下午2點\n\n自我介紹 60 秒；限 20 人。');
  for(const field of ['location','scheduleText','timeStatus'])assert.equal(field in payload,false);
  const existing='活動地點：板橋\nDM 活動時間原文：2026/10/7 14:00\n原文內容';
  assert.equal(api.activityDescription(existing,'板橋','2026/10/7 14:00'),existing);
  assert.throws(()=>api.creationPayload({...values,description:'字'.repeat(10000)},'ACT_core'),/10000/);
  assert.match(source,/name="location" maxlength="300"/);
  assert.match(source,/\['activityName','startTime','endTime','location','description'\]/);
});
test('create UI uses mobile API and keeps pending snapshot and busy guard; existing edit flow is untouched', () => {
  assert.match(source,/data-aar="create">＋新增活動/);
  assert.match(source,/fetchAPI\('bulkAddRegistrants',structuredClone\(creation\.payload\)/);
  assert.match(source,/creation\.payload \|\|= creationPayload/);
  assert.match(source,/if \(!creation \|\| creation\.busy/);
  assert.match(source,/if \(!creation\.payload\) \{ \$\('aar-create-dialog'\)\.remove\(\); creation = null/);
  assert.match(source,/creation\.uploadFailed/);
  assert.match(source,/form\.reportValidity\(\)/);
  assert.doesNotMatch(source,/fetchAPI\(['"]updateActivity/);
});

const shortUrl = 'https://line-engine.fangwl591021.workers.dev/a/AbCd0123456789_-';
const published = {activityId:'A',networkId:'branch',status:'上架'};
function editFixture(responder = async () => ({url:shortUrl})) {
  const elements = new Map(), calls = [], copied = [], toasts = [];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {value:id === 'edit-a-id' ? 'A' : '',textContent:'',hidden:false,
      disabled:false, attrs:{}, classList:{contains:() => false},
      setAttribute(name,value) {this.attrs[name]=value;}, removeAttribute(name) {delete this.attrs[name];delete this[name];},
      focus() {this.focused=true;}, select() {this.selected=true;}});
    return elements.get(id);
  };
  const context = {URL,adminProfile:{userId:'member-1'},WORKER_URL:'https://line-engine.fangwl591021.workers.dev/',
    window:{isSecureContext:true,liff:{isLoggedIn:()=>true,getAccessToken:()=> 'token-1'}},
    document:{getElementById:element,execCommand:()=>true},
    navigator:{clipboard:{writeText:async value=>copied.push(value)}},showToast:value=>toasts.push(value),
    fetchAPI:async (...args)=>{calls.push(args);return responder(...args);}};
  vm.runInNewContext(source,context);
  return {context,api:context.window.AdminActivityRegistration,element,calls,copied,toasts};
}

test('edit link uses the authenticated API and persisted activity network, copies the short URL', async () => {
  for (const result of [{url:shortUrl},{success:true,data:{url:shortUrl}}]) {
    const f=editFixture(async()=>result);
    await f.api.loadEditLink(published);
    assert.deepEqual(plain(f.calls),[['createActivityShareLink',{activityId:'A',networkId:'branch'},{silent:true,timeoutMs:12000}]]);
    assert.equal(f.element('edit-a-registration-link').value,shortUrl);
    assert.equal(f.element('edit-a-link-open').href,shortUrl);
    assert.equal(f.element('edit-a-link-copy').disabled,false);
    assert.equal(f.api.canUseEditLink(),true);
    await f.api.copyEditLink();assert.deepEqual(f.copied,[shortUrl]);
    assert.deepEqual(f.toasts,['報名連結已複製']);
    assert.equal(f.element('edit-a-link-retry').hidden,true);
    f.api.clearEditLink();assert.equal(f.api.canUseEditLink(),false);
    assert.equal(f.element('edit-a-registration-link').value,'');
    assert.equal(f.element('edit-a-link-open').href,undefined);
    assert.equal(f.element('edit-a-link-copy').disabled,true);
  }
});

test('unpublished and unauthenticated edits never request or offer a registration link', async () => {
  const f=editFixture();
  for (const status of ['下架','draft','']) {
    await f.api.loadEditLink({...published,status});assert.equal(f.calls.length,0);
    assert.equal(f.api.canUseEditLink(),false);assert.match(f.element('edit-a-link-status').textContent,/尚未上架/);
  }
  f.context.window.liff.isLoggedIn=()=>false;
  await f.api.loadEditLink(published);assert.equal(f.calls.length,0);
  assert.match(f.element('edit-a-link-status').textContent,/重新登入/);
});

test('failed or unsafe edit-link responses stay disabled and allow an explicit retry', async () => {
  const invalid = [null,{success:false,url:shortUrl},{url:'https://example.com/a/AbCd0123456789_-'},
    {url:shortUrl+'?x=1'},{url:shortUrl+'#x'},{url:shortUrl.replace('https:','http:')},
    {url:shortUrl.replace('//','//user:pass@')},{url:shortUrl.slice(0,-1)},{url:'javascript:alert(1)'}];
  for (const result of invalid) {
    let response=result;const f=editFixture(async()=>response);
    await f.api.loadEditLink(published);assert.equal(f.api.canUseEditLink(),false);
    assert.equal(f.element('edit-a-link-copy').disabled,true);
    assert.equal(f.element('edit-a-link-retry').hidden,false);
    response={url:shortUrl};await f.api.loadEditLink();
    assert.equal(f.calls.length,2);assert.equal(f.api.canUseEditLink(),true);
  }
});

test('late responses cannot leak a link after close, activity switch, account or token change', async () => {
  for (const change of ['close','activity','account','token']) {
    let release;const f=editFixture(()=>new Promise(resolve=>{release=resolve;}));
    const pending=f.api.loadEditLink(published);
    assert.equal(f.element('edit-a-link-copy').disabled,true);
    if(change==='close')f.api.clearEditLink();
    if(change==='activity') {
      f.element('edit-a-id').value='B';
      await f.api.loadEditLink({activityId:'B',status:'下架'});
    }
    if(change==='account')f.context.adminProfile.userId='member-2';
    if(change==='token')f.context.window.liff.getAccessToken=()=> 'token-2';
    release({url:shortUrl});await pending;
    assert.equal(f.api.canUseEditLink(),false);
    assert.equal(f.element('edit-a-registration-link').value,'');
    await f.api.copyEditLink();assert.deepEqual(f.copied,[]);
  }
});

test('clipboard failures offer manual selection; insecure-context fallback remains available', async () => {
  const f=editFixture();await f.api.loadEditLink(published);
  f.context.navigator.clipboard.writeText=async()=>{throw Error('denied');};
  await f.api.copyEditLink();assert.equal(f.element('edit-a-registration-link').selected,true);
  assert.match(f.element('edit-a-link-status').textContent,/手動複製/);assert.deepEqual(f.toasts,[]);
  f.context.window.isSecureContext=false;await f.api.copyEditLink();assert.equal(f.toasts.length,1);
});

test('edit modal exposes a read-only link without changing existing save API', () => {
  assert.match(html,/id="edit-a-registration-link"[^>]*readonly/);
  assert.match(html,/id="edit-a-link-open" target="_blank" rel="noopener noreferrer"/);
  assert.match(html,/void window\.AdminActivityRegistration\.loadEditLink\(act\)/);
  assert.match(html,/function closeActivityEditModal\(\) \{\s*window\.AdminActivityRegistration\.clearEditLink\(\)/);
  const linkCode=source.slice(source.indexOf('  function editToken()'),source.indexOf('  window.AdminActivityRegistration ='));
  assert.doesNotMatch(linkCode,/updateActivity|deleteActivity|bulkAddRegistrants|edit-a-name/);
});
