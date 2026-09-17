import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../js/modules/store-phone-reward.js',import.meta.url),'utf8');
const coreSource=readFileSync(new URL('../js/core.js',import.meta.url),'utf8');
const coreTransport=coreSource.slice(coreSource.indexOf('    window.fetchAPI = async function('),coreSource.indexOf('    // 強效配對機制'));
const owner='U'+'a'.repeat(32),customerId='U'+'b'.repeat(32),token='rwd_'+'b'.repeat(64);
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function setup({rewardOnly=true,pending=null}={}){
  const nodes=new Map(),writes=[],reads=[],storage=new Map();
  const get=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{value:'',hidden:false,disabled:false,textContent:'',events:{},focus(){this.focused=true;},addEventListener(name,handler){this.events[name]=handler;}});
    return nodes.get(selector);
  };
  const root={innerHTML:'',querySelector:get,replaceChildren(){this.innerHTML='';}};
  const key='ACTMASTER_CASHIER_PENDING_V1:'+owner;
  if(pending)storage.set(key,JSON.stringify(pending));
  const data={customerPointUserId:customerId,name:'合成測試會員',phone:'0912345678',canAdjust:true,rewardScanToken:token,rewardScanExpiresAt:Date.now()+180000};
  const window={currentUserProfile:{userId:owner},userRole:rewardOnly?'reward':'store',liff:{isLoggedIn:()=>true},canUseStorePointCashier:()=>true,isRewardOnlyPointCashier:()=>rewardOnly,
    normalizeStorePointRewardPhone(value){const phone=String(value||'').replace(/[\s()-]/g,'').replace(/^\+886(?=9)/,'0');return /^09\d{8}$/.test(phone)?phone:'';},
    // Production core.js unwraps successful API responses before callers see them.
    async fetchAPI(action,payload){reads.push({action,payload});return data;},
    async submitSafeCashier(payload){writes.push(payload);return {success:true,transactionStatus:'succeeded'};},
    async checkPendingCashier(){return {success:false,transactionStatus:'not_found'};}};
  const localStorage={getItem:key=>storage.get(key)||null};
  const context={window,localStorage,Date,Number,JSON};
  vm.runInNewContext(source.replace('export function mountStorePhoneReward','function mountStorePhoneReward')+';this.mount=mountStorePhoneReward;',context);
  const mounted=context.mount(root,{rewardOnly});
  const fire=(selector,event='submit')=>get(selector).events[event]({preventDefault(){}});
  const search=async(phone='0912345678')=>{get('#store-phone-reward-phone').value=phone;await fire('[data-phone-search]');};
  const send=async(points='25')=>{get('#store-phone-reward-points').value=points;await fire('[data-phone-gift]');};
  return {root,get,window,reads,writes,data,storage,key,mounted,fire,search,send,context};
}

test('direct phone popup contains only phone lookup and direct point entry, not cashier/consumption/scanner/debit',()=>{
  const s=setup();
  assert.match(s.root.innerHTML,/會員手機號碼/);assert.match(s.root.innerHTML,/贈送點數/);
  assert.doesNotMatch(s.root.innerHTML,/消費金額|收銀機|折抵扣點|store-point-cashier|data-method="scan"/);
  assert.equal(s.reads.length,0);assert.equal(s.writes.length,0);
});

test('phone reward normalizes lookup then sends exact direct points with no debit',async()=>{
  for(const rewardOnly of [true,false]){
    const s=setup({rewardOnly});await s.search('+886 912-345-678');
    assert.deepEqual(JSON.parse(JSON.stringify(s.reads)),[{action:'getStorePointCustomer',payload:{customerUserId:'0912345678',customerPhone:'0912345678'}}]);
    assert.equal(s.get('[data-member-name]').textContent,'合成測試會員');
    await s.send('25');assert.equal(s.writes.length,1);
    assert.deepEqual(JSON.parse(JSON.stringify(s.writes[0])),{customerUserId:customerId,mode:'reward',amount:25,rewardPoints:25,deductPoints:0,...(rewardOnly?{rewardScanToken:token}:{})});
    assert.match(s.get('[data-phone-status]').textContent,/成功贈送 25 點/);
    assert.equal(s.get('[data-send]').disabled,true);
  }
});

test('actual core transport unwraps the successful HTTP envelope for phone lookup',async()=>{
  for(const rewardOnly of [true,false]){
    const s=setup({rewardOnly}),requests=[];
    s.window.currentNetworkId='admin';
    Object.assign(s.context,{Config:{WORKER_URL:'https://synthetic.invalid'},navigator:{onLine:true},AbortController,setTimeout,clearTimeout,
      liff:{isLoggedIn:()=>true,getAccessToken:()=> 'synthetic-local-token'},
      fetch:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({success:true,data:s.data})};}});
    assert.match(coreTransport,/return data\.data \|\| data;/);
    vm.runInNewContext(coreTransport,s.context);
    await s.search('+886 912-345-678');
    assert.equal(requests.length,1);assert.equal(requests[0].url,'https://synthetic.invalid');
    assert.deepEqual(requests[0].body,{action:'getStorePointCustomer',payload:{customerUserId:'0912345678',customerPhone:'0912345678',networkId:'admin',role:rewardOnly?'reward':'store',userId:owner,lineAccessToken:'synthetic-local-token'}});
    assert.equal(s.get('[data-member-name]').textContent,'合成測試會員');
    assert.equal(s.get('[data-member]').hidden,false);assert.equal(s.get('[data-send]').disabled,false);
    await s.send('25');assert.equal(s.writes.length,1);assert.equal(s.writes[0].rewardPoints,25);assert.equal(s.writes[0].deductPoints,0);
  }
});

test('lookup still accepts explicit successful envelopes without weakening error checks',async()=>{
  const s=setup();s.window.fetchAPI=async()=>({success:true,data:s.data});
  await s.search();assert.equal(s.get('[data-member]').hidden,false);await s.send();assert.equal(s.writes.length,1);
});

test('failed or malformed lookup results never enable gifting even when they carry member data',async()=>{
  for(const response of [null,undefined,false,42,'member',[],{}, {data:null}, {data:[]},
    s=>({success:false,error:'查詢拒絕',data:s.data}),
    s=>({success:false,...s.data}),
    s=>({error:'查詢拒絕',data:s.data}),
    s=>({success:true,error:'查詢拒絕',data:s.data})]){
    const s=setup();s.window.fetchAPI=async()=>typeof response==='function'?response(s):response;
    await s.search();assert.equal(s.get('[data-member]').hidden,true);assert.equal(s.get('[data-send]').disabled,true);
    await s.send();assert.equal(s.writes.length,0);
  }
});

test('direct gifts reject invalid phone, UID, points, missing identity or expired receipt without writes',async()=>{
  for(const phone of ['bad',customerId,'09123']){
    const s=setup();await s.search(phone);assert.equal(s.reads.length,0);await s.send();assert.equal(s.writes.length,0);
  }
  for(const points of ['0','-1','1.5','1e2','1000001','']){
    const s=setup();await s.search();await s.send(points);assert.equal(s.writes.length,0,points);
  }
  for(const replacement of [{rewardScanExpiresAt:1},{rewardScanToken:''},{customerPointUserId:'0912345678'},{needsSelection:true},{needsBinding:true},{canAdjust:false}]){
    const s=setup();Object.assign(s.data,replacement);await s.search();await s.send();assert.equal(s.writes.length,0,JSON.stringify(replacement));
  }
});

test('phone gift uses the receipt-bound point account when profile canonical ID differs',async()=>{
  const s=setup();s.data.canonicalUserId='U'+'c'.repeat(32);await s.search();await s.send('25');
  assert.equal(s.writes.length,1);assert.equal(s.writes[0].customerUserId,customerId);assert.equal(s.writes[0].rewardScanToken,token);
});

test('edited phone or late identity response cannot reuse a verified member',async()=>{
  const s=setup();await s.search();s.get('#store-phone-reward-phone').value='0999999999';await s.fire('#store-phone-reward-phone','input');await s.send();assert.equal(s.writes.length,0);
  const late=setup(),wait=deferred();late.window.fetchAPI=()=>wait.promise;
  const lookup=late.search();late.get('#store-phone-reward-phone').value='0999999999';late.fire('#store-phone-reward-phone','input');wait.resolve(late.data);await lookup;
  assert.equal(late.get('[data-member]').hidden,true);await late.send();assert.equal(late.writes.length,0);
});

test('owner, role or popup lifetime changes invalidate phone gift authority',async()=>{
  for(const change of [s=>s.window.currentUserProfile.userId='U'+'c'.repeat(32),s=>s.window.userRole='store',s=>s.mounted.dispose(),s=>s.window.liff.isLoggedIn=()=>false]){
    const s=setup();await s.search();change(s);await s.send();assert.equal(s.writes.length,0);
  }
});

test('in-flight gifts block closing and double submission',async()=>{
  const s=setup(),wait=deferred();await s.search();s.window.submitSafeCashier=payload=>{s.writes.push(payload);return wait.promise;};
  const sent=s.send();assert.equal(s.mounted.isBusy(),true);await s.send();assert.equal(s.writes.length,1);
  wait.resolve({success:true});await sent;assert.equal(s.mounted.isBusy(),false);
});

test('uncertain result locks edits; retry uses original snapshot only after not_found',async()=>{
  const s=setup();await s.search();s.window.submitSafeCashier=async payload=>{
    s.writes.push(payload);s.storage.set(s.key,JSON.stringify({requestId:'12345678-1234-4234-8234-123456789abc',signature:JSON.stringify(payload),payload}));throw Error('網路逾時');
  };
  await s.send('25');assert.equal(s.get('#store-phone-reward-phone').disabled,true);assert.equal(s.get('[data-retry]').hidden,true);
  await s.send('90');assert.equal(s.writes.length,1);
  await s.fire('[data-check]','click');assert.equal(s.get('[data-retry]').hidden,false);
  await s.fire('[data-retry]','click');await Promise.resolve();await Promise.resolve();assert.equal(s.writes.length,2);
  assert.equal(JSON.stringify(s.writes[1]),JSON.stringify(s.writes[0]));assert.equal(s.writes[1].rewardPoints,25);
});

test('reopened direct request queries first then retries its exact payload without new receipt or transaction data',async()=>{
  const payload={customerUserId:customerId,mode:'reward',amount:25,rewardPoints:25,deductPoints:0,rewardScanToken:token};
  const s=setup({pending:{requestId:'12345678-1234-4234-8234-123456789abc',signature:JSON.stringify(payload),payload}});
  assert.equal(s.get('[data-pending]').hidden,false);await s.search();await s.send();assert.equal(s.reads.length,0);assert.equal(s.writes.length,0);
  assert.match(s.get('[data-phone-status]').textContent,new RegExp(customerId));
  await s.fire('[data-retry]','click');assert.equal(s.writes.length,0);
  await s.fire('[data-check]','click');assert.equal(s.get('[data-retry]').hidden,false);await s.fire('[data-retry]','click');assert.equal(s.writes.length,1);
  assert.equal(JSON.stringify(s.writes[0]),JSON.stringify(payload));
});

test('unrelated or malformed stored requests cannot become phone gifts',async()=>{
  const valid={customerUserId:customerId,mode:'reward',amount:25,rewardPoints:25,deductPoints:0,rewardScanToken:token};
  for(const override of [{mode:'redeem'},{productId:'product'}, {qrToken:'x'},{amount:100},{rewardPoints:-5},{rewardScanToken:'bad'},{customerUserId:'0912345678'},{canAutoBindPointAccount:true}]){
    const payload={...valid,...override};const s=setup({pending:{requestId:'12345678-1234-4234-8234-123456789abc',signature:JSON.stringify(payload),payload}});
    await s.fire('[data-check]','click');assert.equal(s.get('[data-retry]').hidden,true);await s.fire('[data-retry]','click');assert.equal(s.writes.length,0,JSON.stringify(override));
  }
});

test('balance-refresh failure cannot turn a successful gift into a retry',async()=>{
  const s=setup();s.window.refreshPointBalanceBadge=()=>{throw Error('refresh unavailable');};await s.search();await s.send();await Promise.resolve();
  assert.match(s.get('[data-phone-status]').textContent,/成功贈送/);assert.equal(s.get('[data-pending]').hidden,true);assert.equal(s.writes.length,1);
});
