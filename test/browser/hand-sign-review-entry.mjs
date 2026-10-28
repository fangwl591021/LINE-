// Registered-session route boundary + real lazy storefront + signed-record API.
// Entire database, identities and signed applications are isolated synthetic fixtures.
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {handSignFixture,ADMIN,OTHER,mapper} from '../fixtures/hand-sign-applications.mjs';
import {handleRewardApplications} from '../../worker/reward-applications.mjs';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=fileURLToPath(new URL('../../',import.meta.url)).replace(/[\\/]$/,'');
const output=resolve('../contract-review/review-deep-entry');mkdirSync(output,{recursive:true});
let cleanup;const fixture=await handSignFixture({after:fn=>cleanup=fn});
const partner=(await fixture.submit('partner')).result.application;
const full=(await fixture.submit('full')).result.application;
const authSource=readFileSync(join(root,'js/auth.js'),'utf8');
const start=authSource.indexOf("    const shopSection = urlParams.get('shopSection');",authSource.indexOf('// 🔓 已註冊用戶邏輯'));
const end=authSource.indexOf('    const cashierEntryConflict',start);
assert(start>0&&end>start);
const registeredReviewBranch=authSource.slice(start,end);
const html=`<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>合成通知深連結測試</title><button id="launch">模擬已完成登入</button><div id="page-store-shop"></div><p id="toast"></p><script>
window.Config={WORKER_URL:location.origin};window.WORKER_URL=location.origin;
window.testToken='admin';window.userRole='admin';window.currentUserProfile={userId:'${ADMIN}'};
window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.testToken};
window.showToast=message=>document.querySelector('#toast').textContent=message;
window.goPage=page=>window.currentPage=page;window.requestIdleCallback=()=>1;
window.runReviewEntry=async()=>{const urlParams=new URLSearchParams(location.search);${registeredReviewBranch}};
document.querySelector('#launch').onclick=()=>window.runReviewEntry();
</script><script src="/js/modules/reward-applications-entry.js"></script><script src="/js/modules/store-shop-entry.js"></script></html>`;
const requests=[];
const fetcher=async(url,options)=>{assert.equal(url,'https://api.line.me/v2/profile');return Response.json({userId:options.headers.Authorization==='Bearer admin'?ADMIN:OTHER});};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/v1/')){
  requests.push({path:url.pathname+url.search,method:req.method});
  const response=await handleRewardApplications(new Request(url,{headers:req.headers}),fixture.env,mapper,fetcher);
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
 }
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return;}
 const file=resolve(root,'.'+url.pathname);if(!file.startsWith(root+sep)||!['.js','.mjs','.css'].includes(extname(file))){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');res.end(readFileSync(file));
}catch(error){res.writeHead(500);res.end(String(error));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
const link=(kind,id)=>origin+'/?'+new URLSearchParams({shopSection:'mine',applicationReview:'1',applicationKind:kind,applicationId:id});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [kind,record]of [['partner',partner],['full',full]]){
  requests.length=0;await page.goto(link(kind,record.id));await page.click('#launch');await page.getByRole('heading',{name:'申請紀錄',exact:true}).waitFor();
  const text=await page.locator('dialog').innerText();assert(text.includes(record.id));assert(text.includes(record.snapshot.fields.unit_name));
  assert.deepEqual(requests,[{path:'/v1/'+kind+'-applications/admin?id='+record.id,method:'GET'}]);
  assert(!page.url().includes('applicationId'));assert.equal(await page.locator('[name=note]').count(),1);
  assert(await page.evaluate(()=>document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth+1));
  await page.screenshot({path:join(output,kind+'-admin-specific-390.png')});
  await page.evaluate(()=>{window.testToken='user';window.currentUserProfile={userId:'synthetic-other-session'};});await page.locator('dialog').waitFor({state:'detached'});
 }
 for(const extra of ['&target=forged-uid','&applicationKind=full','&shareCardId=forged']){
  requests.length=0;await page.goto(link('partner',partner.id)+extra);await page.click('#launch');await page.getByText('申請通知連結格式不正確，請從合作申請清單開啟',{exact:true}).waitFor();assert.equal(await page.locator('dialog').count(),0);assert.equal(requests.length,0);
 }
 requests.length=0;await page.goto(link('partner',partner.id));await page.evaluate(uid=>{window.userRole='user';window.testToken='user';window.currentUserProfile={userId:uid};},OTHER);await page.click('#launch');await page.getByText('請使用平台管理員帳號登入後查看此申請',{exact:true}).waitFor();assert.equal(requests.length,0);assert.equal(await page.locator('dialog').count(),0);
 // A forged/stale UI role must still be rejected by the API's current database role.
 fixture.sql.prepare("UPDATE users SET role='user' WHERE line_id=?").run(ADMIN);
 await page.goto(link('partner',partner.id));await page.click('#launch');await page.locator('dialog [data-message]').filter({hasText:/管理員|權限/}).waitFor();assert.equal(await page.locator('[name=note]').count(),0);assert.equal(await page.getByText(partner.snapshot.fields.unit_name,{exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert(requests.every(r=>r.method==='GET'));
 const result={success:true,kinds:['partner','full'],specificAdminRecord:true,invalidConflictsRejected:true,memberDenied:true,revokedAdminDeniedByAPI:true,accountSwitchCloses:true,productionWrites:0};writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();server.close();cleanup?.();}
