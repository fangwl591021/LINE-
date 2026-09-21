import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleDailyTank,taiwanDate} from '../worker/daily-tank-challenge.mjs';
import {winningReplay} from './helpers/tank-player.mjs';
import worker from '../workerbackup.js';

const actor={userId:'line-member',token:'verified-LINE-token',role:'user'};
const proof=winningReplay(1);assert.equal(proof.game.state,'won');
function fixture() {
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 sql.exec(readFileSync(new URL('../migrations/0004_point_awards.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0043_daily_tank_sessions.sql',import.meta.url),'utf8'));
 sql.exec(readFileSync(new URL('../migrations/0044_game_center.sql',import.meta.url),'utf8'));
 const f={sql,time:Date.parse('2026-09-20T03:00:00Z'),sends:0,rows:[],balance:300,mode:'success',hasUser:true};
 const db={prepare(q){return {bind(...args){return {
  q,args,async all(){return {results:sql.prepare(q).all(...args)};},
  async first(){return sql.prepare(q).get(...args)||null;},
  async run(){if(f.failReceipt && q.startsWith('UPDATE point_awards'))throw Error('D1 unavailable');
   return {success:true,meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}
 };}};}};
 db.batch=async statements=>{sql.exec('BEGIN');try{const results=statements.map(({q,args})=>({success:true,meta:{changes:Number(sql.prepare(q).run(...args).changes)}}));sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}};
 db.withSession=()=>db;f.env={ACTMASTER_DB:db,MOTHER_CUS_ACCOUNT_SHOP_ID:'78'};
 f.deps={now:()=>f.time,findIdentity:async()=>f.hasUser?{user:{line_id:'line-member',point_line_id:f.member||'canonical-point'},canonicalId:'line-member'}:null,
  points:{
   async insertUserPoint(p){f.sends++;f.last=p;
    if(f.mode==='wait')await new Promise(resolve=>f.release=resolve);
    if(f.mode==='throw')throw Error('timeout');
    if(f.mode==='ambiguous')return {success:true,data:{}};
    f.balance+=p.points;f.rows.push({id:'tx-1',shop_remark:p.shop_remark,get_point:p.points,point_type:p.pointType,event_name:p.eventName});
    if(f.mode==='committed-timeout')throw Error('response lost');
    return {success:true,data:{success:true,data:{id:'tx-1'}}};
   },
   async queryUserPoints(){return {success:true,data:{source:'mother',list:f.rows,balance:f.balance}};},
   async queryPointBalanceFast(){return f.balanceFail?{success:false}:{success:true,data:{source:'mother',balance:f.balance}};}
  }};
 f.call=(action,payload={},who=actor)=>handleDailyTank(action,payload,f.env,who,f.deps);
 f.begin=async()=>{const r=await f.call('startDailyTank');assert.equal(r.success,true);f.id=r.data.sessionId;
  sql.prepare('UPDATE daily_tank_sessions SET seed=1 WHERE id=?').run(f.id);f.time+=proof.game.ticks/30*1000+2000;return f.id;};
 f.finish=extra=>f.call('completeDailyTank',{sessionId:f.id,replay:proof.replay,...extra});
 f.count=()=>sql.prepare('SELECT count(*) AS n FROM point_awards').get().n;
 return f;
}
test('new map is bound to server session; old clients/sessions still replay on old map',async()=>{
 const f=fixture();try{
  const start=await f.call('startDailyTank',{mapVersion:2});assert.equal(start.data.mapVersion,2);assert.ok(start.data.sessionId.startsWith('v2:'));
  f.sql.prepare('UPDATE daily_tank_sessions SET seed=1 WHERE id=?').run(start.data.sessionId);
  const p=winningReplay(1,2);f.time+=p.game.ticks/30*1000+2000;
  // Client cannot force old replay on a v2 session, nor override it using complete payload.
  assert.equal((await f.call('completeDailyTank',{sessionId:start.data.sessionId,mapVersion:1,replay:proof.replay})).success,false);
  assert.equal((await f.call('completeDailyTank',{sessionId:start.data.sessionId,mapVersion:1,replay:p.replay})).data.state,'completed');
  assert.equal(f.sends,1);
 }finally{f.sql.close();}
});
test('reuses canonical member, existing gift_money service and point_awards; amount/tenant/identity are server-owned',async()=>{
 const f=fixture();try{
  assert.equal((await f.call('dailyTankStatus')).data.state,'available');await f.begin();
  const result=await f.finish({points:99999,pointUserId:'attacker',tenantId:'evil',date:'2000-01-01',kills:5});
  assert.equal(result.data.awarded,true);assert.equal(result.data.balance,400);assert.equal(f.sends,1);
  assert.equal(f.last.points,100);assert.equal(f.last.userId,'canonical-point');assert.equal(f.last.shop_id,78);
  assert.equal(f.last.pointType,'gift_money');assert.equal(f.rows[0].event_name,'每日坦克挑戰');
  assert.equal(f.last.requireConfirmedResult,true);assert.equal(f.last.skipMotherMemberSetup,true);
  const row=f.sql.prepare('SELECT * FROM point_awards').get();assert.equal(row.award_type,'daily_tank_challenge');
  assert.equal(row.award_id,'daily_tank_challenge:78:canonical-point:2026-09-20');assert.equal(row.status,'sent');
  assert.equal(JSON.parse(row.response_json).pointTransactionId,'tx-1');
  assert.equal((await f.finish()).data.alreadyCompleted,true);assert.equal(f.sends,1);assert.equal(f.count(),1);
 }finally{f.sql.close();}
});
test('parallel pages, repeated requests and refresh reserve exactly one upstream send',async()=>{
 const f=fixture();try{
  await f.begin();const id1=f.id;await f.begin();const id2=f.id;f.mode='wait';
  const first=f.call('completeDailyTank',{sessionId:id1,replay:proof.replay});
  while(!f.release)await new Promise(r=>setTimeout(r,1));
  const duplicates=await Promise.all(Array.from({length:12},()=>f.call('completeDailyTank',{sessionId:id2,replay:proof.replay})));
  assert.ok(duplicates.every(r=>r.data.state==='pending'));assert.equal(f.sends,1);
  f.release();assert.equal((await first).data.state,'completed');assert.equal((await f.call('dailyTankStatus')).data.state,'completed');assert.equal(f.sends,1);
 }finally{f.sql.close();}
});
test('Taipei midnight resets rewards; old attempt cannot claim for a new day; tenant separated',async()=>{
 assert.equal(taiwanDate(Date.parse('2026-09-20T15:59:59Z')),'2026-09-20');
 assert.equal(taiwanDate(Date.parse('2026-09-20T16:00:00Z')),'2026-09-21');
 const f=fixture();try{
  await f.begin();await f.finish();f.time=Date.parse('2026-09-20T16:00:00Z');
  assert.equal((await f.call('dailyTankStatus')).data.state,'available');await f.begin();await f.finish();assert.equal(f.sends,2);
  f.env.MOTHER_CUS_ACCOUNT_SHOP_ID='79';assert.equal((await f.call('dailyTankStatus')).data.state,'available');await f.begin();await f.finish();assert.equal(f.sends,3);assert.equal(f.count(),3);
 }finally{f.sql.close();}
 const expired=fixture();try{await expired.begin();expired.time+=86400000;assert.equal((await expired.finish()).success,false);assert.equal(expired.sends,0);}finally{expired.sql.close();}
});
test('unknown / missing LINE session / nonexistent member / forged win cannot earn points',async()=>{
 const f=fixture();try{
  for(const a of [null,{...actor,token:''},{...actor,source:'d1_identity_fallback'}])assert.equal((await f.call('startDailyTank',{},a)).success,false);
  f.hasUser=false;assert.equal((await f.call('startDailyTank')).success,false);f.hasUser=true;
  await f.begin();
  for(const payload of [{replay:[]},{replay:[[1,16]],kills:5},{sessionId:'someone-else'},{sessionId:null}])assert.equal((await f.finish(payload)).success,false);
  assert.equal((await f.call('completeDailyTank',{sessionId:f.id,replay:proof.replay},{...actor,userId:'other'})).success,false);
  f.member='different-point';assert.equal((await f.finish()).success,false);assert.equal(f.sends,0);
 }finally{f.sql.close();}
});
test('upstream timeout/ambiguous result is never resent, no speculative/local credits',async()=>{
 for(const mode of ['throw','ambiguous','committed-timeout']) {
  const f=fixture();try{
   await f.begin();f.mode=mode;assert.equal((await f.finish()).data.state,'pending');
   const r=await f.finish();assert.equal(r.data.state,mode==='committed-timeout'?'completed':'pending');assert.equal(f.sends,1);
   f.time+=86400000;const old=await f.call('dailyTankStatus',{sessionId:f.id});assert.equal(old.data.state,r.data.state);assert.equal(f.sends,1);
  }finally{f.sql.close();}
 }
});
test('D1 receipt write failure after upstream success reconciles; balance failure does not invent total',async()=>{
 const f=fixture();try{
  await f.begin();f.failReceipt=true;assert.equal((await f.finish()).success,false);assert.equal(f.sends,1);
  f.failReceipt=false;f.balanceFail=true;const r=await f.finish();assert.equal(r.data.state,'completed');assert.equal(r.data.balance,null);assert.equal(f.sends,1);
 }finally{f.sql.close();}
});
test('reconciliation requires exact marker and +100, not similar balance or unrelated ledger rows',async()=>{
 const f=fixture();try{
  await f.begin();f.mode='throw';await f.finish();
  f.rows=[{shop_remark:f.last.shop_remark+'-different',get_point:100},{shop_remark:f.last.shop_remark,get_point:10},{shop_remark:f.last.shop_remark,get_point:100,point_type:'coupon'}];
  assert.equal((await f.finish()).data.state,'pending');assert.equal(f.sends,1);
 }finally{f.sql.close();}
});
test('existing checkin award coexists untouched; replay without completion request earns nothing',async()=>{
 const f=fixture();try{
  f.sql.prepare("INSERT INTO point_awards(award_id,user_id,card_id,award_type,points,status) VALUES('daily','canonical-point','2026-09-20','daily_checkin',10,'sent')").run();
  await f.begin();assert.equal(f.sends,0);await f.finish();
  assert.equal(f.count(),2);assert.equal(f.sql.prepare("SELECT points FROM point_awards WHERE award_id='daily'").get().points,10);
 }finally{f.sql.close();}
});
test('real Worker dispatch rejects UID-only and spoofed verified fields for all new actions',async()=>{
 for(const action of ['dailyTankStatus','startDailyTank','completeDailyTank']) {
  const res=await worker.fetch(new Request('https://unit.test/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{userId:'line-member',authenticatedUserId:'line-member',role:'admin',kills:5,points:100}})}),{});
  const r=await res.json();assert.equal(r.success,false);assert.match(r.error,/Token/);
 }
});
