import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const auth=html.slice(html.indexOf('    async function withAdminDeadline('),html.indexOf('    document.addEventListener("DOMContentLoaded", initAdmin)'));
const tick=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
function setup({hang='',role='store',checkResult,loggedIn=true,hardAdmin=false}={}){
  const nodes=new Map(),timers=new Map(),calls=[];let seq=0,release;
  const node=id=>{
    if(!nodes.has(id)){const classes=new Set(id==='error-actions'?['hidden']:[]);nodes.set(id,{innerText:'',innerHTML:'',src:'',remove(){this.removed=true;},classList:{add(...items){items.forEach(x=>classes.add(x));},remove(...items){items.forEach(x=>classes.delete(x));},toggle(x,on){on?classes.add(x):classes.delete(x);},contains:x=>classes.has(x)},addEventListener(type,handler){this[type]=handler;}});}
    return nodes.get(id);
  };
  const delayed=()=>new Promise(resolve=>{release=resolve;});
  const context={Promise,Error,URLSearchParams,LIFF_ID:'unchanged',adminProfile:null,adminRole:null,adminNetworkId:null,
    document:{getElementById:node},location:{hash:'',search:''},
    setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    liff:{init:()=>hang==='init'?delayed():Promise.resolve(),getProfile:()=>hang==='profile'?delayed():Promise.resolve({userId:'synthetic',displayName:'Test'}),isLoggedIn:()=>loggedIn,isInClient:()=>false},
    fetchAPI:async(action)=>{calls.push(action);return hang==='check'?delayed():checkResult===undefined?{info:{role}}:checkResult;},
    isHardAdminAccount:()=>hardAdmin,loadSavedAdminCrmFilters(){},applyAdminCrmFilterControls(){},
    switchTab:tab=>calls.push('tab:'+tab),openLineOAMonitorTool:()=>calls.push('monitor'),getAdminLiffEntryUrl:()=>'/synthetic-login'};
  context.window={liff:context.liff,location:{replace:url=>calls.push(url)}};
  if(hang==='sdk')delete context.window.liff;
  vm.createContext(context);vm.runInContext(auth,context);
  return {context,node,timers,calls,run:()=>context.initAdmin(),release:()=>release?.({userId:'synthetic',displayName:'Late',info:{role}}),timeout(){const entry=[...timers.values()].find(t=>t.ms===15000);assert.ok(entry);entry.fn();}};
}
test('admin stages bound SDK, init, profile and permission waits; late results never open admin',async()=>{
  for(const hang of ['sdk','init','profile','check']){
    const f=setup({hang}),pending=f.run();await tick();
    assert.equal(f.node('loading-screen').classList.contains('fade-out'),false);
    f.timeout();await pending;
    assert.match(f.node('loading-text').innerText,/逾時/);
    assert.equal(f.node('error-actions').classList.contains('hidden'),false);
    f.release();await tick();
    assert.equal(f.node('loading-screen').classList.contains('fade-out'),false);
    assert.ok(!f.calls.includes('tab:users'));
  }
});
test('only existing verified store/admin authority can reveal CRM; null checks are retryable errors',async()=>{
  const allowed=setup();await allowed.run();assert.ok(allowed.calls.includes('checkUser'));assert.ok(allowed.calls.includes('tab:users'));
  assert.equal(allowed.node('loading-screen').classList.contains('fade-out'),true);
  const admin=setup({role:'admin',hardAdmin:true});await admin.run();assert.ok(admin.calls.includes('tab:users'));
  for(const role of ['user','reward','redeem']){
    const f=setup({role});await f.run();assert.equal(f.node('loading-screen').classList.contains('fade-out'),false);
    assert.match(f.node('loading-text').innerHTML,/權限不足/);
  }
  const failed=setup({checkResult:null});await failed.run();assert.match(failed.node('loading-text').innerText,/無法確認管理權限/);
  assert.equal(failed.node('loading-screen').classList.contains('fade-out'),false);
});
test('external unauthenticated entry preserves existing LIFF redirect',async()=>{
  const f=setup({loggedIn:false});await f.run();assert.deepEqual(f.calls,['/synthetic-login']);
});
test('SDK can finish loading asynchronously; no dependency on synchronous script execution',async()=>{
  const f=setup({hang:'sdk'}),pending=f.run();await tick();
  f.context.window.liff=f.context.liff;f.node('admin-liff-sdk').load();await pending;
  assert.ok(f.calls.includes('tab:users'));
  assert.match(html,/<script id="admin-liff-sdk" async src=/);
});
test('CRM load reads three existing sources and renders bound cards without registration writes',async()=>{
  const source=html.slice(html.indexOf('    async function loadUsers()'),html.indexOf('    function hasAnnualFeeActive('));
  const calls=[],rendered=[];
  const context={document:{getElementById:()=>({innerHTML:''})},allCardsData:[],allBonusOrdersData:[],allUsersData:[],userPage:1,
    fetchAPI:async action=>{calls.push(action);return action==='getAllUsers'?[{userId:'one'}]:action==='getCardContacts'?[{userId:'two'}]:[];},
    normalizeApiList:v=>v,normalizeBonusOrder:v=>v,populateCardTenantFilter(){},loadSavedAdminCrmFilters(){},applyAdminCrmFilterControls(){},
    mergeUsersWithBoundCards:(users,cards)=>[...users,...cards],renderUsersTable:rows=>rendered.push(rows),
    registerBoundCardUsers(){throw Error('Unexpected registration');},showToast(){}};
  vm.createContext(context);vm.runInContext(source,context);await context.loadUsers();
  assert.deepEqual(calls,['getAllUsers','getCardContacts','mlmListOrders']);assert.equal(rendered[0].length,2);
  assert.match(html,/onclick="syncBoundCardsToUsers\(\)"/);
});
test('mobile layout wraps header and collapses sidebar without changing desktop saved preference',()=>{
  assert.match(html,/@media \(max-width: 1024px\)/);
  assert.match(html,/\.crm-hero-header \{ flex-wrap: wrap; \}/);
  assert.match(html,/window\.matchMedia\('\(max-width: 1024px\)'\)\.matches \|\| localStorage\.getItem/);
  assert.match(html,/navBtn\.getAttribute\('aria-label'\)/);
  assert.match(html,/onclick="window\.location\.reload\(\);"[^>]*>重新嘗試/);
});
