// Isolated loopback fixture: actual storefront UI and handler, synthetic AI and
// registry only. No production credentials, bindings, or records are accessed.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {handleStoreShop} from '../../worker/store-shop.mjs';
import {createFixture,UID,SOURCE,registryCompany,providerResult} from '../fixtures/store-ai-draft.mjs';
export const description='提供網站設計、APP 行銷與 LINE 群購服務。';
const files=['js/modules/store-shop-entry.js','js/modules/store-shop.js','js/modules/store-ai-draft.js','css/store-shop.css','assets/points-logo-transparent-20260916.png'];
export function startPreview(port=0){
  const fixture=createFixture();
  const fields={name:registryCompany.Company_Name,description,category:'服務',address:registryCompany.Company_Location,phone:'',hours:''};
  const draft=()=>({match:'matched',fields:{...fields},warnings:[],evidence:['name','address','description','category'].map(field=>({field,url:SOURCE,quote:field==='category'?description:fields[field]}))});
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/'){
        fixture.resetQuota();fixture.sql.exec('DELETE FROM store_shop_stores;');fixture.calls.length=0;fixture.metrics.analyses=fixture.metrics.saves=0;
        fixture.setDelay(url.searchParams.get('mode')==='slow'?1000:0);fixture.setStatus(url.searchParams.get('mode')==='provider-error'?503:200);
        fixture.setHtml('<h1>'+fields.name+'</h1><p>'+description+'</p><address>'+fields.address+'</address>');
        const output=draft();if(url.searchParams.get('mode')==='bad-summary')output.fields.description='登記業務摘要：食品什貨批發業、化粧品批發業、資訊軟體批發業。';
        if(url.searchParams.get('mode')==='indexed'){
          const profile='https://www.1111.com.tw/corp/68637932/';
          fixture.setPage(profile,'<title>'+fields.name+'</title><p>背景驗證中，安全驗證完成後繼續，請稍候頁面載入。</p>');output.evidence.forEach(e=>e.url=profile);
          const provider=providerResult(output);provider.output[0].action.sources=[{url:profile,title:fields.name}];fixture.setOutput(provider);
        }else if(url.searchParams.get('mode')==='registry-only'){
          output.fields.description='登記業務摘要：資訊軟體服務業';output.evidence.forEach(e=>e.url='https://findbiz.nat.gov.tw/fts/company/24456660');
          const provider=providerResult(output);provider.output[0].action.sources=[{url:output.evidence[0].url,title:'公司登記'}];fixture.setOutput(provider);
        }else fixture.setOutput(providerResult(output));
        fixture.sql.prepare("INSERT INTO store_shop_stores(id,owner_uid,name,description,category,address,phone,hours,status,updated_at) VALUES('local',?,?,'原有介紹','服務','原有地址','原有電話','原有時間','draft','2026-10-09')").run(UID,fields.name);
        res.setHeader('Content-Type','text/html; charset=utf-8');
        res.end(`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>店家實際營業內容測試</title><body style="margin:0"><p style="background:#fff4db;padding:8px;margin:0">隔離測試：合成 AI／登記資料，不連正式環境</p><main id="page-store-shop"></main><script>window.currentPage='store-shop';window.currentUserProfile={userId:'${UID}'};window.userRole='user';window.Config={WORKER_URL:location.origin};window.goPage=p=>window.currentPage=p;window.liff={isLoggedIn:()=>true,getAccessToken:()=>'${UID}'};</script><script src="/js/modules/store-shop-entry.js"></script><script>openStoreShop('','','','manage');</script></body></html>`);return;
      }
      if(url.pathname==='/test-metrics'){
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({...fixture.metrics,providerSearches:fixture.calls.filter(c=>c.url.includes('openai')).map(c=>Boolean(JSON.parse(c.opts.body).tools)),businessItemLookups:fixture.calls.filter(c=>c.url.includes('236EE382')).length}));return;
      }
      if(url.pathname==='/test-reset-quota'&&req.method==='POST'){
        fixture.resetQuota();res.writeHead(204);res.end();return;
      }
      if(files.includes(url.pathname.slice(1))){res.setHeader('Content-Type',url.pathname.endsWith('.png')?'image/png':url.pathname.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(new URL('../../'+url.pathname.slice(1),import.meta.url)));return;}
      if(url.pathname.startsWith('/v1/store-shop')){
        let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>16384){res.writeHead(413);res.end();return;}body+=chunk;}
        const response=await handleStoreShop(new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,...(body?{body}:{})}),fixture.env(),fixture.fetcher);
        res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
      }
      res.writeHead(404);res.end();
    }catch(error){res.writeHead(500);res.end('Isolated fixture error');console.error(error);}
  });
  server.once('close',fixture.close);
  return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server)));
}
