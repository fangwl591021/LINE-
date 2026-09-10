// Local-only synthetic data. Never connects to production or external services.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreCommerce} from '../../worker/store-commerce.mjs';
import {handleStoreShop} from '../../worker/store-shop.mjs';
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON; CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT,name TEXT);');
for(const [token,role,name] of [['a','store','測試店家'],['b','user','測試購買者'],['c','admin','其他店家']])sql.prepare('INSERT INTO users VALUES(?,?,?)').run('U'+token.repeat(32),role,name);
for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0034_store_commerce.sql'])sql.exec(readFileSync(new URL('../../migrations/'+file,import.meta.url),'utf8'));
sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,status,updated_at) VALUES('shop-a',?,'測試商城','active','2026-09-10')").run('U'+'a'.repeat(32));
sql.exec("INSERT INTO store_shop_products(id,shop_id,title,price_cents,status,updated_at,request_key) VALUES('p-a','shop-a','<img src=x onerror=alert(1)> 測試眼鏡',880000,'active','2026-09-10','product-a');");
sql.exec("INSERT INTO store_commerce_settings(shop_id,enabled,bank_name,bank_code,bank_account,bank_holder,shipping_fee_cents,free_shipping_cents,updated_at) VALUES('shop-a',1,'測試銀行','004','1234567890','測試戶名',6000,1000000,'2026-09-10');");
const db={prepare(query){return {bind(...args){return {
  sync(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};},async run(){return this.sync();},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};}
};}};},async batch(items){sql.exec('BEGIN');try{const results=items.map(s=>s.sync());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const fetcher=async(url,opts)=>{if(url!=='https://api.line.me/v2/profile')throw Error('External call forbidden');const token=opts.headers.Authorization.slice(7);return ['a','b','c'].includes(token)?Response.json({userId:'U'+token.repeat(32)}):new Response('',{status:401});};
const env={ACTMASTER_DB:db,STORE_COMMERCE_ENABLED:'true'};
const files=['css/store-shop.css','js/modules/store-shop-entry.js','js/modules/store-shop.js','js/modules/store-commerce.js'];
const server=createServer(async(req,res)=>{
  const origin='http://127.0.0.1:8794',path=new URL(req.url,origin).pathname;
  try {
    if(path==='/'){
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本機商城測試</title><body style="margin:0"><main id="page-store-shop"></main><script>window.testToken='b';window.currentPage='store-shop';window.Config={WORKER_URL:location.origin};window.goPage=p=>window.currentPage=p;window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken,getProfile:async()=>({userId:'U'+window.testToken.repeat(32)})};</script><script src="/js/modules/store-shop-entry.js"></script><script>openStoreShop();</script></body></html>`);return;
    }
    if(files.includes(path.slice(1))){res.setHeader('Content-Type',path.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL('../../'+path.slice(1),import.meta.url)));return;}
    if(path.startsWith('/v1/')){
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>30000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const body=chunks.length?Buffer.concat(chunks):undefined;
      const request=new Request(origin+req.url,{method:req.method,headers:req.headers,body});
      const response=await handleStoreCommerce(request,env,fetcher)||await handleStoreShop(request,env,fetcher);
      if(response){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
    }
    res.writeHead(404);res.end();
  }catch(e){console.error(e);res.writeHead(500);res.end('Local test failed');}
});
server.listen(8794,'127.0.0.1',()=>console.log('Synthetic commerce test: http://127.0.0.1:8794'));
