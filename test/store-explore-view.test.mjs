import test from 'node:test';
import assert from 'node:assert/strict';
import {renderExploreView,renderExploreCards} from '../js/modules/store-explore-view.js';

const shops=[{id:'shop-one',name:'合成餐飲店',category:'食',address:'合成地區一號',description:'依實際店家介紹顯示',image_url:''},{id:'shop-two',name:'合成服務店',category:'服務',address:'合成地區二號',description:'預約服務',image_url:''}];

test('explore view keeps real search values, supported categories and existing operation routes',()=>{
  const html=renderExploreView({shops,q:'板橋',category:'製造',next:'page-next',walletLabel:'9,970 點'});
  assert.match(html,/data-form="search"/);assert.match(html,/name="q"[^>]*value="板橋"/);assert.match(html,/name="category"[^>]*value="製造"/);
  for(const category of ['','食','服務','購','宿','遊','行','製造'])assert.ok(html.includes('data-category="'+category+'"'));
  assert.doesNotMatch(html,/data-category="健康|健康樂齡|附近好店|精選店家/);
  for(const action of ['wallet','spending-history','online-orders','region','view','next','explore-filter','explore-favorite'])assert.ok(html.includes('data-do="'+action+'"'),action);
  assert.match(html,/data-id="page-next" data-query="板橋" data-category="製造"/);
  assert.match(html,/data-explore-balance>9,970 點</);assert.match(html,/本頁 2 家/);
  assert.match(html,/本頁名稱 A–Z/);assert.doesNotMatch(html,/共 40|10%|20%|會員人數/);
});

test('shop data and form values cannot escape markup or image attributes',()=>{
  const unsafe='\"><img src=x onerror=alert(1)><script>bad()</script>&';
  const html=renderExploreView({shops:[{id:unsafe,name:unsafe,category:unsafe,address:unsafe,description:unsafe,image_url:'javascript:alert(1)'}],q:unsafe,category:unsafe,next:unsafe,walletLabel:unsafe});
  assert.doesNotMatch(html,/<script|<img src=x|onerror="|src="javascript:/);assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;&amp;/);
  assert.match(html,/data-id="&quot;&gt;&lt;img/);assert.match(html,/探索在地好店/);
  let photoCalls=0;renderExploreCards([{...shops[0],image_url:'https://user:secret@example.test/a.png'}],{photo:()=>{photoCalls++;return '<img>';}});
  assert.equal(photoCalls,0,'unsafe credential-bearing images never reach the supplied image renderer');
});

test('favorites are caller-owned state and unknown totals or redemption values are never invented',()=>{
  const original=JSON.stringify(shops),html=renderExploreView({shops,favoriteIds:['shop-two'],filter:'favorites',sort:'name'});
  assert.match(html,/本機收藏/);assert.match(html,/目前裝置/);assert.match(html,/data-id="shop-two" aria-pressed="true" aria-label="取消收藏合成服務店"/);
  assert.match(html,/data-id="shop-one" aria-pressed="false" aria-label="收藏合成餐飲店"/);
  assert.match(html,/value="name" selected/);assert.match(html,/依店家設定/);assert.doesNotMatch(html,/\d+%/);assert.equal(JSON.stringify(shops),original);
  assert.match(renderExploreView({shops,total:42}),/共 42 家/);assert.match(renderExploreView({shops,total:0}),/本頁 2 家/);
  assert.match(renderExploreView({shops:[]}),/登入查看/);assert.doesNotMatch(renderExploreView({shops:[]}),/data-explore-balance>0/);
});

test('card rendering uses only real supplied shops and complete safe images',()=>{
  const html=renderExploreCards([{...shops[0],image_url:'https://images.example.test/a.png'}]);
  assert.equal((html.match(/<article /g)||[]).length,1);assert.match(html,/src="https:\/\/images\.example\.test\/a\.png"/);assert.match(html,/loading="lazy"/);
  assert.match(html,/合成餐飲店/);assert.match(html,/合成地區一號/);assert.match(html,/依實際店家介紹顯示/);assert.match(html,/前往店家/);
  assert.equal(renderExploreCards([]),'');
});
