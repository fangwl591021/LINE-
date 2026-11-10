import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
test('top navigation highlights the current destination only and clears previous selection',()=>{
 const buttons=['list','discover','manage','admin-stores','online-orders'].map(action=>({dataset:{do:action},attributes:{},classList:{toggle(key,active){this[key]=active;}},setAttribute(key,value){this.attributes[key]=value;}}));
 const bottom=['points-home','find','mine'].map(action=>({dataset:{do:action},attributes:{},setAttribute(key,value){this.attributes[key]=value;}})),notice={},root={dataset:{},classList:{toggle(key,active){this[key]=active;}},querySelector:()=>notice,querySelectorAll:selector=>selector.startsWith('.shop-bar')?buttons:bottom};
 let closed=0,navigationResets=0;const context={root,merchantView:false,setReferenceNavigation:()=>{navigationResets++;},clearHomeWallet:()=>{closed++;}};
 const code=source.slice(source.indexOf('    function pageKind(kind)'),source.indexOf('    async function pointsHome('));
 vm.runInNewContext(code+';globalThis.choose=pageKind;',context);
 for(const [view,selected]of [['directory','list'],['discovery','discover'],['product',''],['manage','manage'],['home',''],['mine',''],['admin-stores','admin-stores'],['store',''],['directory','list']]){
  context.choose(view);assert.equal(root.dataset.shopView,view);assert.equal(root.classList['shop-reference-mode'],view==='directory');assert.deepEqual(buttons.filter(b=>b.attributes['aria-current']==='page').map(b=>b.dataset.do),selected?[selected]:[]);for(const button of buttons)assert.equal(button.classList.primary,button.dataset.do===selected);
  const bottomSelected=['directory','store'].includes(view)?'find':view==='home'?'points-home':view==='mine'?'mine':'';
  assert.deepEqual(bottom.filter(b=>b.attributes['aria-current']==='page').map(b=>b.dataset.do),bottomSelected?[bottomSelected]:[],view+' bottom navigation');
 }assert.equal(closed,1);assert.equal(navigationResets,9);
 context.merchantView=true;context.choose('home');assert.equal(root.classList['shop-reference-mode'],true,'merchant home uses the reference shell');
 context.merchantView=false;context.choose('home');assert.equal(root.classList['shop-reference-mode'],false,'other home layouts do not inherit the merchant shell');
});

test('visible discovery navigation offers settings only with the existing management gate',()=>{
 const code=source.slice(source.indexOf('    function discoveryTabs('),source.indexOf('    function discoveryForm('));
 for(const allowed of [false,true])for(const products of [false,true]){
  const html=vm.runInNewContext(code+';discoveryTabs('+products+')',{canManage:()=>allowed});
  assert.equal(/data-do="manage"/.test(html),allowed);
  assert.match(html,new RegExp('data-do="discover" aria-pressed="'+products+'"'));
  assert.match(html,new RegExp('data-do="list" aria-pressed="'+!products+'"'));
  if(allowed)assert.match(html,/<button type="button" data-do="manage"[^>]*>商店設定<\/button>/);
 }
 const find=source.slice(source.indexOf("case 'find':"),source.indexOf("case 'region':",source.indexOf("case 'find':")));
 assert.match(find,/await list\(\)/);assert.match(find,/shop-explore-hero/);assert.doesNotMatch(find,/\.focus\(/);
});
test('legacy plain list and internal partner entry resolve only to the store directory',()=>{
 assert.match(source,/else if\(!standalone&&\['partners','list'\]\.includes\(section\)\)await list\('',\s*'',\s*categories\.includes\(initialCategory\)/);
 assert.match(source,/!\['cashier','partners','list'\]\.includes\(section\)/);
 assert.match(source,/section==='discovery'\)await discover\(\)/);assert.match(source,/section==='point-history'/);
 assert.match(source,/case 'manage': await manage\(\); break;/);assert.match(source,/api\('\/manage',null,true\)/);
});
test('settings remains an independent non-submit action with the existing role boundary',()=>{
 assert.match(source,/<button type="button" data-do="manage">商店設定<\/button>/);
 assert.doesNotMatch(source,/<button[^>]*data-do="manage"[^>]*class="primary">我的商城管理/);
 const gate=source.match(/const canManage=\(\)=>(.*);/)[1];
 for(const role of ['user','store','店長','admin','總管','tenant','租戶','reward','贈點用戶','redeem','扣點用戶','unknown'])for(const standalone of [true,false])for(const eligible of [true,false,undefined,'true']){
  const window={userRole:role,currentUser:{userId:'owner',retailSellerEligible:eligible},currentUserProfile:{userId:'owner'}};
  assert.equal(vm.runInNewContext(gate,{window,standalone}),!standalone&&eligible===true&&['store','店長','admin','總管','redeem','扣點用戶'].includes(role));
 }
});

test('normalized tenant, missing capability and mismatched profile cannot open seller controls',async()=>{
 const gate=source.match(/const canManage=\(\)=>(.*);/)[1];
 for(const window of [
  {userRole:'store',currentUser:{userId:'owner',retailSellerEligible:false},currentUserProfile:{userId:'owner'}},
  {userRole:'store',currentUser:{userId:'owner'},currentUserProfile:{userId:'owner'}},
  {userRole:'store',currentUser:{userId:'old-owner',retailSellerEligible:true},currentUserProfile:{userId:'new-owner'}},
  {userRole:'store',currentUser:{retailSellerEligible:true},currentUserProfile:{}},
  {userRole:'store',currentUserProfile:{userId:'owner'}}
 ])assert.equal(vm.runInNewContext(gate,{window,standalone:false}),false);
 const manage=source.slice(source.indexOf('    async function manage()'),source.indexOf('    function edit('));
 for(const allowed of [false,true]){
  const calls=[],context={canManage:()=>allowed,pageKind(){calls.push('page');},epoch:0,alert:{},content:{innerHTML:''},window:{currentUserProfile:{userId:'owner'},liff:{getAccessToken:()=> 'token'},userRole:'store'},cardImportAdminOwner:null,canAdmin:()=>false,api:async()=>{calls.push('api');return {};},root:{isConnected:true},setManagement(){},renderManage(){}};
  if(!allowed)await assert.rejects(vm.runInNewContext(manage+';manage()',context),/加入會員不會自動取得上架資格/);
  else await vm.runInNewContext(manage+';manage()',context);
  assert.deepEqual(calls,allowed?['page','api']:[]);
 }
 assert.match(source,/加入會員不會自動取得上架資格/);
});
