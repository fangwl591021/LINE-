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

test('activity deep link opens only after existing manager verification',async()=>{
  const f=setup();f.context.location.search='?tab=activities';await f.run();
  assert.ok(f.calls.includes('tab:activities'));assert.ok(!f.calls.includes('tab:users'));
  const denied=setup({role:'user'});denied.context.location.search='?tab=activities';await denied.run();
  assert.ok(!denied.calls.includes('tab:activities'));
});
test('direct chat dashboard entry is exposed only after existing administrator verification',async()=>{
  const admin=setup({role:'admin',hardAdmin:true});admin.context.location.search='?tab=checkin-chat-dashboard';await admin.run();
  assert.ok(admin.calls.includes('tab:checkin-chat-dashboard'));
  assert.equal(admin.node('nav-checkin-chat-dashboard').classList.contains('hidden'),false);
  const store=setup({role:'store'});store.context.location.search='?tab=checkin-chat-dashboard';await store.run();
  assert.ok(!store.calls.includes('tab:checkin-chat-dashboard'));assert.ok(store.calls.includes('tab:users'));
  assert.equal(store.node('nav-checkin-chat-dashboard').classList.contains('hidden'),true);
  const user=setup({role:'user'});user.context.location.search='?tab=checkin-chat-dashboard';await user.run();
  assert.ok(!user.calls.includes('tab:checkin-chat-dashboard'));
});

test('policy, bonus report and remittance tabs require verified administrator entry',async()=>{
  for(const tab of ['bonus','bonus-report','commission-ledger']){
    const admin=setup({role:'admin',hardAdmin:true});admin.context.location.search='?tab='+tab;await admin.run();
    assert.ok(admin.calls.includes('tab:'+tab));
    const store=setup({role:'store'});store.context.location.search='?tab='+tab;await store.run();
    assert.ok(!store.calls.includes('tab:'+tab));assert.ok(store.calls.includes('tab:users'));
    const guest=setup({role:'user'});guest.context.location.search='?tab='+tab;await guest.run();
    assert.ok(!guest.calls.includes('tab:'+tab));
  }
  const unknown=setup({role:'admin',hardAdmin:true});unknown.context.location.search='?tab=other';await unknown.run();
  assert.ok(unknown.calls.includes('tab:users'));assert.ok(!unknown.calls.includes('tab:other'));
});

test('login handoff preserves only approved admin destination tabs',()=>{
  const entry=html.slice(html.indexOf('    function getAdminLiffEntryUrl()'),html.indexOf('    function isHardAdminAccount('));
  const context={URLSearchParams,encodeURIComponent,LIFF_ID:'123-test',location:{search:''},Date};
  vm.createContext(context);vm.runInContext(entry,context);
  for(const tab of ['checkin-chat-dashboard','bonus','bonus-report','commission-ledger']){
    context.location.search='?tab='+tab;const url=new URL(context.getAdminLiffEntryUrl());
    assert.equal(url.searchParams.get('tab'),tab);assert.equal(url.searchParams.get('adminPage'),'1');
  }
  context.location.search='?tab=untrusted';assert.equal(new URL(context.getAdminLiffEntryUrl()).searchParams.has('tab'),false);
  const source=readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
  const start=source.indexOf("    if (urlParams.get('admin') === '1' || urlParams.get('adminPage') === '1') {");
  const end=source.indexOf("    const shareCardId =",start);assert.ok(start>=0&&end>start);
  const redirect=source.slice(start,end);let destination='';
  const handoff={URLSearchParams,String,Date,window:{location:{replace:value=>{destination=value}}}};
  for(const tab of ['bonus','bonus-report','commission-ledger','untrusted']){
    destination='';handoff.urlParams=new URLSearchParams({adminPage:'1',tab});
    vm.runInNewContext(`(function(){${redirect}})()`,handoff);
    const url=new URL(destination,'https://example.test/');
    assert.equal(url.pathname,'/admin.html');assert.equal(url.searchParams.get('tab'),tab==='untrusted'?null:tab);
  }
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
