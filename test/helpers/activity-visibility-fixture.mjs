import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createActivityBatches,activityWithBatches,activityBatchRows,joinActivityBatches} from '../../worker/activity-batches.mjs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
export function officialFixture(t){
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  sql.exec(`CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,role TEXT,network_id TEXT,referrer_id TEXT,name TEXT,phone TEXT);
    INSERT INTO users VALUES('owner-a','owner-a','store','irrelevant','','甲店','0912345678'),('owner-b','owner-b','store','irrelevant','','乙店','0923456789'),
    ('member-a','member-a','user','owner-a','','甲會員','0934567890'),('member-b','member-b','user','owner-b','','乙會員','0945678901'),('admin','admin','admin','admin','','管理員','0956789012');
    CREATE TABLE activities(activity_id TEXT PRIMARY KEY,name TEXT,type TEXT,fee_type TEXT,price INTEGER,start_time TEXT,end_time TEXT,description TEXT,image_url TEXT,image_ratio TEXT,creator_id TEXT,network_id TEXT,status TEXT,is_series INTEGER,series_id TEXT DEFAULT '',batch_name TEXT DEFAULT '',batch_limit INTEGER,nfc_checkin_start TEXT,nfc_checkin_end TEXT,nfc_same_day_only INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP,ever_unpublished INTEGER DEFAULT 0);
    CREATE TABLE registrants(row_id TEXT PRIMARY KEY,line_id TEXT,activity_id TEXT,activity_name TEXT,name TEXT,phone TEXT,identity TEXT,amount INTEGER,payment_status TEXT,start_time TEXT,description TEXT,image_url TEXT,status TEXT,checked_in INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX idx_registrants_unique_line ON registrants(activity_id,line_id) WHERE line_id IS NOT NULL AND line_id != '';`);
  for(const file of ['0052_activity_form_options.sql','0053_activity_option_uniqueness.sql','0055_member_hosted_events.sql','0057_member_event_category.sql','0059_activity_visibility.sql'])sql.exec(read('migrations/'+file));
  let beforeRun=null,beforeBatch=null,fail=false;
  function prepare(query,args=[]){return {query,args,bind(...a){return prepare(query,a);},async first(){if(fail)throw Error('synthetic read unavailable');return sql.prepare(query).get(...args)||null;},async all(){if(fail)throw Error('synthetic read unavailable');return {success:true,results:sql.prepare(query).all(...args)};},async run(){if(fail)throw Error('synthetic write unavailable');beforeRun?.(query,args);return {success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}};}
  const db={prepare,async batch(statements){beforeBatch?.();sql.exec('BEGIN');try{const result=await Promise.all(statements.map(s=>s.run()));sql.exec('COMMIT');return result;}catch(e){sql.exec('ROLLBACK');throw e;}}},env={ACTMASTER_DB:db};
  const actors=Object.fromEntries(sql.prepare('SELECT * FROM users').all().map(row=>[row.line_id,{userId:row.line_id,role:row.role,networkId:row.role==='store'?row.line_id:row.network_id,token:row.line_id}]));
  const security={normalizeRole:r=>r==='tenant'?'store':r||'user',legacyAuthSkipActions:()=>new Set(['getPublicActivities']),
    verifyLineAuth:async(uid,token)=>actors[token]?.userId===uid,
    getActor:async p=>actors[p.lineAccessToken]||null,
    async authorizeAction(action,p){const actor=await this.getActor(p);
      if(['getPublicActivities','joinActivity'].includes(action))return {allowed:true,actor:null};
      if(!actor)return {allowed:false};
      if(['updateActivity','bulkAddRegistrants','removeAct','setActivityStatus','duplicateActivity','getActivityRegistrants'].includes(action)&&!['store','admin'].includes(actor.role))return {allowed:false};
      p.authenticatedUserId=actor.userId;p.authenticatedRole=actor.role;p.authenticatedNetworkId=actor.networkId;return {allowed:true,actor};
    }};
  let fallback=0;
  const context=vm.createContext({console:{error(){}},crypto,createActivityBatches,activityWithBatches,activityBatchRows,joinActivityBatches,SecurityModule:security,
    D1ReadModule:{first:async(_e,q,a)=>prepare(q,a).first(),all:async(_e,q,a)=>(await prepare(q,a).all()).results,findUserByIdentity:async(_e,id)=>({user:await prepare('SELECT * FROM users WHERE line_id=? OR row_id=?',[id,id]).first()})},
    DBModule:{forward:async()=>{fallback++;throw Error('Legacy fallback must not run');}}});
  const source=read('workerbackup.js'),start=source.indexOf('const D1ActivityModule = {'),end=source.indexOf('\n};',start);
  vm.runInContext(source.slice(start,end+3)+'\nglobalThis.mod=D1ActivityModule;',context);
  const dispatch=source.indexOf('async function dispatchAction('),dispatchEnd=source.indexOf('// ==================== 主入口',dispatch);
  vm.runInContext(source.slice(dispatch,dispatchEnd)+'\nglobalThis.dispatch=dispatchAction;',context);context.mod._networkScopeReady=true;
  const api=(action,p={},who='owner-a')=>context.dispatch(action,{...p,lineAccessToken:who},new Request('https://fixture.invalid',{method:'POST'}),env);
  const create=(id,visibility,who='owner-a',extra={})=>api('bulkAddRegistrants',{activityId:id,activityName:id,startTime:'2026-10-20 14:00',price:150,status:'上架',names:[],...(visibility===undefined?{}:{visibility}),...extra},who);
  return {sql,env,mod:context.mod,actors,api,create,get fallback(){return fallback;},setBeforeRun:f=>beforeRun=f,setBeforeBatch:f=>beforeBatch=f,setFail:v=>fail=v};
}
