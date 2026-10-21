// Actual admin markup/handlers, synthetic members, no real authentication or writes.
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const cssRuntime=await(await fetch('https://cdn.tailwindcss.com')).text();
const out=join(tmpdir(),'line-member-number-ui-20261021');mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const file of ['admin.html','admin-v2.html'])for(const width of [320,390,1280]){
 const html=readFileSync(new URL('../'+file,import.meta.url),'utf8'),page=await browser.newPage({viewport:{width,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort());
 await page.setContent(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''),{waitUntil:'domcontentloaded'});
 await page.addScriptTag({content:cssRuntime});await page.addScriptTag({content:readFileSync(new URL('../js/shared/member-number.js',import.meta.url),'utf8')});
 const inline=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!m[1].includes('src=')&&m[2].includes('function fillDistributorCrm')).map(m=>m[2]).join('\n');await page.addScriptTag({content:inline});
 await page.evaluate(()=>{
  allUsersData=[{userId:'LOCAL',name:'本機合成會員',role:'user',memberNumber:'20261021001',memberJoinedAt:'2026-10-21T00:00:00Z',memberDateSource:'joined',referrerId:''},{userId:'OTHER',name:'<img src=x onerror=alert(1)>',role:'user',memberNumber:'20261020001',memberJoinedAt:'2026-10-20T00:00:00Z',memberDateSource:'legacy_created_at',referrerId:''}];
  allCardsData=[];allBonusOrdersData=[];adminRole='admin';window.calls=[];window.pending=[];
  window.fetchAPI=async(action,payload)=>{window.calls.push(action);if(action==='getAdminPointProfile')return {};if(action!=='adminLookupMemberNumber')throw Error('No writes allowed');return await new Promise(resolve=>window.pending.push({query:payload.query,resolve}));};
  document.getElementById('loading-screen')?.remove();renderUsersTable(allUsersData);openDistributorCrm('LOCAL');
 });
 assert.equal(await page.locator('#crm-member-number').inputValue(),'20261021001');assert.equal(await page.locator('#crm-member-number').getAttribute('readonly'),'');
 assert.equal(await page.locator('#crm-joined-at').getAttribute('readonly'),'');assert.match(await page.locator('#crm-member-date-source').textContent(),/加入資歷/);
 assert.equal(await page.evaluate(()=>getAdminCrmFilteredUsers.call(null,(adminCrmFilters.search='20261021001',allUsersData)).length),1);
 await page.locator('#crm-referrer-id').fill('20261020001');await page.waitForFunction(()=>window.pending.length===1);
 await page.locator('#crm-referrer-id').fill('20261019001');await page.waitForFunction(()=>window.pending.length===2);
 await page.evaluate(()=>{window.pending[1].resolve({success:true,data:{userId:'NEW',name:'最新推薦人',memberNumber:'20261019001',memberJoinedAt:'2026-10-19T00:00:00Z',memberDateSource:'joined'}});});
 await page.waitForFunction(()=>document.getElementById('crm-referrer-preview').textContent.includes('最新推薦人'));
 await page.evaluate(()=>window.pending[0].resolve({success:true,data:{userId:'OLD',name:'過期回應'}}));await page.waitForTimeout(30);
 assert.match(await page.locator('#crm-referrer-preview').textContent(),/最新推薦人/);assert.doesNotMatch(await page.locator('#crm-referrer-preview').textContent(),/過期回應/);
 await page.locator('#crm-referrer-preview').scrollIntoViewIfNeeded();await page.waitForTimeout(80);
 assert.equal(await page.locator('#crm-referrer-id').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),true);
 assert.equal(await page.locator('#crm-referrer-preview').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
 assert.equal(await page.locator('#crm-member-number-options img').count(),0);assert.deepEqual(errors,[]);const calls=await page.evaluate(()=>window.calls);assert(calls.every(x=>['getAdminPointProfile','adminLookupMemberNumber'].includes(x)),JSON.stringify(calls));
 await page.screenshot({path:join(out,file.replace('.html','')+'-'+width+'.png')});await page.close();console.log('PASS '+file+' '+width+'px: number/date, search, read-only preview race, escaped names, viewport.');
}}finally{await browser.close()}
console.log('Screenshots: '+out);
