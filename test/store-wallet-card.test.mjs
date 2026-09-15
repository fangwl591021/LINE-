import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
let serial=0;
const owner='U'+'a'.repeat(32);
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve:value=>resolve(value)};};
async function fixture({cache=false,success=true}={}){
 const module=await import('../js/modules/store-wallet-popup.js?wallet-card-test='+serial++);
 const result=deferred(),calls=[];
 globalThis.window={currentUserProfile:{userId:owner},liff:{isLoggedIn:()=>true},pointWalletStatus:'ready',pointWalletData:cache?{walletDisplayOwner:owner,queriedLineUserId:owner,balance:10,source:'mother',loadedAt:Date.now()}:null,fetchAPI:action=>{calls.push(action);return result.promise;}};
 globalThis.requestAnimationFrame=cb=>setImmediate(cb);
 const node=()=>({textContent:'',innerHTML:'',replaceChildren(){this.innerHTML='';}});
 const balance=node(),qr=node(),status=node();
 const root={isConnected:true,querySelector:key=>({'[data-home-balance]':balance,'[data-home-qr]':qr,'[data-home-wallet-status]':status})[key]};
 const finish=()=>result.resolve(success?{success:true,data:{balance:25,source:'mother',queriedLineUserId:owner}}:{success:false});
 return {module,root,balance,qr,status,calls,finish};
}
async function until(predicate){for(let i=0;i<60;i++){if(predicate())return;await delay(10);}assert.ok(predicate(),'condition eventually holds');}
test('verified QR paints before delayed fresh balance without requesting history',async()=>{
 const f=await fixture({cache:true});const close=f.module.mountStoreWalletCard(f.root);
 try{await until(()=>f.qr.innerHTML.includes('<svg'));assert.deepEqual(f.calls,['queryPointBalanceFast']);f.finish();await until(()=>f.balance.textContent==='25 點');}finally{close();}
});
test('unconfirmed balance never produces a QR or zero balance',async()=>{
 const f=await fixture({success:false});const close=f.module.mountStoreWalletCard(f.root);
 try{f.finish();await until(()=>f.status.textContent==='點按重試');assert.equal(f.qr.innerHTML,'');assert.equal(f.balance.textContent,'暫時無法讀取');}finally{close();}
});
test('late account response cannot paint old QR or balance; invalid session is reported once',async()=>{
 const f=await fixture();let invalid=0;const close=f.module.mountStoreWalletCard(f.root,{onInvalid:()=>invalid++});
 try{window.currentUserProfile={userId:'U'+'b'.repeat(32)};f.finish();await until(()=>invalid===1);assert.equal(f.qr.innerHTML,'');assert.equal(f.balance.textContent,'請登入查看');await delay(220);assert.equal(invalid,1);}finally{close();}
});
test('navigation clears displayed QR and cannot be repainted by a pending balance',async()=>{
 const f=await fixture({cache:true});const close=f.module.mountStoreWalletCard(f.root);
 await until(()=>f.qr.innerHTML.includes('<svg'));close();f.finish();await delay(30);
 assert.equal(f.qr.innerHTML,'');assert.notEqual(f.balance.textContent,'25 點');
});
