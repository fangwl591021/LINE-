import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { DatabaseSync } from 'node:sqlite';
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
  const c={URLSearchParams,console,Date:class extends Date {static now(){return Date.parse('2026-09-28T04:00:00Z');}},document:{getElementById:node},DEFAULT_LIFF_ID:'fixture-liff',
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
test('frontend uses existing history API and bumps the changed module cache version',()=>{
  assert.match(source,/\['getMyActivities', 'getUserActivities', 'getMyRegistrations', 'getUserRegistrations'\]/);
  assert.match(read('index.html'),/js\/modules\/home\.js\?v=8\.21/);
});

function historyDatabase() {
  const sql=new DatabaseSync(':memory:');
  sql.exec('CREATE TABLE registrants(row_id TEXT PRIMARY KEY,line_id TEXT,phone TEXT,name TEXT,activity_name TEXT,start_time TEXT,created_at TEXT,status TEXT,activity_id TEXT)');
  sql.exec('CREATE TABLE activities(activity_id TEXT PRIMARY KEY,status TEXT,start_time TEXT,end_time TEXT,series_id TEXT,network_id TEXT)');
  sql.exec(read('migrations/0052_activity_form_options.sql'));
  const c=vm.createContext({D1ReadModule:{all:async(_env,query,args)=>sql.prepare(query).all(...args)}});
  const worker=read('workerbackup.js'),begin=worker.indexOf('const D1ActivityModule = {'),end=worker.indexOf('\n};',begin);
  vm.runInContext(worker.slice(begin,end+3)+'\nglobalThis.activities=D1ActivityModule;',c);
  const insert=sql.prepare('INSERT INTO registrants(row_id,line_id,phone,name,activity_name,start_time,created_at,status,activity_id) VALUES(?,?,?,?,?,?,?,?,?)');
  return {sql,add:(id,date,start='2026-10-07 14:00',owner='viewer')=>{
      sql.prepare('INSERT INTO activities(activity_id,status,start_time,end_time,series_id,network_id) VALUES(?,?,?,?,?,?)').run(id,'上架',start,'','','admin');
      return insert.run(id,owner,'','',id,start,date,'active',id);
    },
    list:()=>c.activities.listMyRegistrations({userId:'viewer'},{ACTMASTER_DB:{}})};
}
test('actual history query sorts mixed legacy slash dates and D1 dates before LIMIT, without rewriting registrations',async()=>{
  const f=historyDatabase();
  try {
    // The exact formats that put May registrations above the reported October signup.
    f.add('may-7','2026/5/7 22:49:55');f.add('may-10','2026/5/10 00:07:05');
    f.add('october-signup','2026-09-27 23:56:42');
    f.add('june-signup','2026-06-01T08:00:00Z');
    f.add('next-year','2027/1/2 09:00:00');
    f.add('missing','');f.add('invalid','not-a-date');
    f.add('different-member','2030-01-01 00:00:00','2030-01-01','other');
    const before=JSON.stringify(f.sql.prepare('SELECT * FROM registrants ORDER BY row_id').all());
    const result=await f.list();
    assert.deepEqual(Array.from(result.data.slice(0,5),r=>r.rowId),['next-year','october-signup','june-signup','may-10','may-7']);
    assert.equal(result.data.length,7);
    assert.equal(result.data.find(r=>r.rowId==='may-7').createdAt,'2026/5/7 22:49:55','original snapshot remains intact');
    assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM registrants ORDER BY row_id').all()),before);
    for(let i=0;i<210;i++)f.add('legacy-'+i,'2026/5/9 12:00:00');
    const capped=await f.list();
    assert.equal(capped.data.length,200);
    assert.deepEqual(Array.from(capped.data.slice(0,3),r=>r.rowId),['next-year','october-signup','june-signup']);
  } finally {f.sql.close();}
});
test('history date order handles one-digit date/time, date-only, ISO offsets and stable ties',async()=>{
  const f=historyDatabase();
  try {
    f.add('dawn','2026/5/9 9:05:00');f.add('noon','2026/5/9 12:00:00');
    f.add('day-only','2026/5/9');f.add('iso-offset','2026-05-09T23:00:00+08:00');
    f.add('tie-b','2026-05-10 01:00:00');f.add('tie-a','2026-05-10T01:00:00Z');
    assert.deepEqual(Array.from((await f.list()).data,r=>r.rowId),['tie-b','tie-a','iso-offset','noon','dawn','day-only']);
    assert.deepEqual(Array.from((await f.list()).data,r=>r.rowId),['tie-b','tie-a','iso-offset','noon','dawn','day-only']);
  } finally {f.sql.close();}
});

test('history adds live activity availability without replacing registration snapshots or status',async()=>{
  const f=historyDatabase();
  try {
    for(const id of ['live','hidden','removed','batch','foreign-parent'])f.add(id,'2026-09-28 12:00');
    f.sql.prepare('UPDATE activities SET start_time=?,end_time=? WHERE activity_id=?').run('2026-10-08 14:00','2026-10-08 17:00','live');
    f.sql.exec("UPDATE activities SET status='下架' WHERE activity_id='hidden'; DELETE FROM activities WHERE activity_id='removed';");
    f.sql.exec("INSERT INTO activities(activity_id,status,start_time,end_time,series_id,network_id) VALUES('series','下架','','','','admin'); UPDATE activities SET series_id='series' WHERE activity_id IN ('batch','foreign-parent'); UPDATE activities SET network_id='other' WHERE activity_id='foreign-parent';");
    const snapshot=JSON.stringify(f.sql.prepare('SELECT * FROM registrants ORDER BY row_id').all());
    const records=Object.fromEntries((await f.list()).data.map(r=>[r.rowId,r]));
    assert.equal(records.live.activityStatus,'上架');
    assert.equal(records.live.startTime,'2026-10-07 14:00','saved date stays intact');
    assert.equal(records.live.activityStartTime,'2026-10-08 14:00');
    assert.equal(records.live.activityEndTime,'2026-10-08 17:00');
    for(const id of ['hidden','removed','batch'])assert.equal(records[id].activityStatus,'下架',id);
    assert.equal(records['foreign-parent'].activityStatus,'上架','unrelated network cannot change availability');
    for(const r of Object.values(records))assert.equal(r.status,'active','registration status remains separate');
    assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM registrants ORDER BY row_id').all()),snapshot);
  } finally {f.sql.close();}
});

test('expired and unlisted rows are muted but remain in place with working details and controls',async()=>{
  const records=[
    {...rows[0],activityStatus:'上架',activityEndTime:'2026-10-07 17:00'},
    {...rows[1],activityStatus:'上架',activityEndTime:'2026-09-27 17:00'},
    {...rows[2],activityStatus:'下架',activityEndTime:'2026-12-01 17:00'}
  ];
  const f=fixture(records);await f.c.loadMyActivities();
  const html=f.node('my-activities-list').innerHTML;
  const rendered=[...html.matchAll(/<div data-activity-state="(\w+)"([\s\S]*?)(?=<div data-activity-state=|$)/g)];
  assert.deepEqual(rendered.map(m=>m[1]),['active','expired','unlisted']);
  assert.match(rendered[0][2],/text-blue-600/);
  for(let i=1;i<3;i++){
    assert.match(rendered[i][2],/bg-slate-50/);assert.match(rendered[i][2],/text-slate-500/);
    assert.doesNotMatch(rendered[i][2],/text-blue-|text-red-|pointer-events-none|disabled/);
    assert.match(rendered[i][2],/點開查看報名紀錄/);
    f.c.openMyActivityRecordDetail(i);assert.match(f.node('my-act-detail-content').innerHTML,new RegExp(records[i].activityName));
  }
  assert.match(rendered[1][2],/已過期/);assert.match(rendered[1][2],/已核銷/);
  assert.match(rendered[2][2],/已下架/);assert.match(rendered[2][2],/已取消/);
  assert.deepEqual(Array.from(f.c.myActivitiesData,r=>r.rowId),records.map(r=>r.rowId));
});

test('expiry uses Taipei end time, keeps ongoing events active and never guesses from registration date',()=>{
  const f=fixture(),state=(r,now='2026-10-07T08:00:00Z')=>f.c.getRegistrationActivityState_(r,Date.parse(now)).state;
  assert.equal(state({activityEndTime:'2026-10-07 17:00'}),'active');
  assert.equal(state({activityEndTime:'2026-10-07 17:00'},'2026-10-07T09:00:01Z'),'expired');
  assert.equal(state({activityEndTime:'2026-10-07T09:00:00Z'},'2026-10-07T09:00:01Z'),'expired');
  assert.equal(state({activityEndTime:'2026/10/7 下午5:00:00'},'2026-10-07T09:00:01Z'),'expired');
  assert.equal(state({startTime:'2026/10/7 上午9:00'}),'active','no end: keep through Taipei day');
  assert.equal(state({startTime:'2026/10/7 09:00'},'2026-10-07T16:00:00Z'),'expired');
  assert.equal(state({activityEndTime:'2026-10-07'},'2026-10-07T15:59:59Z'),'active');
  assert.equal(state({activityEndTime:'2026-10-07'},'2026-10-07T16:00:00Z'),'expired');
  assert.equal(state({activityStartTime:'2026-12-01',startTime:'2026-01-01'}),'active','live reschedule wins');
  for(const r of [{createdAt:'2020-01-01'}, {}, {activityEndTime:'invalid'}, {activityEndTime:'2026-02-30'}])assert.equal(state(r),'active');
  assert.equal(state({activityStatus:'下架',activityEndTime:'2020-01-01'}),'unlisted');
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
