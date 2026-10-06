import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {fixture,UIDS} from './helpers/member-events-fixture.mjs';
import {handleMemberEvents} from '../worker/member-hosted-events.mjs';
const ongoing=f=>({...f.input(),startsAt:new Date(Date.now()-1800000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString(),registrationClosesAt:new Date(Date.now()+3600000).toISOString()});

test('category create/update stays on the same event and keeps registrations, tickets, media and owner',async t=>{
  const f=fixture(t),data={...f.input(),category:'合作商業交流',coverUrl:'https://example.com/dm.jpg'},e=await f.create(data);
  await f.api('/'+e.id+'/register',{member:'guest',data:{}});await f.api('/'+e.id+'/ticket',{member:'guest',data:{}});
  const before=f.sql.prepare('SELECT * FROM member_hosted_events WHERE id=?').get(e.id),registrations=f.sql.prepare('SELECT * FROM member_event_registrations').all();
  const update={...data,category:' 課程 ',revision:e.revision,requestKey:crypto.randomUUID()};
  const saved=await f.api('/'+e.id+'/update',{data:update});assert.equal(saved.success,true);assert.equal(saved.event.category,'課程');assert.equal(saved.event.id,e.id);
  const after=f.sql.prepare('SELECT * FROM member_hosted_events WHERE id=?').get(e.id);
  for(const name of Object.keys(before))if(!['category','revision','last_key','updated_at'].includes(name))assert.equal(after[name],before[name],name);
  assert.deepEqual(f.sql.prepare('SELECT * FROM member_event_registrations').all(),registrations);
  assert.equal((await f.api('/'+e.id+'/update',{data:update})).event.revision,1);
  const overview=await f.api('/overview',{member:'guest'});assert.equal(overview.sessions[0].category,'課程');assert.equal(overview.my[0].category,'課程');assert.equal((await f.api('/overview')).hosting[0].category,'課程');
  assert.equal((await f.api('/'+e.id+'/update',{member:'guest',data:{...update,revision:1,requestKey:crypto.randomUUID()}})).httpStatus,403);
  assert.equal((await f.api('/'+e.id+'/update',{data:{...update,requestKey:crypto.randomUUID()}})).code,'STALE_EVENT');
});

test('category default is backward compatible; old edit clients preserve a saved custom category',async t=>{
  const f=fixture(t),data=f.input(),e=await f.create(data);assert.equal(e.category,'活動');
  await f.api('/'+e.id+'/update',{data:{...data,category:'自訂交流',revision:0,requestKey:crypto.randomUUID()}});
  const saved=await f.api('/'+e.id+'/update',{data:{...data,title:'舊版更新名稱',revision:1,requestKey:crypto.randomUUID()}});
  assert.equal(saved.event.category,'自訂交流');assert.equal(saved.event.title,'舊版更新名稱');
});

test('invalid categories are rejected without writing an event or changing an existing one',async t=>{
  const f=fixture(t);for(const category of ['', '  ',null,2,{},[], '字'.repeat(41)]){
    assert.equal((await f.api('/events',{data:{...f.input(),category}})).code,'INVALID_INPUT');
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM member_hosted_events').get().n,0);
  }
  const data=f.input(),e=await f.create(data),before=f.sql.prepare('SELECT * FROM member_hosted_events').get();
  assert.equal((await f.api('/'+e.id+'/update',{data:{...data,category:' ',revision:0,requestKey:crypto.randomUUID()}})).code,'INVALID_INPUT');
  assert.deepEqual(f.sql.prepare('SELECT * FROM member_hosted_events').get(),before);
});

test('category migration preserves legacy ended event rows and does not trigger prohibited updates',t=>{
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec("CREATE TABLE users(row_id TEXT PRIMARY KEY);INSERT INTO users VALUES('owner');");
  sql.exec(readFileSync(new URL('../migrations/0055_member_hosted_events.sql',import.meta.url),'utf8'));
  sql.prepare("INSERT INTO member_hosted_events(id,owner_id,create_key,title,description,location,starts_at,ends_at,registration_closes_at,created_at,updated_at) VALUES('legacy','owner','key','舊活動','說明','地點','2020-01-01T00:00:00Z','2020-01-01T01:00:00Z','2020-01-01T00:00:00Z','2020-01-01','2020-01-01')").run();
  const before=sql.prepare('SELECT * FROM member_hosted_events').get();sql.exec(readFileSync(new URL('../migrations/0057_member_event_category.sql',import.meta.url),'utf8'));
  assert.deepEqual({...sql.prepare('SELECT * FROM member_hosted_events').get()},{...before,category:'活動'});
  assert.throws(()=>sql.prepare("UPDATE member_hosted_events SET category='課程' WHERE id='legacy'").run(),/hosted_event_closed/);
});
test('registered canonical LINE identity only, no card gating, points or official/private agenda writes',async t=>{
  const f=fixture(t);assert.equal((await f.api('/overview',{member:''})).httpStatus,401);assert.equal((await f.api('/overview',{member:'invalid'})).httpStatus,401);
  const input=f.input();assert.equal((await f.api('/events',{data:{...input,ownerId:'other'}})).httpStatus,400);const e=await f.create(input);
  assert.equal((await f.api('/overview',{member:'old'})).hosting[0].id,e.id);assert.equal((await f.api('/overview',{member:'guest'})).sessions[0].isOwner,false);
  assert.equal((await f.api('/'+e.id+'/registrations',{member:'other'})).httpStatus,403);
  for(const table of ['points_ledger','activities','personal_tasks'])assert.equal(f.sql.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,0);
  assert.ok(f.writes.every(q=>/member_(hosted_events|event_registrations)/.test(q)));f.setAuth(500);assert.equal((await f.api('/overview')).httpStatus,503);
  f.sql.exec(`INSERT INTO user_identity_links VALUES('${UIDS.host}','${UIDS.guest}','active')`);assert.equal((await f.api('/overview')).httpStatus,503); // auth is currently unavailable
  f.setAuth(200);assert.equal((await f.api('/overview')).httpStatus,409);
});
test('single unfinished event, idempotent create, parallel insert authority and no reopen',async t=>{
  const f=fixture(t),data=f.input(),e=await f.create(data);assert.equal((await f.create(data)).id,e.id);
  assert.equal((await f.api('/events',{data:f.input()})).code,'hosted_event_active');assert.equal((await f.api('/eligibility')).canHost,false);
  await f.api('/'+e.id+'/cancel-event',{data:{requestKey:crypto.randomUUID(),revision:0}});assert.equal((await f.api('/eligibility')).canHost,true);await f.create();
  assert.throws(()=>f.sql.prepare("UPDATE member_hosted_events SET status='active' WHERE id=?").run(e.id),/hosted_event_closed/);
  const a=f.input(),b=f.input(),r=await Promise.all([f.api('/events',{member:'other',data:a}),f.api('/events',{member:'other',data:b})]);assert.equal(r.filter(x=>x.success).length,1);assert.equal(r.filter(x=>x.code==='hosted_event_active').length,1);
});
test('strict fields, capacity, invalid dates, future deadline and safe cover validation',async t=>{
  const f=fixture(t);for(const bad of [{title:''},{description:''},{location:''},{capacity:-1},{capacity:1.5},{capacity:10001},{capacity:'2'},{startsAt:'2026-02-31T06:00:00.000Z'},{endsAt:'2020-01-01T00:00:00.000Z'},{registrationClosesAt:'2100-01-01T00:00:00.000Z'},{coverUrl:'javascript:alert(1)'},{coverUrl:'https://user:secret@example.com/a'}])assert.equal((await f.api('/events',{data:{...f.input(),...bad}})).httpStatus,400,JSON.stringify(bad));
  assert.equal((await f.api('/events',{data:{...f.input(),registrationClosesAt:'2020-01-01T00:00:00.000Z'}})).code,'PAST_EVENT');
  assert.equal((await f.api('/events',{data:{...f.input(),description:'字'.repeat(20000)}})).httpStatus,413);
  f.setBadWrite(true);assert.equal((await f.api('/events',{data:f.input()})).httpStatus,503);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM member_hosted_events').get().n,0);
});
test('capacity last seat, cancellation/rejoin and duplicate registered retries',async t=>{
  const f=fixture(t),e=await f.create({...f.input(),capacity:1});const r=await Promise.all([f.api('/'+e.id+'/register',{member:'guest',data:{}}),f.api('/'+e.id+'/register',{member:'other',data:{}})]);assert.equal(r.filter(x=>x.success).length,1);assert.equal(r.filter(x=>x.code==='hosted_event_full').length,1);
  const winner=r[0].success?'guest':'other',loser=winner==='guest'?'other':'guest';assert.equal((await f.api('/'+e.id+'/register',{member:winner,data:{}})).duplicate,true);
  assert.equal((await f.api('/'+e.id+'/cancel',{member:winner,data:{}})).success,true);assert.equal((await f.api('/'+e.id+'/register',{member:loser,data:{}})).success,true);assert.equal((await f.api('/'+e.id+'/register',{member:winner,data:{}})).code,'hosted_event_full');
  const current=(await f.api('/'+e.id)).event;assert.equal(current.registrationCount,1);assert.equal(current.cancelledCount,1);
});
test('deadline/cancellation/ending checked at write, updates owned and revision guarded',async t=>{
  const f=fixture(t),data=f.input(),e=await f.create(data);await f.api('/'+e.id+'/register',{member:'guest',data:{}});await f.api('/'+e.id+'/register',{member:'other',data:{}});
  assert.equal((await f.api('/'+e.id+'/update',{data:{...data,requestKey:crypto.randomUUID(),revision:0,capacity:1}})).code,'hosted_capacity_too_small');
  assert.equal((await f.api('/'+e.id+'/update',{member:'guest',data:{...data,revision:0}})).httpStatus,403);
  const update={...data,title:'更新標題',revision:0,requestKey:crypto.randomUUID()};assert.equal((await f.api('/'+e.id+'/update',{data:update})).event.revision,1);assert.equal((await f.api('/'+e.id+'/update',{data:update})).event.revision,1);
  assert.equal((await f.api('/'+e.id+'/update',{data:{...update,requestKey:crypto.randomUUID()}})).code,'STALE_EVENT');
  f.sql.prepare("UPDATE member_hosted_events SET registration_closes_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(e.id);await f.api('/'+e.id+'/cancel',{member:'guest',data:{}});assert.equal((await f.api('/'+e.id+'/register',{member:'guest',data:{}})).code,'hosted_registration_closed');
  await f.api('/'+e.id+'/cancel-event',{data:{requestKey:crypto.randomUUID(),revision:1}});assert.equal((await f.api('/'+e.id+'/register',{data:{}})).code,'hosted_registration_closed');
});
test('random hashed rotating tickets, owner-only one-time redemption and expired/wrong/cancelled denial',async t=>{
  const f=fixture(t),e=await f.create(ongoing(f));await f.api('/'+e.id+'/register',{member:'guest',data:{}});
  const first=await f.api('/'+e.id+'/ticket',{member:'guest',data:{}}),second=await f.api('/'+e.id+'/ticket',{member:'guest',data:{}});assert.notEqual(first.ticket,second.ticket);
  assert.ok(Date.parse(second.expiresAt)-Date.now()>295000);const stored=f.sql.prepare('SELECT * FROM member_event_registrations').get();assert.match(stored.ticket_hash,/^[a-f0-9]{64}$/);assert.notEqual(stored.ticket_hash,second.ticket.split(':')[2]);
  assert.equal((await f.api('/'+e.id+'/redeem',{data:{ticket:first.ticket}})).httpStatus,409);assert.equal((await f.api('/'+e.id+'/redeem',{member:'other',data:{ticket:second.ticket}})).httpStatus,403);
  f.sql.exec("UPDATE member_event_registrations SET ticket_expires_at='2020-01-01T00:00:00.000Z'");assert.equal((await f.api('/'+e.id+'/redeem',{data:{ticket:second.ticket}})).httpStatus,409);
  const current=await f.api('/'+e.id+'/ticket',{member:'guest',data:{}});assert.equal((await f.api('/'+e.id+'/redeem',{data:{ticket:current.ticket}})).duplicate,false);assert.equal((await f.api('/'+e.id+'/redeem',{data:{ticket:current.ticket}})).duplicate,true);
  assert.equal((await f.api('/'+e.id+'/cancel',{member:'guest',data:{}})).httpStatus,409);assert.equal((await f.api('/'+e.id+'/ticket',{member:'guest',data:{}})).httpStatus,409);assert.equal((await f.api('/'+e.id)).event.checkedInCount,1);
  const wrong=current.ticket.replace(e.id,crypto.randomUUID());assert.equal((await f.api('/'+e.id+'/redeem',{data:{ticket:wrong}})).code,'WRONG_TICKET');
});
test('before start cannot redeem, cancelled registration or event invalidates valid ticket',async t=>{
  const f=fixture(t),e=await f.create();await f.api('/'+e.id+'/register',{member:'guest',data:{}});const ticket=(await f.api('/'+e.id+'/ticket',{member:'guest',data:{}})).ticket;
  assert.equal((await f.api('/'+e.id+'/redeem',{data:{ticket}})).httpStatus,409);await f.api('/'+e.id+'/cancel',{member:'guest',data:{}});assert.equal((await f.api('/'+e.id+'/redeem',{data:{ticket}})).httpStatus,409);await f.api('/'+e.id+'/register',{member:'guest',data:{}});const renewed=(await f.api('/'+e.id+'/ticket',{member:'guest',data:{}})).ticket;
  await f.api('/'+e.id+'/cancel-event',{data:{requestKey:crypto.randomUUID(),revision:0}});assert.equal((await f.api('/'+e.id+'/redeem',{data:{ticket:renewed}})).httpStatus,409);
});
test('roster latest first, own pagination, public summaries never expose UID/phone/email/ticket hashes',async t=>{
  const f=fixture(t),e=await f.create();await f.api('/'+e.id+'/register',{member:'guest',data:{}});await f.api('/'+e.id+'/register',{member:'other',data:{}});f.sql.prepare("UPDATE member_event_registrations SET registered_at='2026-10-06 13:00:00' WHERE member_id='guest'").run();f.sql.prepare("UPDATE member_event_registrations SET registered_at='2026-10-06 14:00:00' WHERE member_id='other'").run();
  const roster=await f.api('/'+e.id+'/registrations');assert.equal(roster.registrations[0].displayName,'其他主辦');assert.equal(roster.nextOffset,null);assert.equal((await f.api('/'+e.id+'/registrations?offset=-1')).httpStatus,400);
  const overview=await f.api('/overview',{member:'guest'});assert.doesNotMatch(JSON.stringify(overview),/owner_id|member_id|ticket_hash|phone|email|U[a-f0-9]{32}/);assert.equal(overview.my.length,1);
});
test('route isolation, CORS and kill switch, no runtime schema creation',async t=>{
  const f=fixture(t);assert.equal(await handleMemberEvents(new Request('https://point.test/v1/ai-advance/dashboard'),f.env),null);assert.equal((await f.api('/overview',{method:'OPTIONS',member:''})).httpStatus,204);assert.equal((await f.api('/overview',{method:'DELETE'})).httpStatus,405);
  f.env.MEMBER_EVENTS_DISABLED='1';assert.equal((await f.api('/overview')).httpStatus,503);
  const code=readFileSync(new URL('../worker/member-hosted-events.mjs',import.meta.url),'utf8');assert.doesNotMatch(code,/CREATE TABLE|Math\.random|gift_money|message\/push|OPENAI_API_KEY/);
});
