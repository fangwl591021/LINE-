import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function checkoutWarning('),source.indexOf('  function mount('));
const warning=vm.runInNewContext(code+';checkoutWarning');
const ready=()=>({release_enabled:true,settings:{enabled:1,bank_name:'測試銀行',bank_code:'004',bank_holder:'測試店家',bank_account:'1234567890',shipping_fee_cents:0,free_shipping_cents:0}});
test('complete enabled remittance settings do not show a warning',()=>assert.equal(warning(ready()),''));
test('missing and partial bank or shipping settings warn that online products cannot be ordered',()=>{
 assert.match(warning({}),/尚未完成/);
 for(const [key,value] of [['bank_name',''],['bank_holder',' '],['bank_code','04'],['bank_account','123'],['shipping_fee_cents',null],['free_shipping_cents',-1]]){
  const data=ready();data.settings[key]=value;assert.match(warning(data),/尚未完成.*無法下單/);
 }
});
test('shop disabled and global disabled have distinct messages',()=>{
 const data=ready();data.settings.enabled=0;assert.match(warning(data),/本店尚未開啟/);
 data.settings.enabled=1;data.release_enabled=false;assert.match(warning(data),/全站網購交易尚未開放/);
});
test('warning uses the authenticated read-only settings endpoint and never creates orders or changes settings',()=>{
 const code=source.slice(source.indexOf('    function onlineWarningBox('),source.indexOf('    async function run(job)'));
 assert.match(code,/v1\/store-commerce\/settings/);assert.match(code,/Authorization:`Bearer \$\{token\}`/);
 assert.match(code,/cache:'no-store'/);assert(!code.includes("method:'POST'"));assert(!code.includes('/orders'));
 assert.match(code,/version===epoch/);assert.match(code,/token===window.liff/);assert.match(code,/content.contains\(box\)/);
 assert.match(code,/purchase_mode==='online'&&p.status==='active'/);assert.match(code,/form\?\.elements.status\?\.value==='active'/);
 assert.match(code,/color:#b91c1c/);assert.match(code,/無法確認網路訂單/);
});
