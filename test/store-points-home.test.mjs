import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {merchantRole,renderPointsHome,renderRecommendedShops} from '../js/modules/store-points-home.js';
const mall=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');

test('shared brand uses supplied logo without replacing it on role changes; image stays contained',()=>{
 const css=readFileSync(new URL('../css/store-shop.css',import.meta.url),'utf8');
 const logo=readFileSync(new URL('../assets/points-logo-20260916.png',import.meta.url));
 assert.equal(logo.subarray(1,4).toString(),'PNG');
 assert.match(mall,/class="shop-brand-mark"><img src="assets\/points-logo-20260916\.png" width="1254" height="1254" alt=""/);
 assert.doesNotMatch(mall,/querySelector\('\.shop-brand-mark'\)\.innerHTML=/);
 assert.match(mall,/brand\.dataset\.do=allowed\?'point-operation':'wallet'/);
 assert.match(css,/\.shop-points-theme \.shop-brand-mark img\{[^}]*object-fit:contain/);
 for(const file of ['store-shop.html','js/modules/store-shop-entry.js']){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(source,/store-shop\.css\?v=24/);assert.match(source,/store-shop\.js\?v=33/);
 }
});
test('merchant home requires a signed-in, explicitly assigned role, never product ownership or admin hint',()=>{
 const gate=mall.match(/const canMerchantHome=\(\)=>(.*);/)[1];
 for(const role of ['admin','store','reward','tenant','總管','店長','租戶','贈點用戶','user','用戶','unknown',''])for(const logged of [true,false])for(const standalone of [true,false]){
  const window={userRole:role,currentUserProfile:{userId:'fixture'},liff:{isLoggedIn:()=>logged},hasAdminRights:true};
  const result=vm.runInNewContext(gate,{window,standalone});
  assert.equal(!!result,!standalone&&logged&&!!merchantRole(role),`${role} ${logged} ${standalone}`);
 }
 assert.equal(merchantRole('user'),'');assert.equal(merchantRole('reward'),'reward');
});
test('consumer exposes own wallet/history/orders, not cashier controls or role switch',()=>{
 const html=renderPointsHome({canManage:true});
 for(const action of ['wallet','spending-history','online-orders','find','manage'])assert.ok(html.includes(`data-do="${action}"`));
 assert.doesNotMatch(html,/data-do="point-(reward|redeem)"|商家版|贈點工作台/);
});
test('reward unit gets merchant presentation with scan-gift only, no debit or collection management',()=>{
 const html=renderPointsHome({merchant:true,rewardOnly:true});
 assert.match(html,/贈點工作台/);assert.match(html,/data-do="point-reward"/);
 assert.doesNotMatch(html,/data-do="(?:point-redeem|online-manage|manage|sales)"/);
 assert.match(html,/不提供扣點或店家收款管理/);
});
test('store/admin cover reuses existing functions and never fabricates budget, repeat rates or activity data',()=>{
 const html=renderPointsHome({merchant:true,canManage:true});
 for(const action of ['point-reward','point-redeem','sales','online-manage','manage'])assert.ok(html.includes(`data-do="${action}"`));
 assert.doesNotMatch(html,/13,260|50,000|回購率|新增會員|本月贈點|1 點.*1 元/);
 assert.match(html,/我的共用點數/);assert.match(html,/商品 QR 折抵/);
});
test('untrusted shop text is escaped, list limited to three without invented distance',()=>{
 const html=renderRecommendedShops(Array.from({length:6},()=>({name:'<script>x</script>',id:'" onclick="x',address:'<img>'})),()=> '');
 assert.equal((html.match(/<article>/g)||[]).length,3);assert.doesNotMatch(html,/<script>|onclick="x/);assert.match(html,/&lt;script&gt;/);
});
test('point home starts narrow wallet and public shop reads independently; history remains on demand',()=>{
 const source=mall.slice(mall.indexOf('async function pointsHome('),mall.indexOf('function memberHome()'));
 assert.match(source,/void loadWalletModule/);assert.match(source,/void api\(\)/);
 assert.doesNotMatch(source,/queryUserPoints|loadStorePointCashierLogs|\/manage|Promise\.all/);
 assert.match(source,/owner===window.currentUserProfile\?\.userId&&role===window.userRole/);
});
