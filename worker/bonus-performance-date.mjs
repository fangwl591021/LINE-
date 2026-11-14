// Administrative attribution dates. Payment and settled bonus records remain untouched.
import {authorizeStoreAdmin, DirectoryError} from './store-admin.mjs';
import {readJson, ShopError} from './store-shop.mjs';
import {partnerContractContext11510} from './partner-bonus-v2.mjs';
import {requireReleaseEnabled,enabledSql} from './bonus-release-control.mjs';
const PATH='/v1/admin/bonus-performance-date';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fail=(code,message,status=400)=>{throw new DirectoryError(code,message,status);};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idValid=id=>typeof id==='string'&&/^[\w:.-]{1,100}$/.test(id);
const locks=`NOT EXISTS(SELECT 1 FROM partner_bonus_deal_confirmations WHERE order_id=?) AND NOT EXISTS(SELECT 1 FROM bonus_transactions WHERE order_id=?) AND NOT EXISTS(SELECT 1 FROM partner_11510_statement_items WHERE order_id=?)`;
async function first(db,sql,...args){const row=await db.prepare(sql).bind(...args).first();return row??null;}
function dateValid(precision,value){
 if(precision==='none')return value==='';
 if(typeof value!=='string')return false;
 const pattern={month:/^\d{4}-\d{2}$/,day:/^\d{4}-\d{2}-\d{2}$/,minute:/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/}[precision];
 if(!pattern||!pattern.test(value))return false;
 const [year,month,day=1,hour=0,minute=0]=value.split(/[-T:]/).map(Number);
 if(year<2000||year>9999||month<1||month>12||day<1||hour>23||minute>59)return false;
 const d=new Date(Date.UTC(year,month-1,day,hour,minute));
 if(d.getUTCFullYear()!==year||d.getUTCMonth()!==month-1||d.getUTCDate()!==day)return false;
 const now=new Date(Date.now()+8*3600000).toISOString();
 return value<=now.slice(0,{month:7,day:10,minute:16}[precision]);
}
async function state(db,id){
 const order=await first(db,'SELECT order_id,order_type,payment_status,paid_at,created_at,updated_at,bonus_status,bonus_policy_type FROM orders WHERE order_id=?',id);
 if(!order)fail('NOT_FOUND','查無此訂單',404);
 const latest=await first(db,'SELECT version,precision,value,reason,recorded_at FROM partner_bonus_performance_date_events WHERE order_id=? ORDER BY version DESC LIMIT 1',id);
 const unlocked=await first(db,`SELECT ${locks} AS ok, EXISTS(SELECT 1 FROM partner_bonus_order_snapshots WHERE order_id=?) AS has_snapshot`,id,id,id,id);
 let lockReason='';
 if(!['tenant_annual_fee','tenant_renewal_fee'].includes(order.order_type))lockReason='此訂單類型不能調整業績日期';
 else if(!['pending_payment','paid'].includes(order.payment_status))lockReason='此訂單收款狀態需先人工核對';
 else if(order.bonus_status!=='not_generated'&&!(order.bonus_status==='review_required'&&(order.bonus_policy_type==='signed_referral_pending'||unlocked?.has_snapshot)))lockReason='此訂單已有獎金處理紀錄，請先人工核對';
 else if(!unlocked?.ok)lockReason='此訂單已有獎金或結算紀錄，請先人工核對';
 return {order,version:latest?.version??0,current:latest&&latest.precision!=='none'?{precision:latest.precision,value:latest.value,reason:latest.reason,recordedAt:latest.recorded_at}:null,editable:!lockReason,lockReason};
}
async function receipt(db,data,uid,payload){
 const row=await first(db,'SELECT order_id,version,precision,value,reason,recorded_at,recorded_by,request_json FROM partner_bonus_performance_date_events WHERE request_key=?',data.requestKey);
 if(!row)return null;
 if(row.recorded_by!==uid||row.request_json!==payload)fail('REQUEST_CONFLICT','此送出編號已使用，請重新整理後再試',409);
 return {success:true,orderId:row.order_id,version:row.version,current:row.precision==='none'?null:{precision:row.precision,value:row.value,reason:row.reason,recordedAt:row.recorded_at},affectsSettlement:false,replayed:true};
}
export async function handleBonusPerformanceDate(request,env,profileMapper,fetcher=fetch){
 const url=new URL(request.url);if(url.pathname!==PATH)return null;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','POST'].includes(request.method))return reply({success:false,code:'METHOD_NOT_ALLOWED',error:'不支援此操作'},405);
 try{
  const {uid,db,actor}=await authorizeStoreAdmin(request,env,profileMapper,fetcher);
  if(uid!==actor.line_id)fail('IDENTITY_CONFLICT','請使用管理員目前的 LINE 身分登入',403);
  const ctx=partnerContractContext11510(db,uid,actor);await ctx.policyIdentity(db,uid);
  if(request.method==='GET'){
   if([...url.searchParams.keys()].length!==1||!idValid(url.searchParams.get('order_id')))fail('INVALID_REQUEST','請指定有效訂單');
   const orderId=url.searchParams.get('order_id'),s=await state(db,orderId);
   return reply({success:true,orderId,version:s.version,current:s.current,editable:s.editable,lockReason:s.lockReason,affectsSettlement:false});
  }
  await requireReleaseEnabled(db);
  if(url.search)fail('INVALID_REQUEST','儲存不可附加查詢條件');
  const d=await readJson(request,2048),allowed=['orderId','precision','value','reason','expectedVersion','requestKey'];
  if(!d||typeof d!=='object'||Array.isArray(d)||Object.keys(d).some(k=>!allowed.includes(k))||!idValid(d.orderId)||!dateValid(d.precision,d.value)||typeof d.reason!=='string'||d.reason.length>300||/[\x00-\x1f]/.test(d.reason)||!Number.isSafeInteger(d.expectedVersion)||d.expectedVersion<0||d.expectedVersion>1e9||typeof d.requestKey!=='string'||!uuid.test(d.requestKey))fail('INVALID_REQUEST','日期、原因或版本不正確');
  d.requestKey=d.requestKey.toLowerCase();d.reason=d.reason.trim();
  const payload=JSON.stringify({orderId:d.orderId,precision:d.precision,value:d.value,reason:d.reason,expectedVersion:d.expectedVersion});
  const prior=await receipt(db,d,uid,payload);if(prior)return reply(prior);
  const s=await state(db,d.orderId);if(!s.editable)fail('ORDER_LOCKED',s.lockReason,409);
  if(s.version!==d.expectedVersion)fail('VERSION_CONFLICT','日期已由其他人更新，請重新整理',409);
  if(d.precision==='none'&&!s.current)fail('NO_DATE_TO_WITHDRAW','目前沒有可撤回的業績日期',409);
  const clock=await ctx.clock(db);if(!clock||!Number.isSafeInteger(clock.revision))throw Error('Clock unavailable');
  const nonce=crypto.randomUUID(),now=new Date().toISOString(),o=s.order;
  const result=await db.batch([
   ctx.clockClaim(db,clock.revision,nonce,actor),
   db.prepare(`INSERT INTO partner_bonus_performance_date_events(event_id,order_id,version,previous_precision,previous_value,precision,value,reason,recorded_at,recorded_by,request_key,request_json)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${ctx.gate} AND ${enabledSql}
    AND EXISTS(SELECT 1 FROM orders WHERE order_id=? AND order_type IS ? AND payment_status IS ? AND paid_at IS ? AND created_at IS ? AND updated_at IS ? AND bonus_status IS ? AND bonus_policy_type IS ?)
    AND ${locks} AND COALESCE((SELECT MAX(version) FROM partner_bonus_performance_date_events WHERE order_id=?),0)=?
    AND NOT EXISTS(SELECT 1 FROM partner_bonus_performance_date_events WHERE request_key=?)`)
    .bind(crypto.randomUUID(),d.orderId,s.version+1,s.current?.precision??'',s.current?.value??'',d.precision,d.value,d.reason,now,uid,d.requestKey,payload,clock.revision+1,nonce,d.orderId,o.order_type,o.payment_status,o.paid_at,o.created_at,o.updated_at,o.bonus_status,o.bonus_policy_type,d.orderId,d.orderId,d.orderId,d.orderId,d.expectedVersion,d.requestKey)
  ]);
  if(result.length!==2||result.some(r=>r.success===false))throw Error('Write unavailable');
  const saved=await receipt(db,d,uid,payload);if(!saved)fail('STATE_CHANGED','管理權限或訂單狀態已變更，請重新整理後再試',409);
  return reply({...saved,replayed:result[1].meta?.changes===0});
 }catch(error){
  if(error instanceof DirectoryError)return reply({success:false,code:error.code,error:error.message},error.status);
  if(error instanceof ShopError)return reply({success:false,code:'INVALID_REQUEST',error:error.message},error.status);
  return reply({success:false,code:'DATE_UNAVAILABLE',error:'目前無法確認日期登錄結果，請重新查詢或使用相同送出編號重試'},503);
 }
}
