import test from 'node:test';
import assert from 'node:assert/strict';
import {createCardImageArchive} from '../js/modules/card-image-archive.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('local preview can resolve while original upload waits; archive waits for both uploads',async()=>{
  const original=deferred(),processed=deferred();let results=0;
  const preview=Promise.resolve('LOCAL_IMAGE');
  const task=createCardImageArchive({prepared:preview,uploadOriginal:()=>original.promise,uploadProcessed:()=>{results++;return processed.promise;}});
  assert.equal(await preview,'LOCAL_IMAGE');assert.equal(task.status,'uploading');assert.equal(results,0);
  let done=false;const saved=task.ensure().then(()=>{done=true;});
  original.resolve({id:'ONE'});await new Promise(r=>setImmediate(r));assert.equal(results,1);assert.equal(done,false);
  processed.resolve();await saved;assert.equal(task.status,'completed');assert.equal(task.jobId,'ONE');
});
test('processed-image retry preserves original job, without duplicate original uploads',async()=>{
  let originals=0,results=0;
  const task=createCardImageArchive({prepared:Promise.resolve('IMAGE'),uploadOriginal:async()=>{originals++;return {id:'SAME'};},uploadProcessed:async()=>{if(++results===1)throw Error('network');}});
  assert.equal(await task.promise,false);assert.equal(task.status,'failed');
  const job=await task.ensure();assert.equal(job.id,'SAME');assert.equal(originals,1);assert.equal(results,2);
});
test('original failure is observed and retry succeeds on explicit ensure',async()=>{
  let attempts=0;
  const task=createCardImageArchive({prepared:Promise.resolve('IMAGE'),uploadOriginal:async()=>{if(++attempts===1)throw Error('upload offline');return {id:'RETRY'};},uploadProcessed:async()=>{}});
  await task.promise;assert.equal(task.status,'failed');assert.match(task.error,/offline/);
  await task.ensure();assert.equal(attempts,2);assert.equal(task.status,'completed');
});
test('cancelled/replaced side cannot run processed upload even if old request resolves later',async()=>{
  const original=deferred();let results=0,signal;
  const task=createCardImageArchive({prepared:Promise.resolve('IMAGE'),uploadOriginal:s=>{signal=s;return original.promise;},uploadProcessed:async()=>{results++;}});
  task.cancel();assert.equal(signal.aborted,true);original.resolve({id:'OLD'});await task.promise;
  assert.equal(results,0);assert.equal(task.status,'cancelled');await assert.rejects(task.ensure(),/取消/);
});
test('upload timeout resolves a failed task instead of waiting forever',async()=>{
  const task=createCardImageArchive({prepared:Promise.resolve('IMAGE'),timeoutMs:10,uploadOriginal:signal=>new Promise((r,j)=>signal.addEventListener('abort',()=>j(Error('timeout')))),uploadProcessed:async()=>{}});
  assert.equal(await task.promise,false);assert.equal(task.status,'failed');assert.match(task.error,/逾時/);task.cancel();
});
