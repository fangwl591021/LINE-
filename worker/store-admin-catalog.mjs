// Shared admin/mobile catalog editing. No identity, payment, reward or order mutations.
import {authorizeStoreAdmin,DirectoryError} from './store-admin.mjs';
import {exactHardAdminWriteGate,exactHardAdminBeforeExternal} from './store-admin-identity-proof.mjs';
import {normalizeStore,normalizeProduct,requireProductRedemption,isShippingOnlyUpdate,readJson,ShopError} from './store-shop.mjs';
import {requireListingReview,ListingReviewError,listingReviewFailure,listingPolicyVersion,prepareListingContent,normalizeListingReview} from './store-listing-review.mjs';
import {manualOnlineReleaseOffer,manualReleaseConsent,verifySingleProductRelease} from './store-single-product-release.mjs';
import {RETAIL_ROLES,storePlanForRole,retailRoleSql,productQuotaSql} from '../js/modules/store-cooperation-plans.mjs';
const PATH='/v1/store-shop/admin/catalog';
const REVIEW_PATH=PATH+'/review';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES=RETAIL_ROLES;
const STORE=['name','description','category','address','phone','hours','image_url','status'];
const PRODUCT=['title','description','category','image_url','price_cents','status','purchase_mode','shipping_fee_cents','redeem_type','redeem_value'];
const ACTOR=['row_id','line_id','legacy_line_id','point_line_id','role','name','phone'];
const PRODUCT_SELECT='id,shop_id,title,description,category,image_url,price_cents,status,version,purchase_mode,redeem_type,redeem_value,shipping_fee_cents,updated_at';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
const fail=(code,message,status=400)=>{throw new DirectoryError(code,message,status);};
const validId=value=>typeof value==='string'&&UUID.test(value);
async function rows(db,query,args=[]){
  const result=await db.prepare(query).bind(...args).all();
  if(result.success===false||!Array.isArray(result.results))throw new Error('Catalog unavailable');
  return result.results;
}
async function shopRow(db,id){
  const found=await rows(db,`SELECT s.*,u.role AS owner_role FROM store_shop_stores s JOIN users u ON u.line_id=s.owner_uid WHERE s.id=? LIMIT 2`,[id]);
  if(found.length!==1||!ROLES.includes(String(found[0].owner_role).toLowerCase()))fail('REGISTERED_STORE_REQUIRED','請選擇已註冊且仍具商城資格的店家；未綁定店家請使用合作店家管理',403);
  return found[0];
}
const publicShop=shop=>Object.fromEntries(['id',...STORE,'version','updated_at'].map(key=>[key,shop[key]]));
// At most one page plus its store. Feedback is descriptive, never a publication permit.
async function listingFeedback(db,targets){
  if(!targets.length)return new Map();
  const scopes=targets.map(target=>target.scope);
  let reviews;
  try{
    reviews=await rows(db,`SELECT scope,decision,review_json,reviewed_at FROM (
      SELECT scope,decision,review_json,reviewed_at,
        row_number() OVER(PARTITION BY scope ORDER BY reviewed_at DESC,content_hash DESC) AS position
      FROM store_listing_reviews WHERE policy_version=? AND scope IN (${scopes.map(()=>'?').join(',')})
    ) WHERE position=1 LIMIT ?`,[listingPolicyVersion,...scopes,scopes.length]);
  }catch(error){
    // Older installations may not have the additive review migration yet.
    // A failed query, busy database, or missing unrelated table remains an error.
    if(/\bno such table:\s*(?:main\.)?store_listing_reviews\b/i.test(String(error.message)))return new Map();
    throw error;
  }
  const feedback=new Map(),byScope=new Map(targets.map(target=>[target.scope,target]));
  for(const row of reviews){
    const target=byScope.get(row.scope),updated=target?.updated.map(Date.parse);
    if(!target||!['reject','manual'].includes(row.decision)||!Number.isSafeInteger(row.reviewed_at)||row.reviewed_at<=0||
      updated.some(time=>!Number.isFinite(time)||row.reviewed_at<time))continue;
    try{
      const prepared=prepareListingContent(target.value,target.parent),value=JSON.parse(row.review_json);
      if(value.decision!==row.decision)continue;
      const review=normalizeListingReview(value,prepared,prepared.urls.length);
      if(review.decision!==row.decision)continue;
      feedback.set(row.scope,{decision:review.decision,issues:review.issues.map(({category,field,evidence,reason})=>({category,field,evidence,reason})),reviewed_at:row.reviewed_at});
    }catch{
      // Invalid or stale stored output is not a current verdict about this listing.
    }
  }
  return feedback;
}
const withFeedback=(value,feedback)=>feedback?{...value,listing_review:feedback}:value;
async function receipt(db,key,uid,payload){
  const audit=(await rows(db,'SELECT actor_uid,payload_json,target_id,new_version FROM store_catalog_admin_audit WHERE request_key=?',[key]))[0];
  if(!audit)return null;
  if(audit.actor_uid!==uid||audit.payload_json!==payload)fail('REQUEST_CONFLICT','送出編號已使用，請重新載入資料後再修改',409);
  return {success:true,id:audit.target_id,version:audit.new_version,replayed:true};
}
export async function handleStoreAdminCatalog(request,env,profileMapper,fetcher=fetch,releaseVerifier=verifySingleProductRelease){
  const url=new URL(request.url);
  const reviewOnly=url.pathname===REVIEW_PATH;
  if(url.pathname!==PATH&&!reviewOnly)return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!(reviewOnly?['POST']:['GET','POST']).includes(request.method))return reply({success:false,error:'不支援此商城管理操作'},405);
  try{
    const {uid,db,actor,identityProof}=await authorizeStoreAdmin(request,env,profileMapper,fetcher);
    if(request.method==='GET'){
      const params=url.searchParams,shopId=params.get('shop'),after=params.get('after')||'',status=params.get('status')||'';
      if(params.has('queue')){
        if([...params.keys()].some(key=>!['queue','after'].includes(key)||params.getAll(key).length!==1)||params.get('queue')!=='draft'||(after&&!validId(after)))fail('INVALID_QUERY','草稿查詢條件不正確');
        const products=await rows(db,`SELECT p.id,p.shop_id,p.title,p.price_cents,p.category,p.status,p.version,p.updated_at,s.name AS shop_name,s.status AS shop_status,
          p.description,p.image_url,s.description AS review_parent_description,s.updated_at AS review_parent_updated_at
          FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id
          WHERE p.status='draft' AND p.id>? AND EXISTS(SELECT 1 FROM users u WHERE u.line_id=s.owner_uid AND ${retailRoleSql()})
          ORDER BY p.id LIMIT 21`,[after]);
        const page=products.slice(0,20),feedback=await listingFeedback(db,page.map(product=>({
          scope:'product:'+product.shop_id+':'+product.id,value:product,
          parent:{name:product.shop_name,description:product.review_parent_description},updated:[product.updated_at,product.review_parent_updated_at]
        })));
        return reply({success:true,products:page.map(({description,image_url,review_parent_description,review_parent_updated_at,...product})=>
          withFeedback(product,feedback.get('product:'+product.shop_id+':'+product.id))),next:products.length>20?products[19].id:''});
      }
      if([...params.keys()].some(key=>!['shop','after','status'].includes(key)||params.getAll(key).length!==1)||!validId(shopId)||(after&&!validId(after))||!['','draft','active','archived'].includes(status))fail('INVALID_QUERY','商城查詢條件不正確');
      const shop=await shopRow(db,shopId);
      const products=await rows(db,`SELECT ${PRODUCT_SELECT} FROM store_shop_products WHERE shop_id=? AND id>? AND (?='' OR status=?) ORDER BY id LIMIT 21`,[shop.id,after,status,status]);
      const summary=(await rows(db,"SELECT count(*) AS total,COALESCE(sum(status='active'),0) AS active,COALESCE(sum(status='draft'),0) AS draft FROM store_shop_products WHERE shop_id=?",[shop.id]))[0];
      const plan=storePlanForRole(shop.owner_role),onlineAllowed=plan.canOnline;
      const storeScope='store:'+shop.owner_uid,page=products.slice(0,20);
      const feedback=await listingFeedback(db,[{scope:storeScope,value:shop,updated:[shop.updated_at]},...page.map(product=>({
        scope:'product:'+shop.id+':'+product.id,value:product,parent:shop,updated:[product.updated_at,shop.updated_at]
      }))]);
      return reply({success:true,shop:withFeedback(publicShop(shop),feedback.get(storeScope)),cooperation_plan:plan,online_product_allowed:onlineAllowed,products:page.map(p=>{
        const offer=onlineAllowed?manualOnlineReleaseOffer(p,shop):null;
        return withFeedback(offer?{...p,manual_online_release:offer}:p,feedback.get('product:'+shop.id+':'+p.id));
      }),next:products.length>20?products[19].id:'',summary});
    }
    if(url.search)fail('INVALID_QUERY','儲存不可附加查詢條件');
    const data=await readJson(request);
    if(reviewOnly&&(!data||typeof data!=='object'||Array.isArray(data)))fail('INVALID_REQUEST','商品檢查資料不正確');
    if(Object.keys(data).some(key=>!['type','id','shop_id','version','shop_version','request_key','changes','manual_release'].includes(key))||!['store','product'].includes(data.type)||!validId(data.id)||!validId(data.shop_id)||!validId(data.request_key))fail('INVALID_REQUEST','商城儲存資料不正確');
    if(!Number.isSafeInteger(data.version)||data.version<1||data.version>1e9||!Number.isSafeInteger(data.shop_version)||data.shop_version<1||data.shop_version>1e9)fail('INVALID_VERSION','請重新載入後再修改');
    const fields=data.type==='store'?STORE:PRODUCT,changes=data.changes;
    if(!changes||typeof changes!=='object'||Array.isArray(changes)||!Object.keys(changes).length||Object.keys(changes).some(key=>!fields.includes(key)))fail('INVALID_FIELD','僅能修改商城展示及商品折抵設定，不得變更歸屬、會員點數或訂單');
    if(reviewOnly){
      if(data.type!=='product'||Object.hasOwn(data,'manual_release')||Object.keys(changes).length!==1||changes.status!=='active')fail('INVALID_REQUEST','僅能檢查現有商品草稿，不得修改內容、公開或人工放行');
      const shop=await shopRow(db,data.shop_id);
      const original=(await rows(db,`SELECT ${PRODUCT_SELECT} FROM store_shop_products WHERE id=? AND shop_id=?`,[data.id,shop.id]))[0];
      if(!original)fail('NOT_FOUND','查無此店家的商品',404);
      if(original.version!==data.version||shop.version!==data.shop_version)fail('VERSION_CONFLICT','資料已更新，請重新載入後再檢查',409);
      if(original.status!=='draft')fail('DRAFT_PRODUCT_REQUIRED','僅能檢查尚未公開的商品草稿',409);
      const normalized=normalizeProduct({...original,status:'active'});
      requireProductRedemption(normalized,shop.owner_role);
      if(!await exactHardAdminBeforeExternal(db,identityProof,uid,actor))fail('ADMIN_CHANGED','管理員身分已更新，請重新登入後重試',409);
      await requireListingReview({value:normalized,parent:shop,scope:'product:'+shop.id+':'+data.id,uid,env,fetcher});
      // Review records may be saved, but this route never reads publish receipts
      // or reaches the catalog audit/update batch, even when the review allows it.
      return reply({success:true,id:data.id,reviewed:true,decision:'allow',published:false});
    }
    const sorted=Object.fromEntries(fields.filter(key=>Object.hasOwn(changes,key)).map(key=>[key,changes[key]]));
    const release=Object.hasOwn(data,'manual_release')?manualReleaseConsent(data.manual_release):null;
    const payload=JSON.stringify({type:data.type,id:data.id,shop_id:data.shop_id,version:data.version,shop_version:data.shop_version,changes:sorted,...(release?{manual_release:release}:{})});
    const shop=await shopRow(db,data.shop_id),prior=await receipt(db,data.request_key,uid,payload);
    if(prior)return reply(prior);
    const original=data.type==='store'?shop:(await rows(db,`SELECT ${PRODUCT_SELECT} FROM store_shop_products WHERE id=? AND shop_id=?`,[data.id,shop.id]))[0];
    if(!original||original.id!==data.id)fail('NOT_FOUND','查無此店家的商品／店面',404);
    if(original.version!==data.version||shop.version!==data.shop_version||original.status==='archived')fail('VERSION_CONFLICT','資料已更新或封存，請重新載入後再修改',409);
    const normalized=data.type==='store'?normalizeStore({...original,...changes}):normalizeProduct({...original,...changes});
    if(data.type==='product')requireProductRedemption(normalized,shop.owner_role);
    const updated=Object.fromEntries(fields.map(key=>[key,normalized[key]]));
    const releaseProof=release?await releaseVerifier({data,original,shop,db,fetcher}):null;
    if(!release&&!(data.type==='product'&&isShippingOnlyUpdate(normalized,original))){
      if(!await exactHardAdminBeforeExternal(db,identityProof,uid,actor))fail('ADMIN_CHANGED','管理員身分已更新，請重新登入後重試',409);
      await requireListingReview({value:normalized,parent:data.type==='product'?shop:null,scope:data.type==='store'?'store:'+shop.owner_uid:'product:'+shop.id+':'+data.id,uid,env,fetcher});
    }
    const auditId=crypto.randomUUID(),now=new Date().toISOString();
    const table=data.type==='store'?'store_shop_stores':'store_shop_products';
    const exact=exactHardAdminWriteGate(identityProof,uid,actor);
    let gate=`t.id=? AND t.version=? AND EXISTS(SELECT 1 FROM users a WHERE ${ACTOR.map(key=>'a.'+key+' IS ?').join(' AND ')}) ${exact?'AND '+exact.sql:''}
      AND EXISTS(SELECT 1 FROM store_shop_stores s JOIN users u ON u.line_id=s.owner_uid WHERE s.id=? AND s.owner_uid=? AND s.version=? AND s.status=? AND u.role IS ?)`;
    const args=[data.id,data.version,...ACTOR.map(key=>actor[key]??null),...(exact?.args||[]),shop.id,shop.owner_uid,shop.version,shop.status,shop.owner_role];
    if(data.type==='product'){
      gate+=" AND t.shop_id=? AND t.status!='archived'";args.push(shop.id);
      if(updated.status!=='archived'){
        gate+=` AND EXISTS(SELECT 1 FROM users quota_owner WHERE quota_owner.line_id=? AND quota_owner.role IS ? AND ${productQuotaSql('quota_owner.role',"SELECT count(*) FROM store_shop_products other WHERE other.shop_id=t.shop_id AND other.id!=t.id AND other.status!='archived'")})`;
        args.push(shop.owner_uid,shop.owner_role);
      }
    }
    if(releaseProof){
      const pinned=PRODUCT;
      gate+=` AND ${pinned.map(key=>'t.'+key+' IS ?').join(' AND ')} AND EXISTS(SELECT 1 FROM store_listing_reviews r WHERE r.scope=? AND r.content_hash=? AND r.policy_version=? AND r.decision='manual' AND r.review_json=?)`;
      args.push(...pinned.map(key=>original[key]),releaseProof.scope,releaseProof.hash,releaseProof.policy,releaseProof.reviewJson);
    }
    // The INSERT selects the exact current snapshot. A unique, fresh audit ID gates
    // the UPDATE, so duplicate retries cannot apply a second write after owner edits.
    const results=await db.batch([
      db.prepare(`INSERT INTO store_catalog_admin_audit(id,request_key,actor_uid,shop_id,target_type,target_id,old_version,new_version,payload_json,before_json,after_json,created_at)
        SELECT ?,?,?,?,?,?,?,?, ?,?,?,? FROM ${table} t WHERE ${gate} ON CONFLICT(request_key) DO NOTHING`)
        .bind(auditId,data.request_key,uid,shop.id,data.type,data.id,data.version,data.version+1,payload,JSON.stringify(Object.fromEntries(fields.map(key=>[key,original[key]]))),JSON.stringify(updated),now,...args),
      db.prepare(`UPDATE ${table} SET ${fields.map(key=>key+'=?').join(',')},version=version+1,updated_at=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM store_catalog_admin_audit WHERE id=?)`)
        .bind(...fields.map(key=>updated[key]),now,data.id,data.version,auditId)
    ]);
    if(results.length!==2||results.some(result=>result.success===false))throw new Error('Catalog write unavailable');
    const saved=await receipt(db,data.request_key,uid,payload);
    if(!saved)fail('VERSION_CONFLICT','店家資料或資格已變更，請重新載入後再修改',409);
    return reply({...saved,replayed:!(results[1].meta?.changes>0)});
  }catch(error){
    if(error instanceof ListingReviewError)return reply(listingReviewFailure(error),error.status);
    if(error instanceof DirectoryError||error instanceof ShopError)return reply({success:false,code:error.code||'INVALID_CATALOG',error:error.message},error.status);
    return reply({success:false,code:'CATALOG_UNAVAILABLE',error:'商城管理暫時無法使用，請重新確認；尚未確認儲存成功'},503);
  }
}
