import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPointsHome,renderMerchantProfile,formatMerchantExpiry,pointIcon,merchantRole,renderRecommendedShops,readRewardUnits,renderRewardCards} from '../js/modules/store-points-home.js';

const actions=html=>[...html.matchAll(/data-do="([^"]+)"/g)].map(match=>match[1]);
const render=options=>renderPointsHome({merchant:true,role:'store',canManage:true,canMembers:true,canTutorial:true,...options});

test('merchant workbench uses live-data hooks and real actions without consumer promotion blocks',()=>{
  const html=render();
  assert.match(html,/class="merchant-workbench"/);assert.match(html,/店家專區/);assert.match(html,/店家工作台/);
  for(const hook of ['data-merchant-profile','data-merchant-plan-label','data-merchant-expiry'])assert.ok(html.includes(hook));
  for(const action of ['point-reward','point-redeem','manage','online-manage','spending-history','sales','merchant-members','merchant-tutorial'])assert.ok(actions(html).includes(action),action);
  assert.doesNotMatch(html,/class="(?:points-wallet|points-reward-units|points-recommended)|data-do="(?:wallet|tank-game|reward-units|find)"/);
  assert.doesNotMatch(html,/1,268|\+32|86 筆|2027\/10\/31/);assert.match(html,/依合作方案/);
});

test('gift-only and redemption-only roles retain their existing privilege boundaries',()=>{
  const reward=render({role:'reward',rewardOnly:true});
  assert.ok(actions(reward).includes('point-reward'));assert.match(reward,/贈點單位/);
  for(const action of ['point-redeem','manage','sales','online-manage'])assert.ok(!actions(reward).includes(action),action);
  const redeem=render({role:'redeem',redeemOnly:true});
  assert.ok(actions(redeem).includes('point-redeem'));assert.ok(!actions(redeem).includes('point-reward'));
  assert.match(redeem,/折抵店家/);assert.match(redeem,/1 件商品/);assert.match(redeem,/不能贈點/);
  const administrator=render({role:'總管'});assert.match(administrator,/平台管理員/);assert.match(administrator,/商品不設總數上限/);assert.doesNotMatch(administrator,/可上架 20 件/);
  const noRetail=render({canManage:false});for(const action of ['manage','sales','online-manage'])assert.ok(!actions(noRetail).includes(action));
});

test('optional customer and tutorial controls appear only when their real handlers are available',()=>{
  const without=render({canMembers:false,canTutorial:false});assert.ok(!actions(without).includes('merchant-members'));assert.ok(!actions(without).includes('merchant-tutorial'));
  const withHandlers=render();assert.match(withHandlers,/客戶聯絡人/);assert.match(withHandlers,/名片聯絡人管理/);assert.match(withHandlers,/操作教學/);
  assert.doesNotMatch(withHandlers,/會員名單|分群經營/);
});

test('profile counts distinguish real zero, missing and invalid data without invented business totals',()=>{
  const empty=renderMerchantProfile();assert.equal((empty.match(/class="mw-stat-empty"/g)||[]).length,3);assert.match(empty,/尚無資料/);
  const valid=renderMerchantProfile({shop:{name:'真實範例店',category:'餐飲',address:'台北市中山區'},stats:{productCount:0,monthlyRedemptionCount:12,monthlyRedemptionPoints:12345}});
  assert.match(valid,/data-merchant-stat="productCount"[^>]*>0<\/strong>/);assert.match(valid,/data-merchant-stat="monthlyRedemptionCount"[^>]*>12<small>筆<\/small>/);assert.match(valid,/data-merchant-stat="monthlyRedemptionPoints"[^>]*>1.2萬<small>點<\/small>/);assert.match(valid,/aria-label="本月折抵點數 12,345點"/);
  assert.match(valid,/餐飲｜台北市中山區/);assert.doesNotMatch(valid,/尚無資料/);
  const invalid=renderMerchantProfile({stats:{productCount:-1,monthlyRedemptionCount:'99',monthlyRedemptionPoints:NaN}});assert.equal((invalid.match(/class="mw-stat-empty"/g)||[]).length,3);
});

test('profile display escapes shop content and only loads a safe HTTPS image',()=>{
  const html=renderMerchantProfile({shop:{name:'<script>店</script>',category:'<svg>',address:'" onclick="x',image_url:'https://images.example.test/store.jpg?x="<tag>'}});
  assert.doesNotMatch(html,/<script>|<svg>店|onclick="x/);assert.match(html,/&lt;script&gt;/);assert.match(html,/&quot; onclick=&quot;x/);
  for(const image_url of ['javascript:alert(1)','http://images.example.test/store.png','https://name:secret@images.example.test/store.png'])assert.doesNotMatch(renderMerchantProfile({shop:{image_url}}),/<img /);
});

test('plan expiry never derives a date when the account has supplied none',()=>{
  for(const value of [null,undefined,'','not-a-date',false,'2027-02-30'])assert.equal(formatMerchantExpiry(value),'依合作方案');
  assert.equal(formatMerchantExpiry('2027-10-31'),'有效至 2027/10/31');
});

test('consumer presentation and existing exports remain available',()=>{
  const html=renderPointsHome();
  for(const action of ['wallet','tank-game','find','spending-history','online-orders','reward-units'])assert.ok(actions(html).includes(action));
  assert.match(html,/我的共用點數/);assert.match(html,/我的專屬 QR/);assert.match(html,/探索好店/);assert.doesNotMatch(html,/merchant-workbench|data-do="point-reward"|data-do="point-redeem"/);
  for(const exported of [pointIcon,merchantRole,renderRecommendedShops,readRewardUnits,renderRewardCards])assert.equal(typeof exported,'function');
});

test('merchant stylesheet stays scoped and preserves touch and keyboard interaction',()=>{
  const css=readFileSync(new URL('../css/store-merchant-workbench.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/(?:^|\})\s*(?:body|:root|button|header|section)\s*\{/m);
  assert.match(css,/\.merchant-workbench button\.mw-tile\{[^}]*min-height:44px/);
  assert.match(css,/:focus-visible/);assert.match(css,/\.merchant-workbench \[hidden\]/);
});
