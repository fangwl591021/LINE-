// Loopback-only synthetic UI test; no external credentials, requests or business data.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {handleStoreShop} from '../../worker/store-shop.mjs';
import {createFixture,UID,sampleDraft,providerResult} from '../fixtures/store-ai-draft.mjs';
const fixture=createFixture(),origin='http://127.0.0.1:8831';
const files=['js/modules/store-shop-entry.js','js/modules/store-shop.js','js/modules/store-ai-draft.js','css/store-shop.css','assets/points-logo-transparent-20260916.png'];
createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  try{
    if(url.pathname==='/responsive'){
      const width=['320','390'].includes(url.searchParams.get('width'))?url.searchParams.get('width'):'390';
      const query=url.searchParams.has('existing')?'?existing=1':'';
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><meta charset="utf-8"><title>${width}px 店面草稿測試</title><body style="margin:0;background:#e8efec"><p style="margin:0;padding:8px">${width}px 手機版面・合成資料</p><iframe title="手機店面" src="/${query}" style="width:${width}px;height:900px;border:0;display:block"></iframe></body>`);return;
    }
    if(url.pathname==='/'){
      fixture.resetQuota();fixture.sql.exec('DELETE FROM store_shop_products;DELETE FROM store_shop_stores;');fixture.metrics.analyses=fixture.metrics.saves=0;
      fixture.setDelay(url.searchParams.get('mode')==='slow'?3500:0);fixture.setStatus(url.searchParams.get('mode')==='error'?500:200);
      const draft=sampleDraft();if(url.searchParams.get('mode')==='ambiguous')draft.match='ambiguous';fixture.setOutput(providerResult(draft));
      if(url.searchParams.has('existing'))fixture.sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,description,category,address,phone,hours,status,updated_at) VALUES('local',?,'測試咖啡公司','原有介紹','服務','原有地址','原有電話','原有時間','draft','2026-10-07')").run(UID);
      res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>本機 AI 店面草稿測試</title><body style="margin:0"><p style="background:#fff4db;padding:8px;margin:0">合成資料測試，不連接正式環境</p><main id="page-store-shop"></main><output id="test-metrics"></output><script>window.currentPage='store-shop';window.currentUserProfile={userId:'${UID}'};window.userRole='user';window.Config={WORKER_URL:location.origin};window.goPage=p=>window.currentPage=p;window.liff={isLoggedIn:()=>true,getAccessToken:()=>'${UID}'};</script><script src="/js/modules/store-shop-entry.js"></script><script>openStoreShop('','','','manage');setInterval(async()=>{const r=await fetch('/test-metrics');document.getElementById('test-metrics').textContent=JSON.stringify(await r.json())},500);</script></body></html>`);return;
    }
    if(url.pathname==='/test-metrics'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixture.metrics));return;}
    if(files.includes(url.pathname.slice(1))){res.setHeader('Content-Type',url.pathname.endsWith('.png')?'image/png':url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL('../../'+url.pathname.slice(1),import.meta.url)));return;}
    if(url.pathname.startsWith('/v1/store-shop')){
      let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16000){res.writeHead(413);res.end();return;}body+=chunk;}
      const response=await handleStoreShop(new Request(url,{method:req.method,headers:req.headers,...(body?{body}:{})}),fixture.env(),fixture.fetcher);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    res.writeHead(404);res.end();
  }catch(error){console.error(error);res.writeHead(500);res.end('Local fixture failed');}
}).listen(8831,'127.0.0.1',()=>console.log('Local-only AI draft: '+origin));
