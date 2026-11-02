import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {writeRegistrationWithCredits,deliverMemberCredits,verifyRegistrationActor} from '../worker/member-shopping-credit.mjs';

const uid = n => 'U'+n.repeat(32), buyer=uid('a'), sponsor=uid('b'), other=uid('c');
const source = readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
function fixture(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(`CREATE TABLE users(line_id TEXT PRIMARY KEY,name TEXT,phone TEXT,referrer_id TEXT,legacy_line_id TEXT,point_line_id TEXT);
    CREATE TABLE point_awards(award_id TEXT PRIMARY KEY,user_id TEXT,card_id TEXT,award_type TEXT,points INT,point_type TEXT,status TEXT,response_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT);
    CREATE UNIQUE INDEX award_key ON point_awards(user_id,card_id,award_type);`);
  function prepare(query, values=[]){
    const statement=sql.prepare(query);
    return {bind:(...args)=>prepare(query,args),run:()=>({meta:{changes:statement.run(...values).changes}}),all:()=>({results:statement.all(...values)}),first:()=>statement.get(...values)};
  }
  const db={prepare,batch:async statements=>{sql.exec('BEGIN');try{const result=statements.map(s=>s.run());sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}};
  const seed=(id,phone='',ref='',wallet='')=>sql.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(id,'姓名',phone,ref,'',wallet);
  const submit=(ref=sponsor,id=buyer)=>writeRegistrationWithCredits(db,{line_id:id,referrer_id:ref,name:'新會員',phone:'0912345678'},prepare(`INSERT INTO users(line_id,name,phone,referrer_id) VALUES(?,'新會員','0912345678',?) ON CONFLICT(line_id) DO UPDATE SET phone=excluded.phone`,[id,ref]));
  const rows=()=>sql.prepare('SELECT * FROM point_awards ORDER BY points,award_type').all();
  return {sql,db,seed,submit,rows};
}
test('new member and follow-only profile both accrue once; two invites, concurrent submits and cron do not duplicate',async()=>{
 for(const partial of [false,true]){
  const f=fixture();f.seed(sponsor);f.seed(other);if(partial)f.seed(buyer,'',sponsor);
  await Promise.all([f.submit(partial?other:sponsor),f.submit(other)]);
  assert.deepEqual(f.rows().map(r=>[r.user_id,r.points,r.point_type]),[[sponsor,50,'gift_money'],[buyer,50,'gift_money'],[buyer,300,'gift_money']]);
  const sent=[];const credit=async p=>{sent.push(p);return {success:true,data:{data:{insert_id:51}}};};
  await Promise.all([deliverMemberCredits(f.db,credit),deliverMemberCredits(f.db,credit)]);
  await f.submit();await deliverMemberCredits(f.db,credit);
  assert.equal(sent.length,3);assert(f.rows().every(r=>r.status==='sent'));f.sql.close();
 }
});
test('no referral, unknown, self, same wallet and old completed profiles do not create referral credits',async()=>{
 for(const kind of ['direct','unknown','self','same wallet','old','alias']){
  const f=fixture();if(kind==='same wallet')f.seed(sponsor,'','',buyer);
  if(kind==='old')f.seed(buyer,'0912345678');if(kind==='alias')f.seed(other,'0912345678','',buyer);
  await f.submit(kind==='self'?buyer:kind==='direct'?'':sponsor);
  assert.deepEqual(f.rows().map(r=>r.points),['old','alias'].includes(kind)?[]:[50]);f.sql.close();
 }
});
test('failed profile transaction rolls back all reservations; lost acknowledgement never resends',async()=>{
 const f=fixture();f.seed(sponsor);
 await assert.rejects(writeRegistrationWithCredits(f.db,{line_id:buyer,name:'會員',phone:'0912345678',referrer_id:sponsor},f.db.prepare('INSERT INTO users(line_id) VALUES(?)').bind(sponsor)));
 assert.equal(f.rows().length,0);await f.submit();let writes=0;const timeout=async()=>{writes++;throw Error('after insert');};
 await deliverMemberCredits(f.db,timeout);await deliverMemberCredits(f.db,timeout);
 assert.equal(writes,3);assert(f.rows().every(r=>r.status==='member_review'));f.sql.close();
});
test('fresh LINE identity must match the profile; no token, expired token or impersonation',async()=>{
 const original=globalThis.fetch;try{
  globalThis.fetch=async(url,{headers})=>{assert.equal(url,'https://api.line.me/v2/profile');return {ok:headers.Authorization==='Bearer valid',json:async()=>({userId:buyer})};};
  for(const [token,id,ok] of [['',buyer,false],['expired',buyer,false],['valid',other,false],['valid',buyer,true]])assert.equal(await verifyRegistrationActor(token,id),ok);
 }finally{globalThis.fetch=original;}
});
test('actual follow and daily paths award 300 and 10 gift money only once on simultaneous calls',async()=>{
 const f=fixture();const credits=[];
 const points={resolvePointUserId:async(_env,id)=>id,ensureAwardTable:async()=>{},ensureMotherLineMember:async()=>({success:true}),taipeiDate:()=> '2026-11-02',
  queryUserPoints:async()=>({success:true,data:{balance:credits.filter(p=>p.userId===buyer).reduce((s,p)=>s+p.points,0),list:[]}}),
  insertUserPoint:async p=>{credits.push(p);return {success:true,data:{data:{insert_id:7}}};}};
 const scope={PointModule:points,AdminPointModule:{localBalance:async()=>0},D1ReadModule:{first:async(env,q,args)=>env.ACTMASTER_DB.prepare(q).bind(...args).first()},setTimeout:cb=>cb()};
 const method=(a,b)=>vm.runInNewContext('({'+source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)))+'})',scope);
 Object.assign(points,method('  async dailyCheckin(payload','  async findCustomerByPhone'));
 const follow=method('  async awardLineOAFollowPoints','  async handleFollowPointOnboarding');follow.text=String;follow.followAwardPoints=()=>300;
 const env={ACTMASTER_DB:f.db};await Promise.all([1,2].map(()=>follow.awardLineOAFollowPoints(env,buyer)));
 await Promise.all([1,2].map(()=>points.dailyCheckin({userId:buyer},env)));
 assert.deepEqual(credits.map(p=>[p.points,p.pointType]),[[300,'gift_money'],[10,'gift_money']]);f.sql.close();
});

test('verified profile save uses the actual registration writer and persists the effective sponsor',async()=>{
 const f=fixture();f.seed(sponsor);f.seed(other);f.seed(buyer,'',sponsor);
 for(const column of ['row_id','industry','gender','birthday','region','address','socials','role','store_id','network_id','tg_token','tg_chat_id'])
   f.sql.exec('ALTER TABLE users ADD COLUMN '+column+' TEXT');
 const start=source.indexOf('const D1WriteModule = {');
 const writer=vm.runInNewContext(source.slice(start,source.indexOf('\n};',start))+'\n};D1WriteModule',{
   writeRegistrationWithCredits,isRewardOnlyRole:()=>false,
   SecurityModule:{cleanPhone:p=>p,normalizeRole:r=>r,hasHardAdminId:()=>false,isHardAdmin:()=>false,sanitizeRole:()=> 'user'},
   D1ReadModule:{first:async(env,q,args)=>env.ACTMASTER_DB.prepare(q).bind(...args).first(),userRow:r=>r}
 });
 writer.clearUserCache=async()=>{};writer.ensureReferralPlaceholderCard=async()=>null;
 const payload={userId:buyer,name:'新會員',phone:'0912345678',referrerId:other};
 const env={ACTMASTER_DB:f.db};
 assert.equal((await writer.upsertUser(payload,env,{rewardActor:other})).success,false);
 assert.equal(f.rows().length,0);
 for(let i=0;i<2;i++)assert.equal((await writer.upsertUser(payload,env,{rewardActor:buyer})).success,true);
 assert.equal(f.sql.prepare('SELECT referrer_id FROM users WHERE line_id=?').get(buyer).referrer_id,sponsor);
 assert.equal(f.rows().find(r=>r.award_type==='member_inviter_bonus').user_id,sponsor);
 assert.equal(f.rows().length,3);f.sql.close();
});
