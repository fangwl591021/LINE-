// Product targets come only from immutable sent-card snapshots, never URL targets.
import {readPublicDashboardProduct,normalizeDashboardProduct,dashboardProductVersionGate} from './checkin-dashboard-products.mjs';
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PAGE=/^[a-z][a-z0-9_-]{0,39}$/;
const fail=(message,status=400)=>{const error=new Error(message);error.status=status;throw error;};
export async function recordCheckinProductEntry(db,actor,input,now){
 if(!input||Object.keys(input).length!==3||Object.keys(input).some(key=>!['cardId','action','pageId'].includes(key))
   ||input.action!=='product'||typeof input.cardId!=='string'||!UUID.test(input.cardId)||typeof input.pageId!=='string'||!PAGE.test(input.pageId))fail('商品卡片入口格式不正確');
 const saved=await db.prepare(`SELECT p.product_id,p.shop_id,p.product_json,p.available,p.created_at,c.created_at AS card_created_at
   FROM checkin_chat_dashboard_product_snapshots p JOIN checkin_mall_cards c ON c.id=p.card_id
   WHERE p.card_id=? AND p.page_id=? AND c.state IN ('sending','accepted','unknown')`).bind(input.cardId,input.pageId).first();
 if(!saved||saved.available!==1||saved.created_at!==saved.card_created_at)fail('商品卡片來源不存在或尚未發送',404);
 let frozen;try{frozen=normalizeDashboardProduct(JSON.parse(saved.product_json));}catch{fail('商品卡片來源不完整，請重新取得卡片',409);}
 if(frozen.shopId!==saved.shop_id||frozen.productId!==saved.product_id)fail('商品卡片來源不一致',409);
 const product=await readPublicDashboardProduct(db,saved.shop_id,saved.product_id);
 if(!product)fail('這件商品目前未公開或已下架，未改選其他商品',404);
 const destination={shopId:product.shopId,productId:product.productId},gate=dashboardProductVersionGate([product]);
 let result;
 try{
  result=await db.prepare(`INSERT OR IGNORE INTO checkin_mall_product_clicks(card_id,page_id,actor_uid,actor_name,clicked_at,minute_bucket)
    SELECT p.card_id,p.page_id,?,?,?,? FROM checkin_chat_dashboard_product_snapshots p JOIN checkin_mall_cards c ON c.id=p.card_id
    WHERE p.card_id=? AND p.page_id=? AND p.available=1 AND p.created_at=c.created_at
    AND c.state IN ('sending','accepted','unknown') AND ${gate.sql}`)
    .bind(actor.uid,actor.name,now,Math.floor(now/60000),input.cardId,input.pageId,...gate.args).run();
 }catch{
  // Resolution was verified. Analytics availability must not select another item
  // or prevent viewing this public product; the write outcome remains unknown.
  return {success:true,destination,recorded:null,recordStatus:'unconfirmed'};
 }
 if(result.success===false||!Number.isSafeInteger(result.meta?.changes))return {success:true,destination,recorded:null,recordStatus:'unconfirmed'};
 if(result.meta.changes===1)return {success:true,destination,recorded:true,duplicate:false};
 const current=await readPublicDashboardProduct(db,saved.shop_id,saved.product_id);
 if(!current)fail('這件商品目前未公開或已下架，未改選其他商品',404);
 const duplicate=await db.prepare('SELECT id FROM checkin_mall_product_clicks WHERE card_id=? AND page_id=? AND actor_uid=? AND minute_bucket=?')
   .bind(input.cardId,input.pageId,actor.uid,Math.floor(now/60000)).first();
 return duplicate?{success:true,destination,recorded:true,duplicate:true}:{success:true,destination,recorded:null,recordStatus:'unconfirmed'};
}

export function parseCheckinReportCursor(value){
 if(!value)return {time:0,source:'',id:0,legacy:0};
 if(/^[1-9]\d{0,14}$/.test(value))return {time:0,source:'',id:0,legacy:Number(value)};
 const match=/^([1-9]\d{0,15})_([mp])_([1-9]\d{0,14})$/.exec(value);
 if(!match||!Number.isSafeInteger(Number(match[1]))||Number(match[1])>8640000000000000)fail('報告分頁格式不正確');
 return {time:Number(match[1]),source:match[2],id:Number(match[3]),legacy:0};
}
export async function readCheckinMallCombinedReport(db,range){
 const cursor=parseCheckinReportCursor(range.after||'');
 const installed=await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='checkin_mall_product_clicks'").first();
 const entries=`WITH entries AS (
   SELECT c.id,'m' AS source,c.actor_uid,c.actor_name,c.action,c.clicked_at,c.card_id,'' AS product_title,'' AS shop_name FROM checkin_mall_clicks c
   ${installed?`UNION ALL SELECT c.id,'p',c.actor_uid,c.actor_name,'product',c.clicked_at,c.card_id,
     substr(CASE WHEN json_valid(s.product_json) THEN json_extract(s.product_json,'$.title') ELSE '' END,1,80),
     substr(CASE WHEN json_valid(s.product_json) THEN json_extract(s.product_json,'$.shopName') ELSE '' END,1,80)
     FROM checkin_mall_product_clicks c JOIN checkin_chat_dashboard_product_snapshots s ON s.card_id=c.card_id AND s.page_id=c.page_id`:''}
 )`;
 const [summary,cards,list]=await Promise.all([
  db.prepare(`${entries} SELECT COUNT(*) entries,COUNT(DISTINCT actor_uid) people,COALESCE(SUM(action='mall'),0) mall,
    COALESCE(SUM(action='details'),0) details,COALESCE(SUM(action='product'),0) products FROM entries WHERE clicked_at>=? AND clicked_at<?`).bind(range.start,range.end).first(),
  db.prepare("SELECT COUNT(*) total,COALESCE(SUM(state='accepted'),0) accepted,COALESCE(SUM(state IN ('unknown','sending')),0) unknown,COALESCE(SUM(state='preparing'),0) preparing,COALESCE(SUM(state='failed'),0) failed FROM checkin_mall_cards WHERE created_at>=? AND created_at<?").bind(range.start,range.end).first(),
  db.prepare(`${entries} SELECT id,source,actor_name,action,clicked_at,card_id,product_title,shop_name FROM entries
    WHERE clicked_at>=? AND clicked_at<? AND (?=0 OR (source='m' AND id<?))
    AND (?=0 OR clicked_at<? OR (clicked_at=? AND (source<? OR (source=? AND id<?))))
    ORDER BY clicked_at DESC,source DESC,id DESC LIMIT 51`)
    .bind(range.start,range.end,cursor.legacy,cursor.legacy,cursor.time,cursor.time,cursor.time,cursor.source,cursor.source,cursor.id).all()
 ]);
 if(!summary||!cards||list.success===false||!Array.isArray(list.results))fail('報告暫時無法取得',503);
 const rows=list.results.slice(0,50),last=rows.at(-1);
 return {summary,cards,rows,next:list.results.length>50?`${last.clicked_at}_${last.source}_${last.id}`:''};
}
