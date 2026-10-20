import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const home=read('js/modules/home.js'),shop=read('js/modules/store-shop.js');
const entry=home.match(/window\.openPartnerStores = function\(\) \{[\s\S]*?\n    \};/)[0];
test('actual home shortcut opens only the existing in-app partner list, never the mother or private writes',()=>{
 const calls=[],window={openStoreShop(...args){calls.push(args);return 'opened';},location:{assign(){assert.fail('External navigation forbidden');}}};
 vm.runInNewContext(entry,{window});assert.equal(window.openPartnerStores(),'opened');assert.deepEqual(calls,[['','','','partners']]);
 const notices=[];delete window.openStoreShop;window.showToast=(...args)=>notices.push(args);window.openPartnerStores();assert.equal(notices.length,1);assert.equal(calls.length,1);
 assert.doesNotMatch(entry,/fetch|fetchAPI|shopSection|userId|location\.assign/);
});
function contact(value){
 const context={URL,encodeURIComponent},escape=shop.split('\n').find(l=>l.includes('const esc ='));
 const helper=shop.slice(shop.indexOf('  function companyInfo(s)'),shop.indexOf('  async function prepareImage'));
 vm.runInNewContext(escape+'\n'+helper+'\nglobalThis.contact=companyInfo;',context);return context.contact(value);
}
test('public company phone/address are readable and links use safe schemes and encoded map queries',()=>{
 const html=contact({phone:'(02) 2345-6789',address:'台北市測試路 1 號 & 2 樓',hours:'週一至五\n09:00–18:00'});
 assert.match(html,/電話/);assert.match(html,/地址/);assert.match(html,/href="tel:0223456789"/);
 assert.match(html,/target="_blank" rel="noopener noreferrer"/);assert.ok(html.includes(encodeURIComponent('台北市測試路 1 號 & 2 樓')));
 assert.match(html,/&amp; 2 樓/);assert.doesNotMatch(html,/owner_uid|line_id|會員姓名/);
});
test('hostile or missing public contact fields cannot create executable links or invented details',()=>{
 const html=contact({phone:'javascript:alert(1)',address:'<img src=x onerror=alert(1)>',maps_url:'javascript:alert(1)'});
 assert.doesNotMatch(html,/href="(?:javascript|tel):|<img/);assert.match(html,/&lt;img/);assert.match(html,/www\.google\.com\/maps\/search/);
 assert.doesNotMatch(contact({maps_url:'https://user:pass@example.test/'}),/user:pass/);assert.equal((contact({}).match(/尚未提供/g)||[]).length,2);
});
test('entry reuses owner forms, preserves role/quota rules and does not warm QR in the partner list',()=>{
 assert.match(shop,/\['partners','list'\]\.includes\(section\)\)await list\(\)/);assert.match(shop,/!\['cashier','partners','list'\]\.includes\(section\)/);
 assert.match(shop,/上架公司／商品/);assert.match(shop,/公司與商品上架步驟/);assert.match(shop,/一般會員最多一件/);
 assert.match(shop,/api\('\/store',data\)/);assert.match(shop,/api\('\/product',data\)/);
 assert.ok(read('index.html').includes('home.js?v=8.27'));
 for(const file of ['js/modules/store-shop-entry.js','store-shop.html']){assert.ok(read(file).includes('store-shop.js?v=66'));assert.ok(read(file).includes('store-shop.css?v=34'));}
});
