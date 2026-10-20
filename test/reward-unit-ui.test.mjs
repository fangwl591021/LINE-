import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPointsHome} from '../js/modules/store-points-home.js';
import {renderRewardCards,renderRewardDetail,readRewardUnits} from '../js/modules/reward-units.js';
test('reward title gets a scoped full-width green bar without styling other sections',()=>{
  const css=readFileSync(new URL('../css/store-shop.css',import.meta.url),'utf8');
  const rule=css.match(/\.shop-points-theme \.points-reward-units>\.points-section-title\{([^}]+)\}/)?.[1];
  assert.ok(rule);assert.match(rule,/background:#e2f5ec/);assert.match(rule,/border:1px solid #b4dfcb/);assert.match(rule,/border-radius:12px/);assert.match(rule,/padding:16px/);
  assert.match(css,/\.shop-points-theme \.points-reward-units\{grid-column:1\/-1;min-width:0\}/);
});
test('all point home roles place separate three-card reward strip before shop discovery',()=>{
  for(const options of [{},{standalone:true},{merchant:true},{merchant:true,rewardOnly:true},{merchant:true,redeemOnly:true}]){const html=renderPointsHome(options);assert.ok(html.indexOf('aria-label="贈點單位"')<html.indexOf('探索好店'));assert.match(html,/data-do="reward-units"/);assert.match(html,/data-home-reward-units/);assert.match(html,/data-home-shops/);}
  const html=renderRewardCards(Array.from({length:7},(_,n)=>({id:String(n),name:'單位'+n,reward_terms:'條件'})),{home:true});assert.equal((html.match(/<article/g)||[]).length,3);
});
test('unit projection escapes all text; unsafe external links never become active HTML',()=>{
  const u={id:'" onclick="x',name:'<script>x</script>',description:'<img src=x onerror=x>',image_url:'javascript:alert(1)',phone:'" onclick="x',address:'<PRIVATE>',website_url:'https://x:y@example.com',reward_terms:'<h1>條件</h1>'};
  for(const html of [renderRewardCards([u]),renderRewardCards([u],{home:true}),renderRewardDetail(u)]){assert.doesNotMatch(html,/<script>|onclick="x|href="javascript|src="javascript|https:\/\/x:y@/);assert.match(html,/&lt;script&gt;/);}
  assert.match(renderRewardDetail({name:'單位',phone:'02-2345-6789',address:'新北市'}),/href="tel:0223456789"/);assert.match(renderRewardDetail({name:'單位'}),/尚未提供/);
});
test('public reads use no authorization, private actor, wallet, QR or transaction API',async()=>{
  let seen;await readRewardUnits('https://app.test/',{q:'台北'},async(url,options)=>{seen={url,options};return Response.json({success:true,units:[],next:''});});assert.equal(seen.url,'https://app.test/v1/reward-units?q=%E5%8F%B0%E5%8C%97');assert.equal(seen.options.cache,'no-store');assert.equal(seen.options.headers,undefined);
  await assert.rejects(readRewardUnits('https://app.test',{},async()=>Response.json({success:false,error:'暫時失敗'},{status:503})),/暫時失敗/);
  const mall=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');assert.match(mall,/void home\.readRewardUnits\(base\)/);assert.match(mall,/version===epoch&&root.isConnected/);
  const editor=readFileSync(new URL('../js/modules/reward-unit-editor.js',import.meta.url),'utf8');assert.doesNotMatch(editor,/updateUserRole|rewardMoney|gift_money|saveCard/);assert.match(editor,/confirmed_public/);assert.match(editor,/getAccessToken\(\)===token/);
});
