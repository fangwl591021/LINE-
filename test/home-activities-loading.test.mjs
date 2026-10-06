import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../js/modules/home.js',import.meta.url),'utf8');
const block=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fixture(fetchAPI){
  const calls=[],timers=new Map(),list={innerHTML:'',className:''},filter={remove(){calls.push('remove-filter');}};
  let token='test-token',network='test-network',next=0;
  const window={userRole:'user',currentUserProfile:{userId:'member-a'},liff:{isLoggedIn:()=>true,getAccessToken:()=>token},fetchAPI,
    renderHomeActivities(){calls.push('render');list.innerHTML=window.allActivities.length?'活動卡片':'目前暫無開放中的活動';},openActivityFromUrlParam(){calls.push('deep-link');}};
  const context=vm.createContext({window,document:{getElementById:id=>id==='user-activities-list'?list:filter},console,
    getActivityListNetwork_:()=>network,Promise,JSON,Date,
    setTimeout(fn,delay){const id=++next;timers.set(id,{fn,delay});return id;},clearTimeout(id){timers.delete(id);}});
  vm.runInContext(block('    function normalizeActivityList_(', '    function isTruthy_('),context);
  vm.runInContext(block('    let homeActivitiesRequest_;','    function recurringTaskTimeLabel_('),context);
  return {window,context,calls,timers,list,setToken:v=>token=v,setNetwork:v=>network=v};
}

test('all roles schedule activity at 100ms, skip idle gate and keep secondary work deferred',async()=>{
  for(const role of ['user','store','tenant','admin']){
    const f=fixture(async()=>[]);f.window.userRole=role;let loads=0,idle=0;
    f.window.loadUserActivities=async()=>{loads++;};f.window.requestIdleCallback=()=>{idle++;};
    vm.runInContext(block('    function getHomeLoadRole_(', '    window.loadHomeData ='),f.context);
    assert.equal(f.window.scheduleHomeDataLoadsByRole(),true);
    assert.equal(loads,0,'scheduling must not block landing');
    const activity=[...f.timers.values()].filter(x=>x.delay===100);assert.equal(activity.length,1);
    assert.ok([...f.timers.values()].some(x=>x.delay===3000));
    assert.ok(![...f.timers.values()].some(x=>x.delay===14000));
    activity[0].fn();await settle();assert.equal(loads,1);assert.equal(idle,0);
  }
});

test('success empty arrays stop immediately without admin/legacy fallbacks',async()=>{
  for(const result of [[],{data:[]},{activities:[]},{items:[]}]){
    const calls=[],f=fixture(async(action)=>{calls.push(action);return result;});
    await f.window.loadUserActivities();assert.deepEqual(calls,['getPublicActivities']);
    assert.match(f.list.innerHTML,/暫無/);assert.ok(f.calls.includes('render'));
  }
});

test('concurrent loads coalesce, show loading immediately and render after response',async()=>{
  let resolve,count=0;const response=new Promise(r=>resolve=r),f=fixture(async()=>{count++;return response;});
  const first=f.window.loadUserActivities(),second=f.window.loadUserActivities();
  assert.equal(count,1);assert.match(f.list.innerHTML,/載入中/);
  resolve([{activityId:'one'}]);await Promise.all([first,second]);
  assert.equal(f.window.allActivities[0].activityId,'one');assert.equal(f.calls.filter(x=>x==='render').length,1);
});

test('bounded legacy fallback only for malformed/error responses; failure is retryable, not empty success',async()=>{
  let fail=true;const calls=[],f=fixture(async(action)=>{calls.push(action);return fail?{success:false,error:'offline'}:[];});
  await f.window.loadUserActivities();assert.deepEqual(calls,['getPublicActivities','getAllActivities','getActivities']);
  assert.match(f.list.innerHTML,/載入失敗/);assert.match(f.list.innerHTML,/重新載入活動/);assert.ok(!f.calls.includes('render'));
  fail=false;await f.window.loadUserActivities();assert.equal(calls.length,4);assert.match(f.list.innerHTML,/暫無/);
  const authCalls=[],auth=fixture(async(action)=>{authCalls.push(action);return {success:false,authRelogin:true};});
  await auth.window.loadUserActivities();assert.deepEqual(authCalls,['getPublicActivities']);assert.match(auth.list.innerHTML,/載入失敗/);
});

test('old account/token/network/role responses cannot replace the current activity scope',async()=>{
  for(const change of [f=>f.window.currentUserProfile.userId='member-b',f=>f.setToken('new-token'),f=>f.setNetwork('other-network'),f=>f.window.userRole='admin']){
    const releases=[];let count=0;const f=fixture(()=>new Promise(resolve=>{count++;releases.push(resolve);}));
    const first=f.window.loadUserActivities();change(f);const second=f.window.loadUserActivities();assert.equal(count,2);
    releases[1]([{activityId:'current'}]);await second;releases[0]([{activityId:'old'}]);await first;
    assert.equal(f.window.allActivities[0].activityId,'current');assert.equal(f.calls.filter(x=>x==='render').length,1);
  }
});

test('identity changes without a replacement request still discard the late response',async()=>{
  let resolve;const f=fixture(()=>new Promise(r=>resolve=r)),pending=f.window.loadUserActivities();
  f.window.currentUserProfile.userId='member-b';resolve([{activityId:'old'}]);await pending;
  assert.equal(f.window.allActivities.length,0);assert.ok(!f.calls.includes('render'));
});

test('registration history keeps its prior fallback behavior when empty acceptance is not requested',async()=>{
  const calls=[],f=fixture(async action=>{calls.push(action);return action==='old'?[{rowId:'registration'}]:[];});
  const result=await vm.runInContext("fetchActivitiesByFallback_(['current','old'],{})",f.context);
  assert.equal(result[0].rowId,'registration');assert.deepEqual(calls,['current','old']);
});
