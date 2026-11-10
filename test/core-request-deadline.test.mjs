import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/core.js',import.meta.url),'utf8');
const start=source.indexOf('    window.fetchAPI = async function('),end=source.indexOf('    // 強效配對機制',start);
assert.ok(start>=0&&end>start);
const flush=async()=>{for(let n=0;n<8;n++)await Promise.resolve();};
function fixture(fetcher,{authFailure=()=>false,offline=false}={}){
  const timers=new Map(),cleared=[],requests=[],toasts=[];
  let sequence=0;
  const window={currentUserProfile:{userId:'synthetic-owner'},currentNetworkId:'synthetic-network',userRole:'user',showToast:(...args)=>toasts.push(args),handleActmasterAuthTokenError:authFailure};
  const liff={isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-token'};
  vm.runInNewContext(source.slice(start,end),{window,liff,Config:{WORKER_URL:'https://worker.invalid'},navigator:{onLine:!offline},AbortController,
    localStorage:{getItem:()=>null},console:{warn(){}},
    setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,ms});return id;},
    clearTimeout(id){cleared.push(id);timers.delete(id);},
    fetch:async(...args)=>{requests.push(args);return fetcher(...args);}
  });
  const expire=()=>{assert.equal(timers.size,1,'exactly one request deadline');const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();return timer.ms;};
  return {call:window.fetchAPI,timers,cleared,requests,toasts,expire};
}
const json=(value,extra={})=>({ok:true,status:200,json:async()=>value,...extra});
function untilAbort(signal){return new Promise((_,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});}

test('normal requests preserve authentication and clear their timer only after the JSON body completes',async()=>{
  let completeBody;
  const f=fixture(async()=>json(null,{json:()=>new Promise(resolve=>{completeBody=resolve;})}));
  const pending=f.call('checkUser',{userId:'explicit-owner'},true);await flush();
  assert.equal(f.timers.size,1,'receiving headers does not cancel the body deadline');assert.equal(f.timers.values().next().value.ms,10000);
  const payload=JSON.parse(f.requests[0][1].body);assert.equal(payload.payload.userId,'explicit-owner');assert.equal(payload.payload.lineAccessToken,'synthetic-token');
  completeBody({success:true,data:{isRegistered:true}});const result=await pending;
  assert.equal(result.isRegistered,true);assert.equal(f.timers.size,0);assert.equal(f.cleared.length,1);assert.equal(f.requests.length,1);assert.equal(f.toasts.length,0);
});

test('slow response headers time out once without retrying a write',async()=>{
  const f=fixture(async(_url,{signal})=>untilAbort(signal));
  const pending=f.call('updateUserProfile',{name:'合成資料'});await flush();
  assert.equal(f.expire(),18000);const result=await pending;
  assert.equal(result.success,false);assert.match(result.error,/系統連線逾時/);assert.equal(f.requests.length,1);assert.equal(f.cleared.length,1);assert.equal(f.timers.size,0);
  assert.equal(f.toasts.length,1);
});

test('headers-first stalled bodies retain the deadline and AbortError timeout message',async()=>{
  const f=fixture(async(_url,{signal})=>json(null,{json:()=>untilAbort(signal)}));
  const pending=f.call('checkUser',{},true);await flush();
  assert.equal(f.expire(),10000);const result=await pending;
  assert.equal(result.success,false);assert.match(result.error,/系統連線逾時/);assert.doesNotMatch(result.error,/回應格式/);
  assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);assert.equal(f.cleared.length,1);assert.equal(f.toasts.length,0);
});

test('malformed JSON, HTTP errors, API errors and network errors preserve their messages and clean timers',async()=>{
  for(const [fetcher,message]of [
    [async()=>json(null,{json:async()=>{throw new SyntaxError('synthetic invalid JSON');}}),/伺服器回應格式異常/],
    [async()=>json({error:'合成 HTTP 錯誤'},{ok:false,status:503}),/合成 HTTP 錯誤/],
    [async()=>json({success:false,error:'合成業務拒絕'}),/合成業務拒絕/],
    [async()=>{throw new Error('Failed to fetch');},/無法連線到伺服器/]
  ]){
    const f=fixture(fetcher),result=await f.call('getSubsiteHome',{},true);
    assert.equal(result.success,false);assert.match(result.error,message);assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);assert.equal(f.cleared.length,1);
  }
});

test('authentication failures keep the existing relogin outcome and never leave a live timer',async()=>{
  const f=fixture(async()=>json({success:false,error:'synthetic expired token'}),{authFailure:message=>message==='synthetic expired token'});
  const result=await f.call('checkUser');
  assert.equal(result.success,false);assert.equal(result.authRelogin,true);assert.equal(result.error,'synthetic expired token');
  assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);assert.equal(f.cleared.length,1);assert.equal(f.toasts.length,0);
});

test('offline rejection starts no request or deadline and successful writes are sent exactly once',async()=>{
  const offline=fixture(async()=>{throw Error('must not send');},{offline:true});
  assert.match((await offline.call('checkUser',{},true)).error,/沒有網路/);assert.equal(offline.requests.length,0);assert.equal(offline.timers.size,0);assert.equal(offline.cleared.length,0);
  const f=fixture(async()=>json({success:true,data:{saved:true}}));
  assert.equal((await f.call('updateUserProfile',{},true)).saved,true);assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);assert.equal(f.cleared.length,1);
});
