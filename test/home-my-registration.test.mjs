import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../js/modules/home.js',import.meta.url),'utf8');
const block=(start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a);return source.slice(a,b);
};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(){
  const calls=[],nodes=new Map();
  const element=()=>({innerHTML:'',children:[],className:'',classList:{contains:()=>false},prepend(child){this.children.unshift(child);nodes.set(child.id,child);},scrollIntoView(options){calls.push(['scroll',options.block]);}});
  const list=element(),parent=element(),records=element();
  list.parentElement=parent;parent.insertBefore=(child)=>{parent.children.unshift(child);nodes.set(child.id,child);};
  nodes.set('user-activities-list',list);nodes.set('activity-records-panel',records);
  const c={document:{getElementById:id=>nodes.get(id)||null,createElement:element},escapeHTML:esc,escapeJS:esc,
    renderHomeActivities:()=>calls.push(['render']),goPage:(page,skipLoad)=>{c.currentPage=page;calls.push(['page',page,skipLoad]);},
    loadMyActivities:()=>{calls.push(['load-records']);return Promise.resolve([]);},
    toggleMyActivitySection:(id,force)=>calls.push(['section',id,force]),
    openMemberEvents:view=>calls.push(['member-view',view]),showToast:(message,error)=>calls.push(['toast',message,error])};
  c.window=c;vm.createContext(c);
  vm.runInContext(block('window.homeActivityFilter =', 'window.renderHomeActivities ='),c);
  vm.runInContext("let homeActivitiesLoadState_='loading';"+block('function homeActivityLoadMarkup_(', 'window.loadUserActivities ='),c);
  return {c,calls,nodes,list,parent,records};
}

test('registration shortcut is leftmost before all and every category, including no categories',()=>{
  for(const types of [[],['活動'],['課程','聯誼','其他'],['<img onerror=evil>']]){
    const f=fixture();f.c.renderHomeActivityFilters_(types);
    const labels=[...f.nodes.get('home-activity-filters').innerHTML.matchAll(/>([^<]*)<\/button>/g)].map(m=>m[1]);
    assert.deepEqual(labels.slice(0,2),['我的報名','全部']);
    assert.equal(labels.filter(label=>label==='我的報名').length,1);
    assert.equal(labels.length,types.length+2);
    assert.doesNotMatch(f.nodes.get('home-activity-filters').innerHTML,/<img/);
    assert.deepEqual(f.calls,[],'rendering does not navigate or load private records');
  }
});

test('opening my registrations expands existing records and positions after one load without changing category',async()=>{
  const f=fixture();f.c.homeActivityFilter='課程';await f.c.openHomeMyRegistrations();
  assert.deepEqual(f.calls,[['page','my-activities',true],['load-records'],['section','activity-records-panel',true],['scroll','start'],['scroll','start']]);
  assert.equal(f.c.homeActivityFilter,'課程');
  assert.equal(f.records.children.length,1);
  assert.equal(f.records.children[0].type,'button');
  assert.equal(f.records.children[0].textContent,'查看會員活動／課程報名 ›');
  f.records.children[0].onclick();
  assert.deepEqual(f.calls.at(-1),['member-view','mine']);
});

test('repeat opening keeps one member registration link and uses the current module',async()=>{
  const f=fixture();await f.c.openHomeMyRegistrations();await f.c.openHomeMyRegistrations();
  assert.equal(f.records.children.length,1);
  f.c.openMemberEvents=view=>f.calls.push(['current-module',view]);
  f.records.children[0].onclick();assert.deepEqual(f.calls.at(-1),['current-module','mine']);
  f.c.openMemberEvents=undefined;f.records.children[0].onclick();
  assert.deepEqual(f.calls.at(-1),['toast','會員活動功能尚未載入，請重新整理後再試',true]);
});

test('missing records panel is safe and does not invent another route or write',async()=>{
  const f=fixture();f.nodes.delete('activity-records-panel');await f.c.openHomeMyRegistrations();
  assert.deepEqual(f.calls,[['page','my-activities',true],['load-records'],['section','activity-records-panel',true]]);
});

test('late records do not scroll another page or reopen a user-collapsed panel',async()=>{
  for(const leave of ['page','collapse']){
    const f=fixture();let finish;
    f.c.loadMyActivities=()=>new Promise(resolve=>{finish=resolve;});
    const opening=f.c.openHomeMyRegistrations();
    if(leave==='page')f.c.currentPage='home';
    else f.records.classList.contains=()=>true;
    finish([]);await opening;
    assert.equal(f.calls.filter(c=>c[0]==='scroll').length,1);
  }
});

test('loading and failed public lists still keep all and my registration shortcuts',()=>{
  for(const failed of [false,true]){
    const f=fixture();f.c.renderHomeActivityLoadState_(failed);
    assert.match(f.nodes.get('home-activity-filters').innerHTML,/^<button id="home-my-registrations-tab"[^>]*>我的報名<\/button><button[^>]*>全部<\/button>/);
    assert.match(f.nodes.get('home-activity-filters').innerHTML,/>我的報名<\/button>/);
    assert.match(f.list.innerHTML,failed?/活動載入失敗/:/活動載入中/);
  }
});

test('category filtering remains separate from the registration navigation action',()=>{
  const f=fixture();f.c.renderHomeActivityFilters_(['課程']);
  const markup=f.nodes.get('home-activity-filters').innerHTML;
  assert.match(markup,/id="home-my-registrations-tab"[^>]*onclick="window.openHomeMyRegistrations\(\)"/);
  assert.doesNotMatch(markup,/setHomeActivityFilter\('我的報名'\)/);
  f.c.setHomeActivityFilter('課程');assert.equal(f.c.homeActivityFilter,'課程');assert.deepEqual(f.calls,[['render']]);
});
