// Display-only bridge. A partner listing never becomes a user, shop owner or cashier.
import {catalogOrder} from './store-catalog-order.mjs';
const idSql="substr(p.partner_handle,9,8)||'-'||substr(p.partner_handle,17,4)||'-'||substr(p.partner_handle,21,4)||'-'||substr(p.partner_handle,25,4)||'-'||substr(p.partner_handle,29,12)";
const validHandle="length(p.partner_handle)=40 AND substr(p.partner_handle,1,8)='partner_' AND substr(p.partner_handle,9) NOT GLOB '*[^0-9a-f]*'";
const complete="length(trim(name))>=2 AND length(trim(description))>=15 AND image_url LIKE 'https://%/%' AND instr(description,'請填寫')=0 AND instr(description,'公司/店家介紹…')=0 AND instr(description,'公司/店家服務…')=0 AND (length(trim(phone))>0 OR line_url LIKE 'https://%/%' OR website_url LIKE 'https://%/%')";
const catalog=`SELECT ${idSql} AS id,p.name,p.description,p.category,COALESCE(NULLIF(l.address,''),l.city,'') AS address,p.phone,COALESCE(l.business_hours,'') AS hours,p.cover_image_url AS image_url,p.line_url,p.website_url,COALESCE(l.maps_url,'') AS maps_url,p.status,1 AS version,p.updated_at,0 AS merchant_enabled,1 AS listing_only
 FROM point_redemption_partners p LEFT JOIN point_redemption_partner_locations l ON l.location_id=(SELECT location_id FROM point_redemption_partner_locations WHERE partner_id=p.partner_id AND status='active' ORDER BY sort_order,location_id LIMIT 1)
 WHERE ${validHandle}`;
const missing=error=>/no such table: (?:main\.)?point_redemption_partner(?:s|_locations)\b/.test(String(error?.message));
async function read(db,sql,args=[]){
  const result=await db.prepare(sql).bind(...args).all();
  if(result.success===false||!Array.isArray(result.results))throw Error('Partner catalog unavailable');
  return result.results;
}
export async function publicPartnerShops(db,{id='',q='',after='',category='',order=catalogOrder('',after)}={}){
  try{
    return await read(db,`SELECT *${order.select('id')} FROM (${catalog}) WHERE status='active' AND ${complete} AND (?='' OR id=?) AND ${order.where('id')} AND (instr(name,?)>0 OR instr(category,?)>0 OR instr(address,?)>0) AND (?='' OR category=?) ORDER BY ${order.by('id')} LIMIT 41`,[id,id,...order.args,q,q,q,category,category]);
  }catch(error){if(missing(error))return [];throw error;}
}
export async function adminPartnerShops(db,{q='',status='',after=''}){
  const filter="(?='' OR status=?) AND (?='' OR instr(lower(name),lower(?))>0 OR instr(lower(category),lower(?))>0 OR instr(lower(address),lower(?))>0 OR instr(phone,?)>0)";
  const args=[status,status,q,q,q,q,q];
  try{
    const results=await db.batch([
      db.prepare(`SELECT count(*) AS total,COALESCE(sum(status='active'),0) AS active,COALESCE(sum(status='draft'),0) AS draft FROM (${catalog})`),
      db.prepare(`SELECT count(*) AS total FROM (${catalog}) WHERE ${filter}`).bind(...args),
      db.prepare(`SELECT id,name,category,status,address,phone,'' AS owner_uid,'管理員代建（未綁定帳號）' AS owner_name,'' AS owner_role,0 AS product_count,0 AS active_product_count,0 AS online_product_count,1 AS listing_only,(status='active' AND ${complete}) AS public_visible FROM (${catalog}) WHERE ${filter} AND id>? ORDER BY id LIMIT 21`).bind(...args,after)
    ]);
    if(results.length!==3||results.some(r=>r.success===false||!Array.isArray(r.results)))throw Error('Partner directory unavailable');
    return {summary:results[0].results[0],total:results[1].results[0].total,shops:results[2].results};
  }catch(error){if(missing(error))return {summary:{total:0,active:0,draft:0},total:0,shops:[]};throw error;}
}
export const mergeShopPages=(a,b)=>[...a,...b].sort((x,y)=>x.id<y.id?-1:x.id>y.id?1:0);
