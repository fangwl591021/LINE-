import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {findMemberReferrer,memberNumberView} from '../worker/member-number.mjs';
import api from '../workerbackup.js';

const migration=readFileSync(new URL('../migrations/0067_member_numbers.sql',import.meta.url),'utf8');
const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
function fixture(legacy=true){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,name TEXT DEFAULT '',industry TEXT DEFAULT '',gender TEXT DEFAULT '',phone TEXT DEFAULT '',birthday TEXT DEFAULT '',region TEXT DEFAULT '',address TEXT DEFAULT '',socials TEXT DEFAULT '',role TEXT DEFAULT 'user',store_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '',network_id TEXT DEFAULT 'admin',tg_token TEXT DEFAULT '',tg_chat_id TEXT DEFAULT '',points INTEGER DEFAULT 100,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',identity_source TEXT DEFAULT '',migrated_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
 CREATE TABLE card_contacts(row_id TEXT);
 ${legacy?`INSERT INTO users(row_id,line_id,name,created_at) VALUES('A','UA','甲','2026-10-18 15:59:59'),('B','UB','乙','2026-10-18 16:00:00'),('C','UC','丙','2026-10-18 16:00:00'),('BAD','UBAD','日期不明','not-a-date');`:''}`);
 const before=sql.prepare('SELECT row_id,line_id,name,phone,role,referrer_id,network_id,points,created_at FROM users ORDER BY row_id').all();
 sql.exec(migration);
 const db={prepare(query){let args=[];return{bind(...values){args=values;return this;},first:async()=>sql.prepare(query).get(...args)||null,all:async()=>({success:true,results:sql.prepare(query).all(...args)}),run:async()=>({success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}})}}};
 return {sql,db,before,env:{ACTMASTER_DB:db},row:id=>sql.prepare('SELECT * FROM users WHERE line_id=?').get(id),add:(id,extra='')=>sql.prepare(`INSERT INTO users(row_id,line_id,name${extra?',legacy_line_id':''}) VALUES(?,?,?${extra?',?':''})`).run(...[id,id,id,...(extra?[extra]:[])])};
}
test('additive historical backfill preserves all protected data and Taipei day boundaries',()=>{
 const f=fixture();try{
 assert.deepEqual(f.sql.prepare('SELECT row_id,line_id,name,phone,role,referrer_id,network_id,points,created_at FROM users ORDER BY row_id').all(),f.before);
 assert.equal(f.row('UA').member_number,'20261018001');assert.equal(f.row('UB').member_number,'20261019001');assert.equal(f.row('UC').member_number,'20261019002');
 assert.equal(f.row('UBAD').member_joined_at,'');assert.equal(f.row('UBAD').member_date_source,'legacy_unknown');
 assert.equal(f.row('UA').member_date_source,'legacy_created_at');
 }finally{f.sql.close()}
});
test('every INSERT path allocates atomically, expands beyond 999, and never recycles on update/retry/delete',async()=>{
 const f=fixture(false);try{
 await Promise.all(Array.from({length:1005},(_,i)=>Promise.resolve().then(()=>f.add('U'+i))));
 const all=f.sql.prepare('SELECT * FROM member_number_registry ORDER BY day_sequence').all();assert.equal(new Set(all.map(x=>x.member_number)).size,1005);
 assert.ok(all[0].member_number.endsWith('001'));assert.ok(all[999].member_number.endsWith('1000'));assert.equal(all[1004].day_sequence,1005);
 const before=f.row('U0').member_number;f.sql.prepare("UPDATE users SET name='changed',created_at='2000-01-01' WHERE line_id='U0'").run();assert.equal(f.row('U0').member_number,before);
 f.sql.prepare("INSERT INTO users(row_id,line_id) VALUES('retry','U0') ON CONFLICT(line_id) DO UPDATE SET name='retry'").run();assert.equal(f.row('U0').member_number,before);assert.equal(f.sql.prepare('SELECT count(*) n FROM member_number_registry').get().n,1005);
 f.sql.prepare("DELETE FROM users WHERE line_id='U0'").run();f.add('OTHER');assert.equal(f.row('OTHER').member_number.endsWith('1006'),true);f.add('U0');assert.equal(f.row('U0').member_number,before);
 assert.throws(()=>f.sql.prepare('DELETE FROM member_number_registry').run(),/recycled/);assert.throws(()=>f.sql.prepare("UPDATE member_number_registry SET member_number='forged'").run(),/permanent/);
 f.sql.exec('BEGIN');f.add('ROLLBACK');f.sql.exec('ROLLBACK');assert.equal(f.row('ROLLBACK'),undefined);assert.equal(f.sql.prepare("SELECT count(*) n FROM member_number_registry WHERE line_id='ROLLBACK'").get().n,0);
 }finally{f.sql.close()}
});
test('number lookup is read-only, exact, minimal and follows persisted canonical aliases only',async()=>{
 const f=fixture();try{
 const before=f.sql.prepare('SELECT total_changes() n').get().n;const result=await findMemberReferrer(f.db,'20261018001');assert.equal(result.userId,'UA');assert.deepEqual(Object.keys(result).sort(),['memberDateSource','memberJoinedAt','memberNumber','name','userId']);assert.equal(f.sql.prepare('SELECT total_changes() n').get().n,before);
 await assert.rejects(findMemberReferrer(f.db,'20261018099'),/找不到/);await assert.rejects(findMemberReferrer(f.db,"' OR 1=1--"),/找不到/);
 f.add('NEW','UA');assert.equal(f.row('NEW').member_number,'20261018001');await assert.rejects(findMemberReferrer(f.db,'20261018001'),/不唯一/);
 f.sql.prepare("INSERT INTO user_identity_links VALUES('UA','NEW','active')").run();assert.equal((await findMemberReferrer(f.db,'20261018001')).userId,'NEW');
 f.sql.prepare("DELETE FROM users WHERE line_id='UA'").run();assert.equal((await findMemberReferrer(f.db,'20261018001')).userId,'NEW');
 }finally{f.sql.close()}
});
test('profile write ignores forged number/date, resolves referrer to UID and preserves ordinary existing affiliation',async()=>{
 const f=fixture();try{
 // Exercise the actual upsertUser implementation with real SQLite; stub unrelated services only.
 const start=source.indexOf('  async upsertUser(payload, env, options = {})'),end=source.indexOf('  async updateUserRoleLegacy',start);
 const read={first:async(env,q,args)=>env.ACTMASTER_DB.prepare(q).bind(...args).first(),userRow:row=>({userId:row.line_id,...memberNumberView(row),referrerId:row.referrer_id,networkId:row.network_id})};
 const security={normalizeRole:r=>r||'user',sanitizeRole:(_,r)=>r,hasHardAdminId:()=>false,isHardAdmin:()=>false};
 const method=Function('D1ReadModule','SecurityModule','isRewardOnlyRole','isMemberNumber','findMemberReferrer','return ({'+source.slice(start,end)+'})')(read,security,()=>false,v=>/^\d{11,}$/.test(v),findMemberReferrer);
 Object.assign(method,{hasD1:()=>true,role:r=>r||'user',pick:(d,keys,fallback='')=>keys.map(k=>d[k]).find(v=>v!==undefined&&v!==null)||fallback,normalizeUser:p=>({row_id:p.userId,line_id:p.userId,name:p.name||'測試',industry:'',gender:'',phone:'',birthday:'',region:'',address:'',socials:'',role:'user',store_id:'',referrer_id:p.referrerId||'',network_id:p.networkId||'admin',tg_token:'',tg_chat_id:''}),clearUserCache:async()=>{},ensureReferralPlaceholderCard:async()=>null});
 const saved=await method.upsertUser({userId:'NEW',referrerId:'20261018001',memberNumber:'forged',memberJoinedAt:'2000-01-01'},f.env);assert.equal(saved.success,true);assert.equal(saved.data.info.referrerId,'UA');assert.match(saved.data.info.memberNumber,/^\d{11,}$/);assert.notEqual(saved.data.info.memberJoinedAt,'2000-01-01');
 const number=saved.data.info.memberNumber;await method.upsertUser({userId:'NEW',referrerId:'20261019001'},f.env);assert.equal(f.row('NEW').referrer_id,'UA');assert.equal(f.row('NEW').member_number,number);
 await method.upsertUser({userId:'NEW',referrerId:'20261019001',authenticatedRole:'admin'},f.env);assert.equal(f.row('NEW').referrer_id,'UB');
 const before=f.sql.prepare('SELECT * FROM users').all();for(const referrerId of [number,'20261018999']){assert.equal((await method.upsertUser({userId:'NEW',referrerId},f.env)).success,false)}assert.deepEqual(f.sql.prepare('SELECT * FROM users').all(),before);
 }finally{f.sql.close()}
});
test('preview requires actual authentication, not payload admin claims',async()=>{
 const response=await api.fetch(new Request('https://unit.test/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'adminLookupMemberNumber',payload:{query:'20261018001',userId:'admin',authenticatedUserId:'admin',authenticatedRole:'admin',role:'admin'}})}),{});
 assert.equal((await response.json()).success,false);
 assert.match(source,/adminLookupMemberNumber: \{ access: 'admin' \}/);
});
test('existing action authorization denies all non-admin roles and never permits D1 identity fallback for preview',async()=>{
 const object=name=>source.match(new RegExp('^const '+name+' = \\{[\\s\\S]*?^\\};','m'))[0];
 const scope={console,URL,crypto,TextEncoder};vm.createContext(scope);vm.runInContext(object('ACTION_POLICIES')+'\n'+object('SecurityModule')+'\nglobalThis.security=SecurityModule;',scope);
 const security=scope.security;
 for(const role of ['user','store','tenant','reward','redeem','admin']){
  security.getActor=async()=>({userId:'VERIFIED',role,networkId:'admin',token:'synthetic-verified-token'});
  const payload={userId:'forged',authenticatedRole:'admin',role:'admin'};
  const result=await security.authorizeAction('adminLookupMemberNumber',payload,new Request('https://local.test'),{});
  assert.equal(result.allowed,role==='admin');
 }
 security.getActor=async()=>null;
 assert.equal((await security.authorizeAction('adminLookupMemberNumber',{userId:'admin'},new Request('https://local.test'),{ACTMASTER_DB:{}})).allowed,false);
});
test('CRM dates use Taipei, unknown history never claims seniority, and both CRM versions expose number search',()=>{
 const context={Intl,Date,document:{addEventListener(){}}};vm.createContext(context);vm.runInContext(readFileSync(new URL('../js/shared/member-number.js',import.meta.url),'utf8'),context);
 assert.equal(context.MemberNumber.day('2026-10-20T16:00:00Z'),'2026-10-21');assert.match(context.MemberNumber.summary({memberJoinedAt:'2026-10-18T16:00:00Z',memberDateSource:'joined'},new Date('2026-10-20T16:00:00Z')),/2 天/);
 assert.match(context.MemberNumber.summary({memberDateSource:'legacy_unknown'}),/待確認/);
 for(const file of ['admin.html','admin-v2.html']){const html=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.match(html,/id="crm-member-number" readonly/);assert.match(html,/u\.memberNumber/);assert.match(html,/window\.MemberNumber\.fill\(user, allUsersData\)/);assert.match(html,/推薦人（個人編號／UID）/)}
});
