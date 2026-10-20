import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
test('top navigation highlights the current destination only and clears previous selection',()=>{
 const buttons=['list','discover','manage','admin-stores','online-orders'].map(action=>({dataset:{do:action},attributes:{},classList:{toggle(key,active){this[key]=active;}},setAttribute(key,value){this.attributes[key]=value;}}));
 const bottom=['points-home','find','mine'].map(action=>({dataset:{do:action},attributes:{},setAttribute(key,value){this.attributes[key]=value;}})),notice={},root={dataset:{},querySelector:()=>notice,querySelectorAll:selector=>selector.startsWith('.shop-bar')?buttons:bottom};
 let closed=0;const context={root,clearHomeWallet:()=>{closed++;}};
 const code=source.slice(source.indexOf('    function pageKind(kind)'),source.indexOf('    async function pointsHome('));
 vm.runInNewContext(code+';globalThis.choose=pageKind;',context);
 for(const [view,selected]of [['directory','list'],['discovery','discover'],['product',''],['manage','manage'],['home',''],['mine',''],['admin-stores','admin-stores'],['store',''],['directory','list']]){
  context.choose(view);assert.equal(root.dataset.shopView,view);assert.deepEqual(buttons.filter(b=>b.attributes['aria-current']==='page').map(b=>b.dataset.do),selected?[selected]:[]);for(const button of buttons)assert.equal(button.classList.primary,button.dataset.do===selected);
  const bottomSelected=['directory','store'].includes(view)?'find':view==='home'?'points-home':view==='mine'?'mine':'';
  assert.deepEqual(bottom.filter(b=>b.attributes['aria-current']==='page').map(b=>b.dataset.do),bottomSelected?[bottomSelected]:[],view+' bottom navigation');
 }assert.equal(closed,1);
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
 assert.match(find,/await list\(\)/);assert.match(find,/shop-discovery-tabs/);assert.doesNotMatch(find,/\.focus\(/);
});
test('legacy plain list and internal partner entry resolve only to the store directory',()=>{
 assert.match(source,/else if\(!standalone&&\['partners','list'\]\.includes\(section\)\)await list\(\)/);
 assert.match(source,/!\['cashier','partners','list'\]\.includes\(section\)/);
 assert.match(source,/section==='discovery'\)await discover\(\)/);assert.match(source,/section==='point-history'/);
 assert.match(source,/case 'manage': await manage\(\); break;/);assert.match(source,/api\('\/manage',null,true\)/);
});
test('settings remains an independent non-submit action with the existing role boundary',()=>{
 assert.match(source,/<button type="button" data-do="manage">商店設定<\/button>/);
 assert.doesNotMatch(source,/<button[^>]*data-do="manage"[^>]*class="primary">我的商城管理/);
 const gate=source.match(/const canManage=\(\)=>(.*);/)[1];
 for(const role of ['user','store','admin','tenant','reward','redeem','扣點用戶','unknown'])for(const standalone of [true,false]){
  assert.equal(vm.runInNewContext(gate,{window:{userRole:role},standalone}),!standalone&&['user','store','admin','redeem','扣點用戶'].includes(role));
 }
});
