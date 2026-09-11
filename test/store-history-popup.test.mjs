import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/modules/store-history-popup.js',import.meta.url),'utf8');
const {readStorePointHistory:read,pointHistoryText:text}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const owner='U'+'b'.repeat(32),uid='U'+'a'.repeat(32);
const valid={queriedLineUserId:uid,requestedLineUserId:uid,list:[{event_name:'消費折抵',get_point:-800}]};
function setup(fetchAPI){globalThis.window={currentUserProfile:{userId:owner},liff:{isLoggedIn:()=>true},resolvePointUserIdForCurrentProfile:()=>uid,fetchAPI};}
test('one explicit history query and no changes to wallet state',async()=>{
 let count=0;setup(async(action,payload,silent)=>{count++;assert.equal(action,'queryUserPoints');assert.deepEqual(payload,{userId:owner,pointUserId:uid,pt_uid:uid,point_type:'gift_money',page:1,per_page:100});assert.equal(silent,true);return valid;});
 const cache={balance:100,list:['preserved']};window.pointWalletData=cache;
 assert.deepEqual(await read(),valid.list);assert.equal(count,1);assert.equal(window.pointWalletData,cache);
});
test('missing, invalid or mismatched data is error, not an empty history',async()=>{
 for(const result of [null,{success:false},{error:'offline'},{list:[]},{...valid,list:null},{...valid,requestedLineUserId:owner}]){setup(async()=>result);await assert.rejects(read());}
 setup(async()=>({...valid,list:[]}));assert.deepEqual(await read(),[]);
});
test('only latest 30 entries are rendered, matching existing history scope',async()=>{setup(async()=>({...valid,list:Array.from({length:100},(_,i)=>({id:i}))}));assert.equal((await read()).length,30);});
test('account changes, logout and unauthed calls never expose history',async()=>{
 for(const mode of ['account','logout','mapping']){
  let finish;setup(()=>new Promise(r=>finish=r));const result=read();
  if(mode==='account')window.currentUserProfile.userId=uid;else if(mode==='logout')window.liff.isLoggedIn=()=>false;else window.resolvePointUserIdForCurrentProfile=()=>owner;
  finish(valid);await assert.rejects(result);
 }
 setup(()=>{throw Error('must not call');});window.liff.isLoggedIn=()=>false;await assert.rejects(read(),/請先登入/);
});
test('row text preserves source, amount and date without inventing zero',()=>{
 assert.deepEqual(text({event_name:'店家消費折抵',event_content:'消費 8800',shop_remark:'source=測試店;id=1',get_point:-800,created_at:'2026-09-10 16:43'}),{title:'店家消費折抵',detail:'來源：測試店｜消費 8800',time:'2026-09-10 16:43',amount:'-800',positive:false});
 assert.equal(text({get_point:10}).amount,'+10');assert.equal(text({get_point:0}).amount,'+0');assert.equal(text({get_point:null}).amount,'—');
 assert.equal(text({event_content:'來源：既有店家',child_shop_name:'不重複'}).detail,'來源：既有店家');
});
