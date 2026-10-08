// Loopback-only browser acceptance with synthetic AI and disposable in-memory data.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {createListingFixture,OWNER} from '../fixtures/store-listing-catalog.mjs';
import {allowListing} from '../fixtures/store-listing-review.mjs';
const origin='http://127.0.0.1:8834';let f=createListingFixture({existing:true});
const files=['js/modules/store-shop-entry.js','js/modules/store-shop.js','js/modules/store-ai-draft.js','css/store-shop.css','assets/points-logo-transparent-20260916.png'];
createServer(async(req,res)=>{
  const url=new URL(req.url,origin);try{
    if(url.pathname==='/'){
      f.close();f=createListingFixture({existing:true});const mode=url.searchParams.get('mode')||'allow';
      f.state.review=async(body,count)=>{await new Promise(r=>setTimeout(r,2500));if(mode==='error')return new Response('',{status:500});if(mode==='manual'){const content=JSON.parse(body.input[0].content[0].text);return {...allowListing(count),decision:'manual',issues:[{category:'other',field:'name',evidence:content.name,reason:'合成測試：業務性質需人工核對。'}]};}return allowListing(count);};
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>上架 AI 審核｜本機測試</title><body style="margin:0"><p style="margin:0;padding:8px;background:#fff4db">本機合成測試・不連正式資料／AI</p><main id="page-store-shop"></main><output id="test-metrics"></output><script>window.currentPage='store-shop';window.userRole='store';window.currentUserProfile={userId:'${OWNER}'};window.Config={WORKER_URL:location.origin};window.goPage=p=>window.currentPage=p;window.liff={isLoggedIn:()=>true,getAccessToken:()=>'${OWNER}'};</script><script src="/js/modules/store-shop-entry.js"></script><script>openStoreShop('','','','manage');setInterval(async()=>{document.getElementById('test-metrics').textContent=await fetch('/test-metrics').then(r=>r.text())},700);</script></body></html>`);return;
    }
    if(url.pathname==='/test-metrics'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({providerCalls:f.state.providerCalls,stores:f.sql.prepare('SELECT name,description,status,version FROM store_shop_stores').all(),reviewCount:f.count('store_listing_reviews')}));return;}
    if(files.includes(url.pathname.slice(1))){res.setHeader('Content-Type',url.pathname.endsWith('.png')?'image/png':url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL('../../'+url.pathname.slice(1),import.meta.url)));return;}
    if(url.pathname.startsWith('/v1/store-shop')){let body='',size=0;for await(const b of req){size+=b.length;if(size>16000){res.writeHead(413);res.end();return;}body+=b;}const response=await f.request(url.pathname.slice('/v1/store-shop'.length)+url.search,body?JSON.parse(body):undefined,req.headers.authorization?.slice(7));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
    res.writeHead(404);res.end();
  }catch(error){console.error(error.message);res.writeHead(500);res.end('Local fixture failed');}
}).listen(8834,'127.0.0.1',()=>console.log('LOCAL_ONLY listing review: '+origin));
