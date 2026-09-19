// Loopback-only reviewed-source preview. GET only, in-memory DB, no production credentials.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {resolve,sep} from 'node:path';
import {handleStoreShop} from '../../worker/store-shop.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE users(line_id TEXT,role TEXT);');
for(const name of ['0019_point_redemption_partner_directory.sql','0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql'])sql.exec(await readFile(resolve(root,'migrations',name),'utf8'));
sql.exec(await readFile(resolve(root,'.wrangler/partner-import-20260919/import.sql'),'utf8'));
const db={prepare(query){let values=[];return {bind(...args){values=args;return this;},async first(){return sql.prepare(query).get(...values)||null;},async all(){return {results:sql.prepare(query).all(...values)};}};}};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const url=new URL(req.url,'http://127.0.0.1:8773');
  if(url.pathname==='/v1/store-shop'){const result=await handleStoreShop(new Request(url),{ACTMASTER_DB:db});res.writeHead(result.status,{'Content-Type':'application/json'});res.end(await result.text());return;}
  const file=resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root.endsWith(sep)?root:root+sep)||!/^\/(?:js\/modules\/|js\/vendor\/|css\/|assets\/|store-shop\.html$)/.test(url.pathname)){res.writeHead(404);res.end();return;}
  let data=await readFile(file);
  if(file.endsWith('store-shop.html'))data=data.toString().replace('https://line-engine.fangwl591021.workers.dev','http://127.0.0.1:8773');
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.svg')?'image/svg+xml':'image/png');res.end(data);
 }catch{res.writeHead(500);res.end('Preview unavailable');}
});
server.listen(8773,'127.0.0.1',()=>console.log('http://127.0.0.1:8773/store-shop.html'));
