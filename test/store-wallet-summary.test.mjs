import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/modules/store-wallet-popup.js',import.meta.url),'utf8');
const owner='U'+'b'.repeat(32),uid='U'+'a'.repeat(32);
let serial=0;
async function setup(fetchAPI){
  const history={balance:10,list:[{id:'ledger'}],loadedAt:123};
  globalThis.window={currentUserProfile:{userId:owner},liff:{isLoggedIn:()=>true},resolvePointUserIdForCurrentProfile:()=>uid,fetchAPI,pointWalletData:history};
  const module=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// test '+serial++).toString('base64'));
  return {...module,history};
}
const valid={source:'mother',balance:13217,queriedLineUserId:uid,requestedLineUserId:uid};
test('summary sends one balance-only request, deduplicates and preserves ledger cache',async()=>{
  let calls=0,finish;
  const {readStoreWalletSummary:read,history}=await setup((action,payload,silent)=>{
    calls++;assert.equal(action,'queryPointBalanceFast');assert.deepEqual(payload,{userId:owner,pointUserId:uid,pt_uid:uid,point_type:'gift_money'});assert.equal(silent,true);
    return new Promise(resolve=>finish=resolve);
  });
  const first=read(),second=read();assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
  finish({...valid,list:[{id:'must-not-copy'}]});const result=await first;
  assert.equal(result.balance,13217);assert.equal(result.walletDisplayOwner,owner);assert.equal(result.queriedLineUserId,uid);
  assert.equal('list' in result,false);assert.equal(window.pointWalletData,history);assert.equal(history.loadedAt,123);
});
test('invalid, missing, local or mismatched results never become zero or fall back to history',async()=>{
  for(const result of [null,{error:'offline'},{success:false}, {...valid,source:'local'},{...valid,requestedLineUserId:owner},{...valid,queriedLineUserId:'bad'},...['',null,undefined,false,'bad'].map(balance=>({...valid,balance}))]){
    let calls=0;const {readStoreWalletSummary:read}=await setup(action=>{calls++;assert.equal(action,'queryPointBalanceFast');return result;});
    assert.equal(await read(),null);assert.equal(calls,1);
  }
});
test('confirmed zero is valid; errors permit retry',async()=>{
  let calls=0;const {readStoreWalletSummary:read}=await setup(()=>{if(++calls===1)throw Error('offline');return {...valid,balance:0};});
  assert.equal(await read(),null);assert.equal((await read()).balance,0);assert.equal(calls,2);
});
test('late replies after account switch or logout are ignored',async()=>{
  for(const logout of [false,true]){
    let finish;const {readStoreWalletSummary:read}=await setup(()=>new Promise(resolve=>finish=resolve));
    const pending=read();await Promise.resolve();
    if(logout)window.liff.isLoggedIn=()=>false;else window.currentUserProfile={userId:uid};
    finish(valid);assert.equal(await pending,null);
  }
});
test('not logged in never queries',async()=>{
  const {readStoreWalletSummary:read}=await setup(()=>{throw Error('must not query');});window.liff.isLoggedIn=()=>false;assert.equal(await read(),null);
});
