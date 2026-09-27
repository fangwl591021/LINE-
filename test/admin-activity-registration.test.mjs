import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../js/modules/admin-activity-registration.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../admin.html', import.meta.url), 'utf8');
const context = { window: {} };
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
  assert.match(html,/js\/modules\/admin-activity-registration\.js\?v=1/);
  assert.match(html,/get\('tab'\) === 'activities' \? 'activities' : 'users'/);
  assert.match(html,/data-registrants=/);
  assert.doesNotMatch(source,/localStorage|ACTMASTER_DB|CREATE TABLE|https:\/\//);
});
