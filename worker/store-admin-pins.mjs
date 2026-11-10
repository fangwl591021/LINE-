// Display-order metadata only; never publish a store or mutate its catalog version.
import {authorizeStoreAdmin,DirectoryError} from './store-admin.mjs';
import {readJson,ShopError} from './store-shop.mjs';
import {storePinningEnabled} from './store-pinning-state.mjs';
const PATH='/v1/store-shop/admin/stores/pin';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS=['source','id','pinned','version','request_key'];
const ACTOR=['row_id','line_id','legacy_line_id','point_line_id','role','name','phone'];
const IDS=['line_id','row_id','legacy_line_id','point_line_id'];
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fail=(code,message,status=400)=>{throw new DirectoryError(code,message,status);};
async function rows(db,query,args=[]){const result=await db.prepare(query).bind(...args).all();if(result.success===false||!Array.isArray(result.results))throw Error('Pin read unavailable');return result.results;}
function authority(actor,proof){
  const markers=proof.ids.map(()=>'?').join(','),userMatch=IDS.map(key=>`a.${key} IN (${markers})`).join(' OR ');
  let sql=`EXISTS(SELECT 1 FROM users a WHERE ${ACTOR.map(key=>'a.'+key+' IS ?').join(' AND ')}) AND (SELECT count(*) FROM users a WHERE ${userMatch})=1 AND (SELECT count(*) FROM user_identity_links WHERE status='active' AND (old_line_id IN (${markers}) OR new_line_id IN (${markers})))=?`;
  const args=[...ACTOR.map(key=>actor[key]??null),...IDS.flatMap(()=>proof.ids),...proof.ids,...proof.ids,proof.links.length];
  for(const link of proof.links){sql+=" AND EXISTS(SELECT 1 FROM user_identity_links WHERE status='active' AND old_line_id=? AND new_line_id=?)";args.push(link.old_line_id,link.new_line_id);}
  return {sql,args};
}
async function receipt(db,data,uid,payload){
  const saved=(await rows(db,'SELECT actor_uid,payload_json,pinned,new_version FROM store_catalog_pin_audit WHERE request_key=?',[data.request_key]))[0];
  if(!saved)return null;
  if(saved.actor_uid!==uid||saved.payload_json!==payload)fail('REQUEST_CONFLICT','此送出編號已使用，請重新整理後再調整置頂',409);
  return {success:true,id:data.id,source:data.source,pinned:saved.pinned===1,pin_version:saved.new_version,replayed:true};
}
export async function handleStoreAdminPins(request,env,profileMapper,fetcher=fetch){
  const url=new URL(request.url);if(url.pathname!==PATH)return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return reply({success:false,code:'METHOD_NOT_ALLOWED',error:'置頂僅提供明確勾選儲存'},405);
  try{
    const {uid,db,actor,identityProof}=await authorizeStoreAdmin(request,env,profileMapper,fetcher);
    if(!storePinningEnabled(env))fail('PINNING_DISABLED','店家置頂尚未啟用，請稍後重新整理',503);
    if(url.search)fail('INVALID_QUERY','置頂儲存不可附加查詢條件');
    const data=await readJson(request,2048);
    if(Object.keys(data).length!==FIELDS.length||Object.keys(data).some(key=>!FIELDS.includes(key))||!['shop','partner'].includes(data.source)||typeof data.id!=='string'||!UUID.test(data.id)||typeof data.request_key!=='string'||!UUID.test(data.request_key)||typeof data.pinned!=='boolean'||!Number.isSafeInteger(data.version)||data.version<0||data.version>1e9)fail('INVALID_REQUEST','置頂資料不正確，請重新整理店家列表');
    data.id=data.id.toLowerCase();data.request_key=data.request_key.toLowerCase();
    const entity=data.source==='shop'?data.id:'partner_'+data.id.replace(/-/g,''),payload=JSON.stringify({source:data.source,id:data.id,pinned:data.pinned,version:data.version});
    const prior=await receipt(db,data,uid,payload);if(prior)return reply(prior);
    const target=data.source==='shop'?'EXISTS(SELECT 1 FROM store_shop_stores WHERE id=?)':'EXISTS(SELECT 1 FROM point_redemption_partners WHERE partner_handle=?)';
    if(!(await rows(db,data.source==='shop'?'SELECT id FROM store_shop_stores WHERE id=?':'SELECT partner_handle FROM point_redemption_partners WHERE partner_handle=?',[entity])).length)fail('NOT_FOUND','查無此店家，請重新整理列表',404);
    const current=(await rows(db,'SELECT pinned,version FROM store_catalog_pins WHERE source=? AND entity_id=?',[data.source,entity]))[0];
    if((current?.version||0)!==data.version)fail('VERSION_CONFLICT','置頂設定已更新，請重新整理後再調整',409);
    const guard=authority(actor,identityProof),now=new Date().toISOString();
    const result=await db.batch([
      db.prepare(`INSERT INTO store_catalog_pins(source,entity_id,pinned,version,updated_by,updated_at,request_key)
        SELECT ?,?,?,?,?,?,? WHERE ${guard.sql} AND ${target}
        AND COALESCE((SELECT version FROM store_catalog_pins WHERE source=? AND entity_id=?),0)=?
        AND NOT EXISTS(SELECT 1 FROM store_catalog_pin_audit WHERE request_key=?)
        ON CONFLICT(source,entity_id) DO UPDATE SET pinned=excluded.pinned,version=excluded.version,updated_by=excluded.updated_by,updated_at=excluded.updated_at,request_key=excluded.request_key WHERE store_catalog_pins.version=?`)
        .bind(data.source,entity,Number(data.pinned),data.version+1,uid,now,data.request_key,...guard.args,entity,data.source,entity,data.version,data.request_key,data.version),
      db.prepare(`INSERT INTO store_catalog_pin_audit(request_key,source,entity_id,actor_uid,payload_json,previous_pinned,previous_version,pinned,new_version,created_at)
        SELECT ?,source,entity_id,?,?,?,?,pinned,version,? FROM store_catalog_pins WHERE source=? AND entity_id=? AND request_key=? AND updated_by=? AND version=?
        ON CONFLICT(request_key) DO NOTHING`)
        .bind(data.request_key,uid,payload,current?.pinned||0,data.version,now,data.source,entity,data.request_key,uid,data.version+1)
    ]);
    if(result.length!==2||result.some(r=>r.success===false))throw Error('Pin write unavailable');
    const saved=await receipt(db,data,uid,payload);
    if(!saved)fail('STORE_CHANGED','管理權限、店家或置頂設定已變更，請重新整理後再調整',409);
    return reply({...saved,replayed:result[0].meta?.changes===0});
  }catch(error){
    if(error instanceof DirectoryError)return reply({success:false,code:error.code,error:error.message},error.status);
    if(error instanceof ShopError)return reply({success:false,code:'INVALID_REQUEST',error:error.message},error.status);
    return reply({success:false,code:'PINNING_UNAVAILABLE',error:'置頂儲存結果尚未確認，請重試同一筆儲存或重新整理確認'},503);
  }
}
