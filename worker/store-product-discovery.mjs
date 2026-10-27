// Read-only cross-store discovery. Uses the existing public-store eligibility.
// Never reads bank settings or creates QR, order, point, review or identity data.
import {retailRoleSql} from '../js/modules/store-cooperation-plans.mjs';
export class ProductDiscoveryError extends Error {
  constructor(message,status=400){super(message);this.status=status;}
}
const categories=['','食','宿','遊','購','行','服務','製造','unclassified'];
function text(params,key,max){const value=(params.get(key)||'').trim();if(value.length>max)throw new ProductDiscoveryError('商品搜尋資料過長');return value;}
export async function readPublicProducts(db,params,eligible) {
  const id=text(params,'id',80),after=text(params,'after',80),q=text(params,'q',80);
  const category=text(params,'category',20),mode=text(params,'purchase_mode',20),redeem=text(params,'redeem',10);
  if(!categories.includes(category)||!['','online','in_store'].includes(mode)||!['','1'].includes(redeem))throw new ProductDiscoveryError('商品篩選條件不正確');
  if((id&&!/^[A-Za-z0-9-]{1,80}$/.test(id))||(after&&!/^[A-Za-z0-9-]{1,80}$/.test(after))||(id&&after))throw new ProductDiscoveryError('商品編號或分頁不正確');
  const merchant=`EXISTS(SELECT 1 FROM users u WHERE u.line_id=s.owner_uid AND ${retailRoleSql()})`;
  const columns='p.id,p.shop_id,p.title,p.description,p.image_url,p.price_cents,p.redeem_type,p.redeem_value,p.category,p.purchase_mode,p.shipping_fee_cents,p.version,p.updated_at,s.name AS shop_name,s.category AS shop_category,s.address AS shop_address';
  const where=id?'p.id=?':`p.id>? AND (instr(lower(p.title),lower(?))>0 OR instr(lower(p.description),lower(?))>0 OR instr(lower(s.name),lower(?))>0) AND (?='' OR p.category=?) AND (?='' OR p.purchase_mode=?) AND (?='' OR (${merchant} AND p.redeem_type!='none'))`;
  const categoryValue=category==='unclassified'?'':category;
  // An explicit unclassified selection must not be interpreted as "all".
  const categoryFilter=category==='unclassified'?'unclassified':category;
  const args=id?[id]:[after,q,q,q,categoryFilter,categoryValue,mode,mode,redeem];
  const rows=(await db.prepare(`SELECT ${columns},(${merchant}) AS merchant_enabled FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id WHERE p.status='active' AND s.status='active' AND ${eligible} AND ${where} ORDER BY p.id LIMIT ${id?1:41}`).bind(...args).all()).results;
  if(id&&!rows.length)throw new ProductDiscoveryError('商品尚未上架、店面未公開或已下架',404);
  return {success:true,products:rows.slice(0,40).map(({shop_name,shop_category,shop_address,merchant_enabled,...p})=>({...p,shop:{id:p.shop_id,name:shop_name,category:shop_category,address:shop_address,merchant_enabled}})),next:rows.length>40?rows[39].id:''};
}
