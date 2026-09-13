const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const auth=fs.readFileSync(path.join(__dirname,'../js/auth.js'),'utf8');
const point=fs.readFileSync(path.join(__dirname,'../js/modules/store-point-operation.js'),'utf8');
const safe=fs.readFileSync(path.join(__dirname,'../js/modules/safe-cashier.js'),'utf8');
const core=fs.readFileSync(path.join(__dirname,'../js/core.js'),'utf8');
const actor='U'+'a'.repeat(32),customer='U'+'b'.repeat(32),other='U'+'c'.repeat(32);
function node(){
 const classes=new Set(),listeners={};
 return {value:'',disabled:false,checked:false,textContent:'',innerHTML:'',dataset:{},isConnected:true,
  classList:{add:(...items)=>items.forEach(x=>classes.add(x)),remove:(...items)=>items.forEach(x=>classes.delete(x)),contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);if(on)classes.add(x);else classes.delete(x);return on;}},
  addEventListener(type,fn){(listeners[type]||=[]).push(fn);},dispatchEvent(event){for(const fn of listeners[event.type]||[])fn(event);},focus(){this.focused=true;},remove(){this.removed=true;}};
}
function setup(role='reward'){
 const elements={},get=id=>elements[id]||=(node()),calls=[],toasts=[],submitted=[];
 const radios=[Object.assign(node(),{value:'redeem',checked:true}),Object.assign(node(),{value:'reward'})];
 const document={getElementById:get,querySelector:()=>radios.find(x=>x.checked),querySelectorAll:()=>radios};
 const response=()=>({success:true,data:{customerPointUserId:customer,name:'Test member',balance:200,canAdjust:true,rewardScanToken:'test-scan-token',cashierSessionId:'test-session'}});
 const window={userRole:role,currentUser:{role},currentUserProfile:{userId:actor},liff:{isLoggedIn:()=>true},
  showToast:(...args)=>toasts.push(args),escapeHTML:s=>String(s),fetchAPI:async(action,payload)=>{calls.push({action,payload});return response();},
  submitSafeCashier:async payload=>{submitted.push(payload);return {success:true,data:{mode:'reward',changedPoints:10,customerPointSource:'mother'}};}};
 const context={window,document,Event,URL,URLSearchParams,console,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},setInterval:()=>1,clearInterval(){}};
 const start=auth.indexOf('let storePointRewardScan = null;'),end=auth.indexOf('window.claimDailyPointCheckin =',start);
 assert.ok(start>=0&&end>start);vm.runInNewContext(auth.slice(start,end),context);
 window.loadStorePointCashierLogs=()=>null;window.updateStorePointCashierPermissions();
 const lookup=window.lookupStorePointCustomer;window.lookupStorePointCustomer=()=>window.lookupPending=lookup();
 async function scan(raw=customer){window.fillStorePointCustomerFromQr(raw);await window.lookupPending;}
 return {window,context,document,get,radios,calls,toasts,submitted,scan};
}
test('reward role can use cashier but never gains diagnostic/admin role',()=>{
 const s=setup();assert.equal(s.window.canUseStorePointCashier(),true);assert.equal(s.window.canUsePointSyncDiagnostics(),false);
 assert.equal(s.window.hasAdminRights,undefined);assert.equal(s.window.userRole,'reward');
 for(const role of ['store','admin','tenant','店長','總管','租戶']){const legacy=setup(role);assert.equal(legacy.window.canUseStorePointCashier(),true);assert.equal(legacy.window.isRewardOnlyPointCashier(),false);}
 assert.equal(setup('user').window.canUseStorePointCashier(),false);
});
test('reward UI hides phone/manual query and debit controls, retains a full-width scan button',()=>{
 const {get,radios,window}=setup();
 for(const id of ['store-point-customer','store-point-customer-lookup','store-point-redeem-option','store-point-deduct-wrap'])assert.equal(get(id).classList.contains('hidden'),true,id);
 assert.equal(get('store-point-customer').disabled,true);assert.equal(get('store-point-customer-lookup').disabled,true);
 assert.equal(get('store-point-customer-scan').classList.contains('hidden'),false);assert.equal(get('store-point-customer-scan').classList.contains('col-span-2'),true);
 assert.equal(radios[0].disabled,true);assert.equal(radios[0].checked,false);assert.equal(radios[1].checked,true);
 assert.equal(get('store-point-deduct').value,'0');assert.equal(window.getStorePointMode(),'reward');
 window.userRole='store';window.updateStorePointCashierPermissions();
 assert.equal(get('store-point-customer').disabled,false);assert.equal(get('store-point-customer').classList.contains('hidden'),false);
 assert.equal(get('store-point-customer-lookup').classList.contains('hidden'),false);assert.equal(radios[0].disabled,false);
});
test('reward typed UID, phone, candidate selection and product/URL QR all refuse before network access',async()=>{
 const s=setup();
 for(const raw of [customer,'0912345678','https://liff.line.me/1660923784-vViMTZ1y?shopProduct=01234567-0123-4123-8123-012345678901']){
  s.get('store-point-customer').value=raw;await s.window.lookupStorePointCustomer();assert.equal(s.calls.length,0);
 }
 for(const raw of ['0912345678','https://example.test/?uid='+customer,'https://liff.line.me/1660923784-vViMTZ1y?shopQr='+'a'.repeat(64)]){await s.scan(raw);assert.equal(s.calls.length,0);}
 s.window.storePointCustomerCandidates=[{customerPointUserId:customer}];await s.window.selectStorePointCustomerCandidate(0);assert.equal(s.calls.length,0);
 await s.window.prepareStorePointCashierSession({customerPointUserId:customer});assert.equal(s.calls.length,0);
});
test('wallet QR query obtains scan token and reward submission always passes token with zero deduction',async()=>{
 const s=setup();await s.scan();
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].action,'getStorePointCustomer');assert.equal(s.calls[0].payload.customerUserId,customer);assert.equal(s.calls[0].payload.walletQr,customer);
 assert.equal(s.window.storePointCustomer.rewardScanToken,'test-scan-token');assert.equal(s.window.storePointCustomer.cashierSessionId,'test-session');
 s.get('store-point-amount').value='1000';s.get('store-point-deduct').value='999';s.radios[0].checked=true;s.radios[1].checked=false;
 await s.window.submitStorePointCashier(null);
 assert.equal(s.submitted.length,1);assert.equal(s.submitted[0].mode,'reward');assert.equal(s.submitted[0].deductPoints,0);assert.equal(s.submitted[0].rewardScanToken,'test-scan-token');assert.equal(s.submitted[0].customerUserId,customer);
});
test('missing token or malformed lookup result never enables reward submission',async()=>{
 for(const data of [{customerPointUserId:customer},{rewardScanToken:'test-token'},{customerPointUserId:customer,rewardScanToken:'test-token',needsSelection:true}]){
  const s=setup();s.window.fetchAPI=async()=>({success:true,data});await s.scan();s.get('store-point-amount').value='100';await s.window.submitStorePointCashier(null);assert.equal(s.submitted.length,0);assert.equal(s.window.storePointCustomer,null);
 }
});
test('input edit, reset, actor switch, replacement customer and token change invalidate reward binding',async()=>{
 for(const change of [
  s=>s.get('store-point-customer').dispatchEvent(new Event('input')),
  s=>s.window.resetStorePointCashier(),
  s=>{s.window.currentUserProfile.userId=other;},
  s=>{s.get('store-point-customer').value=other;},
  s=>{s.window.storePointCustomer.customerPointUserId=other;},
  s=>{s.window.storePointCustomer.rewardScanToken='different-token';}
 ]){const s=setup();await s.scan();change(s);s.get('store-point-amount').value='100';await s.window.submitStorePointCashier(null);assert.equal(s.submitted.length,0);}
});
test('late lookup after account switch or reset cannot restore a scanned customer',async()=>{
 for(const change of [s=>{s.window.currentUserProfile.userId=other;},s=>s.window.resetStorePointCashier()]){
  const s=setup();let release;s.window.fetchAPI=()=>new Promise(resolve=>{release=resolve;});
  s.window.fillStorePointCustomerFromQr(customer);change(s);release({success:true,data:{customerPointUserId:customer,rewardScanToken:'late-token'}});await s.window.lookupPending;
  assert.equal(s.window.storePointCustomer,null);
 }
});
test('ordinary store manual lookup and redemption payload remain unchanged',async()=>{
 const s=setup('store');s.get('store-point-customer').value='0912345678';await s.window.lookupStorePointCustomer();
 assert.equal(s.calls[0].payload.customerUserId,'0912345678');assert.equal('walletQr' in s.calls[0].payload,false);
 s.get('store-point-amount').value='1000';s.get('store-point-deduct').value='100';await s.window.submitStorePointCashier(null);
 assert.equal(s.submitted[0].mode,'redeem');assert.equal(s.submitted[0].deductPoints,100);assert.equal('rewardScanToken' in s.submitted[0],false);
});
test('safe cashier preserves scan token in original pending business payload across an unknown result',async()=>{
 const s=setup();await s.scan();const storage=new Map();
 s.context.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
 s.context.crypto=require('node:crypto').webcrypto;vm.runInNewContext(safe,s.context);
 let writes=0;s.window.callSafeCashier=async(action,payload)=>{if(action==='getStoreCashierRequest')return {transactionStatus:'unknown'};writes++;assert.equal(payload.rewardScanToken,'test-scan-token');assert.equal(payload.mode,'reward');assert.equal(payload.deductPoints,0);throw Error('test-only lost reply');};
 s.get('store-point-amount').value='1000';await s.window.submitStorePointCashier(null);
 const saved=JSON.parse([...storage.values()][0]);assert.equal(saved.payload.rewardScanToken,'test-scan-token');assert.equal(saved.payload.cashierSessionId,undefined);
 await s.window.submitStorePointCashier(null);assert.equal(writes,1);
});
test('reward popup removes phone method while store popup retains it',()=>{
 for(const role of ['reward','store']){
  const s=setup(role),parts={},part=selector=>parts[selector]||=(node());let modal;
  s.document.activeElement=node();s.document.body={append(){}};
  s.document.createElement=()=>modal={...node(),querySelector:part,setAttribute(){},showModal(){this.open=true;},close(){this.open=false;}};
  part('[data-choices]').querySelectorAll=()=>[];
  vm.runInNewContext(point.replace('export function','function')+';openStorePointOperationPopup();',s.context);
  assert.equal(!!part('[data-method="phone"]').removed,role==='reward');assert.equal(modal.open,true);
  assert.equal(s.calls.length,0);assert.equal(s.submitted.length,0);
 }
});
test('verified reward role cannot be promoted by editable name/phone hard-admin match',()=>{
 for(const role of ['reward','贈點用戶']){
  const s=setup();let hardAdminCalls=0;
  s.window.isHardAdminUser=()=>{hardAdminCalls++;return true;};
  s.document.querySelector=selector=>s.get(selector.slice(1));s.context.setInputValueUnlessTouched=()=>{};
  const coreStart=core.indexOf('window.applyUserPermissions = function()'),coreEnd=core.indexOf('// 名片資料載入',coreStart);
  vm.runInNewContext(core.slice(coreStart,coreEnd),s.context);
  const authStart=auth.indexOf('window.applyRegisteredUserSession = function(info)'),authEnd=auth.indexOf('window.setPointWalletStatus =',authStart);
  vm.runInNewContext(auth.slice(authStart,authEnd),s.context);
  s.window.applyRegisteredUserSession({userId:actor,role,name:'hard-admin-matching-name',phone:'hard-admin-matching-phone',socials:'[]'});
  assert.equal(hardAdminCalls,0);assert.equal(s.window.currentUser.role,role);assert.equal(s.window.userRole,role);
  assert.equal(s.window.hasAdminRights,false);assert.equal(s.get('header-role-label').textContent,'目前：贈點用戶');
  for(const id of ['header-admin-badge','admin-switch-container','top-nav-switch','home-top-nav-switch','details-store-management','admin-partner-management-entry'])assert.equal(s.get(id).classList.contains('hidden'),true,id);
  s.window.userRole='admin';s.window.hasAdminRights=true;s.window.applyUserPermissions();
  assert.equal(s.window.userRole,role);assert.equal(s.window.hasAdminRights,false);assert.equal(hardAdminCalls,0);
 }
});
test('hard-admin and ordinary role permission behavior remains unchanged outside reward role',()=>{
 for(const [role,hardAdmin,expected,rights] of [['user',true,'admin',true],['store',false,'store',true],['user',false,'user',false],['admin',false,'admin',true]]){
  const s=setup(role);s.window.isHardAdminUser=()=>hardAdmin;
  s.document.querySelector=selector=>s.get(selector.slice(1));
  const start=core.indexOf('window.applyUserPermissions = function()'),end=core.indexOf('// 名片資料載入',start);
  vm.runInNewContext(core.slice(start,end),s.context);s.window.applyUserPermissions();
  assert.equal(s.window.userRole,expected);assert.equal(s.window.hasAdminRights,rights);
 }
});
