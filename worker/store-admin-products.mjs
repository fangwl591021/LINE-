import {authorizeStoreAdmin,DirectoryError} from './store-admin.mjs';
import {normalizeProduct,readJson,ShopError} from './store-shop.mjs';

const PATH='/v1/store-shop/admin/products';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES=['store','店長','admin','總管','user','用戶'];
const UNLIMITED=['store','店長','admin','總管'];
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const fail=(code,message,status=400)=>{throw new DirectoryError(code,message,status);};
const ACTOR_FIELDS=['row_id','line_id','legacy_line_id','point_line_id','role','name','phone'];
const PRODUCT_FIELDS=['title','description','image_url','price_cents','redeem_type','redeem_value','status','category','purchase_mode'];
async function rows(db,sql,args=[]){
  const result=await db.prepare(sql).bind(...args).all();
  if(result.success===false||!Array.isArray(result.results))throw new Error('Read unavailable');
  return result.results;
}
async function target(db,id){
  const found=await rows(db,`SELECT s.id,s.name,s.owner_uid,s.status,s.version,u.role AS owner_role,u.name AS owner_name,
    (SELECT count(*) FROM store_shop_products p WHERE p.shop_id=s.id AND p.status!='archived') AS product_count
    FROM store_shop_stores s JOIN users u ON u.line_id=s.owner_uid WHERE s.id=? LIMIT 2`,[id]);
  if(found.length!==1||!found[0].owner_uid||!ROLES.includes(String(found[0].owner_role).toLowerCase()))fail('REGISTERED_STORE_REQUIRED','僅能替已註冊且仍具商城資格的店家新增商品',403);
  return {...found[0],product_limit:UNLIMITED.includes(String(found[0].owner_role).toLowerCase())?null:1};
}
async function existing(db,shop,key,uid,payload){
  const audit=(await rows(db,'SELECT product_id,actor_uid,owner_uid,payload_json FROM store_admin_product_audit WHERE shop_id=? AND request_key=?',[shop.id,key]))[0];
  if(!audit)return null;
  if(audit.actor_uid!==uid||audit.owner_uid!==shop.owner_uid||audit.payload_json!==payload)fail('REQUEST_CONFLICT','此送出編號已使用，請返回列表後重新新增',409);
  return {success:true,product_id:audit.product_id,shop_id:shop.id,replayed:true};
}
export async function handleStoreAdminProducts(request,env,profileMapper,fetcher=fetch){
  const url=new URL(request.url);
  if(url.pathname!==PATH)return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  if(!['GET','POST'].includes(request.method))return reply({success:false,error:'僅提供查詢及新增商品'},405);
  try{
    const {uid,db,actor}=await authorizeStoreAdmin(request,env,profileMapper,fetcher);
    let data;
    if(request.method==='GET'){
      if([...url.searchParams.keys()].some(key=>key!=='shop')||url.searchParams.getAll('shop').length!==1)fail('INVALID_QUERY','請選擇店家');
      data={shop_id:url.searchParams.get('shop')};
    }else{
      if(url.search)fail('INVALID_QUERY','新增商品不可附加查詢條件');
      data=await readJson(request);
      if(Object.keys(data).some(key=>!['shop_id','shop_version','request_key',...PRODUCT_FIELDS].includes(key)))fail('INVALID_FIELD','商品資料包含不允許的欄位');
    }
    if(typeof data.shop_id!=='string'||!UUID.test(data.shop_id))fail('INVALID_STORE','店家編號不正確');
    const shop=await target(db,data.shop_id);
    if(request.method==='GET'){
      const products=await rows(db,"SELECT id,title,status,price_cents FROM store_shop_products WHERE shop_id=? AND status!='archived' ORDER BY updated_at DESC,id LIMIT 10",[shop.id]);
      const {owner_uid,...view}=shop;
      return reply({success:true,shop:view,products});
    }
    if(!UUID.test(data.request_key||'')||!Number.isSafeInteger(data.shop_version)||data.shop_version<1)fail('INVALID_REQUEST','請返回店家列表重新開啟代上傳');
    const product=normalizeProduct(data);
    if(!['draft','active'].includes(product.status))fail('INVALID_STATUS','新商品只能存草稿或上架');
    const payload=JSON.stringify(product),prior=await existing(db,shop,data.request_key,uid,payload);
    if(prior)return reply(prior);
    if(shop.version!==data.shop_version)fail('STORE_CHANGED','店家資料已變更，請返回列表重新確認',409);
    if(shop.product_limit===1&&(product.purchase_mode!=='in_store'||product.redeem_type!=='none'))fail('OWNER_LIMIT','一般會員商品僅能店內展示，不能設定折抵或網購',403);
    if(shop.product_limit!==null&&shop.product_count>=shop.product_limit)fail('PRODUCT_LIMIT','此店家已達商品件數上限',409);
    const id=crypto.randomUUID(),now=new Date().toISOString();
    // Recheck the exact authorized actor and target snapshot inside the atomic write.
    // Quota is evaluated by SQL, so simultaneous creates cannot bypass a one-product limit.
    const gate=`EXISTS(SELECT 1 FROM users a WHERE ${ACTOR_FIELDS.map(field=>'a.'+field+' IS ?').join(' AND ')})
      AND EXISTS(SELECT 1 FROM store_shop_stores s JOIN users u ON u.line_id=s.owner_uid
        WHERE s.id=? AND s.owner_uid=? AND s.version=? AND s.status=? AND u.role IS ?
        AND (lower(u.role) IN ('store','店長','admin','總管') OR NOT EXISTS(
          SELECT 1 FROM store_shop_products p WHERE p.shop_id=s.id AND p.status!='archived')))`;
    const results=await db.batch([
      db.prepare(`INSERT INTO store_shop_products(id,shop_id,${PRODUCT_FIELDS.join(',')},version,updated_at,request_key)
        SELECT ?,?,${PRODUCT_FIELDS.map(()=>'?').join(',')},1,?,? WHERE ${gate}
        ON CONFLICT(shop_id,request_key) DO NOTHING`).bind(id,shop.id,...PRODUCT_FIELDS.map(key=>product[key]),now,data.request_key,
          ...ACTOR_FIELDS.map(key=>actor[key]??null),shop.id,shop.owner_uid,shop.version,shop.status,shop.owner_role),
      db.prepare(`INSERT INTO store_admin_product_audit(product_id,shop_id,actor_uid,owner_uid,request_key,payload_json,created_at)
        SELECT id,shop_id,?,?,request_key,?,? FROM store_shop_products WHERE id=? AND shop_id=?`)
        .bind(uid,shop.owner_uid,payload,now,id,shop.id)
    ]);
    if(results.length!==2||results.some(result=>result.success===false))throw new Error('Write unavailable');
    const saved=await existing(db,shop,data.request_key,uid,payload);
    if(!saved)fail('STORE_CHANGED','店家資格、資料或商品件數已變更，請返回列表重新確認',409);
    return reply({...saved,replayed:saved.product_id!==id});
  }catch(error){
    if(error instanceof DirectoryError||error instanceof ShopError)return reply({success:false,code:error.code||'INVALID_PRODUCT',error:error.message},error.status);
    return reply({success:false,code:'ADMIN_PRODUCT_UNAVAILABLE',error:'代上傳暫時無法完成，請保留畫面重試'},503);
  }
}
