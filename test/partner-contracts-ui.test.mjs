// Synthetic rendering test; no production services or personal data.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH||'playwright');
const policy='cocreator-115.10-v3';
const sharedHash='a'.repeat(64),recordHash='b'.repeat(64),termsHash='c'.repeat(64);
const records=[
 {id:'OLD-UNKNOWN',policy_version:policy,document_sha256:'1'.repeat(64)},
 {id:'NEW-UNKNOWN',policy_version:policy,document_sha256:'2'.repeat(64),terms:{}},
 {id:'RECORD-HASH',policy_version:policy,document_sha256:'3'.repeat(64),templateSha256:recordHash},
 {id:'TERMS-HASH',policy_version:policy,document_sha256:'4'.repeat(64),terms:{templateSha256:termsHash}},
 {id:'HISTORICAL',policy_version:'historical',document_sha256:'5'.repeat(64)}
];

test('contract template hashes come only from each record while signed hashes remain visible',async()=>{
 const source=await readFile(new URL('../js/modules/partner-contracts.js',import.meta.url),'utf8');
 let browser;
 try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage();
  await page.setContent('<!doctype html><html lang="zh-Hant"><head><link data-reward-application-style></head><body></body></html>');
  // A module script preserves import.meta semantics, without opening any network connection.
  await page.addScriptTag({type:'module',content:source+'\nwindow.openPartnerContractsForTest=openPartnerContracts;'});
  await page.waitForFunction(()=>!!window.openPartnerContractsForTest);
  await page.evaluate(async payload=>{
   window.liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic',getContext:()=>({userId:'U'+'a'.repeat(32)})};
   await window.openPartnerContractsForTest({base:'https://synthetic.invalid',target:'U'+'b'.repeat(32),fetcher:async()=>({ok:true,json:async()=>payload})});
  },{success:true,templateSha256:sharedHash,contracts:records});
  await page.locator('dialog [data-refresh]').waitFor();
  assert.equal(await page.getByText('115.11 制度說明',{exact:true}).isVisible(),false);
  await page.getByText('其他管理與紀錄',{exact:true}).click();
  await page.getByText('查看已登錄契約（5 份）',{exact:true}).click();
  for(const [index,record] of records.entries()){
   const article=page.locator('article.ra-record').filter({hasText:record.id});
   assert.equal(await article.count(),1);
   const content=await article.innerText();
   assert.ok(content.includes(`實際已簽文件 SHA-256：${record.document_sha256}`));
   assert.ok(!content.includes(sharedHash));
   if(index<2)assert.ok(content.includes('115.10 空白範本 SHA-256：未記錄'));
   if(index===2)assert.ok(content.includes(`115.10 空白範本 SHA-256：${recordHash}`));
   if(index===3)assert.ok(content.includes(`115.10 空白範本 SHA-256：${termsHash}`));
  }
  assert.ok(!(await page.locator('dialog').innerText()).includes(sharedHash),'registration form does not imply a global hash identifies the signed template');
 }finally{
  await browser?.close();
 }
});

test('admin opens the selected unpaid sale and verifies a signed application and business member number',async()=>{
 const source=await readFile(new URL('../js/modules/partner-contracts.js',import.meta.url),'utf8');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://fixture.invalid/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><link data-reward-application-style></head><body></body></html>'}));
  await page.goto('https://fixture.invalid/');
  await page.addScriptTag({type:'module',content:source+'\nwindow.openContracts=openPartnerContracts;'});
  await page.evaluate(async()=>{
   const buyer='U'+'b'.repeat(32);window.posted=[];
   window.liff={isLoggedIn:()=>true,getAccessToken:()=>'synthetic',getContext:()=>({userId:'U'+'a'.repeat(32)})};
   await window.openContracts({base:'https://fixture.invalid',target:buyer,orderId:'S2',fetcher:async(url,init)=>{
    let data={contracts:[],heldOrders:[{orderId:'S1'},{orderId:'S2'}],referralProofs:[{id:'PROOF',signed_at:'2026-11-04',namedPartner:'合成業務'}]};
    if(url.includes('/lookup?')) data={member:{userId:'U'+'c'.repeat(32),memberNumber:'20261021003',name:'合成業務'}};
    if(init.method==='POST'){window.posted.push(JSON.parse(init.body));data={};}
    return {ok:true,json:async()=>({success:true,...data})};
   }});
  });
  const form=page.locator('[data-form=orderReferral]');
  assert.equal(await form.isVisible(),true);assert.equal(await form.locator('[name=orderId]').inputValue(),'S2');
  await form.locator('[name=applicationId]').selectOption('PROOF');
  await form.locator('[name=businessNumber]').fill('20261021003');
  await form.locator('[data-lookup=business]').click();
  await form.locator('[data-member=business]').getByText(/合成業務/).waitFor();
  await form.locator('[name=note]').fill('核對該筆簽署資料');await form.locator('[name=confirmed]').check();await form.locator('[type=submit]').click();
  await page.waitForFunction(()=>window.posted.length===1);
  const [verified]=await page.evaluate(()=>window.posted);
  assert.equal(verified.orderId,'S2');assert.equal(verified.applicationId,'PROOF');assert.equal(verified.memberNumber,'20261021003');
 }finally{await browser.close();}
});

test('administrator grants a project, closes the dialog and sees both saved qualifications',async()=>{
 const source=await readFile(new URL('../js/modules/partner-contracts.js',import.meta.url),'utf8');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://fixture.invalid/',route=>route.fulfill({contentType:'text/html',body:'<html><head><link data-reward-application-style></head><body></body></html>'}));
  await page.goto('https://fixture.invalid/');
  await page.addScriptTag({type:'module',content:source+'\nwindow.openContracts=openPartnerContracts;'});
  await page.evaluate(async()=>{
   const target='U'+'b'.repeat(32);let granted=false;
   window.liff={isLoggedIn:()=>true,getAccessToken:()=>'synthetic',getContext:()=>({userId:'U'+'a'.repeat(32)})};
   window.showProject=()=>window.openContracts({base:'https://fixture.invalid',target,fetcher:async(url,init)=>{
    if(init.method==='POST'){const data=JSON.parse(init.body);granted=url.endsWith('/project')&&data.target_uid===target&&data.independent&&data.waiveFee&&data.confirmed&&data.reason==='合成專案';}
    return {ok:true,json:async()=>({success:true,contracts:[],projectIndependentAt:granted?'2026-11-09':'',projectFeeWaivedAt:granted?'2026-11-09':''})};
   }});
   await window.showProject();
  });
  await page.setViewportSize({width:375,height:667});
  await page.addStyleTag({content:await readFile(new URL('../css/reward-applications.css',import.meta.url),'utf8')});
  await page.addStyleTag({content:await readFile(new URL('../css/partner-contracts.css',import.meta.url),'utf8')});
  assert.equal(await page.getByText('月結、請款與已付款登錄',{exact:true}).isVisible(),false);
  await page.getByText('登錄專案資格',{exact:true}).click();
  const form=page.locator('[data-form=project]');
  for(const field of ['independent','waiveFee','confirmed'])await form.locator('[name='+field+']').check();
  await form.locator('[name=reason]').fill('合成專案');await form.getByText('儲存專案資格').click();
  await page.getByText('專案資格已登錄',{exact:true}).waitFor();await page.locator('[data-close]').click();await page.evaluate(()=>window.showProject());
  await page.getByText('年費專案免收 · 已核准專案獨立').waitFor();assert.equal(await form.count(),0);
 }finally{await browser.close();}
});

test('paid order opens after a retry and explains the missing signed application',async()=>{
 const source=await readFile(new URL('../js/modules/partner-contracts.js',import.meta.url),'utf8');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<html><head><link data-reward-application-style></head><body></body></html>');
  await page.addScriptTag({type:'module',content:source+'\nwindow.openContracts=openPartnerContracts;'});
  await page.waitForFunction(()=>!!window.openContracts);
  await page.evaluate(async()=>{
   window.liff={isLoggedIn:()=>true,getAccessToken:()=>'fixture',getContext:()=>({userId:'U'+'a'.repeat(32)})};
   let calls=0;
   await window.openContracts({base:'https://fixture.invalid',target:'U'+'b'.repeat(32),orderId:'PAID-2',
    fetcher:async()=>{const ok=++calls>1;return {ok,json:async()=>ok?{success:true,contracts:[],heldOrders:[{orderId:'PAID-2',status:'paid'}],referralProofs:[]}:{error:'暫時無法連線'}};}});
  });
  assert.equal(await page.getByText('讀取中…').count(),0);
  await page.getByRole('button',{name:'重新讀取'}).click();
  const form=page.locator('[data-form=orderReferral]');
  await form.getByText(/目前沒有已受理的雙向完整版申請書/).waitFor();
  assert.equal(await form.locator('option:checked').textContent(),'PAID-2 · 已收款');
  assert.equal(await form.getByRole('button',{name:'確認業務歸屬'}).count(),0);
 }finally{await browser.close();}
});

test('registers an approved signed application without retyping; pending, absent and mismatched evidence cannot be enrolled',async()=>{
 const src=await readFile(new URL('../js/modules/partner-contracts.js',import.meta.url),'utf8');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<link data-reward-application-style>'}));
  await page.goto('https://fixture.invalid/');
  await page.addScriptTag({type:'module',content:src+'\nwindow.startCRM=openPartnerContracts;'});
  await page.evaluate(async()=>{
   const target='U'+'b'.repeat(32),id=crypto.randomUUID(),signed_at='2026-11-07T08:00:00.000Z';
   window.liff={isLoggedIn:()=>true,getAccessToken:()=>'synthetic',getContext:()=>({userId:'U'+'a'.repeat(32)})};
   const snapshot={signer_uid:target,form_kind:'partner',signing:{preview_id:id},signed_at,attribution_mode:'applicant_performance_v1',
    template:{kind:'partner',version:'partner-115.11-hand-sign-2026-11-05-r2',source_sha256:'4126be459a0ea6a48c7b755e814d700e7fa1f98941b7a013a3bfc40678cacaf2'},
    fields:{unit_name:'合成乙方',party_type:'natural_person',bank_name:'測試銀行',bank_code:'123',bank_branch:'測試分行',bank_account_holder:'合成乙方',bank_account:'1234567890'}};
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)))),b=>b.toString(16).padStart(2,'0')).join('');
   window.writes=[];
   window.show=mode=>window.startCRM({base:'https://fixture.invalid',target,fetcher:async(url,init)=>{
    const u=new URL(url);let data={contracts:window.writes.map(p=>({id:'registered',evidence_ref:p.evidenceRef,signed_at:p.signedAt}))};
    if(u.pathname.includes('/partner-applications/')){
     if(u.searchParams.get('target')!==target)throw Error('target missing');
     const a={id,status:mode==='pending'?'pending':'accepted',signed_at,unit_name:'合成乙方'};
     data=u.searchParams.has('id')?{application:{...a,snapshot,content_sha256:mode==='bad'?'0'.repeat(64):digest}}:{applications:mode==='empty'?[]:[a]};
    }else if(init.method==='POST'){window.writes.push(JSON.parse(init.body));data={};}
    return {ok:true,json:async()=>({success:true,...data})};
   }});
  });
  const open=async mode=>{await page.evaluate(m=>window.show(m),mode);await page.getByText('登錄已簽契約',{exact:true}).click();};
  for(const [mode,label] of [['empty','尚無線上簽署紀錄'],['pending','請先到']]){
   await open(mode);await page.locator('[data-online]').getByText(new RegExp(label)).first().waitFor();
   assert.equal(await page.getByText('查看並登錄',{exact:true}).count(),0);await page.locator('[data-close]').click();
  }
  await open('bad');await page.getByText('查看並登錄').click();await page.getByText(/簽署內容與原始校驗碼不符/).waitFor();
  assert.equal(await page.evaluate(()=>window.writes.length),0);await page.locator('[data-close]').click();
  await open('ok');assert.equal(await page.locator('[name=bankName]').isVisible(),false);
  await page.getByText('查看並登錄').click();await page.getByText(/末 7890 碼/).waitFor();
  await page.getByText('確認登錄這份契約').click();await page.getByText('已登錄 合成乙方 的共創夥伴契約。').waitFor();
  const [posted]=await page.evaluate(()=>window.writes);
  assert.equal(posted.bankAccount,'1234567890');assert.equal(posted.templateVersion,'115.11-R2');assert.equal(posted.signedAt,posted.effectiveAt);
  assert.equal(posted.evidenceRef,'線上手簽：'+posted.requestKey);
  await page.locator('[data-close]').click();await open('ok');await page.locator('[data-online]').getByText(/已登錄/).waitFor();
  assert.equal(await page.getByText('查看並登錄').count(),0);
 }finally{await browser.close();}
});
