import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {writeRegistrationWithCredits,deliverMemberCredits,verifyRegistrationActor} from '../worker/member-shopping-credit.mjs';
import {RETAIL_ROLES} from '../js/modules/store-cooperation-plans.mjs';
import {isRewardOnlyRole} from '../worker/reward-only-cashier.mjs';
import {deliverRegistrationShoppingCredits} from '../workerbackup.js';

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
test('new member and follow-only profile accrue 288 once; competing referrals and concurrent submits do not create registration referrals',async()=>{
 for(const partial of [false,true]){
  const f=fixture();f.seed(sponsor);f.seed(other);if(partial)f.seed(buyer,'',sponsor);
  await Promise.all([f.submit(partial?other:sponsor),f.submit(other)]);
  assert.deepEqual(f.rows().map(r=>[r.user_id,r.points,r.point_type,r.award_type]),[[buyer,288,'gift_money','member_profile_bonus']]);
  const sent=[];const credit=async p=>{sent.push(p);return {success:true,data:{data:{insert_id:51}}};};
  await Promise.all([deliverMemberCredits(f.db,credit),deliverMemberCredits(f.db,credit)]);
  await f.submit();await deliverMemberCredits(f.db,credit);
  assert.equal(sent.length,1);assert.equal(sent[0].points,288);assert(f.rows().every(r=>r.status==='sent'));f.sql.close();
 }
});
test('referral state never creates new registration referral credits and completed profiles are not rewarded again',async()=>{
 for(const kind of ['direct','unknown','self','same wallet','old','alias']){
  const f=fixture();if(kind==='same wallet')f.seed(sponsor,'','',buyer);
  if(kind==='old')f.seed(buyer,'0912345678');if(kind==='alias')f.seed(other,'0912345678','',buyer);
  await f.submit(kind==='self'?buyer:kind==='direct'?'':sponsor);
  assert.deepEqual(f.rows().map(r=>r.points),['old','alias'].includes(kind)?[]:[288]);f.sql.close();
 }
});
test('failed profile transaction rolls back all reservations; lost acknowledgement never resends',async()=>{
 const f=fixture();f.seed(sponsor);
 await assert.rejects(writeRegistrationWithCredits(f.db,{line_id:buyer,name:'會員',phone:'0912345678',referrer_id:sponsor},f.db.prepare('INSERT INTO users(line_id) VALUES(?)').bind(sponsor)));
 assert.equal(f.rows().length,0);await f.submit();let writes=0;const timeout=async()=>{writes++;throw Error('after insert');};
 await deliverMemberCredits(f.db,timeout);await deliverMemberCredits(f.db,timeout);
 assert.equal(writes,1);assert(f.rows().every(r=>r.status==='member_review'));f.sql.close();
});
test('fresh LINE identity must match the profile; no token, expired token or impersonation',async()=>{
 const original=globalThis.fetch;try{
  globalThis.fetch=async(url,{headers})=>{assert.equal(url,'https://api.line.me/v2/profile');return {ok:headers.Authorization==='Bearer valid',json:async()=>({userId:buyer})};};
  for(const [token,id,ok] of [['',buyer,false],['expired',buyer,false],['valid',other,false],['valid',buyer,true]])assert.equal(await verifyRegistrationActor(token,id),ok);
 }finally{globalThis.fetch=original;}
});
test('follow and daily paths reserve 600 and 10 gift money only once on simultaneous calls',async()=>{
 const f=fixture();const credits=[];
 const points={resolvePointUserId:async(_env,id)=>id,ensureAwardTable:async()=>{},ensureMotherLineMember:async()=>({success:true}),taipeiDate:()=> '2026-11-02',
  queryUserPoints:async()=>({success:true,data:{balance:credits.filter(p=>p.userId===buyer).reduce((s,p)=>s+p.points,0),list:[]}}),
  insertUserPoint:async p=>{credits.push(p);return {success:true,data:{data:{insert_id:7}}};}};
 const scope={PointModule:points,AdminPointModule:{localBalance:async()=>0},D1ReadModule:{first:async(env,q,args)=>env.ACTMASTER_DB.prepare(q).bind(...args).first()},setTimeout:cb=>cb()};
 const method=(a,b)=>vm.runInNewContext('({'+source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)))+'})',scope);
 Object.assign(points,method('  async dailyCheckin(payload','  async findCustomerByPhone'));
 const follow=method('  async awardLineOAFollowPoints','  async handleFollowPointOnboarding');follow.text=String;follow.followAwardPoints=()=>600;
 const env={ACTMASTER_DB:f.db};await Promise.all([1,2].map(()=>follow.awardLineOAFollowPoints(env,buyer)));
 await Promise.all([1,2].map(()=>points.dailyCheckin({userId:buyer},env)));
 assert.deepEqual(credits.map(p=>[p.points,p.pointType]),[[600,'gift_money'],[10,'gift_money']]);f.sql.close();
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
 assert.equal(f.rows().some(r=>r.award_type==='member_inviter_bonus'||r.award_type==='member_invitee_bonus'),false);
 assert.equal(f.rows().length,1);assert.equal(f.rows()[0].points,288);f.sql.close();
});

test('legacy queued rewards retain their original amounts; sending, review, sent and unknown rows are never replayed',async()=>{
 const f=fixture();f.seed(sponsor);await f.submit();
 const add=(id,user,type,points,status,created='2000-01-01')=>f.sql.prepare(`INSERT INTO point_awards
   (award_id,user_id,card_id,award_type,points,point_type,status,response_json,created_at)
   VALUES(?,?,?,?,?,'gift_money',?,'{}',?)`).run(id,user,id,type,points,status,created);
 add('old-profile',other,'member_profile_bonus',50,'member_ready');
 add('old-invitee',other,'member_invitee_bonus',300,'member_ready');
 add('old-inviter',sponsor,'member_inviter_bonus',50,'member_ready');
 add('already-sent',other,'member_profile_bonus',50,'sent');
 add('still-sending',other,'member_profile_bonus',50,'member_sending');
 add('needs-review',other,'member_invitee_bonus',300,'member_review');
 add('unrecognized-amount',other,'member_profile_bonus',999,'member_ready');
 add('unrecognized-kind',other,'unexpected_reward',288,'member_ready');
 const sent=[];const credit=async input=>{sent.push(input);return {success:true,data:{data:{insert_id:51}}};};
 await Promise.all([deliverMemberCredits(f.db,credit),deliverMemberCredits(f.db,credit)]);
 await deliverMemberCredits(f.db,credit);
 assert.deepEqual(sent.map(x=>[x.shop_remark,x.points]).sort(),[
  ['AWD_member_profile_bonus_'+buyer,288],['old-profile',50],['old-invitee',300],['old-inviter',50]
 ].sort());
 const status=id=>f.rows().find(r=>r.award_id===id).status;
 assert.equal(status('already-sent'),'sent');assert.equal(status('still-sending'),'member_sending');
 assert.equal(status('needs-review'),'member_review');assert.equal(status('unrecognized-amount'),'member_ready');
 assert.equal(status('unrecognized-kind'),'member_ready');
 f.sql.close();
});

test('invalid queued amounts and user IDs cannot fill the batch and starve valid profile or legacy rewards',async()=>{
 const f=fixture();
 const add=(id,user,type,points,created)=>f.sql.prepare(`INSERT INTO point_awards
   (award_id,user_id,card_id,award_type,points,point_type,status,response_json,created_at)
   VALUES(?,?,?,?,?,'gift_money','member_ready','{}',?)`).run(id,user,id,type,points,created);
 for(let i=0;i<12;i++)add('bad-amount-'+i,buyer,'member_profile_bonus',999,'2000-01-01');
 for(let i=0;i<12;i++)add('bad-uid-'+i,'invalid-'+i,'member_profile_bonus',288,'2000-01-01');
 add('bad-point-type',buyer,'member_profile_bonus',288,'2000-01-01');
 f.sql.prepare("UPDATE point_awards SET point_type='system_point' WHERE award_id=?").run('bad-point-type');
 add('valid-current',buyer,'member_profile_bonus',288,'2026-01-01');
 add('valid-legacy',sponsor,'member_inviter_bonus',50,'2026-01-01');
 const sent=[];await deliverMemberCredits(f.db,async input=>{sent.push(input);return {success:true,data:{data:{insert_id:51}}};});
 assert.deepEqual(sent.map(x=>x.shop_remark).sort(),['valid-current','valid-legacy']);
 assert.equal(f.rows().filter(r=>r.status==='member_ready').length,25);
 f.sql.close();
});

test('a previous profile reservation, whether paid or waiting, is not replaced by the new amount',async()=>{
 for(const status of ['sent','member_ready','member_sending','member_review']){
  const f=fixture();f.seed(buyer,'');
  const awardId='AWD_member_profile_bonus_'+buyer;
  f.sql.prepare(`INSERT INTO point_awards(award_id,user_id,card_id,award_type,points,point_type,status,response_json)
   VALUES(?,?,?,'member_profile_bonus',50,'gift_money',?,'{}')`).run(awardId,buyer,buyer,status);
  await f.submit('');
  assert.equal(f.rows().length,1);assert.equal(f.rows()[0].points,50);assert.equal(f.rows()[0].status,status);
  assert.equal(f.sql.prepare('SELECT phone FROM users WHERE line_id=?').get(buyer).phone,'0912345678');
  f.sql.close();
 }
});

function friendClaimFixture() {
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE users(line_id TEXT PRIMARY KEY,row_id TEXT,point_line_id TEXT,legacy_line_id TEXT);
 CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
 CREATE TABLE friend_referral_events(event_id TEXT PRIMARY KEY,user_id TEXT,event_time_ms INTEGER,is_unblocked INTEGER);
 CREATE TABLE point_awards(award_id TEXT PRIMARY KEY,user_id TEXT,card_id TEXT,award_type TEXT,points INTEGER,point_type TEXT,status TEXT,response_json TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT);`);
 function prepare(query,values=[]){const statement=sql.prepare(query);return {bind:(...args)=>prepare(query,args),
  run:()=>({meta:{changes:statement.run(...values).changes}}),all:()=>({results:statement.all(...values)}),first:()=>statement.get(...values)};}
 const db={prepare}, actor=buyer, wallet=sponsor, at=1760000001000;
 sql.prepare('INSERT INTO users VALUES(?,?,?,?)').run(wallet,wallet,'','');
 sql.prepare('INSERT INTO friend_referral_events VALUES(?,?,?,0)').run('follow-event',actor,at);
 const metadata={actor,referrer:wallet,wallet,sponsor:{old:wallet,wallet,ownerLine:wallet,ids:[wallet],linked:false},
  reservedAt:at-1000,signedReferral:true,followEventId:'follow-event',followAt:at};
 const add=(id,user,card,body)=>sql.prepare(`INSERT INTO point_awards
  (award_id,user_id,card_id,award_type,points,point_type,status,response_json) VALUES(?,?,?,'member_inviter_bonus',50,'gift_money','member_ready',?)`)
  .run(id,user,card,JSON.stringify(body));
 add('AWD_member_inviter_bonus_'+actor,wallet,actor,metadata);
 return {sql,db,metadata,actor,wallet,add};
}

test('new signed friend credit rechecks identity and event atomically, while historical inviter rows remain payable',async()=>{
 for (const change of ['none','sponsor-wallet','sponsor-shared','sponsor-link','actor-row','actor-link','old-award','event-missing','invalid-snapshot']) {
  const f=friendClaimFixture(), {sql,actor,wallet}=f;
  if(change==='sponsor-wallet')sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(other,wallet);
  if(change==='sponsor-shared')sql.prepare('INSERT INTO users VALUES(?,?,?,?)').run(other,other,wallet,'');
  if(change==='sponsor-link')sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(wallet,other);
  if(change==='actor-row')sql.prepare('INSERT INTO users VALUES(?,?,?,?)').run(actor,other,'','');
  if(change==='actor-link')sql.prepare("INSERT INTO user_identity_links VALUES(?,?,'active')").run(actor,other);
  if(change==='old-award')f.add('old-award',wallet,actor,{});
  if(change==='event-missing')sql.exec('DELETE FROM friend_referral_events');
  if(change==='invalid-snapshot')sql.prepare('UPDATE point_awards SET response_json=?').run(JSON.stringify({...f.metadata,followAt:0}));
  if(change!=='old-award')f.add('legacy-inviter',wallet,other,{});
  const sent=[];const credit=async p=>{sent.push(p.shop_remark);return {success:true,data:{data:{insert_id:1}}};};
  await Promise.all([deliverMemberCredits(f.db,credit),deliverMemberCredits(f.db,credit)]);
  const row=sql.prepare('SELECT status FROM point_awards WHERE award_id=?').get('AWD_member_inviter_bonus_'+actor);
  assert.equal(row.status,change==='none'?'sent':'member_review',change);
  assert.equal(sent.filter(id=>id==='AWD_member_inviter_bonus_'+actor).length,change==='none'?1:0,change);
  assert.equal(sent.filter(id=>id===(change==='old-award'?'old-award':'legacy-inviter')).length,1,change);
  sql.close();
 }
});

test('new referral identity recheck fails closed if the database is unavailable',async()=>{
 const f=friendClaimFixture();let writes=0;
 f.sql.exec('DROP TABLE user_identity_links');
 await assert.rejects(deliverMemberCredits(f.db,async()=>{writes++;return {success:true};}));
 assert.equal(writes,0);
 assert.equal(f.sql.prepare('SELECT status FROM point_awards').get().status,'member_ready');
 f.sql.close();
});

test('actual worker sends signed friend credit only after strict identity reads; old rewards retain their path',async()=>{
 const originalFetch=globalThis.fetch;
 try {
  for (const scenario of ['success','first-read-fails','final-read-fails','mapping-changed-after-claim','mapping-changed-during-setup','legacy']) {
   const f=friendClaimFixture();let strictReads=0, motherCalls=0, pointCalls=0;
   f.sql.exec('ALTER TABLE users ADD COLUMN identity_source TEXT');
   f.sql.exec('ALTER TABLE users ADD COLUMN migrated_at TEXT');
   const db={prepare(query){const statement=(args=[])=>({bind(...values){return statement(values);},
    async all(){return {results:f.sql.prepare(query).all(...args)};},
    async run(){return {meta:{changes:f.sql.prepare(query).run(...args).changes}};},
    async first(){
     if(query.includes('SELECT 1 AS verified FROM point_awards')) {
      strictReads++;
      if ((scenario==='first-read-fails' && strictReads===1) || (scenario==='final-read-fails' && strictReads===2)) throw Error('synthetic D1 failure');
      if (scenario==='mapping-changed-after-claim' && strictReads===1) f.sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(other,sponsor);
     }
     return f.sql.prepare(query).get(...args);
    }
   });return statement();}};
   if(scenario==='legacy') f.sql.prepare("UPDATE point_awards SET response_json='{}' WHERE award_id=?").run('AWD_member_inviter_bonus_'+buyer);
   globalThis.fetch=async(url)=>{
    if(String(url).includes('insert-user-point')) {pointCalls++;return new Response(JSON.stringify({success:true,data:{insert_id:123}}),{status:200});}
    motherCalls++;
    if(scenario==='mapping-changed-during-setup') f.sql.prepare('UPDATE users SET point_line_id=? WHERE line_id=?').run(other,sponsor);
    return new Response(JSON.stringify({success:true,code:'already_member'}),{status:200});
   };
   await deliverRegistrationShoppingCredits({ACTMASTER_DB:db,POINT_API_KEY:'synthetic-test-key'});
   const status=f.sql.prepare('SELECT status FROM point_awards WHERE award_id=?').get('AWD_member_inviter_bonus_'+buyer).status;
   assert.equal(pointCalls,['success','legacy'].includes(scenario)?1:0,scenario);
   assert.equal(status,['success','legacy'].includes(scenario)?'sent':'member_review',scenario);
   assert.equal(strictReads,scenario==='legacy'?0:['success','final-read-fails','mapping-changed-during-setup'].includes(scenario)?2:1,scenario);
   assert.equal(motherCalls,['first-read-fails','mapping-changed-after-claim'].includes(scenario)?0:1,scenario);
   f.sql.close();
  }
 } finally {globalThis.fetch=originalFetch;}
});

// Automatic LINE/profile membership uses the real writer and index SQL. Network,
// referral-card creation and point-ledger initialization stay isolated here.
function automaticMemberFixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,name TEXT DEFAULT '',industry TEXT DEFAULT '',gender TEXT DEFAULT '',phone TEXT DEFAULT '',birthday TEXT DEFAULT '',region TEXT DEFAULT '',address TEXT DEFAULT '',socials TEXT DEFAULT '',role TEXT DEFAULT 'user',store_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '',network_id TEXT DEFAULT 'admin',tg_token TEXT DEFAULT '',tg_chat_id TEXT DEFAULT '',legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',identity_source TEXT DEFAULT '',migrated_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,points INTEGER DEFAULT 0);
 CREATE TABLE user_identity_links(id INTEGER PRIMARY KEY,old_line_id TEXT,new_line_id TEXT,status TEXT,updated_at TEXT);
 CREATE TABLE card_contacts(row_id TEXT,line_id TEXT,creator_id TEXT,owner_user_id TEXT,profile_user_id TEXT,claimed_by_uid TEXT,name TEXT,mobile TEXT,office_phone TEXT,title TEXT,company_name TEXT,network_id TEXT,source_type TEXT,created_at TEXT,updated_at TEXT);
 CREATE TABLE line_oa_threads(thread_id TEXT PRIMARY KEY,user_id TEXT,source_type TEXT DEFAULT 'user',display_name TEXT DEFAULT '',picture_url TEXT DEFAULT '',last_message_text TEXT DEFAULT '',last_message_type TEXT DEFAULT '',last_event_type TEXT DEFAULT '',message_count INTEGER DEFAULT 0,unread_count INTEGER DEFAULT 0,status TEXT DEFAULT 'open',last_event_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE line_oa_messages(message_id TEXT PRIMARY KEY,thread_id TEXT,user_id TEXT,direction TEXT,message_type TEXT,text_content TEXT,event_type TEXT,reply_token TEXT,raw_json TEXT,created_at TEXT);
 CREATE TABLE point_awards(award_id TEXT PRIMARY KEY,points INTEGER,status TEXT);INSERT INTO point_awards VALUES('existing-award',300,'sent');
 CREATE TABLE admin_point_ledger(row_id TEXT PRIMARY KEY,points INTEGER);INSERT INTO admin_point_ledger VALUES('existing-ledger',123);`);
 let failFast=false;
 const env={ACTMASTER_DB:{prepare(query){const statement=(args=[])=>({
  bind(...values){return statement(values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},
  async run(){if(failFast&&query.includes("'line_oa_chat_index'")){failFast=false;throw Error('synthetic fast-index failure');}return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}
 });return statement();}}};
 const object=name=>{const found=source.match(new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`,'m'));assert.ok(found,name);return found[0];};
 const context=vm.createContext({console,TextEncoder,crypto,Date,URL,RETAIL_ROLES,isRewardOnlyRole,writeRegistrationWithCredits,
  AdminPointModule:{async ensure(){}},fetch(){throw Error('external I/O forbidden');}});
 vm.runInContext([object('SecurityModule'),object('D1ReadModule'),object('D1WriteModule'),object('PointModule'),object('LineOAChatModule'),
  'globalThis.modules={write:D1WriteModule,point:PointModule,chat:LineOAChatModule};'].join('\n'),context);
 const {write,point,chat}=context.modules;write.clearUserCache=async()=>{};write.ensureReferralPlaceholderCard=async()=>null;chat.fetchProfile=async()=>({displayName:'合成自動會員',pictureUrl:'https://example.invalid/avatar'});
 const seed=(id,industry='',role='user',points=0)=>sql.prepare('INSERT INTO users(row_id,line_id,name,industry,role,points) VALUES(?,?,?,?,?,?)').run(id,id,'既有會員',industry,role,points);
 const thread=(id,name='合成對話')=>sql.prepare('INSERT INTO line_oa_threads(thread_id,user_id,display_name,picture_url,last_event_at) VALUES(?,?,?,?,?)').run('line:'+id,id,name,'https://example.invalid/avatar','2026-11-10T00:00:00Z');
 const row=id=>sql.prepare('SELECT * FROM users WHERE line_id=?').get(id);
 const points=()=>JSON.stringify([sql.prepare('SELECT * FROM point_awards').all(),sql.prepare('SELECT * FROM admin_point_ledger').all()]);
 return {sql,env,write,point,chat,seed,thread,row,points,failNextFast:()=>{failFast=true;}};
}

for(const slow of [false,true])test((slow?'slow fallback':'fast SQL')+' defaults only missing industry and honors supplied profile industry aliases',async t=>{
 const profiles=[{}, {industry:'教育業',title:'不應覆寫',companyName:'不應覆寫'}, {title:'設計業',companyName:'不應覆寫'}, {companyName:'餐飲業'}];
 for(const [index,profile] of profiles.entries()){
  const f=automaticMemberFixture(t),before=f.points();if(slow)f.failNextFast();
  const result=await f.point.ensureLocalPointWalletIndexFast(f.env,buyer,{name:'合成會員',...profile});
  assert.equal(result.success,true);assert.equal(result.source,slow?'local_wallet_index':'line_oa_chat_index');
  const row=f.row(buyer);assert.equal(row.industry,['服務業','教育業','設計業','餐飲業'][index]);assert.equal(row.role,'user');assert.equal(row.points,0);assert.equal(row.point_line_id,buyer);assert.equal(f.points(),before);
 }
});

test('automatic indexes preserve existing industry, raw roles and points in fast and slow paths',async t=>{
 for(const slow of [false,true])for(const [industry,role] of [['LINE OA','tenant'],['醫療業','store'],['金融業','reward'],['教育業','redeem']]){
  const f=automaticMemberFixture(t);f.seed(buyer,industry,role,876);const before=f.points();if(slow)f.failNextFast();
  assert.equal((await f.point.ensureLocalPointWalletIndexFast(f.env,buyer,{industry:'服務業',role:'admin'})).success,true);
  assert.equal(f.row(buyer).industry,industry);assert.equal(f.row(buyer).role,role);assert.equal(f.row(buyer).points,876);assert.equal(f.points(),before);
 }
});

test('webhook saveEvent passes the service industry to the real fast index and duplicate messages do not re-create it',async t=>{
 const f=automaticMemberFixture(t),calls=[],actual=f.point.ensureLocalPointWalletIndexFast;
 f.point.ensureLocalPointWalletIndexFast=async function(env,id,profile){calls.push({id,profile});return actual.call(this,env,id,profile);};
 const event={type:'message',timestamp:1794268800000,source:{type:'user',userId:buyer},message:{id:'synthetic-message',type:'text',text:'合成測試'}};
 const before=f.points();await f.chat.saveEvent(f.env,event);
 assert.equal(calls.length,1);assert.equal(calls[0].id,buyer);assert.equal(calls[0].profile.industry,'服務業');assert.equal(calls[0].profile.name,'合成自動會員');
 assert.equal(f.row(buyer).industry,'服務業');assert.equal(f.row(buyer).role,'user');assert.equal(f.row(buyer).points,0);
 assert.equal(f.sql.prepare('SELECT message_count FROM line_oa_threads').get().message_count,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM line_oa_messages').get().n,1);
 assert.equal((await f.chat.saveEvent(f.env,event)).duplicate,true);assert.equal(calls.length,1);assert.equal(f.points(),before);
});

test('thread repair candidates use service industry while existing user industry remains authoritative',async t=>{
 const f=automaticMemberFixture(t);f.thread(buyer);f.seed(other,'LINE OA','tenant',876);f.thread(other);
 const changes=f.sql.prepare('SELECT total_changes() n').get().n,before=f.points();
 const preview=await f.point.repairPointWalletSearchIndex({dryRun:true},f.env);
 assert.equal(preview.data.candidates.find(row=>row.userId===buyer).profile.industry,'服務業');
 assert.equal(preview.data.candidates.find(row=>row.userId===other).profile.industry,'LINE OA');assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes);
 const repaired=await f.point.repairPointWalletSearchIndex({},f.env);assert.equal(repaired.data.failedCount,0);assert.equal(repaired.data.repairedCount,2);
 assert.equal(f.row(buyer).industry,'服務業');assert.equal(f.row(other).industry,'LINE OA');assert.equal(f.row(other).role,'tenant');assert.equal(f.row(other).points,876);assert.equal(f.points(),before);
});

test('thread customer search displays service only when no existing industry is available and stays read-only',async t=>{
 const f=automaticMemberFixture(t);f.thread(buyer);f.seed(other,'LINE OA','tenant',876);f.thread(other);f.seed(sponsor,'醫療業');f.thread(sponsor);
 const changes=f.sql.prepare('SELECT total_changes() n').get().n;
 const result=await f.point.findStorePointCustomerCandidates(f.env,'合成對話');
 assert.equal(result.matches.find(row=>row.id===buyer).industry,'服務業');assert.equal(result.matches.find(row=>row.id===other).industry,'LINE OA');assert.equal(result.matches.find(row=>row.id===sponsor).industry,'醫療業');
 assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,changes);
});

test('actual profile writer defaults a new empty industry, honors self input and leaves existing empty or legacy industry intact',async t=>{
 const f=automaticMemberFixture(t),before=f.points();
 let result=await f.write.upsertUser({userId:buyer,name:'新合成會員',role:'store'},f.env);
 assert.equal(result.success,true);assert.equal(f.row(buyer).industry,'服務業');assert.equal(result.data.info.industry,'服務業');assert.equal(f.row(buyer).role,'user');
 result=await f.write.upsertUser({userId:other,name:'自填合成會員',industry:'資訊業'},f.env);assert.equal(result.success,true);assert.equal(f.row(other).industry,'資訊業');
 for(const [id,industry,role] of [[sponsor,'','redeem'],[uid('d'),'LINE OA','tenant']]){
  f.seed(id,industry,role,876);assert.equal((await f.write.upsertUser({userId:id,name:'更新姓名',industry:''},f.env)).success,true);
  assert.equal(f.row(id).industry,industry);assert.equal(f.row(id).role,role);assert.equal(f.row(id).points,876);
 }
 assert.equal(f.points(),before);
});
