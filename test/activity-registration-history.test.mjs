import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('js/modules/home.js');
function block(text,start,end) {
  const from=text.indexOf(start),to=text.indexOf(end,from+start.length);
  assert.ok(from>=0&&to>from);return text.slice(from,to);
}
const rows=[
  {rowId:'latest',activityId:'A',activityName:'最新報名',createdAt:'2026-09-28T03:00:00Z',startTime:'2026-10-01T03:00:00Z',status:'active'},
  {rowId:'middle',activityId:'B',activityName:'先前報名',createdAt:'2026-09-27T03:00:00Z',startTime:'2026-12-01T03:00:00Z',status:'checkedin'},
  {rowId:'oldest',activityId:'C',activityName:'最早報名',createdAt:'2026-09-26T03:00:00Z',startTime:'2026-11-01T03:00:00Z',status:'cancelled'}
];
function fixture(records=structuredClone(rows)) {
  const nodes=new Map(),calls=[];
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',classList:{add(){},remove(){}}});
    return nodes.get(id);
  };
  const c={URLSearchParams,console,document:{getElementById:node},DEFAULT_LIFF_ID:'fixture-liff',
    currentUserProfile:{userId:'viewer',displayName:'會員'},currentUser:{name:'會員'},
    escapeHTML:String,formatDisplayTime:String,goPage:page=>calls.push(['page',page]),showToast:()=>{},
    ensurePersonalAgendaPanel_:()=>{},loadPersonalAgenda:()=>{},
    fetchActivitiesByFallback_:async()=>records,
    appConfirm:async message=>{calls.push(['confirm',message]);return true;},
    fetchAPI:async(action,payload)=>{calls.push([action,payload]);return {success:true};}
  };
  c.window=c;vm.createContext(c);
  for(const [start,end] of [
    ['function isTruthy_(', 'function getInitialActivityId_('],
    ['window.loadMyActivities =', 'function buildActivityFromRegistration_('],
    ['window.showActivityCheckinQr =', 'function getHomeLoadRole_(']
  ])vm.runInContext(block(source,start,end),c);
  return {c,calls,node,records};
}
test('existing API orders by registration creation descending; frontend cache version is updated',()=>{
  assert.match(block(read('workerbackup.js'),'async listMyRegistrations(','async cancelRegistration('),/ORDER BY created_at DESC LIMIT 200/);
  assert.match(read('index.html'),/js\/modules\/home\.js\?v=8\.13/);
});
test('newest registration renders first, independent of event start date; response is not mutated',async()=>{
  const f=fixture(),snapshot=JSON.stringify(f.records);await f.c.loadMyActivities();
  const html=f.node('my-activities-list').innerHTML;
  assert.ok(html.indexOf('最新報名')<html.indexOf('先前報名'));
  assert.ok(html.indexOf('先前報名')<html.indexOf('最早報名'));
  assert.deepEqual([...html.matchAll(/openMyActivityRecordDetail\((\d+)\)/g)].map(m=>Number(m[1])),[0,1,2]);
  assert.deepEqual(Array.from(f.c.myActivitiesData,r=>r.rowId),['latest','middle','oldest']);
  assert.equal(JSON.stringify(f.records),snapshot);
  assert.equal((html.match(/取消報名/g)||[]).length,1,'checked and cancelled rows keep their existing controls');
});
test('same-time or missing-time rows retain source order without invented timestamps',async()=>{
  for(const records of [rows.map(r=>({...r,createdAt:'2026-09-28T03:00:00Z'})),rows.map(({createdAt,...r})=>r)]) {
    const f=fixture(records);await f.c.loadMyActivities();
    const titles=[...f.node('my-activities-list').innerHTML.matchAll(/text-\[16px\] truncate">([^<]+)/g)].map(m=>m[1]);
    assert.deepEqual(titles,records.map(r=>r.activityName));
  }
});
test('detail, QR and explicit cancel still target the row displayed at each index',async()=>{
  const f=fixture();await f.c.loadMyActivities();
  for(let index=0;index<rows.length;index++) {
    f.c.openMyActivityRecordDetail(index);
    assert.ok(f.node('my-act-detail-content').innerHTML.includes(rows[index].activityName));
    assert.ok(f.node('my-act-detail-content').innerHTML.includes(`showActivityCheckinQr(${index})`));
    f.c.showActivityCheckinQr(index);
    const qr=new URL(f.node('qr-code-img').src),verify=new URL(qr.searchParams.get('text'));
    assert.equal(verify.searchParams.get('verifyCheckin'),rows[index].rowId);
    assert.equal(verify.searchParams.get('activityId'),rows[index].activityId);
  }
  assert.equal(f.calls.filter(c=>c[0]==='cancelActivityRegistration').length,0);
  await f.c.cancelMyActivityRegistration(0);
  const payload=f.calls.find(c=>c[0]==='cancelActivityRegistration')[1];
  assert.equal(payload.rowId,'latest');assert.equal(payload.activityId,'A');assert.equal(payload.userId,'viewer');
});
test('empty and single-record results preserve existing rendering',async()=>{
  const empty=fixture([]);await empty.c.loadMyActivities();assert.match(empty.node('my-activities-list').innerHTML,/目前沒有活動紀錄/);
  const single=fixture([rows[0]]);await single.c.loadMyActivities();
  assert.match(single.node('my-activities-list').innerHTML,/openMyActivityRecordDetail\(0\)/);
});
