// Actual worker profile writes/dispatch over disposable SQLite. No external requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import vm from 'node:vm';
import {RETAIL_ROLES} from '../js/modules/store-cooperation-plans.mjs';
import {isRewardOnlyRole,checkRewardOnlyAction} from '../worker/reward-only-cashier.mjs';
import {checkRedeemOnlyAction} from '../worker/redeem-only-cashier.mjs';

const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');
const OWNER='U'+'a'.repeat(32),ADMIN='Uf729764dbb5b652a5a90a467320bea29';
const object=name=>{const found=source.match(new RegExp(`^const ${name} = \\{[\\s\\S]*?^\\};`,'m'));assert.ok(found,name);return found[0];};
function fixture(t,{role='user',existing=true}={}){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT,line_id TEXT PRIMARY KEY,name TEXT DEFAULT '',industry TEXT DEFAULT '',gender TEXT DEFAULT '',phone TEXT DEFAULT '',birthday TEXT DEFAULT '',region TEXT DEFAULT '',address TEXT DEFAULT '',socials TEXT DEFAULT '',role TEXT,store_id TEXT DEFAULT '',referrer_id TEXT DEFAULT '',network_id TEXT DEFAULT 'admin',tg_token TEXT DEFAULT '',tg_chat_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',legacy_line_id TEXT DEFAULT '');`);
  if(existing)sql.prepare('INSERT INTO users(row_id,line_id,name,role) VALUES(?,?,?,?)').run(OWNER,OWNER,'合成會員',role);
  sql.prepare('INSERT INTO users(row_id,line_id,name,role) VALUES(?,?,?,?)').run(ADMIN,ADMIN,'方萬隆','admin');
  let beforeWrite=null,failWrite=false;
  const legacy=[],inputs=[],cacheDeletes=[],awardCalls=[];
  const env={ACTMASTER_DB:{prepare(query){
    const statement=(args=[])=>({bind(...values){return statement(values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){
      if(query.includes('INSERT INTO users')){if(failWrite)throw Error('synthetic D1 failure');if(beforeWrite){const callback=beforeWrite;beforeWrite=null;callback();}}
      return {success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};
    }});return statement();
  }},ACTMASTER_KV:{async delete(key){cacheDeletes.push(key);}}};
  const context=vm.createContext({console:{log(){},warn(){},error(){}},crypto,TextEncoder,URL,Date,RETAIL_ROLES,isRewardOnlyRole,checkRewardOnlyAction,checkRedeemOnlyAction,
    fetch(){throw Error('external requests forbidden');},DBModule:{async forward(...args){legacy.push(args);return {success:true,legacy:true};}},AuthModule:{async updateAndClearCache(...args){legacy.push(args);return {success:true,legacy:true};}},
    PointModule:{async ensureSubsitePointWalletOnJoin(){awardCalls.push('wallet');return {success:true};},async awardShareJoinPoints(){awardCalls.push('join');return {success:true};}}
  });
  vm.runInContext([object('ACTION_POLICIES'),object('SecurityModule'),object('D1ReadModule'),object('D1WriteModule'),'globalThis.modules={SecurityModule,D1ReadModule,D1WriteModule};'].join('\n'),context);
  const {SecurityModule:security,D1ReadModule:read,D1WriteModule:write}=context.modules;
  security.getActor=async(_payload,request)=>{
    const token=request.headers.get('Authorization'),uid=token==='Bearer admin-token'?ADMIN:token==='Bearer owner-token'?OWNER:'';
    if(!uid)return null;
    const row=sql.prepare('SELECT * FROM users WHERE line_id=?').get(uid),profile=row?read.userRow(row):{role:'user'};
    return {userId:uid,role:profile.role,networkId:'admin',token:token.slice(7)};
  };
  security.verifyLineAuth=async(uid,token)=>uid===OWNER&&token==='owner-token';
  security.getLineUserIdFromToken=async token=>token==='owner-token'?OWNER:token==='admin-token'?ADMIN:'';
  write.ensureReferralPlaceholderCard=async()=>null;
  const actualUpsert=write.upsertUser;
  write.upsertUser=async function(payload,...args){inputs.push(JSON.parse(JSON.stringify(payload)));return actualUpsert.call(this,payload,...args);};
  const dispatch=source.match(/^async function dispatchAction\([\s\S]*?^}/m);assert.ok(dispatch);
  vm.runInContext(dispatch[0]+'\nglobalThis.dispatch=dispatchAction;',context);
  const call=(action,payload,token='owner-token')=>context.dispatch(action,payload,new Request('https://local.invalid/',{headers:token?{Authorization:'Bearer '+token}:{}}),env);
  return {sql,env,write,call,legacy,inputs,cacheDeletes,awardCalls,before:fn=>{beforeWrite=fn;},fail:()=>{failWrite=true;},row:()=>sql.prepare('SELECT * FROM users WHERE line_id=?').get(OWNER)};
}

for(const role of ['user','tenant','租戶','TENANT','reward','贈點用戶','redeem','REDEEM','扣點用戶','store','STORE','店長','admin','ADMIN','總管','',null])test('ordinary upsert preserves exact raw DB role: '+String(role),async t=>{
  const f=fixture(t,{role});
  const saved=await f.write.upsertUser({userId:OWNER,name:'已修改的合成會員',role:'store','權限級別':'admin'},f.env);
  assert.equal(saved.success,true);assert.equal(f.row().role,role);assert.equal(f.row().name,'已修改的合成會員');
  assert.equal(saved.data.info.retailSellerEligible,RETAIL_ROLES.includes(String(role).toLowerCase()));
});

for(const action of ['registerUser','updateUserProfile'])for(const envelope of ['top','data','profile'])test(action+' ignores client role aliases inside '+envelope,async t=>{
  const f=fixture(t,{role:'tenant'}),fields={userId:OWNER,name:'合成設定保存',role:'store','權限級別':'admin'};
  const payload=envelope==='top'?fields:{userId:OWNER,role:'admin','權限級別':'store',[envelope]:fields};
  const result=await f.call(action,payload);
  assert.equal(result.success,true);assert.equal(f.row().role,'tenant');assert.equal(f.row().name,'合成設定保存');
  assert.equal(result.data.info.role,'store','legacy display role stays compatible');assert.equal(result.data.info.retailSellerEligible,false);
  for(const data of [f.inputs[0],f.inputs[0].data,f.inputs[0].profile])if(data){assert.equal(Object.hasOwn(data,'role'),false);assert.equal(Object.hasOwn(data,'權限級別'),false);}
  assert.equal(f.legacy.length,0);
});

for(const suppliedRole of ['store','redeem','admin','tenant','reward','店長','總管'])test('a new ordinary signup cannot grant '+suppliedRole,async t=>{
  const f=fixture(t,{existing:false});
  const result=await f.call('registerUser',{userId:OWNER,name:'合成新會員',role:suppliedRole},null);
  assert.equal(result.success,true);assert.equal(f.row().role,'user');assert.equal(result.data.info.retailSellerEligible,false);
  assert.equal(f.legacy.length,0);assert.deepEqual(f.awardCalls,['wallet','join'],'existing join hooks remain in their original path');
});

test('profile write cannot undo a concurrent administrator downgrade or grant',async t=>{
  const f=fixture(t,{role:'store'});
  f.before(()=>f.sql.prepare("UPDATE users SET role='reward' WHERE line_id=?").run(OWNER));
  let result=await f.write.upsertUser({userId:OWNER,role:'store'},f.env);
  assert.equal(f.row().role,'reward');assert.equal(result.data.info.role,'reward');assert.equal(result.data.info.retailSellerEligible,false);
  f.before(()=>f.sql.prepare("UPDATE users SET role='store' WHERE line_id=?").run(OWNER));
  result=await f.write.upsertUser({userId:OWNER,role:'user'},f.env);
  assert.equal(f.row().role,'store');assert.equal(result.data.info.role,'store');assert.equal(result.data.info.retailSellerEligible,true);
});

for(const action of ['registerUser','updateUserProfile'])test(action+' fails closed on D1 failure instead of sending role choices to legacy services',async t=>{
  const f=fixture(t,{role:'tenant'});f.fail();
  const result=await f.call(action,{userId:OWNER,role:'store',data:{userId:OWNER,role:'admin','權限級別':'store'}});
  assert.equal(result.success,false);assert.equal(f.row().role,'tenant');assert.equal(f.legacy.length,0);assert.deepEqual(f.awardCalls,[]);
});

test('explicit administrator role editor remains the grant path; following profile metadata cannot change it',async t=>{
  const f=fixture(t);
  assert.equal((await f.call('updateUserRole',{targetUserId:OWNER,newRole:'store'},'admin-token')).success,true);
  assert.equal(f.row().role,'store');
  const result=await f.call('updateUserProfile',{userId:OWNER,name:'付款後合成資料',role:'user',dealerProfile:{annualFeePaidAt:'2026-11-10'}});
  assert.equal(result.success,true);assert.equal(f.row().role,'store');assert.equal(result.data.info.retailSellerEligible,true);
  assert.equal(f.row().name,'付款後合成資料');assert.equal(JSON.parse(f.row().socials).dealerProfile.annualFeePaidAt,'2026-11-10');
  assert.ok(f.cacheDeletes.some(key=>key==='U_PROFILE_'+OWNER));assert.equal(f.legacy.length,0);
  assert.equal((await f.call('updateUserRole',{targetUserId:OWNER,newRole:'redeem'})).success,false,'a member profile request cannot substitute for the protected editor');
  assert.equal(f.row().role,'store');
});
