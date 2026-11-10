// Loopback-only acceptance; disposable catalog and synthetic AI, no real accounts.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createListingFixture,ADMIN,SHOP,PRODUCT} from '../fixtures/store-listing-catalog.mjs';
import {allowListing} from '../fixtures/store-listing-review.mjs';
const f=createListingFixture({existing:true}),origin='http://127.0.0.1:8839';
const since=new Date(Date.now()-60000).toISOString();
f.sql.prepare("UPDATE store_shop_stores SET updated_at=?,status='draft'").run(since);
f.sql.prepare("UPDATE store_shop_products SET title='可通過咖啡豆',status='draft',updated_at=?").run(since);
for(const [id,title,description] of [
  ['33333333-1111-4111-8111-111111111111','合成疑義商品','合成待核對用途'],
  ['44444444-1111-4111-8111-111111111111','合成退回商品','合成禁止宣稱']
]) f.sql.prepare("INSERT INTO store_shop_products(id,shop_id,title,description,price_cents,status,updated_at,request_key) VALUES(?,?,?,?,10000,'draft',?,?)").run(id,SHOP,title,description,since,id);
f.state.review=(body,count)=>{
  const c=JSON.parse(body.input[0].content[0].text),decision=c.description.includes('待核對')?'manual':c.description.includes('禁止宣稱')?'reject':'allow';
  return decision==='allow'?allowListing(count):{...allowListing(count),decision,issues:[{category:'other',field:'description',evidence:c.description,reason:decision==='manual'?'合成用途資料尚待核對。':'合成內容不符合上架政策。'}]};
};
createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,origin);
    if(u.pathname==='/'){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>商城審核回饋｜合成驗證</title><style>body{margin:0;background:#f8fafb;font:16px Arial}aside{padding:8px;background:#fff4db}</style><aside>本機合成驗證；不連正式會員、商品或 AI</aside><main id="catalog"></main><script type="module">import{mountAdminCatalog,mountAdminDrafts}from'/js/modules/store-admin-catalog.js';const root=document.getElementById('catalog');const api=async(path,data)=>{const r=await fetch('/v1/store-shop'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer ${ADMIN}','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const v=await r.json();if(!r.ok||!v.success){const e=new Error(v.error);Object.assign(e,{code:v.code,status:r.status,review:v.review});throw e;}return v;};const catalog=()=>mountAdminCatalog(root,{shopId:'${SHOP}',api,isCurrent:()=>true,onBack:drafts,onUploadProducts:()=>{}});const drafts=()=>mountAdminDrafts(root,{api,isCurrent:()=>true,onBack:catalog,onManageCatalog:catalog});catalog();</script></html>`);return;
    }
    if(/^\/(js\/modules\/[A-Za-z0-9_.-]+\.(?:js|mjs)|css\/[A-Za-z0-9_.-]+\.css)$/.test(u.pathname)){
      res.setHeader('Content-Type',u.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL('../../'+u.pathname.slice(1),import.meta.url)));return;
    }
    if(u.pathname==='/metrics'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({products:f.sql.prepare('SELECT id,title,status,version FROM store_shop_products').all(),audit:f.count('store_catalog_admin_audit'),providerCalls:f.state.providerCalls}));return;}
    if(u.pathname.startsWith('/v1/store-shop')){
      let text='';for await(const b of req){text+=b;if(text.length>16000)throw Error('Too large');}if(text)f.resetUsage();
      const r=await f.request(u.pathname.slice('/v1/store-shop'.length)+u.search,text?JSON.parse(text):undefined,ADMIN);
      res.writeHead(r.status,Object.fromEntries(r.headers));res.end(await r.text());return;
    }
    res.writeHead(404);res.end();
  }catch(e){console.error(e.message);res.writeHead(500);res.end('Synthetic fixture failure');}
}).listen(8839,'127.0.0.1',()=>console.log('LOCAL_ONLY '+origin+' product '+PRODUCT));
