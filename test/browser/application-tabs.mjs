import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const root=resolve('.'),out=resolve('../application-tabs-qa');mkdirSync(out,{recursive:true});
const html=`<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><button id="open">open</button><script type="module">
import {openRewardApplications} from '/js/modules/reward-applications.js';
window.token='synthetic';window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.token};window.requests=[];
window.fetcher=(url,options)=>new Promise(resolve=>{window.requests.push({url,method:options.method});window.finish=(ok=true)=>resolve(Response.json(ok?{success:true,applications:url.includes('/reward-applications')?Array.from({length:15},(_,i)=>({id:'synthetic-'+i,unit_name:'合成單位 '+i,applicant_name:'合成申請人',status:'pending',signed_at:'2026-11-06T01:00:00Z'})):[],next:null}:{success:false,error:'合成測試連線失敗'},{status:ok?200:503}));});
document.querySelector('#open').onclick=()=>openRewardApplications({base:location.origin,admin:new URLSearchParams(location.search).has('admin'),target:new URLSearchParams(location.search).has('admin')?'U'+'a'.repeat(32):'',fetcher:window.fetcher});
</script>`;
const server=createServer((req,res)=>{const path=new URL(req.url,'http://localhost').pathname;if(path==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html);return;}const f=resolve(root,'.'+path);if(!f.startsWith(root)||!['.js','.mjs','.css'].includes(extname(f))){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(process.env.TABS_BASELINE&&path==='/js/modules/reward-applications.js'?process.env.TABS_BASELINE:f));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const width of [320,390,1280])for(const admin of [false,true]){
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+(admin?'/?admin':'/'));await page.click('#open');
 await page.waitForFunction(()=>typeof window.finish==='function');await page.evaluate(()=>window.finish());
 await page.waitForFunction(()=>document.querySelector('[data-action=refresh]')&&!document.querySelector('[data-action=refresh]').disabled);
 const tab=kind=>page.locator('[data-action=kind][data-kind='+kind+']');
 for(const kind of ['full','partner','discount','reward']){
  const before=await tab(kind).boundingBox();await page.evaluate(()=>window.finish=null);await tab(kind).click();
  await page.waitForFunction(()=>typeof window.finish==='function');
  assert.equal(await page.locator('.ra-kind-tabs button').count(),4,'tabs disappear during loading');
  assert.equal(await tab(kind).getAttribute('aria-pressed'),'true');
  const during=await tab(kind).boundingBox();assert(Math.abs(during.y-before.y)<2,'tab moves during loading');
  await page.evaluate(()=>window.finish());await page.waitForFunction(()=>!document.querySelector('[data-action=refresh]').disabled);
  assert.equal(await tab(kind).getAttribute('aria-pressed'),'true');assert(Math.abs((await tab(kind).boundingBox()).y-before.y)<2);
 }
 await tab('full').click();await page.waitForFunction(()=>document.querySelector('[data-action=refresh]').disabled);await page.evaluate(()=>window.finish(false));
 await page.getByRole('alert').filter({hasText:'合成測試連線失敗'}).waitFor();assert.equal(await tab('full').getAttribute('aria-pressed'),'true');
 await page.click('[data-action=refresh]');await page.evaluate(()=>window.finish());await page.waitForFunction(()=>!document.querySelector('[data-action=refresh]').disabled);
 const requests=await page.evaluate(()=>window.requests);assert(requests.every(r=>r.method==='GET'));assert(requests.every(r=>admin?new URL(r.url).searchParams.get('target')==='U'+'a'.repeat(32):!new URL(r.url).searchParams.has('target')));
 assert.equal(new URL(requests.at(-1).url).pathname,admin?'/v1/full-applications/admin':'/v1/full-applications');
 await page.screenshot({path:out+'/'+(admin?'admin':'member')+'-'+width+'.png'});
 await page.click('[data-action=kind][data-kind=partner]');await page.waitForFunction(()=>document.querySelector('[data-action=refresh]').disabled);await page.evaluate(()=>window.token='changed');await page.locator('dialog').waitFor({state:'detached'});await page.evaluate(()=>window.finish());assert.equal(await page.locator('dialog').count(),0);assert.deepEqual(errors,[]);await page.close();
 console.log(JSON.stringify({width,admin,pass:true}));
}}finally{await browser.close();server.close();}
