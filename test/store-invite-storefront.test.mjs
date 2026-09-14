import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
const entry=readFileSync(new URL('../js/modules/store-shop-entry.js',import.meta.url),'utf8');
const routeSource=readFileSync(new URL('../js/modules/store-invite-route.js',import.meta.url),'utf8');
const shopId='11111111-1111-4111-8111-111111111111',productId='22222222-2222-4222-8222-222222222222';
const ref='U'+'a'.repeat(32),net='U'+'b'.repeat(32);
const attribution='&ref='+ref+'&net='+net+'&via=store-invite&code=must-not-copy&lineAccessToken=must-not-copy&redirect=https://evil.test/';
function node(){
 const classes=new Set(),children=new Map();
 const element={innerHTML:'',textContent:'',dataset:{},isConnected:true,appended:[],disabled:false,
  classList:{add:(...list)=>list.forEach(x=>classes.add(x)),remove:(...list)=>list.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);if(on)classes.add(x);else classes.delete(x);}},
  querySelector:selector=>{if(!children.has(selector))children.set(selector,node());return children.get(selector);},querySelectorAll:()=>[],
  insertAdjacentHTML(_position,html){this.appended.push(html);},appendChild(child){this.appended.push(child);},contains:target=>!!target,setAttribute(){},scrollIntoView(){},focus(){}};
 return element;
}
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function setup({standalone=true,section='',selected=shopId,products=true,status='active'}={}){
 const url=new URL(standalone?'https://store.example.test/LINE-/store-shop.html?shop='+selected+attribution:'https://store.example.test/LINE-/index.html?shopSection='+section+'&shopId='+selected+attribution);
 const root=node();root.dataset.worker='https://worker.example.test';const calls=[],redirects=[],copies=[],shares=[],timers=[],commerce=[];
 const shop={id:shopId,name:'Test store',status,merchant_enabled:1};
 const items=products?[{id:productId,shop_id:shopId,title:'Test product',purchase_mode:'online',status:'active',category:'食',price_cents:60000,redeem_type:'none'}]:[];
 const window={userRole:'user',currentPage:'store-shop',liff:{isLoggedIn:()=>!standalone,getAccessToken:()=>{throw Error('Public store must not request an auth token');}},Config:{WORKER_URL:'https://worker.example.test'},showInviteLink:async mode=>shares.push(mode)};
 const location={href:url.href,search:url.search,assign:href=>redirects.push(href)};
 window.location=location;
 window.__testLoadCommerce=async()=>({mountCommerce:async(host,options)=>commerce.push({host,options})});
 const fetch=async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({success:true,shop,products:items,product_next:'',product_count:items.length,product_limit:1})};};
 const document={getElementById:()=>null,createElement:node};
 const context={window,document,location,fetch,URL,URLSearchParams,AbortSignal,navigator:{clipboard:{writeText:async value=>copies.push(value)}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},console};
 vm.runInNewContext(routeSource,context);
 // Isolate only the lazy checkout module boundary; execute the actual storefront event routing.
 assert.ok(source.includes("await import('./store-commerce.js?v=4')"));
 vm.runInNewContext(source.replace("await import('./store-commerce.js?v=4')",'await window.__testLoadCommerce()'),context);
 const mount=(extraProduct='',extraQr='',extraMember='')=>window.StoreShop.mount(root,standalone,extraProduct,extraQr,extraMember,section,selected);
 const click=async(action,data={})=>{const button=node();button.dataset={do:action,...data};button.closest=()=>button;root.onclick({target:{closest:()=>button}});await flush();};
 return {window,context,root,content:root.querySelector('.shop-content'),alert:root.querySelector('[role=alert]'),calls,redirects,copies,shares,commerce,shop,mount,click};
}
function checkLogin(href){
 const url=new URL(href.replace(/&amp;/g,'&'));assert.equal(url.origin,'https://store.example.test');assert.equal(url.pathname,'/LINE-/index.html');assert.equal(url.searchParams.get('shopSection'),'store');assert.equal(url.searchParams.get('shopId'),shopId);
 assert.equal(url.searchParams.get('ref'),ref);assert.equal(url.searchParams.get('net'),net);assert.equal(url.searchParams.get('via'),'store-invite');
 for(const key of ['code','lineAccessToken','redirect','shopProduct','memberProduct','shopQr'])assert.equal(url.searchParams.has(key),false,key);
 return url;
}
for(const standalone of [true,false])test(`direct shop entry uses only a public catalog read (${standalone?'standalone':'authenticated shell'})`,async()=>{
 const s=setup({standalone,section:standalone?'':'store'});s.mount();await flush();
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].url,'https://worker.example.test/v1/store-shop?shop='+shopId);assert.equal(s.calls[0].options.method,'GET');assert.deepEqual({...s.calls[0].options.headers},{});assert.equal(s.calls[0].options.body,undefined);
 assert.match(s.content.innerHTML,/Test store/);assert.match(s.content.innerHTML,/Test product/);assert.doesNotMatch(s.content.innerHTML,/data-scope="products"/);assert.equal(s.shares.length,0);
});
test('explicit store mount cannot become product redemption or member QR issuing',async()=>{
 const s=setup({standalone:false,section:'store'});s.mount(productId,'test-token',productId);await flush();assert.equal(s.calls.length,1);assert.equal(s.calls[0].options.method,'GET');assert.equal(s.root.dataset.shopView,'store');assert.equal(s.redirects.length,0);
});
for(const standalone of [true,false])test(`invalid direct shop target is rejected without lookup (${standalone?'standalone':'shell'})`,async()=>{
 const s=setup({standalone,section:standalone?'':'store',selected:'https://evil.test/not-a-shop'});s.mount();await flush();assert.equal(s.calls.length,0);assert.match(s.alert.textContent,/商城連結格式不正確/);
});
test('standalone online entry, product details, member account and wallet retain shop context for login',async()=>{
 const s=setup();s.mount();await flush();
 const cta=s.content.appended.find(html=>typeof html==='string'&&html.includes('登入後線上選購'));checkLogin(cta.match(/href="([^"]+)"/)[1]);
 await s.click('detail',{id:productId});checkLogin(s.content.innerHTML.match(/href="([^"]+)"/)[1]);
 await s.click('mine');checkLogin(s.content.innerHTML.match(/href="([^"]+)"/)[1]);
 for(const action of ['wallet','registration','online-buy','online-orders']){await s.click(action,{id:shopId});checkLogin(s.redirects.at(-1));}
 assert.equal(s.calls.length,1,'Explicit login CTAs do not quote, create orders, query wallets or call AI');
});
test('copy public shop link forwards only referral attribution',async()=>{
 const s=setup();s.mount();await flush();await s.click('copy',{id:shopId});
 const url=new URL(s.copies[0]);assert.equal(url.pathname,'/LINE-/store-shop.html');assert.equal(url.searchParams.get('shop'),shopId);assert.deepEqual([...url.searchParams.keys()],['shop','ref','net','via']);assert.equal(s.calls.length,1);
});
test('cashier and member-product QR keep their original LIFF intent while forwarding referral attribution',async()=>{
 const s=setup();s.mount();await flush();await s.click('point-operation');await s.click('member-qr',{id:productId});
 const cashier=new URL(s.redirects[0]),member=new URL(s.redirects[1]);
 assert.equal(cashier.origin,'https://liff.line.me');assert.equal(cashier.searchParams.get('shopSection'),'cashier');assert.equal(member.searchParams.get('memberProduct'),productId);
 for(const url of [cashier,member]){assert.equal(url.searchParams.get('ref'),ref);assert.equal(url.searchParams.get('net'),net);assert.equal(url.searchParams.get('via'),'store-invite');assert.equal(url.searchParams.has('shopId'),false);assert.equal(url.searchParams.has('code'),false);assert.equal(url.searchParams.has('lineAccessToken'),false);}
 assert.equal(s.calls.length,1);
});
test('management exposes explicit share action only after shop is active, without creating a shop',async()=>{
 for(const status of ['active','draft']){
  const s=setup({standalone:false,section:'manage',products:false,status});s.window.liff.getAccessToken=()=> 'test-only';s.mount();await flush();
  const button=s.content.appended.find(html=>typeof html==='string'&&html.includes('data-do="share-store"'));assert.ok(button);assert.equal(button.includes('disabled'),status==='draft');
  await s.click('share-store');assert.deepEqual(s.shares,status==='active'?['store']:[]);assert.equal(s.calls.length,1);assert.equal(s.calls[0].options.method,'GET');assert.match(s.calls[0].url,/\/manage$/);
 }
});
test('entry adapter validates and preserves shop id across the existing lazy-load retry',async()=>{
 const root=node(),calls=[];let fail=true;
 const window={location:{href:'https://store.example.test/LINE-/index.html',search:''},goPage:page=>window.currentPage=page,StoreShop:{mount(...args){calls.push(args);if(fail){fail=false;throw Error('test-only retry');}}}};
 const context={window,location:window.location,document:{getElementById:()=>root,createElement:node},URL,URLSearchParams,setTimeout,clearTimeout,console};
 vm.runInNewContext(routeSource,context);vm.runInNewContext(entry,context);
 await window.openStoreShop('','','','store',shopId);assert.equal(calls.length,1);assert.equal(calls[0][6],shopId);assert.equal(calls[0][5],'store');
 await root.appended[0].onclick();assert.equal(calls.length,2);assert.equal(calls[1][6],shopId);
 await window.openStoreShop('','','','store','not-a-uuid');assert.equal(calls.length,2);assert.match(root.querySelector('p').textContent,/商城連結格式不正確/);
});
test('login target reopens the invited shop and explicit online CTA mounts checkout for that same shop',async()=>{
 const publicView=setup();publicView.mount();await flush();
 const cta=publicView.content.appended.find(html=>typeof html==='string'&&html.includes('登入後線上選購'));
 const target=checkLogin(cta.match(/href="([^"]+)"/)[1]);
 const authenticated=setup({standalone:false,section:'store',selected:publicView.window.StoreInviteRoute.readTarget(target.searchParams)});
 authenticated.mount();await flush();
 assert.equal(authenticated.calls.length,1);assert.equal(authenticated.calls[0].url,'https://worker.example.test/v1/store-shop?shop='+shopId);assert.equal(authenticated.commerce.length,0,'No checkout on login');
 const buyButton=authenticated.content.appended.find(html=>typeof html==='string'&&html.includes('data-do="online-buy"'));
 const selected=buyButton.match(/data-id="([^"]+)"/)[1];assert.equal(selected,shopId);
 await authenticated.click('online-buy',{id:selected});assert.equal(authenticated.commerce.length,1);
 const mounted=authenticated.commerce[0];assert.equal(mounted.host,authenticated.content);assert.equal(mounted.options.mode,'checkout');assert.equal(mounted.options.shop,authenticated.shop);assert.equal(mounted.options.shop.id,shopId);assert.equal(mounted.options.products[0].shop_id,shopId);assert.equal(mounted.options.isCurrent(),true);
 assert.equal(authenticated.calls.length,1,'Selecting the known storefront does not look up a different store or issue an order/AI request');assert.equal(authenticated.redirects.length,0);
});
