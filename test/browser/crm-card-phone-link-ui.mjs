// Actual admin markup and module; synthetic responses only, no LINE/data requests.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=readFileSync(new URL('../../admin.html',import.meta.url),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace(/<img\b[^>]*>/gi,'').replace('</head>','<script src="https://cdn.tailwindcss.com"></script></head>');
const source=readFileSync(new URL('../../js/modules/admin-crm-card-link.js',import.meta.url),'utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.route('**/*',route=>route.request().url().startsWith('https://cdn.tailwindcss.com/')?route.continue():route.abort());
 await page.setContent(html,{waitUntil:'networkidle'});
 await page.evaluate(()=>{
  document.querySelector('#loading-screen').remove();
  const modal=document.querySelector('#modal-distributor-crm');modal.classList.remove('hidden');modal.classList.add('flex');
  window.adminRole='admin';window.allUsersData=[{userId:'member',name:'合成會員',phone:''},{userId:'second',name:'另一位會員',phone:''}];
  window.getUserId=u=>u.userId;window.findAdminUser=id=>allUsersData.find(u=>u.userId===id);window.renderUsersTable=()=>{};
  window.calls=[];window.delaySearch=false;window.failLink=false;
  window.fetchAPI=async(action,payload)=>{
   calls.push({action,payload});
   if(action==='adminSearchCrmCards'){
    if(delaySearch)await new Promise(resolve=>window.releaseSearch=resolve);
    return {cards:[{rowId:'c1',name:'合成名片 <img src=x onerror=alert(1)>',company:'測試公司',title:'業務',phone:'0912345678',fingerprint:'preview'}],userPhone:findAdminUser(payload.targetUserId).phone};
   }
   if(action==='adminLinkCrmCard')return failLink?null:{userId:payload.targetUserId,phone:'0912345678',reference:{card_name:'合成名片',phone:'0912345678',created_at:'2026-09-20'}};
   throw Error('unexpected action');
  };
 });
 await page.addScriptTag({content:source});
 await page.evaluate(()=>resetCrmCardLink(allUsersData[0]));
 assert.equal(await page.evaluate(()=>calls.length),0);
 await page.locator('#crm-card-link-open').click();
 await page.locator('input[name="crm-card-reference"]').waitFor();
 assert.equal(await page.locator('#crm-card-link-results img').count(),0);
 assert.equal(await page.locator('#crm-card-link-confirm').isDisabled(),true);
 await page.locator('input[name="crm-card-reference"]').check();
 await page.locator('#crm-card-link').screenshot({path:join(tmpdir(),'crm-card-link-mobile.png')});
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#crm-card-link-confirm').click();
 assert.equal(await page.evaluate(()=>calls.filter(c=>c.action==='adminLinkCrmCard').length),0);
 page.once('dialog',dialog=>dialog.accept());await page.locator('#crm-card-link-confirm').click();
 await page.waitForFunction(()=>document.querySelector('#crm-phone').value==='0912345678');
 assert.match(await page.locator('#crm-card-link-status').textContent(),/電話已補入/);
 assert.equal(await page.locator('#crm-save-profile').isDisabled(),false);
 await page.locator('#crm-card-link-search').click();
 await page.waitForFunction(()=>document.querySelector('#crm-card-link-status').textContent.includes('不會覆蓋'));
 assert.equal(await page.locator('input[name="crm-card-reference"]').isDisabled(),true);
 await page.evaluate(()=>{adminRole='store';resetCrmCardLink(allUsersData[0]);});
 assert.equal(await page.locator('#crm-card-link').isVisible(),false);
 await page.evaluate(()=>{adminRole='admin';allUsersData[0].phone='';document.querySelector('#crm-phone').value='';delaySearch=true;resetCrmCardLink(allUsersData[0]);});
 await page.locator('#crm-card-link-open').click();
 await page.waitForFunction(()=>typeof releaseSearch==='function');
 await page.evaluate(()=>{resetCrmCardLink(allUsersData[1]);releaseSearch();delaySearch=false;});
 await page.waitForTimeout(100);
 assert.equal(await page.locator('#crm-card-link-results').textContent(),'');
 await page.locator('#crm-card-link-open').click();
 await page.locator('input[name="crm-card-reference"]').check();
 await page.evaluate(()=>{failLink=true;});
 page.once('dialog',dialog=>dialog.accept());await page.locator('#crm-card-link-confirm').click();
 await page.waitForFunction(()=>document.querySelector('#crm-card-link-status').textContent.includes('未完成'));
 assert.equal(await page.locator('#crm-phone').inputValue(),'');
 assert.equal(await page.locator('#crm-save-profile').isDisabled(),false);
 assert.ok((await page.evaluate(()=>calls)).every(call=>['adminSearchCrmCards','adminLinkCrmCard'].includes(call.action)));
 console.log('PASS: explicit selection, cancel/confirm, no overwrite, role hiding, stale response, error recovery and text escaping');
} finally {await browser.close();}
