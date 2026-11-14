// Actual admin shell and entry script, synthetic session/API. No real requests.
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
const files=new Set(['/js/modules/admin-activity-registration.js','/js/modules/admin-finance-overview.mjs']);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/admin.html'){
  const html=fs.readFileSync(path.join(root,'admin.html'),'utf8');
  const marker='document.addEventListener("DOMContentLoaded", initAdmin);';
  assert.equal(html.split(marker).length,2,'actual initialization marker remains unique');
  res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(html.replace(marker,'/* isolated test: suppress real login */'));
 }
 if(!files.has(url.pathname)){res.writeHead(404);return res.end();}
 res.writeHead(200,{'content-type':'text/javascript; charset=utf-8'});res.end(fs.readFileSync(path.join(root,url.pathname.slice(1))));
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:800}}), origin=`http://127.0.0.1:${server.address().port}`;
  let calls=0,fail=false,oldActionCalls=0;
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===origin) return route.continue();
   if(url.hostname==='line-engine.fangwl591021.workers.dev'){
    calls++;
    if(req.method()==='POST'){oldActionCalls++;return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({success:false,error:'unexpected old action'})});}
    assert.equal(url.pathname,'/v1/admin/overview-stats');assert.equal(req.headers().authorization,'Bearer synthetic-a');
    return route.fulfill({status:fail?503:200,contentType:'application/json',body:JSON.stringify(fail?{success:false}:{success:true,data:{memberRecordCount:13,cardRecordCount:0,publishedActivityCount:4,activeRegistrationCount:6}})});
   }
   return route.abort();
  });
  await page.addInitScript(()=>{window.syntheticToken='synthetic-a';window.liff={isLoggedIn:()=>true,getAccessToken:()=>window.syntheticToken};});
  await page.goto(origin+'/admin.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{adminRole='admin';adminProfile={userId:'test-admin'};switchTab('finance');});
  await page.waitForFunction(()=>document.getElementById('finance-overview-memberRecordCount')?.textContent==='13');
  assert.equal(oldActionCalls,0);assert.equal(await page.locator('#finance-overview-cardRecordCount').textContent(),'0');
  // A real CRM render writes the compatibility sink, not the overview.
  await page.evaluate(()=>renderUsersTable([]));
  assert.equal(await page.locator('#finance-overview-memberRecordCount').textContent(),'13');
  await page.evaluate(()=>{window.syntheticToken='synthetic-b';});
  await page.waitForFunction(()=>document.getElementById('finance-overview-memberRecordCount')?.textContent==='—');
  await page.evaluate(()=>{adminRole='store';switchTab('finance');});
  const before=calls;await page.waitForTimeout(150);assert.equal(calls,before);
  assert.match(await page.locator('#finance-overview-feedback').innerText(),/僅總管/);
  await page.evaluate(()=>{adminRole='admin';window.syntheticToken='synthetic-a';});fail=true;
  await page.evaluate(()=>switchTab('finance'));
  await page.waitForFunction(()=>document.getElementById('finance-overview-feedback')?.textContent.includes('無法讀取'));
  assert.equal(await page.locator('#finance-overview-memberRecordCount').textContent(),'—');
  fail=false;await page.getByRole('button',{name:'重新讀取',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('finance-overview-memberRecordCount')?.textContent==='13');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{adminRole='admin';adminProfile={userId:'test-admin'};switchTab('finance');});
  await page.waitForFunction(()=>document.getElementById('finance-overview-memberRecordCount')?.textContent==='13');
  assert.equal(oldActionCalls,0);
  console.log('PASS actual admin shell: dedicated overview, no old action, CRM, account change, denial, failure and retry');
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
