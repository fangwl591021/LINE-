import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
function section(start,end){
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert.ok(from>=0&&to>from,`Source section remains available: ${start}`);
 return source.slice(from,to);
}
const productCode=section('    function product(', '    async function list(');
const viewCode=section('    async function view(', '    function input(');
const moreCode=section('    function moreButton(', "    let listCategory=");
const filterCode=section('    function filterProducts(', '    function addProductTags(');
const products=[
 {id:'tea',title:'茶葉',category:'食',purchase_mode:'online',price_cents:60000},
 {id:'glasses',title:'眼鏡',category:'服務',purchase_mode:'in_store',price_cents:880000}
];
const shop={id:'shop-test',name:'測試店',category:'服務',merchant_enabled:1};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

for(const standalone of [false,true])test(`single-store browsing omits category controls and renders every category (${standalone?'standalone':'embedded'})`,async()=>{
 const appended=[],gridClasses=[],apiCalls=[],filterCalls=[];
 const content={innerHTML:'',insertAdjacentHTML:(_,html)=>appended.push(html),querySelector(selector){
  assert.equal(selector,'.shop-grid');return {classList:{add:value=>gridClasses.push(value)}};
 }};
 const context={content,standalone,esc,photo:()=>'',policy:()=>'',statusText:()=>'',canTransact:()=>false,
  loginLink:id=>'https://example.test/index.html?shopSection=store&shopId='+id,
  alert:{textContent:''},pageKind:kind=>assert.equal(kind,'store'),
  api:async(...args)=>{apiCalls.push(args);return {shop,products,product_next:'next-page'};},
  addProductTags:()=>filterCalls.push('tags'),filterProducts:category=>filterCalls.push(category)};
 const api=vm.runInNewContext(`let epoch=0,viewedShop=null,viewedProducts=[];${productCode}${moreCode}${viewCode};({view,getState:()=>({viewedShop,viewedProducts})})`,context);
 // Even a stale caller that supplies the former category argument must show the entire store.
 await api.view(shop.id,'食');
 assert.deepEqual(apiCalls,[[`?shop=${shop.id}`]]);
 assert.deepEqual(filterCalls,[],'Public view must not create controls or apply a hidden category filter');
 for(const product of products){
  assert.ok(content.innerHTML.includes(`data-product-category="${product.category}"`));
  assert.ok(content.innerHTML.includes(`<span class="shop-category-badge">${product.category}</span>`));
  assert.ok(content.innerHTML.includes(`>${product.title}</button>`));
 }
 assert.doesNotMatch(content.innerHTML+appended.join(''),/data-scope="products"|shop-category-empty/);
 assert.ok(appended.some(html=>html.includes('data-do="more-products"')),'Public pagination stays available');
 assert.equal(appended.some(html=>html.includes('data-do="online-buy"')),!standalone);
 assert.deepEqual(gridClasses,['shop-browse-products']);
 assert.equal(api.getState().viewedProducts,products);
});

test('the view click action never forwards a directory category into a store',async()=>{
 const action=section("          case 'view':", "          case 'manage':");
 const calls=[];
 await vm.runInNewContext(`(async()=>{switch('view'){${action}}})()`,{
  button:{dataset:{id:shop.id},closest:()=>{throw Error('Directory context must not filter a store');}},
  content:{querySelector:()=>null},listCategory:'食',view:async(...args)=>calls.push(args)
 });
 assert.deepEqual(calls,[[shop.id]]);
});

test('directory filters, management filters, category dropdowns and badges remain',()=>{
 const directory=section('    async function list(', '    function filterProducts(');
 const manage=section('    function renderManage(', '    async function manage(');
 assert.ok(directory.includes("categoryTags('shops',category)"));
 assert.ok(directory.includes('listCategory=category'));
 assert.ok(manage.includes('addProductTags();'),'Management keeps its existing filter controls');
 assert.ok(source.includes("select('category','商品分類'"));
 assert.ok(source.includes("select('category','店面分類'"));
 assert.ok(productCode.includes('shop-category-badge'));
 assert.ok(source.includes("const categories = ['食','宿','遊','購','行','服務','製造'];"));
});

for(const privateView of [false,true])test(`load more keeps ${privateView?'management filtering':'all public product categories'}`,async()=>{
 const added=[{id:'new-food',category:'食'},{id:'new-service',category:'服務'}];
 const cards=products.map(p=>({dataset:{productCategory:p.category},hidden:false}));
 const target=[...products],apiCalls=[];
 const categoryButton={dataset:{category:'食'},setAttribute(){}};
 const button={dataset:{private:String(privateView),cursor:'next'},disabled:false,isConnected:true,outerHTML:''};
 const content={querySelector(selector){
  if(selector==='.shop-grid')return {insertAdjacentHTML(_position,html){
   for(const match of html.matchAll(/data-product-category="([^"]*)"/g))cards.push({dataset:{productCategory:match[1]},hidden:false});
  }};
  if(selector==='[data-scope="products"][aria-pressed="true"]')return privateView?categoryButton:null;
  if(selector==='.shop-category-empty')return null;
  throw Error(`Unexpected selector: ${selector}`);
 },querySelectorAll(selector){
  if(selector==='[data-product-category]')return cards;
  if(selector==='[data-scope="products"]')return privateView?[categoryButton]:[];
  throw Error(`Unexpected selector: ${selector}`);
 }};
 const context={content,esc,items:target,viewedProducts:target,viewedShop:shop,epoch:1,
  api:async(...args)=>{apiCalls.push(args);return {products:added,product_next:''};},
  product:p=>`<article data-product-category="${p.category}"></article>`,checkOnlineWarnings:async()=>{}};
 const load=vm.runInNewContext(`${filterCode}${moreCode};moreProducts`,context);
 await load(button);
 assert.equal(target.length,4);assert.equal(cards.length,4);
 for(const card of cards)assert.equal(card.hidden,privateView&&card.dataset.productCategory!=='食');
 assert.equal(button.outerHTML,'');assert.equal(button.disabled,false);
 assert.equal(apiCalls.length,1);
 assert.equal(apiCalls[0][0],privateView?'/manage?product_after=next':'?shop=shop-test&product_after=next');
 assert.equal(apiCalls[0][2],privateView);
});
