// Actual catalog UI, isolated mocked API only. No production identities or writes.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);let playwright;
try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const out=join(tmpdir(),'store-single-release-qa-20261019');mkdirSync(out,{recursive:true});
const browser=await playwright.chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 for(const width of [320,390,1440]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[],writes=[],dialogs=[];let lost=true,capability=true;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());return d.accept();});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());assert.equal(url.hostname,'localhost');
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><main id="catalog"></main></html>'});
   if(url.pathname.startsWith('/js/modules/')||url.pathname.startsWith('/css/'))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:readFileSync(new URL('../../'+url.pathname.slice(1),import.meta.url),'utf8')});
   throw Error('Unknown fixture route '+url.pathname);
  });
  await page.goto('http://localhost/');
  await page.exposeFunction('fixtureApi',async(_path,data)=>{
   if(data){writes.push(data);if(lost){lost=false;throw Error('synthetic response lost');}return {success:true,id:'product-test',version:2};}
   return {success:true,shop:{id:'shop-test',name:'合成測試店',version:6,status:'active'},online_product_allowed:true,summary:{total:1,draft:0},products:[{id:'product-test',shop_id:'shop-test',title:'光動能按摩機',description:'',category:'購',image_url:'',price_cents:1180000,redeem_type:'percent',redeem_value:50,status:'active',purchase_mode:'in_store',version:1,...(capability?{manual_online_release:{reference:'massage-online-20261019'}}:{})}]};
  });
  const mount=()=>page.evaluate(async()=>{const {mountAdminCatalog}=await import('/js/modules/store-admin-catalog.js');await mountAdminCatalog(document.getElementById('catalog'),{shopId:'shop-test',api:window.fixtureApi,isCurrent:()=>true,onBack(){},onUploadProducts(){}});});
  await mount();await page.getByRole('button',{name:'編輯／上下架'}).click();
  await page.locator('[name=purchase_mode]').selectOption('online');await page.locator('[name=manual_release_confirm]').check();
  await page.locator('[name=title]').fill('不應變更的商品');await page.getByRole('button',{name:'確認人工放行網購',exact:true}).click();
  await page.getByRole('status').filter({hasText:'請還原其他欄位修改'}).waitFor();assert.equal(writes.length,0);
  await page.locator('[name=title]').fill('光動能按摩機');
  await page.screenshot({path:join(out,`approval-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'確認人工放行網購',exact:true}).click();await page.getByRole('button',{name:'重新確認同一筆儲存'}).waitFor();
  assert.equal(await page.locator('[name=manual_release_confirm]').isEnabled(),false);
  await page.getByRole('button',{name:'重新確認同一筆儲存'}).click();await page.getByRole('status').filter({hasText:'已儲存'}).waitFor();
  assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.deepEqual(writes[0].changes,{purchase_mode:'online'});assert.deepEqual(writes[0].manual_release,{reference:'massage-online-20261019',confirmed:true});
  assert.equal('redeem_type'in writes[0].changes,false);assert.equal('price_cents'in writes[0].changes,false);
  capability=false;await mount();await page.getByRole('button',{name:'編輯／上下架'}).click();assert.equal(await page.locator('[name=manual_release_confirm]').count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);
  results.push({width,consentRequired:true,explicitNamedSubmit:true,noNativeDialog:true,additionalEditsBlocked:true,retrySamePayload:true,noCapabilityNoCheckbox:true,noOverflow:true,productionWrites:0});await page.close();
 }
 writeFileSync(join(out,'result.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({results,output:out}));
}finally{await browser.close();}
