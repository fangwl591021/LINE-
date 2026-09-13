import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modules/store-point-operation.js',import.meta.url),'utf8');
const auth=readFileSync(new URL('../js/auth.js',import.meta.url),'utf8');
const {openStorePointOperationPopup:open}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const owner='U'+'a'.repeat(32);

test('standalone brand entry uses the point LIFF and navigation-only query',async()=>{
 const mall=readFileSync(new URL('../js/modules/store-shop.js',import.meta.url),'utf8');
 const start=mall.indexOf('async function openPointOperations()');
 const end=mall.indexOf("    root.classList.add('store-shop');",start);
 for(const standalone of [true,false]){
  let target;
  const context={standalone,window:{POINT_LIFF_ID:'test-liff',liff:{isLoggedIn:()=>false}},URL,location:{assign:url=>target=url}};
  await vm.runInNewContext(mall.slice(start,end)+';openPointOperations()',context);
  const url=new URL(target);assert.equal(url.origin,'https://liff.line.me');assert.equal(url.pathname,'/test-liff');
  assert.deepEqual([...url.searchParams],[['shopSection','cashier']]);
 }
 assert.match(mall,/data-do="point-operation"[\s\S]*?aria-haspopup="dialog"/);
 assert.match(mall,/section==='cashier'\)\{memberHome\(\);await openPointOperations\(\);\}/);
 assert.match(mall,/if\(!standalone&&section!=='cashier'\)/);
});

function signedIn(canUse=true){
 globalThis.window={currentUserProfile:{userId:owner},liff:{isLoggedIn:()=>true},canUseStorePointCashier:()=>canUse};
 globalThis.document={getElementById(){throw Error('must not read cashier DOM');}};
}

test('point operation rejects standalone, anonymous and missing-owner sessions before cashier access',()=>{
 signedIn();assert.throws(()=>open({standalone:true}),/登入/);
 window.liff.isLoggedIn=()=>false;assert.throws(()=>open(),/登入/);
 window.liff.isLoggedIn=()=>true;window.currentUserProfile=null;assert.throws(()=>open(),/登入/);
});

test('stale mall entry does not read or move cashier nodes',()=>{
 signedIn();assert.equal(open({isCurrent:()=>false}),undefined);
});

test('point operation fails closed for ordinary members or unavailable role authority',()=>{
 signedIn(false);assert.throws(()=>open(),error=>!error.message.includes('must not read cashier DOM'));
 delete window.canUseStorePointCashier;
 assert.throws(()=>open(),error=>!error.message.includes('must not read cashier DOM'));
});

test('missing existing cashier fails without creating a replacement transaction form',()=>{
 signedIn();document.getElementById=()=>null;
 document.createElement=()=>{throw Error('must not create replacement cashier');};
 assert.throws(()=>open(),error=>!error.message.includes('must not create replacement cashier'));
});

test('point popup reuses cashier, scanner and toast; opening cannot load wallets or write transactions',()=>{
 for(const id of ['store-point-cashier','store-point-scanner-modal','toast-container','btn-store-point-submit'])assert.ok(source.includes(id),id);
 assert.match(source,/__storePointLookupRevision/);
 assert.match(source,/closeStorePointScanner/);
 assert.match(source,/clearInterval/);
 assert.match(source,/currentUserProfile/);
 assert.match(source,/掃描會員錢包 QR/);
 assert.match(source,/輸入行動電話查找/);
 assert.doesNotMatch(source,/cloneNode|\bfetch\s*\(|fetchAPI\s*\(|goPage\s*\(|loadPointsWallet\s*\(|localStorage/);
 assert.doesNotMatch(source,/submitSafeCashier\s*\(|storeAdjustCustomerPoints/);
});

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function scannerSetup({decoder,camera,play}={}){
 const events={cameraCalls:0,frames:[],toasts:[],playCalls:0};
 const classes=new Set(['hidden']);
 const modal={classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)}};
 const video={srcObject:null,play(){events.playCalls++;return play?.promise||Promise.resolve();}};
 const status={textContent:''};
 const canvas={getContext:()=>({})};
 const nodes={'store-point-scanner-modal':modal,'store-point-scanner-video':video,'store-point-scanner-status':status,'store-point-scanner-canvas':canvas};
 const defaultStream={getTracks:()=>[]};
 const window={loadQrDecoder:()=>decoder?.promise||Promise.resolve(()=>null),showToast:(...args)=>events.toasts.push(args)};
 const context={window,document:{getElementById:id=>nodes[id]||null},navigator:{mediaDevices:{getUserMedia(){events.cameraCalls++;return camera?.promise||Promise.resolve(defaultStream);}}},requestAnimationFrame:fn=>events.frames.push(fn)};
 const start=auth.indexOf('window.closeStorePointScanner = function()');
 const end=auth.indexOf('window.updateStorePointPreview = function()',start);
 assert.ok(start>=0&&end>start,'existing scanner functions remain discoverable');
 vm.runInNewContext(auth.slice(start,end),context);
 return {window,video,status,modal,events};
}
const flush=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};

test('album decoder ignores old QR results and errors after close or account switch',async()=>{
 for(const failure of [false,true])for(const switchedOwner of [false,true]){
  const decode=deferred(),events=[];
  const window={currentUserProfile:{userId:owner},decodeStorePointQrFile:()=>decode.promise,fillStorePointCustomerFromQr:()=>events.push('fill'),showToast:()=>events.push('toast'),closeStorePointScanner:()=>events.push('close')};
  const start=auth.indexOf('window.scanStorePointQr ='),end=auth.indexOf('window.submitStorePointCashier =',start);
  vm.runInNewContext(auth.slice(start,end),{window});
  const input={files:[{}],value:'test.png'},pending=window.scanStorePointQr(input);
  if(switchedOwner)window.currentUserProfile={userId:'another-owner'};else window.__storePointScannerRevision=1;
  if(failure)decode.reject(Error('late'));else decode.resolve('stale QR');
  await pending;assert.deepEqual(events,[]);assert.equal(input.value,'');
 }
});

test('closing while QR decoder loads never requests a camera afterward',async()=>{
 const decoder=deferred(),state=scannerSetup({decoder});
 const pending=state.window.openStorePointScanner();
 state.window.closeStorePointScanner();decoder.resolve(()=>null);await pending;
 assert.equal(state.events.cameraCalls,0);
 assert.equal(state.video.srcObject,null);
 assert.ok(state.modal.classList.contains('hidden'));
 assert.equal(state.events.frames.length,0);
});

test('closing while camera permission is pending stops the late stream without starting video',async()=>{
 const camera=deferred(),state=scannerSetup({camera});let stopped=0;
 const pending=state.window.openStorePointScanner();await flush();
 assert.equal(state.events.cameraCalls,1);
 state.window.closeStorePointScanner();camera.resolve({getTracks:()=>[{stop(){stopped++;}}]});await pending;
 assert.equal(stopped,1);assert.equal(state.video.srcObject,null);
 assert.equal(state.events.playCalls,0);assert.equal(state.events.frames.length,0);
});

test('closing while video starts cannot resurrect the scan loop',async()=>{
 const play=deferred(),state=scannerSetup({play});
 const pending=state.window.openStorePointScanner();await flush();
 assert.equal(state.events.playCalls,1);
 state.window.closeStorePointScanner();play.resolve();await pending;
 assert.equal(state.video.srcObject,null);assert.equal(state.events.frames.length,0);
 assert.equal(state.window.__storePointScannerActive,false);
});

test('stale scanner initialization errors do not leak a toast after popup dismissal',async()=>{
 const decoder=deferred(),state=scannerSetup({decoder});
 const pending=state.window.openStorePointScanner();
 state.window.closeStorePointScanner();decoder.reject(Error('test-only decoder failure'));await pending;
 assert.equal(state.events.toasts.length,0);assert.ok(state.modal.classList.contains('hidden'));
});
