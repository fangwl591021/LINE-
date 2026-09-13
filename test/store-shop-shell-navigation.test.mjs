import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const navigation=fs.readFileSync(new URL('../js/navigation.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

function classList(initial=[]) {
  const values=new Set(initial);
  return {
    add(...names){names.forEach(name=>values.add(name));},
    remove(...names){names.forEach(name=>values.delete(name));},
    contains(name){return values.has(name);},
    toggle(name,force){const enabled=force===undefined?!values.has(name):force;if(enabled)values.add(name);else values.delete(name);return enabled;}
  };
}

function fixture(mode='user') {
  const ids=['page-home','page-inbox','page-store-shop','page-points-wallet','page-register','page-admin-settings','home-profile-card','bottom-nav','bottom-nav-admin','nav-btn-home','nav-btn-inbox','admin-nav-btn-inbox'];
  const nodes=new Map(ids.map(id=>[id,{id,classList:classList(id.startsWith('page-')?['hidden']:[])}]));
  const body={classList:classList(['unrelated-body-style'])};
  let apiCalls=0;
  const unexpectedRequest=()=>{apiCalls++;throw Error('Unexpected data access in shell navigation test');};
  const context={currentViewMode:mode,document:{body,getElementById:id=>nodes.get(id)||null,querySelectorAll(selector){
    if(selector==='[id^="page"]')return [...nodes.values()].filter(node=>node.id.startsWith('page'));
    if(selector==='.nav-btn')return [...nodes.values()].filter(node=>node.id.startsWith('nav-btn-')||node.id.startsWith('admin-nav-btn-'));
    throw Error('Unexpected selector: '+selector);
  }},fetch:unexpectedRequest,fetchAPI:unexpectedRequest,loadUserActivities:unexpectedRequest,loadInbox:unexpectedRequest,loadPointsWallet:unexpectedRequest};
  context.window=context;
  vm.runInNewContext(navigation,context,{filename:'js/navigation.js'});
  return {context,body,nodes,go:page=>context.goPage(page,true),apiCalls:()=>apiCalls};
}

test('shell CSS uses ordinary class selectors and keeps the shared header DOM',()=>{
  const style=html.match(/<style id="store-shop-shell-layout">([\s\S]*?)<\/style>/)?.[1];
  assert.ok(style);
  assert.equal(style.includes(':has('),false);
  for(const rule of ['body.store-shop-page #top-nav { display: none !important; }','body.store-shop-page #main { padding-top: 0 !important; }','body.store-shop-page #page-store-shop { margin-top: 0 !important; }'])assert.ok(style.includes(rule));
  assert.ok(html.includes('id="top-nav"'));
  assert.ok(html.includes('js/navigation.js?v=8.03'),'Load the navigation version with mall shell state');
});

test('actual router enters, leaves and reenters mall without data requests',()=>{
  const f=fixture();
  assert.equal(f.body.classList.contains('store-shop-page'),false);
  f.go('store-shop');
  assert.equal(f.context.currentPage,'store-shop');
  assert.equal(f.body.classList.contains('store-shop-page'),true);
  assert.equal(f.nodes.get('page-store-shop').classList.contains('hidden'),false);
  assert.equal(f.nodes.get('page-home').classList.contains('hidden'),true);
  assert.equal(f.nodes.get('home-profile-card').classList.contains('hidden'),true);
  f.go('inbox');
  assert.equal(f.context.previousPage,'store-shop');
  assert.equal(f.body.classList.contains('store-shop-page'),false);
  assert.equal(f.nodes.get('page-store-shop').classList.contains('hidden'),true);
  assert.equal(f.nodes.get('page-inbox').classList.contains('hidden'),false);
  f.go('store-shop');
  assert.equal(f.body.classList.contains('store-shop-page'),true);
  assert.equal(f.body.classList.contains('unrelated-body-style'),true);
  assert.equal(f.apiCalls(),0);
});

for(const mode of ['user','admin'])test(`leaving mall preserves ${mode} navigation mode`,()=>{
  const f=fixture(mode);f.go('store-shop');f.go('inbox');
  assert.equal(f.body.classList.contains('store-shop-page'),false);
  assert.equal(f.context.currentViewMode,mode);
  assert.equal(f.nodes.get('bottom-nav').classList.contains('hidden'),mode==='admin');
  assert.equal(f.nodes.get('bottom-nav-admin').classList.contains('hidden'),mode!=='admin');
  assert.equal(f.nodes.get('nav-btn-inbox').classList.contains('nav-active'),true);
  assert.equal(f.nodes.get('admin-nav-btn-inbox').classList.contains('nav-active'),true);
  assert.equal(f.apiCalls(),0);
});

for(const page of ['points-wallet','register'])test(`leaving mall for ${page} retains hidden original bottom navigation`,()=>{
  const f=fixture('admin');f.go('store-shop');f.go(page);
  assert.equal(f.body.classList.contains('store-shop-page'),false);
  assert.equal(f.nodes.get('bottom-nav').classList.contains('hidden'),true);
  assert.equal(f.nodes.get('bottom-nav-admin').classList.contains('hidden'),true);
  assert.equal(f.apiCalls(),0);
});

test('returning home preserves original banner state and user navigation',()=>{
  const f=fixture('admin');f.go('store-shop');f.go('home');
  assert.equal(f.body.classList.contains('store-shop-page'),false);
  assert.equal(f.body.classList.contains('home-page'),true);
  assert.equal(f.body.classList.contains('shared-front-banner-page'),true);
  assert.equal(f.nodes.get('home-profile-card').classList.contains('hidden'),false);
  assert.equal(f.nodes.get('bottom-nav').classList.contains('hidden'),false);
  assert.equal(f.nodes.get('bottom-nav-admin').classList.contains('hidden'),true);
  assert.equal(f.apiCalls(),0);
});

test('profile alias leaves mall and retains original shared-banner state',()=>{
  const f=fixture();f.go('store-shop');f.go('profile');
  assert.equal(f.context.currentPage,'admin-settings');
  assert.equal(f.body.classList.contains('store-shop-page'),false);
  assert.equal(f.body.classList.contains('shared-front-banner-page'),true);
  assert.equal(f.nodes.get('page-admin-settings').classList.contains('hidden'),false);
  assert.equal(f.apiCalls(),0);
});
