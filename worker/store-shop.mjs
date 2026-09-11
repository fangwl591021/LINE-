// Catalog and read-only sales. No point writes or cashier execution calls.
import {readShopSales} from './store-shop-sales.mjs';
import {recognizeProductDm,ProductDmError} from './store-product-ocr.mjs';
const roles = ['store','店長','admin','總管'];
const categories = ['','食','宿','遊','購','行','服務','製造'];
const publicColumns = 's.id,s.name,s.description,s.category,s.address,s.phone,s.hours,s.image_url,s.status,s.version,s.updated_at';
const eligible = "EXISTS (SELECT 1 FROM users u WHERE u.line_id=s.owner_uid AND lower(u.role) IN ('store','店長','admin','總管'))";
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type, Authorization', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS' };
class ShopError extends Error { constructor(message,status=400) { super(message); this.status=status; } }
const fail = (message,status) => { throw new ShopError(message,status); };
const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers});
function field(data,key,max,required=false) {
  const value=data[key] ?? '';
  if(typeof value!=='string' || value.length>max) fail(`${key} 格式或長度不正確`);
  if(required && !value.trim()) fail(`${key} 不可空白`);
  return value.trim();
}
function choice(value,values,label) { if(!values.includes(value)) fail(`${label} 不正確`); return value; }
function integer(value,max,label) { if(!Number.isSafeInteger(value)||value<0||value>max) fail(`${label} 必須是有效的非負整數`); return value; }
function imageUrl(data) {
  const value=field(data,'image_url',2048); if(!value) return '';
  let url; try { url=new URL(value); } catch { fail('圖片網址不正確'); }
  if(url.protocol!=='https:'||url.username||url.password) fail('圖片須使用 HTTPS 網址');
  return url.href;
}
export function normalizeStore(data) {
  return {name:field(data,'name',80,true),description:field(data,'description',2000),category:field(data,'category',40),address:field(data,'address',200),phone:field(data,'phone',40),hours:field(data,'hours',200),image_url:imageUrl(data),status:choice(data.status,['draft','active'],'店面狀態')};
}
export function normalizeProduct(data) {
  const type=choice(data.redeem_type,['none','fixed','percent','full'],'折抵規則');
  const value=integer(data.redeem_value,type==='percent'?100:1000000,'折抵上限');
  if(['none','full'].includes(type)&&value!==0) fail('不折抵或全額折抵的數值須為 0');
  if(['fixed','percent'].includes(type)&&value===0) fail('折抵上限必須大於 0');
  return {title:field(data,'title',100,true),description:field(data,'description',3000),image_url:imageUrl(data),price_cents:integer(data.price_cents,100000000,'價格'),redeem_type:type,redeem_value:value,status:choice(data.status,['draft','active','archived'],'商品狀態'),category:choice(data.category ?? '',categories,'商品分類'),purchase_mode:choice(data.purchase_mode===undefined?'in_store':data.purchase_mode,['in_store','online'],'銷售方式')};
}
async function readJson(request,maxBytes=16000) {
  const reader=request.body?.getReader(); if(!reader) fail('缺少資料');
  const chunks=[]; let size=0;
  while(true) {
    const {value,done}=await reader.read(); if(done) break;
    size+=value.length; if(size>maxBytes) { await reader.cancel(); fail('資料過大',413); }
    chunks.push(value);
  }
  const bytes=new Uint8Array(size); let offset=0;
  for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
  try {
    const data=JSON.parse(new TextDecoder().decode(bytes));
    if(!data||typeof data!=='object'||Array.isArray(data)) fail('資料格式錯誤');
    return data;
  } catch { fail('資料格式錯誤'); }
}
async function actor(request,db,fetcher) {
  const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if(!token||token.length>4096) fail('請先登入後再管理商城',401);
  const response=await fetcher('https://api.line.me/v2/profile',{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});
  if(!response.ok) fail('登入已失效，請重新登入',401);
  const profile=await response.json();
  if(!/^U[0-9a-f]{32}$/i.test(profile.userId||'')) fail('登入身分無效',401);
  const row=await db.prepare('SELECT line_id,role FROM users WHERE line_id=? LIMIT 1').bind(profile.userId).first();
  if(!row||!roles.includes(String(row.role).toLowerCase())) fail('僅已登記的店家可管理自己的商城',403);
  return profile.userId;
}
const own=(db,uid)=>db.prepare('SELECT * FROM store_shop_stores WHERE owner_uid=?').bind(uid).first();
const products=async(db,id,privateView)=>(await db.prepare(`SELECT id,shop_id,title,description,image_url,price_cents,redeem_type,redeem_value,status,category,purchase_mode,version,updated_at FROM store_shop_products WHERE shop_id=? AND status ${privateView?"!= 'archived'":"= 'active'"} ORDER BY id LIMIT 100`).bind(id).all()).results;
function publicStore(shop) { if(!shop) return null; const {owner_uid,...visible}=shop; return visible; }
export async function handleStoreShop(request,env,fetcher=fetch) {
  const url=new URL(request.url);
  if(!(url.pathname==='/v1/store-shop'||url.pathname.startsWith('/v1/store-shop/'))) return null;
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  try {
    const db=env.ACTMASTER_DB;
    if(request.method==='GET'&&url.pathname==='/v1/store-shop') {
      const id=url.searchParams.get('shop');
      if(id) {
        if(id.length>80) fail('店面編號不正確');
        const shop=await db.prepare(`SELECT ${publicColumns} FROM store_shop_stores s WHERE s.id=? AND s.status='active' AND ${eligible}`).bind(id).first();
        if(!shop) fail('店面尚未開放或已下架',404);
        return reply({success:true,shop,products:await products(db,id,false)});
      }
      const query=(url.searchParams.get('q')||'').trim().slice(0,80);
      const cursor=(url.searchParams.get('after')||'').slice(0,80);
      const category=choice(url.searchParams.get('category')||'',categories,'商品分類');
      const rows=(await db.prepare(`SELECT ${publicColumns} FROM store_shop_stores s WHERE s.status='active' AND ${eligible} AND s.id>? AND (instr(s.name,?)>0 OR instr(s.category,?)>0 OR instr(s.address,?)>0) AND (?='' OR EXISTS (SELECT 1 FROM store_shop_products p WHERE p.shop_id=s.id AND p.status='active' AND p.category=?)) ORDER BY s.id LIMIT 41`).bind(cursor,query,query,query,category,category).all()).results;
      return reply({success:true,shops:rows.slice(0,40),next:rows.length>40?rows[39].id:''});
    }
    const manage=request.method==='GET'&&url.pathname==='/v1/store-shop/manage';
    const sales=request.method==='GET'&&url.pathname==='/v1/store-shop/sales';
    const writeStore=request.method==='POST'&&url.pathname==='/v1/store-shop/store';
    const writeProduct=request.method==='POST'&&url.pathname==='/v1/store-shop/product';
    const recognizeDm=request.method==='POST'&&url.pathname==='/v1/store-shop/product-ocr';
    if(!manage&&!sales&&!writeStore&&!writeProduct&&!recognizeDm) fail('不支援此商城操作',404);
    const uid=await actor(request,db,fetcher);
    const shop=await own(db,uid);
    if(recognizeDm){
      if(!shop)fail('請先儲存店面，再辨識 DM',400);
      const data=await readJson(request,Math.ceil(4*1024*1024*4/3)+1024);
      return reply(await recognizeProductDm(data,env,shop.id,fetcher));
    }
    if(sales) {
      if(!shop) fail('請先建立店面',404);
      const result=await readShopSales(db,uid,url.searchParams);
      return reply(result,result.success?200:400);
    }
    if(manage) return reply({success:true,shop:publicStore(shop),products:shop?await products(db,shop.id,true):[]});
    const data=await readJson(request); const now=new Date().toISOString();
    if(writeStore) {
      const vals=Object.values(normalizeStore(data));
      if(!shop) {
        if(data.version!==0) fail('店面狀態已改變，請重新載入',409);
        try { await db.prepare('INSERT INTO store_shop_stores (id,owner_uid,name,description,category,address,phone,hours,image_url,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),uid,...vals,now).run(); }
        catch(error) { if(String(error.message).includes('UNIQUE')) fail('店面已建立，請重新載入',409); throw error; }
      } else {
        const version=integer(data.version,1000000000,'版本');
        const result=await db.prepare('UPDATE store_shop_stores SET name=?,description=?,category=?,address=?,phone=?,hours=?,image_url=?,status=?,updated_at=?,version=version+1 WHERE id=? AND owner_uid=? AND version=?').bind(...vals,now,shop.id,uid,version).run();
        if(!result.meta.changes) fail('資料已被更新，請重新載入後再編輯',409);
      }
      return reply({success:true,shop:publicStore(await own(db,uid))});
    }
    if(!shop) fail('請先建立店面');
    const id=field(data,'id',80);
    // Older cached clients must not reset the owner's category or sales channel.
    if(id && (data.category===undefined || data.purchase_mode===undefined)) {
      const previous=await db.prepare('SELECT category,purchase_mode FROM store_shop_products WHERE id=? AND shop_id=?').bind(id,shop.id).first();
      if(data.category===undefined)data.category=previous?.category ?? '';
      if(data.purchase_mode===undefined)data.purchase_mode=previous?.purchase_mode ?? 'in_store';
    }
    const value=normalizeProduct(data);
    if(id) {
      const version=integer(data.version,1000000000,'版本');
      const result=await db.prepare("UPDATE store_shop_products SET title=?,description=?,image_url=?,price_cents=?,redeem_type=?,redeem_value=?,status=?,category=?,purchase_mode=?,updated_at=?,version=version+1 WHERE id=? AND shop_id=? AND version=? AND status!='archived'").bind(...Object.values(value),now,id,shop.id,version).run();
      if(!result.meta.changes) fail('商品不存在、已更新或無權修改，請重新載入',409);
    } else {
      const key=field(data,'request_key',80,true);
      if(!/^[0-9a-f-]{36}$/i.test(key)) fail('請重新開啟新增商品表單');
      const result=await db.prepare("INSERT INTO store_shop_products (id,shop_id,title,description,image_url,price_cents,redeem_type,redeem_value,status,category,purchase_mode,updated_at,request_key) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM store_shop_products WHERE shop_id=? AND status!='archived')<100 ON CONFLICT(shop_id,request_key) DO NOTHING").bind(crypto.randomUUID(),shop.id,...Object.values(value),now,key,shop.id).run();
      if(!result.meta.changes) {
        const previous=await db.prepare('SELECT * FROM store_shop_products WHERE shop_id=? AND request_key=?').bind(shop.id,key).first();
        if(!previous) fail('每店最多 100 件商品，請先封存不用的商品');
        if(!Object.entries(value).every(([key,value])=>previous[key]===value)) fail('這次新增已儲存，請重新載入後使用編輯商品修改',409);
      }
    }
    return reply({success:true,products:await products(db,shop.id,true)});
  } catch(error) {
    if(error instanceof ShopError||error instanceof ProductDmError) return reply({success:false,error:error.message},error.status);
    const missing=/no such table/.test(String(error?.message));
    console.error(JSON.stringify({event:'store_shop_failed',path:url.pathname,code:missing?'SCHEMA_NOT_READY':'UNAVAILABLE'}));
    return reply({success:false,error:missing?'商城尚未啟用，請管理員完成資料庫更新':'商城服務暫時無法使用，請稍後重試'},503);
  }
}
