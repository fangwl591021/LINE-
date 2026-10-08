import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {officialFixture} from './helpers/activity-visibility-fixture.mjs';
import {fixture as memberFixture,UIDS} from './helpers/member-events-fixture.mjs';
import {handleMemberEvents} from '../worker/member-hosted-events.mjs';
const ids=result=>Array.from(result.data,e=>e.activityId).sort();
const png={type:'image/png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};

test('additive migration preserves legacy official affiliation and member global defaults without rewriting data',t=>{
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec("CREATE TABLE activities(id TEXT,status TEXT,start_time TEXT);INSERT INTO activities VALUES('old','下架','2026-10-01');CREATE TABLE member_hosted_events(id TEXT,status TEXT,starts_at TEXT);INSERT INTO member_hosted_events VALUES('old-member','cancelled','2026-10-01');");
  sql.exec(readFileSync(new URL('../migrations/0059_activity_visibility.sql',import.meta.url),'utf8'));
  assert.deepEqual({...sql.prepare('SELECT * FROM activities').get()},{id:'old',status:'下架',start_time:'2026-10-01',visibility:'network'});
  assert.deepEqual({...sql.prepare('SELECT * FROM member_hosted_events').get()},{id:'old-member',status:'cancelled',starts_at:'2026-10-01',visibility:'platform',network_id:''});
  assert.throws(()=>sql.exec("UPDATE activities SET visibility='yes'"),/CHECK/);
});

test('public catalog merges published global activities with verified affiliation; payload role/net never grant visibility',async t=>{
  const f=officialFixture(t);await f.create('a','network');await f.create('global','platform');await f.create('b','network','owner-b');await f.create('draft','platform','owner-a',{status:'下架'});
  assert.deepEqual(ids(await f.api('getPublicActivities',{networkId:'owner-a',role:'admin'},'member-b')),['b','global']);
  assert.deepEqual(ids(await f.api('getPublicActivities',{},'member-a')),['a','global']);
  assert.deepEqual(ids(await f.api('getPublicActivities',{role:'admin',userId:'admin',authenticatedRole:'admin'},'')),[]);
  assert.deepEqual(ids(await f.api('getAllActivities',{},'owner-b')),['b']);
  assert.deepEqual(ids(await f.api('getAllActivities',{},'admin')),['a','b','draft','global']);
});

test('detail, ownership and management remain distinct; cross-network private deep links and public rosters fail closed',async t=>{
  const f=officialFixture(t);await f.create('global','platform');await f.create('private','network');
  assert.equal((await f.api('getActivityById',{activityId:'global'},'member-b')).success,true);
  assert.equal((await f.api('getActivityById',{activityId:'private',networkId:'owner-a',role:'admin'},'member-b')).success,false);
  for(const action of ['updateActivity','setActivityStatus','removeAct','duplicateActivity','getActivityRegistrants']){
    assert.equal((await f.api(action,{activityId:'global',visibility:'network',data:{visibility:'network'}},'owner-b')).success,false,action);
  }
  assert.equal(f.sql.prepare("SELECT visibility FROM activities WHERE activity_id='global'").get().visibility,'platform');assert.equal(f.fallback,0);
});

test('creation, scoped publication and edits persist selection without moving owner/network; old clients preserve existing selection',async t=>{
  const f=officialFixture(t);assert.equal((await f.create('a','platform','owner-a',{networkId:'owner-b',userId:'owner-b'})).success,true);
  const before=f.sql.prepare("SELECT * FROM activities WHERE activity_id='a'").get();assert.equal(before.creator_id,'owner-a');assert.equal(before.network_id,'owner-a');
  await f.api('updateActivity',{activityId:'a',data:{activityName:'新版',visibility:'network',networkId:'owner-b'}});
  assert.equal(f.sql.prepare("SELECT visibility FROM activities WHERE activity_id='a'").get().visibility,'network');
  await f.api('setActivityStatus',{activityId:'a',status:'上架',visibility:'platform'});
  await f.api('updateActivity',{activityId:'a',data:{activityName:'舊客戶端'}});
  const after=f.sql.prepare("SELECT * FROM activities WHERE activity_id='a'").get();assert.equal(after.visibility,'platform');assert.equal(after.network_id,before.network_id);assert.equal(after.creator_id,before.creator_id);
  await f.create('foreign','network','owner-b');
  for(const action of ['updateActivity','bulkAddRegistrants'])assert.equal((await f.api(action,{activityId:'a',data:{activityId:'foreign',visibility:'platform'}})).success,false);
  assert.equal(f.sql.prepare("SELECT visibility FROM activities WHERE activity_id='foreign'").get().visibility,'network');
  for(const visibility of [null,true,'public','',{}])assert.equal((await f.create('invalid-'+Math.random(),visibility)).success,false);
  assert.equal(f.fallback,0);
});

test('single registration uses authoritative publication and member identity; fake prices/net cannot bypass it',async t=>{
  const f=officialFixture(t);await f.create('public','platform');await f.create('private','network');
  const users=f.sql.prepare('SELECT * FROM users').all();
  assert.equal((await f.api('joinActivity',{activityId:'private',networkId:'owner-a',userId:'member-a',role:'admin'},'member-b')).success,false);
  assert.equal((await f.api('joinActivity',{activityId:'public',userId:'member-a',price:0,amount:0},'member-b')).success,false);
  assert.equal((await f.api('joinActivity',{activityId:'public',userId:'member-b',price:0,amount:0},'member-b')).success,true);
  const r=f.sql.prepare('SELECT * FROM registrants').get();assert.equal(r.line_id,'member-b');assert.equal(r.amount,150);assert.equal(r.name,'乙會員');assert.equal(r.phone,'0945678901');
  assert.deepEqual(f.sql.prepare('SELECT * FROM users').all(),users);
  await f.api('updateActivity',{activityId:'public',data:{visibility:'network'}});
  assert.equal((await f.api('getActivityById',{activityId:'public'},'member-b')).success,true,'prior registrant retains own detail');
  assert.equal((await f.api('joinActivity',{activityId:'public'},'owner-b')).success,false);
});

test('uncertain create retries keep the committed scope and content instead of updating the same ID',async t=>{
  const f=officialFixture(t);
  assert.equal((await f.create('retry','network','owner-a',{createOnly:true})).success,true);
  assert.equal((await f.create('retry','platform','owner-a',{createOnly:true,activityName:'不應覆蓋'})).success,true);
  const row=f.sql.prepare("SELECT * FROM activities WHERE activity_id='retry'").get();
  assert.equal(row.name,'retry');assert.equal(row.visibility,'network');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM activities').get().n,1);
  assert.equal((await f.create('bad-series',true,'owner-a',{isBatch:true,batches:[{startTime:'2026-10-20T14:00',endTime:'2026-10-20T16:00'}]})).success,false);
  assert.equal(f.fallback,0);
});

test('management runtime failures after permission checks do not fall back to unscoped legacy actions',async t=>{
  const f=officialFixture(t);await f.create('a','platform');
  for(const [action,method] of [['getActivityRegistrants','listRegistrants'],['setActivityStatus','setActivityStatus'],['removeAct','removeActivity'],['duplicateActivity','duplicateActivity']]){
    f.mod[method]=async()=>{throw Error('synthetic failure after preflight');};
    assert.equal((await f.api(action,{activityId:'a',status:'上架',visibility:'network'})).success,false,action);
  }
  assert.equal(f.fallback,0);
});

test('quick-create guest names resume after a partial failure without duplicate registrations or activity republishing',async t=>{
  const f=officialFixture(t);let writes=0;
  f.setBeforeRun(q=>{if(q.includes('INSERT INTO registrants')&&++writes===2)throw Error('synthetic partial failure');});
  const input={createOnly:true,names:['甲來賓','乙來賓','丙來賓']};
  assert.equal((await f.create('guests','network','owner-a',input)).success,false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM registrants').get().n,1);
  f.setBeforeRun(null);assert.equal((await f.create('guests','network','owner-a',input)).success,true);
  assert.equal((await f.create('guests','network','owner-a',input)).success,true);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM registrants').get().n,3);
  assert.equal(f.sql.prepare("SELECT visibility FROM activities WHERE activity_id='guests'").get().visibility,'network');
  assert.equal(f.fallback,0);
});

test('create ID collision during the write cannot add guests to another owner activity',async t=>{
  const f=officialFixture(t);
  f.setBeforeRun(q=>{if(q.includes('INSERT INTO activities')){
    f.setBeforeRun(null);f.sql.exec("INSERT INTO activities(activity_id,name,creator_id,network_id,status,visibility) VALUES('collision','別人的活动','owner-b','owner-b','上架','network')");
  }});
  assert.equal((await f.create('collision','platform','owner-a',{createOnly:true,names:['不可加入']})).success,false);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM registrants').get().n,0);assert.equal(f.fallback,0);
});

test('visibility is rechecked in single and batch writes, not only in a preflight read',async t=>{
  const f=officialFixture(t);await f.create('single','platform');
  f.setBeforeRun(q=>{if(q.includes('INSERT INTO registrants')){f.setBeforeRun(null);f.sql.exec("UPDATE activities SET visibility='network' WHERE activity_id='single'");}});
  assert.equal((await f.api('joinActivity',{activityId:'single'},'member-b')).success,false);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM registrants').get().n,0);
  await f.create('series','platform','owner-a',{isBatch:true,batches:[{name:'午場',startTime:'2026-10-20T14:00',endTime:'2026-10-20T16:00',price:0}]});
  f.setBeforeBatch(()=>{f.setBeforeBatch(null);f.sql.exec("UPDATE activities SET visibility='network' WHERE activity_id='series'");});
  assert.equal((await f.api('joinActivity',{activityId:'series',batchIds:['series_B01']},'member-b')).success,false);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM registrants').get().n,0);
});

test('database failures never forward activity reads or publication to a legacy backend',async t=>{
  const f=officialFixture(t);await f.create('a','platform');f.setFail(true);
  for(const action of ['getPublicActivities','getActivityById','updateActivity','bulkAddRegistrants','setActivityStatus','joinActivity']){
    assert.equal((await f.api(action,{activityId:'a',visibility:'platform',data:{visibility:'platform'}})).success,false,action);
  }
  assert.equal(f.fallback,0);
});

function memberScope(t){const f=memberFixture(t);f.sql.exec("UPDATE users SET network_id='group-a' WHERE row_id='host';UPDATE users SET network_id='group-b' WHERE row_id='guest';");return f;}
test('member activity private scope applies to catalog/detail/media and new registration; public choice restores global reach',async t=>{
  const f=memberScope(t),objects=new Map();f.env.IMG_BUCKET={async put(k,b){objects.set(k,new Uint8Array(b));return {key:k};},async get(k){const b=objects.get(k);return b?{size:b.length,arrayBuffer:async()=>b.slice().buffer}:null;}};
  const data={...f.input(),visibility:'network',dmFile:png},e=await f.create(data);
  assert.equal((await f.api('/overview',{member:'guest'})).sessions.length,0);
  assert.equal((await f.api('/'+e.id,{member:'guest'})).httpStatus,403);
  assert.equal((await f.api('/'+e.id+'/register',{member:'guest',data:{}})).httpStatus,403);
  assert.equal((await handleMemberEvents(new Request(e.coverUrl,{headers:{Authorization:'Bearer guest'}}),f.env,f.fetcher)).status,403);
  f.sql.exec("UPDATE users SET network_id='group-a' WHERE row_id='guest'");assert.equal((await f.api('/overview',{member:'guest'})).sessions[0].id,e.id);
  f.sql.exec("UPDATE users SET network_id='group-b' WHERE row_id='guest'");
  const saved=await f.api('/'+e.id+'/update',{data:{...f.input(),coverUrl:e.coverUrl,revision:0,visibility:'platform'}});assert.equal(saved.success,true);
  assert.equal((await f.api('/overview',{member:'guest'})).sessions[0].id,e.id);assert.equal((await f.api('/'+e.id+'/register',{member:'guest',data:{}})).success,true);
  assert.equal((await f.api('/'+e.id+'/registrations',{member:'guest'})).httpStatus,403);
});

test('member old-client edits preserve choice, network is frozen, request retries do not publish twice or change scope',async t=>{
  const f=memberScope(t),data={...f.input(),visibility:'network'},e=await f.create(data);
  assert.equal((await f.create({...data,visibility:'platform'})).visibility,'network');
  f.sql.exec("UPDATE users SET network_id='moved-group' WHERE row_id='host'");
  const updated=await f.api('/'+e.id+'/update',{data:{...f.input(),revision:0}});assert.equal(updated.event.visibility,'network');
  assert.equal(f.sql.prepare('SELECT network_id FROM member_hosted_events').get().network_id,'group-a');
  assert.equal((await f.api('/'+e.id+'/update',{member:'guest',data:{...f.input(),revision:1,visibility:'platform'}})).httpStatus,403);
  for(const visibility of ['',null,true,'yes'])assert.equal((await f.api('/'+e.id+'/update',{data:{...f.input(),revision:1,visibility}})).code,'INVALID_VISIBILITY');
  assert.equal((await f.api('/'+e.id+'/update',{data:{...f.input(),revision:1,networkId:'group-b'}})).code,'INVALID_FIELDS');
});

test('existing member registrations keep history/detail/cancellation after becoming private, but cannot rejoin out of scope',async t=>{
  const f=memberScope(t),e=await f.create({...f.input(),visibility:'platform'});await f.api('/'+e.id+'/register',{member:'guest',data:{}});
  await f.api('/'+e.id+'/update',{data:{...f.input(),revision:0,visibility:'network'}});
  const overview=await f.api('/overview',{member:'guest'});assert.equal(overview.sessions.length,0);assert.equal(overview.my[0].id,e.id);
  assert.equal((await f.api('/'+e.id,{member:'guest'})).success,true);assert.equal((await f.api('/'+e.id+'/ticket',{member:'guest',data:{}})).success,true);
  assert.equal((await f.api('/'+e.id+'/cancel',{member:'guest',data:{}})).success,true);assert.equal((await f.api('/'+e.id+'/register',{member:'guest',data:{}})).httpStatus,403);
});

test('member visibility change during registration write cannot be bypassed',async t=>{
  const f=memberScope(t),e=await f.create({...f.input(),visibility:'platform'});
  f.setBeforeRun(q=>{if(q.includes('INSERT INTO member_event_registrations')){f.setBeforeRun(null);f.sql.prepare("UPDATE member_hosted_events SET visibility='network' WHERE id=?").run(e.id);}});
  assert.equal((await f.api('/'+e.id+'/register',{member:'guest',data:{}})).httpStatus,403);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM member_event_registrations').get().n,0);
  assert.equal((await f.api('/overview',{member:'old'})).hosting[0].id,e.id,'canonical linked owner unchanged');
  assert.equal(UIDS.host.length,33);
});
