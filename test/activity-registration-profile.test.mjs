import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const source=read('workerbackup.js'),ui=read('js/modules/activity-registration.js'),home=read('js/modules/home.js');
const actor='U'+'a'.repeat(32),other='U'+'b'.repeat(32);
const input={activityRegistration:true,privacyAgreed:true,activityId:'ACT_fixture',activityNetworkId:'admin',userId:actor,name:'新會員',phone:'0912-345-678',referrerId:other,networkId:'admin'};
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert(a>=0&&b>a);return source.slice(a,b);}
function fixture(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(`CREATE TABLE users (row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,name TEXT,industry TEXT,gender TEXT,phone TEXT,birthday TEXT,region TEXT,address TEXT,socials TEXT,role TEXT,store_id TEXT,referrer_id TEXT,network_id TEXT,tg_token TEXT,tg_chat_id TEXT);`);
 const calls=[],env={ACTMASTER_DB:{prepare:query=>({bind:(...args)=>({run:async()=>({meta:{changes:Number(sql.prepare(query).run(...args).changes)}}),first:async()=>sql.prepare(query).get(...args)})})}};
 const profile=row=>row?{userId:row.line_id,name:row.name,phone:row.phone,role:row.role,networkId:row.network_id,referrerId:row.referrer_id}:null;
 const context=vm.createContext({console:{error(){}},isRewardOnlyRole:r=>r==='reward',
  SecurityModule:{getActor:async()=>({userId:actor,role:'user'}),cleanPhone:x=>String(x).replace(/[\s()-]/g,''),normalizeRole:x=>x,hasHardAdminId:()=>false,isHardAdmin:()=>false,sanitizeRole:(_id,role)=>role},
  D1ReadModule:{first:async(_env,q,args)=>sql.prepare(q).get(...args),userRow:profile,findUserByIdentity:async(_env,id)=>({user:sql.prepare('SELECT * FROM users WHERE line_id=?').get(id)})},
  D1ActivityModule:{getActivityById:async(payload,_env,verified)=>{calls.push(['activity',payload,verified]);return {success:true,data:{status:'上架'}};}},
  PointModule:{ensureSubsitePointWalletOnJoin:async p=>{calls.push(['wallet',p]);return {};},awardShareJoinPoints:async p=>{calls.push(['award',p]);return {};}}
 });
 vm.runInContext(section('const D1WriteModule = {','\n};')+'\n};\nglobalThis.writer=D1WriteModule;',context);
 context.writer.clearUserCache=async()=>{};
 context.writer.ensureReferralPlaceholderCard=async(_env,user)=>{calls.push(['placeholder',user.line_id]);return {};};
 vm.runInContext('globalThis.register=async function(payload,request,env){switch("registerUser"){'+section("    case 'registerUser': {","    case 'updateUserProfile': {")+'}}',context);
 return {sql,calls,context,env,call:p=>context.register({...input,...p},{},env)};
}
test('activity registration reuses users and existing join effects; token identity wins over supplied UID/role/nested profile',async()=>{
 const f=fixture();try{
  const r=await f.call({userId:other,role:'admin',profile:{userId:other,role:'admin'}});
  assert.equal(r.data.isRegistered,true);assert.equal(r.data.info.userId,actor);
  const row=f.sql.prepare('SELECT * FROM users').get();assert.equal(row.name,'新會員');assert.equal(row.phone,'0912345678');assert.equal(row.role,'user');assert.equal(row.referrer_id,other);
  assert.deepEqual(f.calls.filter(c=>['wallet','award','placeholder'].includes(c[0])).map(c=>c[0]),['placeholder','wallet','award']);
  assert(f.calls.filter(c=>['wallet','award'].includes(c[0])).every(c=>c[1].userId===actor&&c[1].role==='user'));
 }finally{f.sql.close();}
});
test('missing token, consent, valid phone/name or available activity cannot create members or trigger points',async()=>{
 for(const failure of ['token','consent','activity','phone','name','db']){
  const f=fixture();try{
   if(failure==='token')f.context.SecurityModule.getActor=async()=>null;
   if(failure==='activity')f.context.D1ActivityModule.getActivityById=async()=>({success:true,data:{status:'草稿'}});
   if(failure==='db')f.context.D1ReadModule.findUserByIdentity=async()=>{throw Error('unavailable');};
   const r=await f.call(failure==='consent'?{privacyAgreed:false}:failure==='phone'?{phone:'bad'}:failure==='name'?{name:''}:{});
   assert.equal(r.success,false,failure);assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,0);assert(!f.calls.some(c=>['wallet','award','placeholder'].includes(c[0])));
  }finally{f.sql.close();}
 }
});
test('existing and mapped members are returned without overwriting profile, referral, role or triggering registration effects',async()=>{
 for(const mapped of [false,true]){
  const f=fixture();try{
   f.sql.prepare('INSERT INTO users(row_id,line_id,name,phone,role,network_id,referrer_id) VALUES(?,?,?,?,?,?,?)').run('old',mapped?other:actor,'原會員','0988888888','store','original-net','original-ref');
   if(mapped)f.context.D1ReadModule.findUserByIdentity=async()=>({user:f.sql.prepare('SELECT * FROM users').get()});
   const before=JSON.stringify(f.sql.prepare('SELECT * FROM users').get());const r=await f.call({name:'不可覆蓋',phone:'0911111111'});
   assert.equal(r.data.existed,true);assert.equal(r.data.info.name,'原會員');assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM users').get()),before);assert.equal(f.calls.length,1);
  }finally{f.sql.close();}
 }
});
test('two concurrent creates use actual SQLite unique constraint and conditional upsert; repeat never updates member',async()=>{
 const f=fixture();try{
  const result=await Promise.all([f.call({name:'第一頁'}),f.call({name:'第二頁'})]);
  assert.equal(result.filter(r=>r.data.existed).length,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM users').get().n,1);
  const before=JSON.stringify(f.sql.prepare('SELECT * FROM users').get());await f.call({name:'重送'});assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM users').get()),before);
  assert.equal(f.calls.filter(c=>c[0]==='wallet').length,1);assert.equal(f.calls.filter(c=>c[0]==='award').length,1);
 }finally{f.sql.close();}
});
test('ordinary registration still updates existing profile with unchanged default upsert behavior',async()=>{
 const f=fixture();try{
  await f.call({activityRegistration:false});await f.call({activityRegistration:false,name:'一般更新'});
  assert.equal(f.sql.prepare('SELECT name FROM users').get().name,'一般更新');assert.equal(f.calls.filter(c=>c[0]==='wallet').length,2);
 }finally{f.sql.close();}
});
test('frontend registered member only reads checkUser; failure or missing login never opens registration/writes',async()=>{
 for(const mode of ['registered','failed','unknown','logout']){
  const calls=[];const c={currentUserProfile:{userId:actor},currentPage:'my-act-detail',liff:{getAccessToken:()=>mode==='logout'?'':'token',isLoggedIn:()=>true},
   fetchAPI:async action=>{calls.push(action);return mode==='registered'?{isRegistered:true,info:{userId:actor,name:'原會員'}}:mode==='failed'?{error:'offline'}:{};},
   applyRegisteredUserSession:(info,options)=>{assert.equal(info.name,'原會員');assert.equal(options.skipHome,true);},document:{createElement:()=>{throw Error('must not open');}}};
  c.window=c;vm.runInNewContext(ui,c);
  if(mode==='registered')assert.equal(await c.ActivityRegistration.ensureMember({}),true);else await assert.rejects(c.ActivityRegistration.ensureMember({}));
  assert.deepEqual(calls,mode==='logout'?[]:['checkUser']);
 }
});
test('UI wiring protects disclosure, single submission, original activity; both DM detail renderers preserve intrinsic ratio',()=>{
 assert.match(ui,/privacyAgreed: true/);assert.match(ui,/requirePrivacyTermsAgreement\('activity-reg-agree'\)/);assert.match(ui,/if \(saving\) return/);
 assert.match(home,/if \(activityJoinBusy\) return/);assert.match(home,/await window.ActivityRegistration.ensureMember\(activity\)/);
 assert.match(home,/renderRegisteredActivityDetail_\(activity, index\)/);
 assert.equal((home.match(/alt="活動 DM" class="block w-full h-auto object-contain"/g)||[]).length,2);
 assert.match(home,/\['LINE商機引擎', 'AI商脈系統', 'AI工坊'\].*\? 'AI商脈' : siteName/);
 assert.match(read('index.html'),/header-site-name[^>]*>AI商脈/);
});
