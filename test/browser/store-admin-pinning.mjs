// Real admin renderer/CSS, synthetic API only. No request may reach a live service.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
let playwright;try{playwright=require('playwright');}catch{playwright=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');}
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),OUT=resolve(ROOT,'../store-admin-pinning-browser');
mkdirSync(OUT,{recursive:true});
const ORIGIN='https://admin-pinning.invalid',UID='U'+'a'.repeat(32),TOKEN='synthetic-admin-pinning-token';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id=n=>String(n).padStart(8,'0')+'-1111-4111-8111-111111111111';
const clone=value=>JSON.parse(JSON.stringify(value));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const shops=()=>[
  {id:id(1),name:'合成一般店家',status:'active',pinned:false,pin_version:3,pin_source:'shop',public_visible:true,owner_uid:UID,owner_role:'store'},
  {id:id(2),name:'合成已置頂草稿店家',status:'draft',pinned:true,pin_version:8,pin_source:'shop',public_visible:false,owner_uid:UID,owner_role:'redeem'},
  {id:id(3),name:'合成未綁帳號合作店家',status:'draft',pinned:false,pin_version:0,pin_source:'partner',listing_only:1,public_visible:false}
].map((row,index)=>({...row,owner_name:'合成負責人 '+index,category:'食',address:'合成地址',phone:'02-00000000',product_count:3,active_product_count:1,online_product_count:1}));
function report(rows=shops(),flag){if(arguments.length<2)flag=true;return {success:true,shops:clone(rows),summary:{total:rows.length,active:rows.filter(row=>row.status==='active').length,draft:rows.filter(row=>row.status==='draft').length},filtered_total:rows.length,next:'',...(flag===undefined?{}:{pinning_enabled:flag})};}
const row=(page,shopId=id(1))=>page.locator('article[data-admin-shop-id="'+shopId+'"]');
const input=(page,shopId=id(1))=>row(page,shopId).locator('input[data-admin-pin]');
const pinStatus=(page,shopId=id(1))=>row(page,shopId).locator('[data-admin-pin-status]');
const retry=(page,shopId=id(1))=>row(page,shopId).locator('[data-admin-action="pin-retry"]');
const files=new Map(['js/modules/store-admin.js','css/store-admin.css','css/store-shop.css'].map(path=>['/'+path,readFileSync(join(ROOT,path))]));
async function until(test,label){for(let n=0;n<500;n++){if(await test())return;await pause(10);}assert.fail('Timed out: '+label);}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}

async function fixture(browser,{width=390,rows=shops(),flag=true}={}){
  const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage();
  page.setDefaultTimeout(6000);
  const state={report:report(rows,flag),calls:[],pins:[],plans:[],pending:[],blocked:[],errors:[],consoleErrors:[],navigations:[],unknown:[]};
  page.on('pageerror',error=>state.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')state.consoleErrors.push(message.text());});
  page.on('dialog',dialog=>{state.errors.push('Unexpected dialog '+dialog.message());return dialog.dismiss();});
  const resultFor=(data,plan)=>{
    if(plan.kind==='network')return {ok:false,error:{message:'合成網路中斷'}};
    if(plan.kind==='http')return {ok:false,error:{message:plan.message||'合成儲存失敗',status:plan.status,code:plan.code||'SYNTHETIC_FAILURE'}};
    const response={success:true,id:data.id,source:data.source,pinned:data.pinned,pin_version:data.version+1,replayed:plan.replayed===true,...plan.response};
    if(plan.kind!=='malformed'){
      const stored=state.report.shops.find(row=>row.id===data.id&&row.pin_source===data.source);
      if(stored){stored.pinned=response.pinned;stored.pin_version=response.pin_version;}
    }
    return {ok:true,value:response};
  };
  await page.exposeFunction('__pinningApi',async(path,data,silent)=>{
    const call={path,data:clone(data),silent};state.calls.push(call);
    if(path.startsWith('/admin/stores')&&data===null){return {ok:true,value:clone(state.report)};}
    if(path==='/admin/stores/pin'&&data&&typeof data==='object'){
      state.pins.push(call);
      const plan=state.plans.shift()||{};
      if(plan.hold)await new Promise(resolve=>state.pending.push({release:resolve,data:clone(data)}));
      return resultFor(data,plan);
    }
    state.unknown.push(call);return {ok:false,error:{status:403,message:'Blocked unknown synthetic API'}};
  });
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==ORIGIN||request.method()!=='GET'){state.blocked.push({url:request.url(),method:request.method()});return route.abort();}
    if(url.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成置頂測試</title><link rel="stylesheet" href="/css/store-shop.css"><style>body{margin:0;background:#fffaf1;font:16px Arial}#fixture{padding:12px;box-sizing:border-box}</style><main id="fixture"></main><script type="module">
import{mountStoreAdmin}from'/js/modules/store-admin.js';
window.__actor={uid:${JSON.stringify(UID)},role:'admin',token:${JSON.stringify(TOKEN)},active:true};window.__injected=false;
window.__mount=async()=>{const snapshot={...window.__actor};const isCurrent=()=>!!window.__actor.active&&!!window.__actor.token&&snapshot.uid===window.__actor.uid&&snapshot.role===window.__actor.role&&snapshot.token===window.__actor.token;
const api=async(path,data=null,silent)=>{const response=await window.__pinningApi(path,data,silent);if(!response.ok)throw Object.assign(new Error(response.error.message),response.error);return response.value;};
await mountStoreAdmin(document.getElementById('fixture'),{api,isCurrent,onView:()=>{},onBack:()=>{window.__actor.active=false;document.getElementById('fixture').textContent='合成已離開';},onManagePartners:()=>{},onManageCatalog:()=>{},onUploadProducts:()=>{}});};await window.__mount();window.__ready=true;
</script></html>`});
    if(files.has(url.pathname))return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8',body:files.get(url.pathname)});
    state.blocked.push({url:request.url(),method:request.method()});return route.abort();
  });
  await page.goto(ORIGIN,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__ready===true);
  await page.waitForFunction(()=>!!document.getElementById('store-admin-styles')?.sheet);
  return {page,context,state,remount:async next=>{if(next)state.report=next;await page.evaluate(()=>window.__mount());await settle(page);},close:async()=>{for(const pending of state.pending.splice(0))pending.release();await context.close();}};
}
async function clean(f){assert.deepEqual(f.state.errors,[]);assert.deepEqual(f.state.consoleErrors,[]);assert.deepEqual(f.state.blocked,[]);assert.deepEqual(f.state.unknown,[]);}
function assertPayload(call,expected){
  assert.equal(call.path,'/admin/stores/pin');assert.equal(call.silent,true);
  assert.deepEqual(Object.keys(call.data).sort(),['source','id','pinned','version','request_key'].sort());
  assert.match(call.data.request_key,uuid);assert.deepEqual({...call.data,request_key:undefined},{...expected,request_key:undefined});
}
async function done(f,shopId=id(1)){await f.page.waitForFunction(shopId=>{const box=document.querySelector('article[data-admin-shop-id="'+shopId+'"] input[data-admin-pin]');return box&&!box.disabled;},shopId);await settle(f.page);}
async function holdReached(f){await until(()=>f.state.pending.length>0,'pin request held');}
async function release(f){const pending=f.state.pending.shift();assert.ok(pending);pending.release();await settle(f.page);}
async function errorReady(f,shopId=id(1)){await pinStatus(f.page,shopId).filter({hasText:/./}).waitFor();await f.page.waitForFunction(shopId=>{const box=document.querySelector('article[data-admin-shop-id="'+shopId+'"] input[data-admin-pin]');return box?.disabled&&box.checked===false;},shopId);await settle(f.page);assert.equal(await pinStatus(f.page,shopId).getAttribute('role'),'status');}
async function layout(f,width){
  await settle(f.page);
  const measured=await f.page.evaluate(()=>{
    const visible=node=>node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
    const bounds=node=>{const r=node.getBoundingClientRect();return {w:r.width,h:r.height};};
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,mainText:[...document.querySelectorAll('.store-admin-main')].filter(visible).map(node=>{const card=node.parentElement,style=getComputedStyle(card);return {...bounds(node),available:card.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)};}),labels:[...document.querySelectorAll('label.store-admin-pin-label')].filter(visible).map(bounds),retry:[...document.querySelectorAll('[data-admin-action="pin-retry"]')].filter(visible).map(bounds)};
  });
  await f.page.screenshot({path:join(OUT,'admin-pinning-'+width+'.png'),fullPage:true});
  assert.equal(measured.overflow,false,width+' no horizontal overflow');
  for(const text of measured.mainText)assert.ok(text.w>=Math.min(180,width-60),width+' main text keeps readable width instead of a one-character vertical column: '+JSON.stringify(text));
  if(width<=520)for(const text of measured.mainText)assert.ok(text.w>=text.available*.8,width+' mobile main text occupies its own readable row: '+JSON.stringify(text));
  assert.ok(measured.labels.length>0);for(const target of [...measured.labels,...measured.retry])assert.ok(target.w>=43.5&&target.h>=43.5,width+' label/retry retains 44px hit area: '+JSON.stringify(target));
  return measured;
}

const browser=await playwright.chromium.launch({headless:true,channel:'chrome'}),results=[];
async function scenario(name,work){try{await work();results.push({name,passed:true});console.log('PASS '+name);}catch(error){results.push({name,passed:false,error:error.stack});throw error;}}
try{
  await scenario('strict feature flag and row validation; text remains literal',async()=>{
    const f=await fixture(browser);try{
      for(const flag of [undefined,false,0,1,'true',null]){await f.remount(report(shops(),flag));assert.equal(await f.page.locator('input[data-admin-pin]').count(),0,'non-true flag '+flag);}
      const invalid=[{id:'not-a-uuid'},{pinned:'false'},{pinned:1},{pinned:null},{pinned:undefined},{pin_version:-1},{pin_version:1.5},{pin_version:'3'},{pin_version:null},{pin_version:undefined},{pin_source:'other'},{pin_source:'SHOP'},{pin_source:undefined}].map((patch,index)=>({...shops()[0],id:id(index+20),name:'非法 DTO '+index,...patch}));
      const injection='<img src="x" onerror="window.__injected=true"><script>window.__injected=true</script>';
      const valid=shops();valid[0].name=injection;valid[0].owner_name=injection;valid[0].address=injection;
      await f.remount(report([...valid,...invalid]));assert.equal(await f.page.locator('input[data-admin-pin]').count(),3);
      assert.equal(await row(f.page).locator('h3').textContent(),injection);assert.equal(await row(f.page).locator('img,script').count(),0);assert.equal(await f.page.evaluate(()=>window.__injected),false);
      assert.equal(await input(f.page,id(2)).isChecked(),true);assert.equal(await input(f.page,id(3)).count(),1);await clean(f);
    }finally{await f.close();}
  });
  await scenario('shop check/uncheck and draft partner save affect only that row',async()=>{
    const f=await fixture(browser);try{
      await f.page.evaluate(shopId=>window.__unchangedRow=document.querySelector('article[data-admin-shop-id="'+shopId+'"]'),id(2));
      const originalBadge=await row(f.page).locator('.store-admin-badge').allTextContents();
      await input(f.page).click();await done(f);assert.equal(await input(f.page).isChecked(),true);assertPayload(f.state.pins[0],{source:'shop',id:id(1),pinned:true,version:3});
      assert.equal(await f.page.evaluate(shopId=>window.__unchangedRow===document.querySelector('article[data-admin-shop-id="'+shopId+'"]'),id(2)),true,'sibling row not replaced');
      assert.equal(await input(f.page,id(2)).isChecked(),true);assert.deepEqual(await row(f.page).locator('.store-admin-badge').allTextContents(),originalBadge);
      await input(f.page).uncheck();await done(f);assertPayload(f.state.pins[1],{source:'shop',id:id(1),pinned:false,version:4});assert.notEqual(f.state.pins[0].data.request_key,f.state.pins[1].data.request_key);
      await input(f.page,id(3)).check();await done(f,id(3));assertPayload(f.state.pins[2],{source:'partner',id:id(3),pinned:true,version:0});assert.match(await row(f.page,id(3)).innerText(),/草稿/);assert.equal(f.state.report.shops.find(s=>s.id===id(3)).status,'draft');assert.equal(f.state.pins.length,3);await clean(f);
    }finally{await f.close();}
  });
  await scenario('busy row ignores a second toggle',async()=>{
    const f=await fixture(browser);try{f.state.plans.push({hold:true});await input(f.page).click();await holdReached(f);assert.equal(await input(f.page).isDisabled(),true);
      await input(f.page).evaluate(box=>{box.checked=false;box.dispatchEvent(new Event('change',{bubbles:true}));});await pause(30);assert.equal(f.state.pins.length,1);await release(f);await done(f);assert.equal(await input(f.page).isChecked(),true);await clean(f);
    }finally{await f.close();}
  });
  for(const failure of [{name:'network',kind:'network'},{name:'503',kind:'http',status:503},{name:'malformed-id',kind:'malformed',response:{id:id(90)}},{name:'malformed-source',kind:'malformed',response:{source:'partner'}},{name:'malformed-pinned',kind:'malformed',response:{pinned:false}},{name:'malformed-version',kind:'malformed',response:{pin_version:3}},{name:'malformed-version-type',kind:'malformed',response:{pin_version:'4'}}]){
    await scenario(failure.name+' reverts and retries the identical request',async()=>{
      const f=await fixture(browser);try{f.state.plans.push(failure);await input(f.page).click();await errorReady(f);assert.equal(await retry(f.page).isVisible(),true);assert.equal(await retry(f.page).textContent(),'重試置頂儲存');
        const first=clone(f.state.pins[0].data);f.state.plans.push({hold:true,replayed:true});await retry(f.page).click();await holdReached(f);assert.equal(await retry(f.page).isDisabled(),true);
        await retry(f.page).evaluate(button=>{button.click();button.click();});await pause(20);assert.equal(f.state.pins.length,2);assert.deepEqual(f.state.pins[1].data,first);await release(f);await done(f);assert.equal(await input(f.page).isChecked(),true);assert.equal(await retry(f.page).isVisible(),false);
        await input(f.page).uncheck();await done(f);assert.equal(f.state.pins[2].data.version,4);assert.notEqual(f.state.pins[2].data.request_key,first.request_key);await clean(f);
      }finally{await f.close();}
    });
  }
  for(const transition of [{kind:'network',status:401},{kind:'http',initialStatus:503,status:403}]){
    await scenario('unknown '+(transition.initialStatus||transition.kind)+' then '+transition.status+' preserves uncertainty',async()=>{
      const f=await fixture(browser);try{
        f.state.plans.push({kind:transition.kind,status:transition.initialStatus});await input(f.page).click();await errorReady(f);assert.equal(await retry(f.page).isVisible(),true);
        const first=clone(f.state.pins[0].data);f.state.plans.push({kind:'http',status:transition.status});await retry(f.page).click();
        await pinStatus(f.page).filter({hasText:'前次結果仍未確認，請重新整理後確認'}).waitFor();
        assert.equal(f.state.pins.length,2);assert.deepEqual(f.state.pins[1].data,first,'known error retry retains the unresolved request payload and key');
        assert.doesNotMatch(await pinStatus(f.page).textContent(),/置頂未儲存/);assert.equal(await input(f.page).isChecked(),false);assert.equal(await input(f.page).isDisabled(),true);assert.equal(await retry(f.page).isVisible(),false);
        await f.page.locator('[data-admin-action="refresh"]').click();await done(f);assert.equal(await input(f.page).isChecked(),false);assert.doesNotMatch(await pinStatus(f.page).textContent(),/前次結果仍未確認/);await clean(f);
      }finally{await f.close();}
    });
  }
  for(const status of [400,401,403,404,409,422,429]){
    await scenario(status+' locks row until refresh without retry',async()=>{
      const f=await fixture(browser);try{f.state.plans.push({kind:'http',status,message:'<img src=x onerror="window.__injected=true">'});await input(f.page).click();await errorReady(f);assert.equal(await retry(f.page).isVisible(),false);assert.match(await pinStatus(f.page).textContent(),/重新整理/);assert.equal(await pinStatus(f.page).locator('img').count(),0);
        await f.page.locator('[data-admin-action="refresh"]').click();await done(f);assert.equal(await input(f.page).isChecked(),false);assert.equal(f.state.pins.length,1);await clean(f);
      }finally{await f.close();}
    });
  }
  for(const move of ['query','page']){
    await scenario('late pin response after '+move+' cannot overwrite refreshed row',async()=>{
      const f=await fixture(browser);try{
        if(move==='page'){f.state.report.next=id(90);await f.remount();}
        f.state.plans.push({hold:true});await input(f.page).click();await holdReached(f);
        const replacement=shops();replacement[0].pin_version=77;replacement[0].name='合成新列表資料';f.state.report=report(replacement);
        if(move==='query'){await f.page.locator('input[name="q"]').fill('新查詢');await f.page.locator('[data-admin-form]').evaluate(form=>form.requestSubmit());}
        else await f.page.locator('[data-admin-action="next"]').click();
        await row(f.page).locator('h3').filter({hasText:'合成新列表資料'}).waitFor();await release(f);assert.equal(await input(f.page).isChecked(),false);assert.equal(await input(f.page).isDisabled(),false);
        await input(f.page).click();await done(f);assert.equal(f.state.pins[1].data.version,77,'new row retains new version');await clean(f);
      }finally{await f.close();}
    });
  }
  for(const change of ['uid','role','token','token-false','leave','back']){
    await scenario('late pin response ignored after '+change,async()=>{
      const f=await fixture(browser);try{f.state.plans.push({hold:true});await input(f.page).click();await holdReached(f);
        if(change==='back')await f.page.locator('[data-admin-action="back"]').click();
        else await f.page.evaluate(change=>{if(change==='uid')window.__actor.uid='U'+'b'.repeat(32);if(change==='role')window.__actor.role='user';if(change==='token')window.__actor.token='different-synthetic-token';if(change==='token-false')window.__actor.token=false;if(change==='leave')window.__actor.active=false;},change);
        const before=await f.page.locator('#fixture').innerHTML();await release(f);await pause(30);assert.equal(await f.page.locator('#fixture').innerHTML(),before,'stale response does not rewrite any retained DOM');await clean(f);
      }finally{await f.close();}
    });
  }
  for(const width of [320,390,1280]){
    await scenario('pin controls layout '+width,async()=>{
      const f=await fixture(browser,{width});try{f.state.plans.push({kind:'http',status:503});await input(f.page).click();await errorReady(f);assert.equal(await retry(f.page).isVisible(),true);await layout(f,width);await clean(f);}finally{await f.close();}
    });
  }
  await scenario('public name sort puts pinned true first and preserves legacy name sort',async()=>{
    const hadFixtureOnly=process.argv.includes('--fixture-only');if(!hadFixtureOnly)process.argv.push('--fixture-only');
    let createFixture;try{({createFixture}=await import('./shop-reference-layout.mjs'));}finally{if(!hadFixtureOnly)process.argv.splice(process.argv.lastIndexOf('--fixture-only'),1);}
    const f=await createFixture(browser,{role:'user',width:390});try{
      await f.page.locator('.shop-explore-card-name').first().waitFor();
      let publicRows=[{name:'Zulu',pinned:true},{name:'Alpha',pinned:false},{name:'Delta',pinned:false},{name:'Beta',pinned:true}].map((item,index)=>({id:id(index+50),category:'食',description:'合成公開店家',address:'合成地址',image_url:'https://shop-reference.invalid/assets/storefront/lifestyle-cafe-v1.jpg',status:'active',version:1,merchant_enabled:1,has_active_products:1,...item}));
      await f.context.route('https://shop-reference.invalid/v1/store-shop**',route=>{
        const request=route.request(),url=new URL(request.url());if(request.method()==='GET'&&url.pathname==='/v1/store-shop'&&!url.searchParams.has('shop'))return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,shops:publicRows,next:''})});return route.fallback();
      });
      const refresh=async()=>{await f.page.locator('form[data-form="search"]').evaluate(form=>form.requestSubmit());await f.page.waitForFunction(()=>document.querySelectorAll('.shop-explore-card-name').length===4);await f.page.locator('[data-explore-sort]').selectOption('name');await settle(f.page);};
      await refresh();assert.deepEqual(await f.page.locator('.shop-explore-card-name').allTextContents(),['Beta','Zulu','Alpha','Delta']);
      publicRows=publicRows.map(({pinned,...rest})=>rest);await refresh();assert.deepEqual(await f.page.locator('.shop-explore-card-name').allTextContents(),['Alpha','Beta','Delta','Zulu']);assert.deepEqual(f.state.errors,[]);assert.deepEqual(f.state.blocked,[]);assert.deepEqual(f.state.writes,[]);
    }finally{await f.close();}
  });
  console.log(JSON.stringify({passed:true,scenarios:results.length,productionRequests:0,results,output:OUT},null,2));
}finally{
  writeFileSync(join(OUT,'results.json'),JSON.stringify({results,passed:results.every(result=>result.passed)},null,2));await browser.close();
}
