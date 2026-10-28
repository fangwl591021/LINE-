// Disposable SQLite and mocked image/review services only; no production calls.
import {createServer} from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,join,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {createListingFixture,OWNER,SHOP} from '../fixtures/store-listing-catalog.mjs';
import {allowListing} from '../fixtures/store-listing-review.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/[\\/]$/,'');
const output=resolve(root,'../shop-photo-browser');mkdirSync(output,{recursive:true});
let fixture,mode='allow';
function reset(){fixture?.close();fixture=createListingFixture({existing:true});mode='allow';fixture.sql.prepare('UPDATE store_shop_stores SET name=?,image_url=? WHERE id=?').run('測試店家（不是真實商家）','https://example.com/original-shop.jpg',SHOP);fixture.state.review=(body,count)=>mode==='manual'?{...allowListing(count),decision:'manual',issues:[{category:'other',field:'name',evidence:JSON.parse(body.input[0].content[0].text).name,reason:'合成測試：請核對展示介紹後重新送審。'}]}:allowListing(count);}
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>店面圖片儲存合成驗證</title><link rel="stylesheet" href="/css/store-shop.css"><body style="margin:0"><main id="fixture"></main><script>window.currentPage='store-shop';window.userRole='store';window.currentUserProfile={userId:'${OWNER}'};window.Config={WORKER_URL:location.origin};window.liff={isLoggedIn:()=>true,getAccessToken:()=>'${OWNER}',getProfile:async()=>({userId:'${OWNER}'})};window.goPage=p=>window.currentPage=p;window.requestIdleCallback=()=>0;</script><script src="/js/modules/store-shop.js"></script><script>StoreShop.mount(document.querySelector('#fixture'),false,'','','','manage');</script></body></html>`;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 if(url.pathname==='/test/image-review'){assert(['manual','allow'].includes(url.searchParams.get('mode')));mode=url.searchParams.get('mode');res.setHeader('Content-Type','application/json');res.end('{"success":true}');return;}
 if(url.pathname==='/test/image-state'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(fixture.sql.prepare('SELECT id,image_url,version FROM store_shop_stores WHERE id=?').get(SHOP)));return;}
 if(url.pathname==='/test/image-version-conflict'&&req.method==='POST'){fixture.sql.prepare('UPDATE store_shop_stores SET version=version+1 WHERE id=?').run(SHOP);res.setHeader('Content-Type','application/json');res.end('{"success":true}');return;}
 if(url.pathname==='/v1/store-commerce/settings'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,release_enabled:true,settings:{enabled:1,bank_name:'合成銀行',bank_holder:'合成店家',bank_code:'999',bank_account:'1234567890',shipping_fee_cents:0,free_shipping_cents:0}}));return;}
 if(url.pathname.startsWith('/v1/store-shop')){let body='';for await(const chunk of req)body+=chunk;const response=await fixture.request(url.pathname.slice('/v1/store-shop'.length)+url.search,body?JSON.parse(body):undefined,req.headers.authorization?.slice(7)||'');res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;}
 const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+sep)||!/^\/(?:js|css|assets)\//.test(url.pathname)||!existsSync(file)){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',['.js','.mjs'].includes(extname(file))?'text/javascript':file.endsWith('.css')?'text/css':'image/png');res.end(readFileSync(file));
}catch(error){console.error(error.message);res.writeHead(500);res.end('Synthetic image fixture failed');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const width of [320,390,1280]){
  reset();const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.exposeFunction('clickShopImageSave',()=>page.locator('[data-form=store] [data-image-save]').click());
  await page.exposeFunction('captureShopImageStage',async stage=>{assert(['pending','review-failed','public'].includes(stage));if(width===390){if(stage==='public')await page.screenshot({path:join(output,'public-store-'+width+'.png'),fullPage:true});else await page.locator('[data-form=store] .shop-image-field').screenshot({path:join(output,stage+'-'+width+'.png')});}});
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin===origin||url.protocol==='data:'||url.protocol==='blob:')return route.continue();if(url.hostname==='example.com')return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')});errors.push('Unexpected external request');return route.abort();});
  await page.goto(origin);await page.locator('[data-form=store]').waitFor();
  await page.addScriptTag({content:readFileSync(join(root,'test/browser/store-shop-images.js'),'utf8')});
  const result=await page.evaluate(()=>testStoreShopImages());assert.deepEqual(errors,[]);
  assert.equal(fixture.sql.prepare('SELECT image_url FROM store_shop_stores WHERE id=?').get(SHOP).image_url,'https://example.com/draft-shop.jpg');
  await page.screenshot({path:join(output,'draft-management-'+width+'.png'),fullPage:true});results.push(result);await page.close();
 }
 writeFileSync(join(output,'result.json'),JSON.stringify({pass:true,results,productionWrites:0,realExternalRequests:0},null,2));
 console.log(JSON.stringify({pass:true,results,productionWrites:0,realExternalRequests:0}));
}finally{fixture?.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
