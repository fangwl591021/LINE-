import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreShop} from '../../worker/store-shop.mjs';
import {handleStoreAdminCatalog} from '../../worker/store-admin-catalog.mjs';
import {handleStoreAdminProducts} from '../../worker/store-admin-products.mjs';
import {storeInviteProfileView} from '../../workerbackup.js';
import {listingTestEnv,listingTestFetch,allowListing} from './store-listing-review.mjs';
export const OWNER='U'+'a'.repeat(32),ADMIN='Uf729764dbb5b652a5a90a467320bea29';
export const SHOP='11111111-1111-4111-8111-111111111111',PRODUCT='22222222-1111-4111-8111-111111111111';
export function createListingFixture({existing=false}={}){
  const sql=new DatabaseSync(':memory:');
  sql.exec("PRAGMA foreign_keys=ON; CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT UNIQUE,legacy_line_id TEXT DEFAULT '',point_line_id TEXT DEFAULT '',role TEXT,name TEXT DEFAULT '',phone TEXT DEFAULT '',points INTEGER DEFAULT 500); CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);");
  for(const file of ['0019_point_redemption_partner_directory.sql','0020_partner_card_onboarding.sql','0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0040_store_admin_product_audit.sql','0045_store_catalog_admin_audit.sql'])sql.exec(readFileSync(new URL('../../migrations/'+file,import.meta.url),'utf8'));
  for(const [uid,role,name]of [[OWNER,'store','合成店主'],[ADMIN,'admin','方萬隆']])sql.prepare('INSERT INTO users(row_id,line_id,role,name) VALUES(?,?,?,?)').run(uid,uid,role,name);
  if(existing){
    sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,description,status,updated_at) VALUES(?,?,'原咖啡店','原有合法介紹','active','now')").run(SHOP,OWNER);
    sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,price_cents,status,updated_at,request_key) VALUES(?,?,'原咖啡商品',10000,'active','now',?)").run(PRODUCT,SHOP,PRODUCT);
  }
  const db={withSession(){return this;},prepare(query){const stmt=(args=[])=>({bind(...values){return stmt(values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args),meta:{changes:sql.prepare('SELECT changes() n').get().n}};},async run(){return {success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});return stmt();},async batch(statements){sql.exec('BEGIN');try{const results=[];for(const stmt of statements)results.push(await stmt.all());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const env=listingTestEnv(sql,db,{bypassQuota:false}),state={providerCalls:0,requests:[],review:(_body,count)=>allowListing(count),image:null};
  const fetcher=listingTestFetch(async(url,opts)=>{if(url==='https://api.line.me/v2/profile'){const uid=opts.headers.Authorization.slice(7);return [OWNER,ADMIN].includes(uid)?Response.json({userId:uid}):new Response('',{status:401});}throw Error('External calls forbidden');},{review:(body,count)=>{state.providerCalls++;state.requests.push(body);return state.review(body,count);},image:(url,opts)=>{state.requests.push({image:url,opts});return state.image?state.image(url,opts):new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),{headers:{'Content-Type':'image/png'}});}});
  const request=async(path,data,uid=OWNER)=>{
    const req=new Request('https://app.com/v1/store-shop'+path,{method:data?'POST':'GET',headers:uid?{Authorization:'Bearer '+uid,'Content-Type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});
    const response=await handleStoreAdminCatalog(req,env,storeInviteProfileView,fetcher)||await handleStoreAdminProducts(req,env,storeInviteProfileView,fetcher)||await handleStoreShop(req,env,fetcher);
    return response;
  };
  const call=async(...args)=>{const r=await request(...args);return {http:r.status,...await r.json()};};
  return {sql,env,db:env.ACTMASTER_DB,state,fetcher,request,call,resetUsage:()=>sql.exec('DELETE FROM store_listing_review_usage;'),count:table=>sql.prepare('SELECT count(*) n FROM '+table).get().n,close:()=>sql.close()};
}
