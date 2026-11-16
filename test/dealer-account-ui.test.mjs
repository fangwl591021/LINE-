import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const file=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('帳務專區在手機呈現本人資料，篩選、組織圖與切換帳號可正常運作',async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const [index,js,css,org,orgCss]=await Promise.all(['index.html','js/modules/dealer-account.js','css/dealer-account.css','js/modules/contract-organization.js','css/contract-organization.css'].map(file));
  const button=index.match(/<button[^>]+id="dealer-account-entry"[\s\S]*?<\/button>/)[0];
  await page.route('https://fixture.test/',r=>r.fulfill({contentType:'text/html',body:button}));
  await page.goto('https://fixture.test/');await page.addStyleTag({content:css+'\n'+orgCss});await page.addScriptTag({content:org});await page.addScriptTag({content:js});
  await page.evaluate(()=>{window.currentPage='settings';window.currentUserProfile={userId:'self'};window.Config={WORKER_URL:'https://fixture.test'};window.liff={isLoggedIn:()=>true,getAccessToken:()=>'synthetic-token',getContext:()=>({userId:'self'})};});
  const calls=[];
  await page.route('**/v1/dealer-account**',r=>{calls.push(r.request().url());assert.equal(r.request().headers().authorization,'Bearer synthetic-token');return r.fulfill({json:{success:true,identityReview:false,bonus:{page:1,total:1,pageSize:20,totals:[{status:'review_required',amount:1500}],rows:[{transactionId:'x',orderId:'ORD-1',bonusType:'direct_full',amount:1500,status:'review_required',performanceMonth:'2026-10',createdAt:'2026-11-01T00:00:00Z'}]},performance:{page:1,total:1,pageSize:20,paidCount:1,paidAmount:6300,pendingCount:0,rows:[{buyerName:'合成會員',orderId:'ORD-1',dealType:'tenant_annual_fee',performanceMonth:'2026-10',paymentStatus:'paid',grossAmount:6300}]}}});});
  await page.route('**/v1/partner-applications/organization**',r=>r.fulfill({json:{success:true,organization:{root:{name:'本人',children:[{name:'合成下線',children:[],hasChildren:false}],hasChildren:true},unplaced:[]}}}));
  await page.locator('#dealer-account-entry').click();await page.getByText('合成會員').waitFor();
  assert.equal(await page.getByText('NT$ 1,500').count()>0,true);
  assert.equal(await page.locator('dialog').evaluate(el=>el.clientWidth<=390),true);
  await page.locator('dialog input[type=month]').fill('2026-10');await page.getByRole('button',{name:'查詢',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('2026-10'));
  assert.equal(new URL(calls.at(-1)).searchParams.get('month'),'2026-10');
  await page.getByRole('button',{name:'我的組織圖'}).click();await page.getByText('合成下線').waitFor();
  await page.evaluate(()=>{window.currentUserProfile={userId:'another'};});await page.locator('dialog').waitFor({state:'detached'});
 }finally{await browser.close();}
});
