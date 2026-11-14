import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture,ADMIN,OTHER,mapper} from './fixtures/reward-unit-directory.mjs';
import {handleBonusReleaseControl} from '../worker/bonus-release-control.mjs';
import {handleBonusPerformanceDate} from '../worker/bonus-performance-date.mjs';
import {handleBonusOrderSequence} from '../worker/bonus-order-sequence.mjs';

function fixture(t){
 const f=rewardFixture();t.after(()=>f.sql.close());f.sql.exec("ALTER TABLE users ADD COLUMN member_number TEXT DEFAULT ''");
 const core=readFileSync(new URL('../migrations/0001_core_schema.sql',import.meta.url),'utf8');
 for(const name of ['orders','bonus_transactions'])f.sql.exec(core.match(new RegExp('CREATE TABLE IF NOT EXISTS '+name+' \\([\\s\\S]*?\\);'))[0]);
 for(const name of ['0070_partner_bonus_v2','0074_partner_policy_11510','0075_partner_settlement_11510','0077_hand_sign_contracts','0079_partner_full_service_evidence','0082_partner_project_qualification','0087_partner_performance_date_candidates','0088_bonus_order_sequence_drafts','0089_bonus_release_control'])f.sql.exec(readFileSync(new URL('../migrations/'+name+'.sql',import.meta.url),'utf8'));
 f.sql.prepare("INSERT INTO orders(order_id,buyer_id,order_type,payment_status,paid_at) VALUES('order-1',?,'tenant_annual_fee','paid','2026-11-01T00:00:00Z')").run(OTHER);
 f.call=async(kind,data,token='admin')=>{
  const handler={control:handleBonusReleaseControl,date:handleBonusPerformanceDate,sequence:handleBonusOrderSequence}[kind],path={control:'bonus-release-control',date:'bonus-performance-date',sequence:'bonus-order-sequence'}[kind];
  const response=await handler(new Request('https://test/v1/admin/'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined}),f.env,mapper,async(url,opts)=>{const v=opts.headers.Authorization.slice(7);return ['admin','user'].includes(v)?Response.json({userId:v==='admin'?ADMIN:OTHER}):new Response('',{status:401});});
  return {http:response.status,...await response.json()};
 };
 f.flag=(enabled,expectedVersion=0)=>({enabled,reason:'fixture',expectedVersion,requestKey:crypto.randomUUID()});
 f.date=()=>({orderId:'order-1',precision:'month',value:'2026-10',reason:'fixture',expectedVersion:0,requestKey:crypto.randomUUID()});
 f.sequence=()=>({batchId:crypto.randomUUID(),expectedVersion:0,requestKey:crypto.randomUUID(),confirmedComplete:true,evidenceRef:'fixture',periodFrom:'2026-10',periodTo:'2026-10',orderIds:['order-1']});
 return f;
}
test('fresh rollout defaults off; explicit audited enable then disable fences both write endpoints',async t=>{
 const f=fixture(t),order=f.sql.prepare('SELECT * FROM orders').all(),flag=f.flag(true);
 assert.deepEqual(await f.call('control'),{http:200,success:true,version:0,enabled:false});
 for(const [kind,data] of [['date',f.date()],['sequence',f.sequence()]]){const r=await f.call(kind,data);assert.equal(r.http,503);assert.equal(r.code,'FEATURE_DISABLED');}
 assert.equal((await f.call('control',flag,'user')).http,403);
 const enabled=await f.call('control',flag);assert.equal(enabled.http,200);assert.equal(enabled.enabled,true);assert.equal(enabled.version,1);
 assert.equal((await f.call('control',flag)).replayed,true);assert.equal((await f.call('control',{...flag,reason:'other'})).http,409);
 assert.equal((await f.call('date',f.date())).http,200);assert.equal((await f.call('sequence',f.sequence())).http,200);
 assert.equal((await f.call('control',f.flag(false,1))).enabled,false);
 const oldRetry=await f.call('control',flag);assert.equal(oldRetry.replayed,true);assert.equal(oldRetry.enabled,false);assert.equal(oldRetry.version,2);assert.equal(oldRetry.appliedEnabled,true);assert.equal(oldRetry.superseded,true);
 for(const [kind,data] of [['date',f.date()],['sequence',f.sequence()]])assert.equal((await f.call(kind,data)).code,'FEATURE_DISABLED');
 const audit=f.sql.prepare('SELECT version,enabled,previous_enabled,actor_uid FROM bonus_release_control_events ORDER BY version').all().map(x=>({...x}));
 assert.deepEqual(audit,[{version:1,enabled:1,previous_enabled:0,actor_uid:ADMIN},{version:2,enabled:0,previous_enabled:1,actor_uid:ADMIN}]);
 assert.deepEqual(f.sql.prepare('SELECT * FROM orders').all(),order);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_transactions').get().n,0);
});
test('disable between check and date insert prevents any date event',async t=>{
 const f=fixture(t);assert.equal((await f.call('control',f.flag(true))).http,200);
 f.onBatch(()=>{f.onBatch(null);f.sql.prepare("INSERT INTO bonus_release_control_events VALUES(2,0,1,?,'fixture','2026-11-14',?,'{}')").run(ADMIN,crypto.randomUUID());f.sql.exec('UPDATE partner_bonus_v2_clock SET revision=revision+1 WHERE id=1');});
 const result=await f.call('date',f.date());assert.equal(result.http,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_bonus_performance_date_events').get().n,0);
});
test('disable between check and sequence insert prevents any draft event',async t=>{
 const f=fixture(t);assert.equal((await f.call('control',f.flag(true))).http,200);
 f.onBatch(()=>{f.onBatch(null);f.sql.prepare("INSERT INTO bonus_release_control_events VALUES(2,0,1,?,'fixture','2026-11-14',?,'{}')").run(ADMIN,crypto.randomUUID());f.sql.exec('UPDATE partner_bonus_v2_clock SET revision=revision+1 WHERE id=1');});
 const result=await f.call('sequence',f.sequence());assert.equal(result.http,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_order_sequence_draft_events').get().n,0);
});
test('missing control schema fails closed without changing any order, date or draft',async t=>{
 const f=fixture(t);f.sql.exec('DROP TABLE bonus_release_control_events');
 assert.equal((await f.call('date',f.date())).http,503);assert.equal((await f.call('sequence',f.sequence())).http,503);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM partner_bonus_performance_date_events').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_order_sequence_draft_events').get().n,0);
});
test('enable refuses incomplete prerequisites while disable remains available',async t=>{
 const f=fixture(t);f.sql.exec('DROP TABLE partner_full_service_evidence');
 const result=await f.call('control',f.flag(true));assert.equal(result.http,409);assert.equal(result.code,'PREREQUISITES_UNAVAILABLE');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_release_control_events').get().n,0);
 f.sql.prepare("INSERT INTO bonus_release_control_events VALUES(1,1,0,?,'fixture','2026-11-14',?,'{}')").run(ADMIN,crypto.randomUUID());
 assert.equal((await f.call('control',f.flag(false,1))).enabled,false);
});
test('control CAS rejects concurrent conflicting changes and revoked admin',async t=>{
 const f=fixture(t),a=f.flag(true),b=f.flag(true),results=await Promise.all([f.call('control',a),f.call('control',b)]);
 assert.deepEqual(results.map(x=>x.http).sort(),[200,409]);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_release_control_events').get().n,1);
 f.onBatch(()=>f.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN));
 assert.equal((await f.call('control',f.flag(false,1))).http,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM bonus_release_control_events').get().n,1);
});
