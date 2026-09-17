import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import vm from 'node:vm';
import {merchantRole,renderPointsHome,renderRecommendedShops} from '../js/modules/store-points-home.js';
const mall=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');

test('shared brand uses supplied logo without replacing it on role changes; image stays contained',()=>{
 const css=readFileSync(new URL('../css/store-shop.css',import.meta.url),'utf8');
 const logo=readFileSync(new URL('../assets/points-logo-transparent-20260916.png',import.meta.url));
 assert.equal(logo.subarray(1,4).toString(),'PNG');
 assert.match(mall,/class="shop-brand-mark"><img src="assets\/points-logo-transparent-20260916\.png" width="1254" height="1254" alt=""/);
 assert.doesNotMatch(mall,/querySelector\('\.shop-brand-mark'\)\.innerHTML=/);
 assert.match(mall,/brand\.dataset\.do=allowed\?'point-operation':'wallet'/);
 assert.match(css,/\.shop-points-theme \.shop-brand-mark img\{[^}]*object-fit:contain/);
 for(const file of ['store-shop.html','js/modules/store-shop-entry.js']){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(source,/store-shop\.css\?v=25/);assert.match(source,/store-shop\.js\?v=35/);
 }
});
test('shared storefront places an accessible main-home return before the brand for every role',()=>{
 const css=readFileSync(new URL('../css/store-shop.css',import.meta.url),'utf8');
 assert.match(mall,/<nav class="shop-home-return" aria-label="返回主首頁"><button type="button" data-do="exit"><span aria-hidden="true">‹<\/span>回主首頁<\/button><\/nav><header class="shop-brand">/);
 assert.match(css,/\.shop-points-theme \.shop-home-return\s*\{/);
});

test('main-home return uses the existing exit route and invalidates pending views without browser history',()=>{
 const exit=mall.match(/case 'exit':[^\r\n]*?break;/)?.[0];
 assert.ok(exit,'shared click handler retains its exit action');
 assert.doesNotMatch(exit,/history\s*\.\s*back/);
 for(const userRole of ['user','store'])for(const standalone of [false,true]){
  const calls=[];
  const location={href:'https://store.test/LINE-/store-shop.html?code=oauth-code&state=oauth-state&shop=shop-fixture&ref=owner#store',assign:url=>calls.push(['assign',url])};
  const history={back:()=>calls.push(['history.back'])};
  const window={userRole,location,history,goPage:page=>calls.push(['goPage',page])};
  const context={standalone,epoch:7,location,history,window,URL};
  vm.runInNewContext(`switch ('exit') { ${exit} }`,context);
  assert.equal(context.epoch,8,`${userRole} ${standalone}: pending view is invalidated`);
  assert.deepEqual(calls,standalone?[['assign','https://store.test/LINE-/index.html']]:[['goPage','home']],`${userRole} ${standalone}: returns to the main home`);
 }
});

test('shared brand logo has a transparent first pixel in a noninterlaced RGBA8 PNG',()=>{
 const logo=readFileSync(new URL('../assets/points-logo-transparent-20260916.png',import.meta.url));
 assert.deepEqual([...logo.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(logo.readUInt32BE(8),13);
 assert.equal(logo.toString('ascii',12,16),'IHDR');
 assert.deepEqual([...logo.subarray(24,29)],[8,6,0,0,0],'logo must retain an RGBA alpha channel');
 const idat=[];
 for(let offset=8;offset<logo.length;){
  const length=logo.readUInt32BE(offset);
  assert.ok(offset+length+12<=logo.length,'PNG chunk stays within the file');
  if(logo.toString('ascii',offset+4,offset+8)==='IDAT')idat.push(logo.subarray(offset+8,offset+8+length));
  offset+=length+12;
 }
 const pixels=inflateSync(Buffer.concat(idat));
 assert.equal(pixels.length,logo.readUInt32BE(20)*(1+logo.readUInt32BE(16)*4));
 assert.ok(pixels[0]<=4,'first scanline uses a valid PNG filter');
 // Every filter has zero left/above predictors at the first pixel of the first row.
 assert.equal(pixels[4],0,'first pixel must be fully transparent');
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
