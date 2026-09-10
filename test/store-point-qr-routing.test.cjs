const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync('js/auth.js','utf8');
const id='12345678-1234-1234-1234-123456789abc';
const product='https://liff.line.me/1660923784-vViMTZ1y?shopProduct='+id;
const uid='U'+'a'.repeat(32);
function setup(fetcher=async()=>({customerPointUserId:uid,name:'test'})) {
 const input={value:'',dispatchEvent(){}}; const calls=[],opened=[],rendered=[],toasts=[];
 const window={location:{origin:'https://fangwl591021.github.io'},canUseStorePointCashier:()=>true,
   renderStorePointCustomer:c=>rendered.push(c),closeStorePointScanner(){},openStoreShop:async id=>opened.push(id),
   showToast:m=>toasts.push(m),fetchAPI:async(...args)=>{calls.push(args);return fetcher(...args);}};
 const context=vm.createContext({window,document:{getElementById:()=>input},URL,Event});
 for(const [start,end] of [['window.classifyStorePointInput =','window.loadQrDecoder ='],['window.fillStorePointCustomerFromQr =','window.closeStorePointScanner ='],['window.lookupStorePointCustomer =','window.resetStorePointCashier =']]) {
   vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),context);
 }
 return {window,input,calls,opened,rendered,toasts};
}
test('product scan routes to product ID without customer API or external navigation',async()=>{
 const f=setup();f.window.storePointCustomer={customerPointUserId:uid};
 f.window.fillStorePointCustomerFromQr(product);await Promise.resolve();
 assert.deepEqual(f.opened,[id]);assert.equal(f.calls.length,0);assert.equal(f.input.value,'');assert.equal(f.window.storePointCustomer,null);
 assert.equal(f.window.extractPointCustomerId(product),'');
 f.input.value=product;await f.window.lookupStorePointCustomer();assert.equal(f.opened.length,2);assert.equal(f.calls.length,0);
});
test('customer QR, UID, phone and account keep customer lookup',async()=>{
 for(const raw of [uid,'0912345678','legacy-user','https://aiwe.cc/wallet?pt_uid='+uid]) {
  const f=setup();f.input.value=raw;await f.window.lookupStorePointCustomer();
  assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'getStorePointCustomer');
  assert.equal(f.calls[0][1].customerUserId,raw.startsWith('https:')?uid:raw);assert.equal(f.opened.length,0);
 }
});
test('unknown, hostile and malformed product URLs never query customer',async()=>{
 for(const raw of ['https://example.com','javascript:alert(1)',product.replace('liff.line.me','evil.test'),product.replace(id,'bad'),product+'&uid='+uid,'https://liff.line.me/wrong?shopProduct='+id]) {
  const f=setup();f.input.value=raw;await f.window.lookupStorePointCustomer();
  assert.equal(f.calls.length,0);
  if(raw===product+'&uid='+uid)assert.deepEqual(f.opened,[id]);
  else {assert.equal(f.opened.length,0);assert.equal(f.toasts.length,1);}
 }
});
test('late customer response cannot refill after product scan',async()=>{
 let finish;const f=setup(()=>new Promise(resolve=>finish=resolve));
 f.input.value=uid;const pending=f.window.lookupStorePointCustomer();
 f.input.value=product;await f.window.lookupStorePointCustomer();
 finish({customerPointUserId:uid,name:'late'});await pending;
 assert(f.rendered.every(x=>x===null));assert.equal(f.window.storePointCustomer,null);assert.deepEqual(f.opened,[id]);
});
test('both camera and image paths use shared routing and never label a product as customer',()=>{
 assert(source.includes('window.fillStorePointCustomerFromQr(code.data)'));
 assert(source.includes('window.fillStorePointCustomerFromQr(raw)'));
 assert(!source.includes("'已讀取客戶帳號：' + customerId.slice"));
});
