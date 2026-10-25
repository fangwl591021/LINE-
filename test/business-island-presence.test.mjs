import test from 'node:test';
import assert from 'node:assert/strict';
import {createIslandPresence} from '../js/modules/business-island-presence.mjs';

const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({count=1,request}={}){
  let time=0,owned=true,shown=true,alive=true,id=0;
  const timers=new Map(),listeners=new Map(),calls=[],updates=[],states=[];
  const doc={hidden:false,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:(type)=>listeners.delete(type)};
  const members=Array.from({length:count},(_,n)=>({handle:'public-'+n}));
  const client={current:()=>alive,request:async(path,body)=>{
    calls.push({path,body});
    if(request)return request(path,body);
    if(body)return {heartbeat:true,retryAfterSeconds:60};
    const handles=JSON.parse(new URL('https://fixture.test'+path).searchParams.get('handles'));
    return {presenceAvailable:true,items:handles.map(handle=>({handle,online:true,onlineKnown:true}))};
  }};
  const view={setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:key=>timers.delete(key)};
  const pulse=createIslandPresence({client,doc,view,now:()=>time,getMembers:()=>members,isCurrent:()=>owned,isVisible:()=>shown,onUpdate:rows=>updates.push(rows),onState:state=>states.push(state)});
  return {pulse,calls,updates,states,timers,listeners,doc,members,
    async tick(){const [key,task]=[...timers][0]||[];assert.ok(task);timers.delete(key);time+=task.delay;task.fn();await flush();},
    async hidden(value){doc.hidden=value;listeners.get('visibilitychange')?.();await flush();},
    disown(){owned=false;},close(){alive=false;},hide(){shown=false;}};
}

test('presence polls all public handles in bounded read batches with one self heartbeat per interval',async()=>{
  const f=fixture({count:205});f.pulse.refresh();await flush();
  assert.equal(f.calls.filter(row=>row.body).length,1);
  assert.deepEqual(f.calls.filter(row=>!row.body).map(row=>JSON.parse(new URL('https://fixture.test'+row.path).searchParams.get('handles')).length),[100,100,5]);
  assert.equal(f.updates.at(-1).length,205);assert.ok(f.updates.at(-1).every(row=>row.online&&row.onlineKnown));
  f.pulse.refresh();await flush();assert.equal(f.calls.filter(row=>row.body).length,1,'manual refresh must not accelerate heartbeat');
  await f.tick();assert.equal(f.calls.filter(row=>row.body).length,2);f.pulse.destroy();
  assert.equal(f.timers.size,0);assert.equal(f.listeners.size,0);
});

test('hidden pages stop polling and resume without duplicate heartbeat; destroying rejects late responses',async()=>{
  let resolveRead;
  const f=fixture({request:(path,body)=>body?{heartbeat:true}:new Promise(resolve=>{resolveRead=resolve;})});
  f.pulse.refresh();await flush();assert.equal(f.calls.length,2);
  await f.hidden(true);assert.equal(f.timers.size,0);
  resolveRead({presenceAvailable:true,items:[{handle:'public-0',online:true,onlineKnown:true}]});await flush();
  assert.equal(f.updates.length,0,'hidden in-flight response cannot update scene');
  await f.hidden(false);assert.equal(f.calls.filter(row=>row.body).length,1);
  assert.equal(f.calls.length,3);f.pulse.destroy();
  resolveRead({presenceAvailable:true,items:[{handle:'public-0',online:true,onlineKnown:true}]});await flush();
  assert.equal(f.updates.length,0);assert.equal(f.timers.size,0);
});

test('unavailable, malformed and unrequested status rows never fabricate online members',async()=>{
  const f=fixture({count:3,request:(path,body)=>body?{heartbeat:true}:{presenceAvailable:true,items:[
    {handle:'public-0',online:true,onlineKnown:false},{handle:'public-1',online:'true',onlineKnown:true},
    {handle:'private-stranger',online:true,onlineKnown:true},{handle:'public-2',online:false,onlineKnown:true}
  ]}});
  f.pulse.refresh();await flush();assert.deepEqual(f.updates.at(-1),[
    {handle:'public-0',online:false,onlineKnown:false},{handle:'public-1',online:false,onlineKnown:false},
    {handle:'public-2',online:false,onlineKnown:true}
  ]);assert.equal(f.states.at(-1),'unavailable');f.pulse.destroy();
  const failed=fixture({request:()=>Promise.reject(Error('unavailable'))});failed.pulse.refresh();await flush();
  assert.deepEqual(failed.updates.at(-1),[{handle:'public-0',online:false,onlineKnown:false}]);failed.pulse.destroy();
});

test('identity failure clears stale online hints and stops automatic retries; changed owners ignore all late results',async()=>{
  const f=fixture({request:()=>Promise.reject(Object.assign(Error('expired'),{status:401}))});
  f.pulse.refresh();await flush();assert.equal(f.calls.length,1);assert.equal(f.timers.size,0);
  assert.deepEqual(f.updates.at(-1),[{handle:'public-0',online:false,onlineKnown:false}]);f.pulse.destroy();
  let finish;
  const stale=fixture({request:()=>new Promise(resolve=>{finish=resolve;})});stale.pulse.refresh();await flush();
  stale.disown();finish({heartbeat:true});await flush();assert.equal(stale.calls.length,1);assert.equal(stale.updates.length,0);assert.equal(stale.timers.size,0);stale.pulse.destroy();
});
