// Empty event history is disabled. This gate is independent of existing finance flows.
import {authorizeStoreAdmin,DirectoryError} from './store-admin.mjs';
import {readJson,ShopError} from './store-shop.mjs';
import {partnerContractContext11510} from './partner-bonus-v2.mjs';
const PATH='/v1/admin/bonus-release-control';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers});
const fail=(code,message,status=400)=>{throw new DirectoryError(code,message,status);};
export const enabledSql="EXISTS(SELECT 1 FROM bonus_release_control_events WHERE version=(SELECT MAX(version) FROM bonus_release_control_events) AND enabled=1)";
export async function releaseState(db){
 const row=await db.prepare('SELECT version,enabled FROM bonus_release_control_events ORDER BY version DESC LIMIT 1').first();
 if(!row)return {version:0,enabled:false};
 if(!Number.isSafeInteger(row.version)||row.version<1||![0,1].includes(row.enabled))throw Error('Invalid control state');
 return {version:row.version,enabled:row.enabled===1};
}
export async function requireReleaseEnabled(db){if(!(await releaseState(db)).enabled)fail('FEATURE_DISABLED','業績日期與排序功能暫未開放',503);}
async function requirePrerequisites(db){
 const checks=[
  'SELECT version,precision,value,order_id,recorded_at,recorded_by FROM partner_bonus_performance_date_events LIMIT 0',
  'SELECT batch_id,version,request_key,request_json FROM bonus_order_sequence_draft_events LIMIT 0',
  'SELECT revision,last_key FROM partner_bonus_v2_clock LIMIT 0',
  'SELECT row_id,line_id,legacy_line_id,point_line_id,role,member_number,crm_project_independent_at FROM users LIMIT 0',
  'SELECT old_line_id,new_line_id,status FROM user_identity_links LIMIT 0',
  'SELECT order_id,order_type,buyer_id,recruiter_id,payment_status,paid_at,net_amount,gross_amount,tax_amount,tax_rate,currency FROM orders LIMIT 0',
  'SELECT id,member_uid,policy_version,signed_at,effective_at,expires_at,sponsor_uid,purchase_status,purchase_order_id,verified_at FROM partner_contract_enrollments LIMIT 0',
  'SELECT contract_id,template_version FROM partner_contract_11510_terms LIMIT 0',
  'SELECT id,contract_id,action,effective_at,verified_at FROM partner_contract_lifecycle_events LIMIT 0',
  'SELECT id,target_uid,manager_uid,effective_at,verified_at FROM partner_attribution_events LIMIT 0',
  'SELECT order_id,recruiter_uid,buyer_uid,deal_type,confirmed_at,facts_json FROM partner_bonus_deal_confirmations LIMIT 0',
  'SELECT tx_id,order_id,beneficiary_id,bonus_type,amount,status FROM bonus_transactions LIMIT 0',
  'SELECT tx_id,order_id,statement_id FROM partner_11510_statement_items LIMIT 0',
  'SELECT id,order_id,status,created_at,event_json FROM partner_bonus_v2_status_events LIMIT 0',
  'SELECT order_id,contract_id,policy_version,recruiter_uid,buyer_uid,captured_at,snapshot_json FROM partner_bonus_order_snapshots LIMIT 0',
  'SELECT id,member_uid,action,order_id,effective_at,expires_at,evidence_ref,recorded_at FROM partner_full_service_evidence LIMIT 0',
  'SELECT id,owner_uid,snapshot_json,content_sha256,signed_at FROM full_applications LIMIT 0',
  'SELECT application_id,reviewer_uid,decision,reviewed_at FROM full_application_reviews LIMIT 0'
 ];
 try{const results=await db.batch(checks.map(sql=>db.prepare(sql)));if(results.length!==checks.length||results.some(r=>r.success===false||!Array.isArray(r.results)))throw Error('incomplete');}
 catch{fail('PREREQUISITES_UNAVAILABLE','必要資料表尚未就緒，功能維持關閉',409);}
}
async function receipt(db,d,uid,json){
 const row=await db.prepare('SELECT version,enabled,actor_uid,request_json FROM bonus_release_control_events WHERE request_key=?').bind(d.requestKey).first();
 if(!row)return null;if(row.actor_uid!==uid||row.request_json!==json)fail('REQUEST_CONFLICT','送出編號已用於其他操作',409);
 return {success:true,version:row.version,enabled:row.enabled===1,replayed:true};
}
async function withCurrentState(db,saved,replayed){
 const current=await releaseState(db);
 return {success:true,...current,appliedVersion:saved.version,appliedEnabled:saved.enabled,superseded:current.version!==saved.version,replayed};
}
export async function handleBonusReleaseControl(request,env,profileMapper,fetcher=fetch){
 const url=new URL(request.url);if(url.pathname!==PATH)return null;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','POST'].includes(request.method))return reply({success:false,code:'METHOD_NOT_ALLOWED',error:'不支援此操作'},405);
 try{
  const {uid,db,actor}=await authorizeStoreAdmin(request,env,profileMapper,fetcher);
  if(uid!==actor.line_id)fail('IDENTITY_CONFLICT','請以總管目前 LINE 身分登入',403);
  const ctx=partnerContractContext11510(db,uid,actor);await ctx.policyIdentity(db,uid);
  if(url.search)fail('INVALID_REQUEST','不可附加查詢條件');
  if(request.method==='GET')return reply({success:true,...await releaseState(db)});
  const d=await readJson(request,2048),fields=['enabled','reason','expectedVersion','requestKey'];
  if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).length!==fields.length||Object.keys(d).some(k=>!fields.includes(k))||typeof d.enabled!=='boolean'||typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>300||/[\x00-\x1f]/.test(d.reason)||!Number.isSafeInteger(d.expectedVersion)||d.expectedVersion<0||d.expectedVersion>1e9||typeof d.requestKey!=='string'||!UUID.test(d.requestKey))fail('INVALID_REQUEST','請確認開關、原因及版本');
  d.reason=d.reason.trim();d.requestKey=d.requestKey.toLowerCase();
  const json=JSON.stringify({enabled:d.enabled,reason:d.reason,expectedVersion:d.expectedVersion}),prior=await receipt(db,d,uid,json);if(prior)return reply(await withCurrentState(db,prior,true));
  const state=await releaseState(db);if(state.version!==d.expectedVersion)fail('VERSION_CONFLICT','功能狀態已更新，請重新查詢',409);
  if(state.enabled===d.enabled)fail('UNCHANGED','目前功能狀態無須變更',409);
  if(d.enabled)await requirePrerequisites(db);
  const c=await ctx.clock(db);if(!c||!Number.isSafeInteger(c.revision))throw Error('Clock unavailable');
  const nonce=crypto.randomUUID(),result=await db.batch([ctx.clockClaim(db,c.revision,nonce,actor),db.prepare(`INSERT INTO bonus_release_control_events(version,enabled,previous_enabled,actor_uid,reason,recorded_at,request_key,request_json)
   SELECT ?,?,?,?,?,?,?,? WHERE ${ctx.gate} AND COALESCE((SELECT MAX(version) FROM bonus_release_control_events),0)=? AND NOT EXISTS(SELECT 1 FROM bonus_release_control_events WHERE request_key=?)`)
   .bind(state.version+1,Number(d.enabled),Number(state.enabled),uid,d.reason,new Date().toISOString(),d.requestKey,json,c.revision+1,nonce,state.version,d.requestKey)]);
  if(result.length!==2||result.some(x=>x.success===false))throw Error('Control write unavailable');
  const saved=await receipt(db,d,uid,json);if(!saved)fail('STATE_CHANGED','權限或功能狀態已變更，請重新查詢',409);
  return reply(await withCurrentState(db,saved,result[1].meta?.changes===0));
 }catch(error){
  if(error instanceof DirectoryError)return reply({success:false,code:error.code,error:error.message},error.status);
  if(error instanceof ShopError)return reply({success:false,code:'INVALID_REQUEST',error:error.message},error.status);
  return reply({success:false,code:'CONTROL_UNAVAILABLE',error:'目前無法確認功能開關狀態，請重新查詢或使用相同送出編號重試'},503);
 }
}
