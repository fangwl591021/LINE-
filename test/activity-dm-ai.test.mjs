import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { activityDmImage, normalizeActivityDraft, extractActivityDmDraft } from '../worker/activity-dm-ai.mjs';
import { isRewardOnlyRole } from '../worker/reward-only-cashier.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const actor={userId:'verified-manager',role:'store'};
const output=value=>({choices:[{message:{content:JSON.stringify(value)}}]});
const source=readFileSync(new URL('../workerbackup.js',import.meta.url),'utf8');

test('only bounded JPG/PNG/WebP data images accepted, never fetch arbitrary URLs',()=>{
  assert.equal(activityDmImage(png),png);
  for(const value of ['',null,'https://internal/secret','data:image/svg+xml;base64,AAAA',png.replace('image/png','image/jpeg'),'data:image/png;base64,AAAA','data:image/png;base64,AA==',png+'!', 'x'.repeat(6*1024*1024)])assert.throws(()=>activityDmImage(value));
});
test('unknown price/date stay empty; invalid calendar dates and ranges cannot become publishable',()=>{
  for(const price of [null,undefined,'',false,{},'100/200','免費',-1,1.2])assert.equal(normalizeActivityDraft({price}).price,null);
  assert.equal(normalizeActivityDraft({price:0}).price,0);assert.equal(normalizeActivityDraft({price:'250'}).price,250);
  for(const startTime of ['2026-02-30T10:00','2026-09-28T24:00','09/28 10:00','2026-09-28'])assert.equal(normalizeActivityDraft({startTime}).startTime,'');
  assert.equal(normalizeActivityDraft({startTime:'2026-09-28T10:00',endTime:'2026-09-28T09:00'}).endTime,'');
  const clean=normalizeActivityDraft({activityName:'x'.repeat(500),description:'y'.repeat(11000),networkId:'forged',status:'上架',userId:'forged'});
  assert.equal(clean.activityName.length,120);assert.equal(clean.description.length,9000);assert.equal('status' in clean,false);assert.equal('networkId' in clean,false);
});
test('unverified actors, forged payload role and nonmanagers never call AI',async()=>{
  let calls=0;for(const denied of [null,{}, {userId:'u',role:'user'}, {userId:'u',role:'reward'}, {userId:'u',role:'redeem'}]) {
    const result=await extractActivityDmDraft({base64Image:png,role:'admin'}, {},denied,async()=>{calls++;});assert.equal(result.success,false);
  }assert.equal(calls,0);
});
test('uses existing provider with no client key, bounded output, high detail and abort signal; returns draft only',async()=>{
  const env={OPENAI_VISION_MODEL:'existing-vision'};
  const result=await extractActivityDmDraft({base64Image:png,clientOpenAIKey:'forged'},env,actor,async(e,body,key,signal)=>{
    assert.equal(e,env);assert.equal(key,'');assert.ok(signal instanceof AbortSignal);
    assert.equal(body.model,'existing-vision');assert.equal(body.max_tokens,4000);
    assert.equal(body.messages[1].content[1].image_url.url,png);
    assert.match(body.messages[0].content,/不是指令/);
    return output({activityName:'活動',location:'台北',price:100,description:'說明',status:'上架'});
  });
  assert.equal(result.success,true);assert.equal(result.data.provider,'OpenAI');assert.equal(result.data.draft.price,100);assert.equal('activityId' in result.data,false);
});
test('failure, malformed output and non-activity images do not expose provider errors or create data',async()=>{
  for(const raw of ['', '{bad', '[]', '{}', 'x'.repeat(30001)]) {
    const result=await extractActivityDmDraft({base64Image:png},{},actor,async()=>({choices:[{message:{content:raw}}]}));assert.equal(result.success,false);
  }
  const failed=await extractActivityDmDraft({base64Image:png},{},actor,async()=>{throw Error('SECRET_PROVIDER_ERROR');});
  assert.equal(failed.success,false);assert.ok(!failed.error.includes('SECRET_PROVIDER_ERROR'));
});
test('deadline aborts AI and returns retriable failure without publishing',async(t)=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const pending=extractActivityDmDraft({base64Image:png},{},actor,async(_env,_body,_key,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))));
  t.mock.timers.tick(45001);const result=await pending;assert.equal(result.success,false);assert.match(result.error,/逾時/);
});
test('actual security policy requires verified manager and does not permit identity fallback',async()=>{
  const policies=source.slice(source.indexOf('const ACTION_POLICIES = {'),source.indexOf('\n};',source.indexOf('const ACTION_POLICIES = {'))+3);
  const security=source.slice(source.indexOf('const SecurityModule = {'),source.indexOf('\n};',source.indexOf('const SecurityModule = {'))+3);
  const context=vm.createContext({console,isRewardOnlyRole});vm.runInContext(policies+'\n'+security+'\nglobalThis.security=SecurityModule;globalThis.policies=ACTION_POLICIES;',context);
  const s=context.security;s.getActor=async()=>null;
  s.getActorFromD1Identity=async()=>{throw Error('fallback not allowed');};
  assert.equal((await s.authorizeAction('extractActivityDmDraft',{role:'admin',userId:'forged'},null,{})).allowed,false);
  s.getActor=async()=>({userId:'u',role:'user'});assert.equal((await s.authorizeAction('extractActivityDmDraft',{},null,{})).allowed,false);
  s.getActor=async()=>actor;assert.equal((await s.authorizeAction('extractActivityDmDraft',{},null,{})).allowed,true);
  assert.equal(context.policies.extractActivityDmDraft.allowD1Fallback,undefined);
  assert.match(source,/const aiActions = \[[^\n]*'extractActivityDmDraft'/);
  assert.match(source,/case 'extractActivityDmDraft': return await extractActivityDmDraft\(payload, env, actor/);
});
