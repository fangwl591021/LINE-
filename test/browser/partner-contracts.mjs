// Loopback-only CRM UI tests. All accounts, documents and API responses are synthetic.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/[\\/]$/,'');
const target='U'+'b'.repeat(32),manager='U'+'c'.repeat(32),calls=[];
let failContract=false,holdRead=false,releaseRead,contracts=[];
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成共創契約測試</title><button id="start" onclick="openPartnerContracts('${target}')">共創制度</button><output></output><script>window.userRole='admin';window.testToken='synthetic-admin';window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken};window.Config={WORKER_URL:location.origin};window.showToast=m=>document.querySelector('output').textContent=m;</script><script src="/js/modules/partner-contracts-entry.js"></script></html>`;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/v1/partner-contracts')){
  const chunks=[];for await(const c of req)chunks.push(c);const body=chunks.length?JSON.parse(Buffer.concat(chunks)):undefined;
  calls.push({path:url.pathname,query:url.search,method:req.method,body,authorization:req.headers.authorization});
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  if(req.method==='GET'&&url.pathname.endsWith('/lookup')){res.end(JSON.stringify({success:true,member:{userId:manager,name:'合成管理人 <img src=x>',memberNumber:'20261021003'}}));return;}
  if(req.method==='GET'){if(holdRead)await new Promise(r=>{releaseRead=r;});res.end(JSON.stringify({success:true,policyVersion:'cocreator-2026-10-25-v2',contracts,attribution:null,pendingDeals:[{orderId:'SYNTHETIC-PENDING',status:'paid'}]}));return;}
  if(url.pathname==='/v1/partner-contracts'&&failContract){failContract=false;res.writeHead(503);res.end(JSON.stringify({success:false,error:'合成暫時失敗，請重試'}));return;}
  if(url.pathname==='/v1/partner-contracts')contracts.push({policy_version:'cocreator-2026-10-25-v2',signed_at:body.signedAt,effective_at:body.effectiveAt,document_sha256:body.documentSha256});
  res.end(JSON.stringify({success:true,...(url.pathname.endsWith('/deals/confirm')?{settlementStatus:'review_required',plan:{status:'pending'}}:{})}));return;
 }
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+sep)||!['.js','.css'].includes(extname(file))){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(file));
 }catch(error){res.writeHead(500);res.end(String(error));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true}),errors=[];
const posts=()=>calls.filter(c=>c.method==='POST');
const section=(page,name)=>page.locator('details').filter({has:page.locator(`form[data-form=${name}]`)});
const form=(page,name)=>page.locator(`form[data-form=${name}]`);
const settled=page=>page.waitForFunction(()=>document.querySelector('dialog [data-status]')?.textContent!=='處理中…'&&!!document.querySelector('dialog [data-refresh]'));
async function open(page){await page.click('#start');await page.locator('dialog [data-refresh]').waitFor();await settled(page);}
async function fillContract(page){const f=form(page,'contract');await section(page,'contract').locator('summary').click();await f.locator('[name=signedAt]').fill('2026-10-23T10:00');await f.locator('[name=effectiveAt]').fill('2026-10-24T10:00');await f.locator('[name=evidenceRef]').fill('合成保管編號-UI');return f;}
try{
 const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.evaluate(()=>window.userRole='user');await page.click('#start');await page.getByText('請使用平台管理員帳號登入').waitFor();assert.equal(calls.length,0);assert.equal(await page.locator('dialog').count(),0);
 await page.evaluate(()=>window.userRole='admin');await open(page);assert.equal(posts().length,0,'opening CRM is read-only');assert.ok(calls.every(c=>c.authorization==='Bearer synthetic-admin'));
 await page.getByRole('button',{name:'關閉 ×',exact:true}).click();assert.equal(await page.locator('dialog').count(),0);assert.equal(await page.evaluate(()=>document.activeElement.id),'start');await open(page);await page.keyboard.press('Escape');assert.equal(await page.locator('dialog').count(),0);
 await open(page);let f=await fillContract(page);
 const synthetic=Buffer.from('Synthetic signed document - browser test only');await f.locator('[data-file]').setInputFiles({name:'synthetic.pdf',mimeType:'application/pdf',buffer:synthetic});await page.getByText('文件校驗碼已計算，尚未登錄。').waitFor();assert.equal(await f.locator('[name=documentSha256]').inputValue(),createHash('sha256').update(synthetic).digest('hex'));assert.equal(posts().length,0,'hash stays local, no upload');
 await f.getByRole('button',{name:'確認登錄新簽契約',exact:true}).click();assert.equal(posts().length,0,'unchecked attestation cannot submit');await f.locator('[name=confirmed]').check();await f.locator('[name=purchaseStatus]').selectOption('purchased');await f.getByRole('button',{name:'確認登錄新簽契約',exact:true}).click();await page.getByText('已購買者請填寫本人購買訂單編號').waitFor();assert.equal(posts().length,0);
 await f.locator('[name=purchaseOrderId]').fill('SYNTHETIC-OWN-PURCHASE');failContract=true;await f.getByRole('button',{name:'確認登錄新簽契約',exact:true}).click();await page.getByText('合成暫時失敗，請重試').waitFor();assert.equal(await f.locator('[name=evidenceRef]').inputValue(),'合成保管編號-UI');await f.getByRole('button',{name:'確認登錄新簽契約',exact:true}).click();await page.getByText('新簽契約已登錄；舊訂單維持原規則。').waitFor();
 const submitted=posts();assert.equal(submitted.length,2);assert.deepEqual(submitted[0].body,submitted[1].body,'retry preserves original idempotency key and facts');assert.equal(submitted[0].body.target_uid,target);assert.equal(submitted[0].body.purchaseStatus,'purchased');assert.equal(submitted[0].body.purchaseOrderId,'SYNTHETIC-OWN-PURCHASE');assert.equal(submitted[0].body.confirmed,true);assert.match(submitted[0].body.requestKey,/^[0-9a-f-]{36}$/);assert.match(submitted[0].body.signedAt,/^2026-10-2[23]T/);
 await section(page,'attribution').locator('summary').click();f=form(page,'attribution');await f.locator('[name=managerNumber]').fill('20261021003');await f.locator('[data-lookup]').click();await f.locator('[data-manager]').getByText('合成管理人 <img src=x> · 20261021003',{exact:true}).waitFor();assert.equal(await f.locator('img').count(),0);assert.equal(posts().length,2,'lookup read-only');
 await f.locator('[name=effectiveAt]').fill('2026-10-24T12:00');await f.locator('[name=consentSha256]').fill('c'.repeat(64));await f.locator('[name=evidenceRef]').fill('合成同意保管編號');await f.locator('[name=confirmed]').check();await f.getByRole('button',{name:'確認登錄管理歸屬',exact:true}).click();await page.getByText('管理歸屬已登錄，原推薦歷史保留。').waitFor();const transfer=posts().at(-1);assert.ok(transfer.path.endsWith('/attribution'));assert.equal(transfer.body.manager_uid,manager);assert.equal(transfer.body.target_uid,target);assert.equal(transfer.body.consentSha256,'c'.repeat(64));assert.equal(transfer.body.confirmed,true);assert.equal('referrer_id' in transfer.body,false);
 await section(page,'attribution').locator('summary').click();f=form(page,'attribution');await f.locator('[name=managerNumber]').fill('20261021003');await f.locator('[data-lookup]').click();await f.locator('[data-manager]').getByText('合成管理人 <img src=x> · 20261021003',{exact:true}).waitFor();await f.locator('[name=managerNumber]').fill('20261021004');await f.locator('[name=effectiveAt]').fill('2026-10-24T12:00');await f.locator('[name=consentSha256]').fill('c'.repeat(64));await f.locator('[name=evidenceRef]').fill('合成同意保管編號');await f.locator('[name=confirmed]').check();await f.getByRole('button',{name:'確認登錄管理歸屬',exact:true}).click();await page.getByText('請先核對管理人的會員編號').waitFor();assert.equal(posts().length,3,'editing lookup invalidates chosen manager');
 await section(page,'deal').locator('summary').click();f=form(page,'deal');await f.locator('[name=orderId]').fill('SYNTHETIC-PENDING');await f.locator('[name=receiptRef]').fill('合成收款及開通憑證');await f.locator('[name=serviceOpenedAt]').fill('2026-10-24T13:00');await f.locator('[name=confirmed]').check();await f.getByRole('button',{name:'確認有效成交並核算新制獎金',exact:true}).click();await page.getByText('已核算，對帳與請款給付仍待核對，尚未付款。',{exact:true}).waitFor();const deal=posts().at(-1);assert.ok(deal.path.endsWith('/deals/confirm'));assert.equal(deal.body.orderId,'SYNTHETIC-PENDING');assert.equal(deal.body.receiptRef,'合成收款及開通憑證');assert.equal(deal.body.confirmed,true);assert.equal('netAmount' in deal.body,false,'UI cannot dictate award amount');
 await page.evaluate(()=>window.testToken='changed-token');await page.locator('dialog').waitFor({state:'detached'});assert.equal(posts().length,4);await page.evaluate(()=>window.testToken='synthetic-admin');
 // A delayed response from a closed or role-revoked screen cannot re-render it.
 holdRead=true;await page.click('#start');await page.locator('dialog').waitFor();await page.waitForFunction(()=>document.querySelector('dialog [data-status]')?.textContent==='處理中…');while(!releaseRead)await new Promise(r=>setTimeout(r,10));await page.evaluate(()=>window.userRole='user');await page.locator('dialog').waitFor({state:'detached'});holdRead=false;releaseRead();releaseRead=undefined;await page.waitForTimeout(100);assert.equal(await page.locator('dialog').count(),0);assert.equal(posts().length,4);
 await context.close();console.log('PASS CRM admin gate; read-only open/hash/lookup; consent/validation; contract retry; attribution identity; opened-service payload; review status; token/role lifecycle');
 for(const width of [320,390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:900}}),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);await open(p);await p.locator('details').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
  for(const name of ['documentSha256','evidenceRef','purchaseOrderId','consentSha256','receiptRef','orderId'])for(const control of await p.locator(`[name=${name}]`).all())await control.fill('X'.repeat(name.includes('Sha256')?64:120));
  const sizes=await p.locator('dialog').evaluate(d=>({scrollWidth:d.scrollWidth,clientWidth:d.clientWidth,rect:d.getBoundingClientRect().toJSON(),viewport:innerWidth}));assert.ok(sizes.scrollWidth<=sizes.clientWidth+1,JSON.stringify({width,...sizes}));assert.ok(sizes.rect.left>=0&&sizes.rect.right<=width+1,JSON.stringify(sizes));
  await p.screenshot({path:join(tmpdir(),`partner-contracts-ui-${width}.png`)});await p.getByRole('button',{name:'關閉 ×',exact:true}).click();assert.equal(await p.locator('dialog').count(),0);await ctx.close();console.log('PASS CRM contract/attribution/deal forms no horizontal overflow width='+width);
 }
 assert.deepEqual(errors,[]);writeFileSync(join(tmpdir(),'partner-contracts-ui-result.json'),JSON.stringify({success:true,widths:[320,390,1280],syntheticPosts:posts().length,productionWrites:0},null,2));
}finally{if(releaseRead)releaseRead();await browser.close();await new Promise(r=>server.close(r));}
