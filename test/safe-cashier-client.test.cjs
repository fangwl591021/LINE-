const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/modules/safe-cashier.js'),'utf8');
const A='U'+'a'.repeat(32),B='U'+'b'.repeat(32);
const payload=()=>({customerUserId:B,amount:100,deductPoints:10,mode:'redeem'});
function setup(storage=new Map()){
 const window={currentUserProfile:{userId:A},liff:{isLoggedIn:()=>true,getAccessToken:()=> 'test-only'},Config:{WORKER_URL:'https://example.test'},showToast:()=>{}};
 const ctx={window,crypto:require('node:crypto').webcrypto,AbortSignal,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:()=>null},fetch:async()=>Response.json({success:true})};
 vm.runInNewContext(source,ctx);return {window,storage,ctx};
}
test('timeout survives page reload; lookup recovers original success without second write',async()=>{
 const {window,storage}=setup();let id,writes=0;
 window.callSafeCashier=async(action,p)=>{id=p.requestId;writes++;throw Error('lost');};
 await assert.rejects(window.submitSafeCashier(payload()),/lost/);assert.equal(storage.size,1);
 const second=setup(storage).window;
 second.callSafeCashier=async(action,p)=>{assert.equal(action,'getStoreCashierRequest');assert.equal(p.requestId,id);return {success:true,transactionStatus:'succeeded',transactionId:id,data:{changedPoints:10}};};
 assert.equal((await second.submitSafeCashier(payload())).transactionId,id);assert.equal(storage.size,0);assert.equal(writes,1);
});
test('not found retry uses original ID and changed content cannot replace it',async()=>{
 const {window,storage}=setup();let original;
 window.callSafeCashier=async(a,p)=>{original=p.requestId;throw Error('offline');};
 await assert.rejects(window.submitSafeCashier(payload()));
 let posts=0;
 window.callSafeCashier=async(a,p)=>{assert.equal(p.requestId,original);if(a==='getStoreCashierRequest')return {transactionStatus:'not_found'};posts++;return {success:true,transactionStatus:'succeeded'};};
 await assert.rejects(window.submitSafeCashier({...payload(),deductPoints:11}),/原內容/);assert.equal(posts,0);
 await window.submitSafeCashier(payload());assert.equal(posts,1);assert.equal(storage.size,0);
});
test('unknown status never sends another write; storage failure prevents first write',async()=>{
 const {window,ctx}=setup();let calls=0;
 window.callSafeCashier=async()=>{calls++;return {transactionStatus:'unknown',error:'pending'};};
 await assert.rejects(window.submitSafeCashier(payload()));
 await assert.rejects(window.submitSafeCashier(payload()));assert.equal(calls,2);
 const fresh=setup();fresh.ctx.localStorage.setItem=()=>{throw Error('storage disabled');};fresh.window.callSafeCashier=async()=>{throw Error('must not send');};
 await assert.rejects(fresh.window.submitSafeCashier(payload()),/storage disabled/);
});
test('double click blocked while in flight and account switch cannot display old receipt',async()=>{
 const {window}=setup();let release;const wait=new Promise(r=>release=r);
 window.callSafeCashier=async()=>{await wait;return {success:true,transactionStatus:'succeeded'};};
 const first=window.submitSafeCashier(payload());await assert.rejects(window.submitSafeCashier(payload()),/正在處理/);
 window.currentUserProfile.userId=B;release();await assert.rejects(first,/帳號已變更/);
});
test('dedicated transport preserves business error metadata and uses current token only',async()=>{
 const {window,ctx}=setup();
 ctx.fetch=async(url,options)=>{const req=JSON.parse(options.body);assert.equal(req.payload.lineAccessToken,'test-only');assert.equal(req.payload.authenticatedUserId,undefined);return Response.json({success:false,transactionStatus:'unknown',transactionId:'test'});};
 assert.equal((await window.callSafeCashier('getStoreCashierRequest',{requestId:'test'})).transactionStatus,'unknown');
});
