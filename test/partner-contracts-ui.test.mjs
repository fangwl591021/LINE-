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
