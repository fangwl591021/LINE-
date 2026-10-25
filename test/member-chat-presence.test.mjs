import test from 'node:test';
import assert from 'node:assert/strict';
import { readIslandPresence, recordIslandPresence, PRESENCE_TTL_SECONDS } from '../worker/member-chat-presence.mjs';

function fixture({ bulk = true } = {}) {
  const values = new Map(), puts = [], gets = [];
  const kv = {
    async get(key, options) {
      gets.push({key,options});
      if (Array.isArray(key)) {
        if (!bulk) throw new TypeError('single keys only');
        return new Map(key.map(item => [item, values.get(item) ?? null]));
      }
      return values.get(key) ?? null;
    },
    async put(key, value, options) { puts.push({key,value:JSON.parse(value),options}); values.set(key,JSON.parse(value)); }
  };
  return { env:{ACTMASTER_KV:kv}, kv, puts, gets, values };
}

test('island presence is canonical, short lived, bounded and contains no public timestamps or identifiers', async () => {
  const f=fixture(), now=1800000000000;
  assert.deepEqual(await recordIslandPresence(f.env,{memberId:'canonical-a'},now),{available:true,heartbeat:true,retryAfterSeconds:60});
  assert.equal(f.puts.length,1);assert.equal(f.puts[0].options.expirationTtl,180);assert.equal(PRESENCE_TTL_SECONDS,180);
  assert.match(f.puts[0].key,/^MEMBER_CHAT_ISLAND_PRESENCE_V1:[0-9a-f]{64}$/);assert.ok(!f.puts[0].key.includes('canonical-a'));
  await recordIslandPresence(f.env,{memberId:'canonical-a'},now+59000);assert.equal(f.puts.length,1);
  await recordIslandPresence(f.env,{memberId:'canonical-a'},now+60000);assert.equal(f.puts.length,2);
  let result=await readIslandPresence(f.env,[{peer:'canonical-a'},{peer:'not-active'},{peer:'canonical-a'}],now+179999);
  assert.equal(result.available,true);assert.deepEqual(result.states.get('canonical-a'),{online:true,onlineKnown:true});assert.deepEqual(result.states.get('not-active'),{online:false,onlineKnown:true});
  result=await readIslandPresence(f.env,[{peer:'canonical-a'}],now+60000+180000);
  assert.deepEqual(result.states.get('canonical-a'),{online:false,onlineKnown:true});
  assert.doesNotMatch(JSON.stringify([...result.states.values()]),/seenAt|memberId|line_id/);
  const bulk=f.gets.find(call=>Array.isArray(call.key));assert.deepEqual(bulk.options,{type:'json',cacheTtl:30});assert.equal(bulk.key.length,2);
});

test('future or malformed markers are unknown and cannot create fake online members', async () => {
  const f=fixture(),now=1800000000000;await recordIslandPresence(f.env,{memberId:'a'},now);const key=f.puts[0].key;
  for(const value of [{v:1,seenAt:now+60000},{v:1,seenAt:-1},{v:1,seenAt:String(now)},{v:2,seenAt:now},'not-json',[],{}]){
    f.values.set(key,value);const result=await readIslandPresence(f.env,[{peer:'a'}],now);
    assert.equal(result.available,false);assert.deepEqual(result.states.get('a'),{online:false,onlineKnown:false});
  }
  f.values.set(key,{v:1,seenAt:now+1000});assert.equal((await readIslandPresence(f.env,[{peer:'a'}],now)).states.get('a').online,true,'small server clock skew is tolerated');
});

test('missing or failing KV never invents offline certainty or prevents the caller from continuing', async () => {
  const members=[{peer:'a'},{peer:'b'}];
  for(const env of [{},{ACTMASTER_KV:{get:async()=>{throw Error('unavailable');},put:async()=>{throw Error('429');}}}]){
    assert.deepEqual(await recordIslandPresence(env,{memberId:'a'}),{available:false});
    const result=await readIslandPresence(env,members);assert.equal(result.available,false);
    assert.ok([...result.states.values()].every(value=>value.online===false&&value.onlineKnown===false));
  }
  const f=fixture();f.kv.put=async()=>{throw Error('rate limited');};assert.deepEqual(await recordIslandPresence(f.env,{memberId:'a'}),{available:false});
  assert.deepEqual(await recordIslandPresence(f.env,{memberId:''}),{available:false});
  assert.equal((await readIslandPresence(f.env,Array.from({length:101},(_,index)=>({peer:String(index)})))).available,false);assert.equal(f.gets.length,1,'oversized reads do not reach KV');
});

test('single-key fallback is limited to six in-flight reads and never lists the namespace', async () => {
  const f=fixture({bulk:false}),original=f.kv.get;let active=0,maxActive=0;
  f.kv.get=async(key,options)=>{
    if(Array.isArray(key))return original(key,options);
    active++;maxActive=Math.max(maxActive,active);
    await new Promise(resolve=>setTimeout(resolve,2));const value=await original(key,options);active--;return value;
  };
  const result=await readIslandPresence(f.env,Array.from({length:100},(_,index)=>({peer:String(index)})));
  assert.equal(result.available,true);assert.equal(result.states.size,100);assert.ok(maxActive<=6);assert.equal(maxActive,6);
  assert.ok([...result.states.values()].every(value=>value.online===false&&value.onlineKnown===true));
  assert.equal(f.gets.filter(call=>typeof call.key==='string').length,100);
});
