import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const customerSource = readFileSync(new URL('../js/modules/customers.js', import.meta.url), 'utf8');
const homeSource = readFileSync(new URL('../js/modules/home.js', import.meta.url), 'utf8');
function parserHarness() {
  const scripts = [], timers = new Map(); let sequence = 0;
  const context = {window:{}, document:{createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:s=>scripts.push(s)}},
    setTimeout:fn=>{timers.set(++sequence,fn);return sequence;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(context);
  vm.runInContext(customerSource.slice(customerSource.indexOf('  let spreadsheetParserPromise'),customerSource.indexOf('  window.handleCustomerFile'))+'\nglobalThis.load = loadSpreadsheetParser;',context);
  return {context,scripts,timers};
}
test('parser performs no initial download and coalesces concurrent first-use requests', async()=>{
  const {context,scripts,timers}=parserHarness();
  assert.equal(scripts.length,0);
  const first=context.load(),second=context.load();
  assert.equal(first,second);assert.equal(scripts.length,1);
  context.window.XLSX={read:()=>{}};scripts[0].onload();
  assert.equal(await first,context.window.XLSX);assert.equal(timers.size,0);
  await context.load();assert.equal(scripts.length,1);
});
test('failed parser download is recoverable on next selection',async()=>{
  const {context,scripts}=parserHarness();const first=context.load();
  const rejected=assert.rejects(first,/載入失敗/);scripts[0].onerror();await rejected;
  assert.equal(scripts[0].removed,true);
  const retry=context.load();assert.equal(scripts.length,2);
  context.window.XLSX={};scripts[1].onload();await retry;
});
test('parser timeout removes failed script and permits retry',async()=>{
  const {context,scripts,timers}=parserHarness();const first=context.load();
  const rejected=assert.rejects(first,/逾時/);[...timers.values()][0]();await rejected;
  assert.equal(scripts[0].removed,true);
  const retry=context.load();context.window.XLSX={};scripts[1].onload();await retry;
});
function homeHarness(withIdle=true) {
  const timers=[],idle=[],calls=[];
  const context={window:{},console,setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}};
  if(withIdle)context.window.requestIdleCallback=(fn,options)=>idle.push({fn,options});
  vm.createContext(context);
  const start=homeSource.indexOf('    function runHomeBackgroundTask_(');
  vm.runInContext(homeSource.slice(start,homeSource.indexOf('    window.applySubsiteHomeFastData',start))+'\nglobalThis.run = runHomeBackgroundTask_;',context);
  return {context,timers,idle,calls};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('aggregate starts immediately; secondary task waits for bounded idle callback and stays deduplicated',async()=>{
  const {context,timers,idle,calls}=homeHarness();
  context.run('subsite-home-fast',20,()=>calls.push('aggregate'));
  timers.shift()();await flush();assert.deepEqual(calls,['aggregate']);assert.equal(idle.length,0);
  context.run('secondary',3000,()=>calls.push('secondary'));timers.shift()();await flush();
  assert.deepEqual(calls,['aggregate']);assert.equal(idle[0].options.timeout,1000);
  context.run('secondary',3000,()=>calls.push('duplicate'));timers.shift()();await flush();
  assert.equal(idle.length,1);idle[0].fn();await flush();assert.deepEqual(calls,['aggregate','secondary']);
});
test('secondary task still runs without requestIdleCallback',async()=>{
  const {context,timers,calls}=homeHarness(false);
  context.run('secondary',3000,()=>calls.push('done'));timers.shift()();await flush();
  assert.equal(calls.length,0);timers.shift()();await flush();assert.deepEqual(calls,['done']);
});
