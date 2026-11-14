import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,OTHER,mapper} from './fixtures/reward-unit-directory.mjs';
import {handleBonusPerformanceDate} from '../worker/bonus-performance-date.mjs';

function fixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());
 const schema=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(schema.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const name of ['0070_partner_bonus_v2.sql','0075_partner_settlement_11510.sql','0087_partner_performance_date_candidates.sql','0089_bonus_release_control.sql'])f.sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 f.sql.prepare("INSERT INTO bonus_release_control_events VALUES(1,1,0,?,'fixture','2026-11-14',?,'{}')").run(ADMIN,crypto.randomUUID());
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,paid_at) VALUES('order-1',?,'tenant_annual_fee','paid','2026-11-09T04:00:00Z')").run(OTHER);
 f.call=async({method='GET',id='order-1',data,token='admin'}={})=>{
  const url='https://test/v1/admin/bonus-performance-date'+(method==='GET'?'?order_id='+id:'');
  const response=await handleBonusPerformanceDate(new Request(url,{method,headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),f.env,mapper,async(url,opts)=>{
   const v=opts.headers.Authorization.slice(7);return ['admin','user'].includes(v)?Response.json({userId:v==='admin'?ADMIN:OTHER}):new Response('',{status:401});
  });return {http:response.status,...await response.json()};
 };
 f.data=(extra={})=>({orderId:'order-1',precision:'month',value:'2026-10',reason:'依證據調整',expectedVersion:0,requestKey:crypto.randomUUID(),...extra});
 return f;
}
test('month candidate preserves payment and ledgers, retains audit trail, and replays safely',async t=>{
 const f=fixture(t),original=f.sql.prepare('SELECT * FROM orders').all(),data=f.data();
 const initial=await f.call();assert.equal(initial.version,0);assert.equal(initial.editable,true);
 const saved=await f.call({method:'POST',data});assert.equal(saved.http,200,JSON.stringify(saved));assert.equal(saved.affectsSettlement,false);assert.equal(saved.current.value,'2026-10');assert.equal(saved.current.precision,'month');
 assert.deepEqual(f.sql.prepare('SELECT * FROM orders').all(),original);assert.equal(f.sql.prepare('SELECT count(*) n FROM bonus_transactions').get().n,0);
 const event=f.sql.prepare('SELECT * FROM partner_bonus_performance_date_events').get();assert.equal(event.recorded_by,ADMIN);assert.equal(event.previous_value,'');
 assert.equal((await f.call({method:'POST',data})).replayed,true);assert.equal((await f.call({method:'POST',data:{...data,value:'2026-09'}})).http,409);
 const next=f.data({precision:'day',value:'2026-10-15',expectedVersion:1});assert.equal((await f.call({method:'POST',data:next})).http,200);
 const row=f.sql.prepare('SELECT * FROM partner_bonus_performance_date_events WHERE version=2').get();assert.equal(row.previous_value,'2026-10');assert.equal(row.previous_precision,'month');assert.equal((await f.call()).current.value,'2026-10-15');
});
test('authorization, validation, version and locked records fail closed',async t=>{
 const f=fixture(t);assert.equal((await f.call({token:'user'})).http,403);assert.equal((await f.call({token:'bad'})).http,401);
 for(const changes of [{precision:'day',value:'2026-02-30'},{value:'2099-10'},{precision:'minute',value:'2026-10-05T25:00'}])assert.equal((await f.call({method:'POST',data:f.data(changes)})).http,400);
 assert.equal((await f.call({method:'POST',data:f.data({expectedVersion:1})})).http,409);
 f.sql.prepare("INSERT INTO bonus_transactions(tx_id,order_id,status) VALUES('tx','order-1','paid')").run();
 assert.equal((await f.call()).editable,false);assert.equal((await f.call({method:'POST',data:f.data()})).http,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_performance_date_events').get().n,0);
});
test('revocation and concurrent edits cannot create a candidate under stale authority or version',async t=>{
 const f=fixture(t);f.onBatch(()=>f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN));
 assert.equal((await f.call({method:'POST',data:f.data()})).http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_performance_date_events').get().n,0);
 f.onBatch(null);f.sql.prepare("UPDATE users SET role='admin' WHERE line_id=?").run(ADMIN);
 const results=await Promise.all([f.call({method:'POST',data:f.data()}),f.call({method:'POST',data:f.data({value:'2026-09'})})]);
 assert.deepEqual(results.map(r=>r.http).sort(),[200,409]);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_performance_date_events').get().n,1);
});
test('confirmation, statement and changed payment state each block a date change',async t=>{
 for(const setup of [
  "INSERT INTO partner_bonus_deal_confirmations VALUES('order-1','recruiter','buyer','tenant_annual_fee','proof','2026-11-01','2026-11-01','admin',1,'{}','{}','request','{}')",
  "INSERT INTO partner_11510_statement_items VALUES('tx','statement',100,'order-1','direct')",
  "UPDATE orders SET payment_status='refunded' WHERE order_id='order-1'"
 ]){
  const f=fixture(t);if(setup.includes('statement_items'))f.sql.exec('PRAGMA foreign_keys=OFF');f.sql.exec(setup);assert.equal((await f.call()).editable,false,setup);
  assert.equal((await f.call({method:'POST',data:f.data()})).http,409,setup);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_performance_date_events').get().n,0);
 }
 const f=fixture(t);f.onBatch(()=>f.sql.exec("UPDATE orders SET payment_status='refunded' WHERE order_id='order-1'"));
 assert.equal((await f.call({method:'POST',data:f.data()})).http,409);
 assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_performance_date_events').get().n,0);
});
test('the exact signed referral pending review state can record a candidate only before any finance evidence',async t=>{
 for(const payment of ['paid','pending_payment']){
  const f=fixture(t);f.sql.prepare("UPDATE orders SET payment_status=?,bonus_status='review_required',bonus_policy_type='signed_referral_pending' WHERE order_id='order-1'").run(payment);
  const original=f.sql.prepare('SELECT * FROM orders').get();assert.equal((await f.call()).editable,true);
  const result=await f.call({method:'POST',data:f.data()});assert.equal(result.http,200,JSON.stringify(result));assert.equal(result.affectsSettlement,false);
  assert.deepEqual(f.sql.prepare('SELECT * FROM orders').get(),original);
 }
 for(const [status,policy] of [['review_required','other'],['generated','signed_referral_pending']]){
  const f=fixture(t);f.sql.prepare('UPDATE orders SET bonus_status=?,bonus_policy_type=?').run(status,policy);
  assert.equal((await f.call()).editable,false);assert.equal((await f.call({method:'POST',data:f.data()})).http,409);
 }
 for(const sql of [
  "INSERT INTO partner_bonus_deal_confirmations VALUES('order-1','recruiter','buyer','tenant_annual_fee','proof','2026-11-01','2026-11-01','admin',1,'{}','{}','request','{}')",
  "INSERT INTO bonus_transactions(tx_id,order_id,status) VALUES('tx','order-1','paid')",
  "INSERT INTO partner_11510_statement_items VALUES('tx','statement',100,'order-1','direct')"
 ]){
  const f=fixture(t);f.sql.exec("UPDATE orders SET bonus_status='review_required',bonus_policy_type='signed_referral_pending'");
  if(sql.includes('statement_items'))f.sql.exec('PRAGMA foreign_keys=OFF');f.sql.exec(sql);
  assert.equal((await f.call()).editable,false);assert.equal((await f.call({method:'POST',data:f.data()})).http,409);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_performance_date_events').get().n,0);
 }
});
test('reviewed snapshot may be adjusted and withdrawn with append-only history until confirmation',async t=>{
 const f=fixture(t);f.sql.exec("UPDATE orders SET bonus_status='review_required',bonus_policy_type='cocreator-115.10-v3'");
 f.sql.exec("INSERT INTO partner_bonus_order_snapshots VALUES('order-1','contract','policy','recruiter','buyer','2026-11-01','{}')");
 const before=f.sql.prepare('SELECT * FROM orders').get(),snapshot=f.sql.prepare('SELECT * FROM partner_bonus_order_snapshots').get();
 assert.equal((await f.call()).editable,true);
 assert.equal((await f.call({method:'POST',data:f.data()})).http,200);
 const change=f.data({expectedVersion:1,precision:'day',value:'2026-10-15'});assert.equal((await f.call({method:'POST',data:change})).http,200);
 const withdrawal=f.data({expectedVersion:2,precision:'none',value:'',reason:'撤回'});
 const result=await f.call({method:'POST',data:withdrawal});assert.equal(result.http,200);assert.equal(result.version,3);assert.equal(result.current,null);
 assert.equal((await f.call({method:'POST',data:withdrawal})).replayed,true);
 const state=await f.call();assert.equal(state.version,3);assert.equal(state.current,null);
 assert.equal((await f.call({method:'POST',data:f.data({expectedVersion:3,precision:'none',value:''})})).http,409);
 const events=f.sql.prepare('SELECT precision,value,previous_precision,previous_value FROM partner_bonus_performance_date_events ORDER BY version').all();
 assert.deepEqual(events.map(e=>({...e})),[
  {precision:'month',value:'2026-10',previous_precision:'',previous_value:''},
  {precision:'day',value:'2026-10-15',previous_precision:'month',previous_value:'2026-10'},
  {precision:'none',value:'',previous_precision:'day',previous_value:'2026-10-15'}]);
 assert.deepEqual(f.sql.prepare('SELECT * FROM orders').get(),before);assert.deepEqual(f.sql.prepare('SELECT * FROM partner_bonus_order_snapshots').get(),snapshot);
 f.sql.exec("INSERT INTO partner_bonus_deal_confirmations VALUES('order-1','recruiter','buyer','tenant_annual_fee','proof','2026-11-01','2026-11-01','admin',1,'{}','{}','request','{}')");
 assert.equal((await f.call()).editable,false);assert.equal((await f.call({method:'POST',data:f.data({expectedVersion:3})})).http,409);
});
test('confirmation appearing during a date update blocks it without changing the audit log',async t=>{
 const f=fixture(t);f.sql.exec("INSERT INTO partner_bonus_order_snapshots VALUES('order-1','contract','policy','recruiter','buyer','2026-11-01','{}')");
 f.onBatch(()=>f.sql.exec("INSERT INTO partner_bonus_deal_confirmations VALUES('order-1','recruiter','buyer','tenant_annual_fee','proof','2026-11-01','2026-11-01','admin',1,'{}','{}','request','{}')"));
 assert.equal((await f.call({method:'POST',data:f.data()})).http,409);assert.equal(f.sql.prepare('SELECT count(*) n FROM partner_bonus_performance_date_events').get().n,0);
});
