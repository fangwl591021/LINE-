import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/auth.js', import.meta.url), 'utf8');
const configSource = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const shopId = 'b7df9472-8cb0-4ae2-a6e6-f6b49eaa7688';
const actor = 'U' + 'a'.repeat(32), inviter = 'U' + 'b'.repeat(32);
const invite = '?shopSection=store&shopId=' + shopId + '&ref=' + inviter + '&net=store-net&via=invite-test';

function block(text, start, end) {
  const first = text.indexOf(start), last = text.indexOf(end, first);
  assert(first >= 0 && last > first, start);
  return text.slice(first, last);
}

function fixture({search=invite, result={isRegistered:true, info:{userId:actor, role:'store'}}, loggedIn=true, friendship=true, cached, firstRef, acceptance, fetchError, fetchHook, jsonHook, token='mock-access-token', manageEntry=false}={}) {
  const calls=[], timers=[], cancelledTimers=new Set(), nodes=new Map(), storage=new Map();
  if(cached) storage.set('ACTMASTER_USER_' + actor, JSON.stringify({info:cached, savedAt:Date.now()}));
  if(firstRef) storage.set('ACTMASTER_FIRST_REF_' + actor, JSON.stringify(firstRef));
  const node = id => {
    if(!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {id, textContent:'', innerHTML:'', children:[], appendChild(n){this.children.push(n);}, querySelector:()=>node(id+':status'), classList:{add:name=>classes.add(name), remove:name=>classes.delete(name), contains:name=>classes.has(name)}, classes});
    }
    return nodes.get(id);
  };
  const location = new URL('https://example.invalid/LINE-/index.html' + search);
  location.replace = url => calls.push(['replace',url]);
  const context = {
    URL,URLSearchParams,Date,AbortController,console:{warn(){},error(){}},LIFF_ID:'mock-liff',location,
    Config:{WORKER_URL:'https://worker.invalid/'},currentToken:token,loggedIn,
    document:{getElementById:node,createElement:tag=>({tag,remove(){}}),head:{appendChild:n=>calls.push(['asset',n])},addEventListener(name,fn){if(name==='DOMContentLoaded')context.ready=fn;}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    setTimeout:fn=>{timers.push(fn);return timers.length;},
    clearTimeout:id=>cancelledTimers.add(id),
    liff:{isLoggedIn:()=>context.loggedIn,getAccessToken:()=>context.currentToken},
    reorderSettingsSections(){},
    initActmasterLiff:async()=>calls.push(['liff-init']),
    ensureActmasterLiffLogin:options=>calls.push(['login',options]),
    getActmasterLiffProfile:async()=>{calls.push(['profile']);return {userId:actor,displayName:'測試會員'};},
    ensureActmasterPointFriendship:async()=>{calls.push(['friendship']);return friendship;},
    applyUserPermissions:()=>calls.push(['permissions']),
    refreshInboxBadge:()=>calls.push(['inbox-home']),
    setInputValueUnlessTouched:(id,value)=>{node(id).value=value;},
    addUserSocial(){},
    openStoreShop:async(...args)=>{calls.push(['store',...args]);context.currentPage='store-shop';},
    goPage:page=>{context.currentPage=page;calls.push(['page',page]);},
    fetchAPI:async(action,payload)=>{calls.push(['api',action,payload]);if(action!=='checkUser')throw Error('Unexpected API '+action);return typeof result==='function'?result():result;},
    fetch:async(url,options)=>{
      calls.push(['accept',url,options]);
      await fetchHook?.(context);
      if(fetchError)throw fetchError;
      const info=result?.isRegistered && result.info ? {...result.info} : {userId:actor,lineId:actor,role:'user',name:'',phone:'',industry:'',birthday:'',points:0,needsProfileCompletion:true,profileStatus:'incomplete'};
      info.referrerId ??= inviter; info.networkId ??= 'owner-net';
      const data=acceptance === undefined ? {success:true,shopId,actorUserId:actor,binding:{status:'bound',referrerId:info.referrerId,networkId:info.networkId},isRegistered:true,info} : acceptance;
      return {ok:acceptance?.httpOk !== false,json:async()=>{await jsonHook?.(context);return data;}};
    },
    installPendingMotherRegistrationReturnWatcher:()=>calls.push(['watcher']),
    refreshHomeProfileCard:()=>calls.push(['profile-home']),
    refreshPointBalanceBadge:()=>calls.push(['wallet-home']),
    updateMyCardReminder:()=>calls.push(['card-reminder']),
    loadHomeData:()=>{calls.push(['home-data']);return Promise.resolve();},
    loadCardData:()=>{calls.push(['card-data']);return Promise.resolve();},
    loadAllData:()=>{calls.push(['all-data']);return Promise.resolve();},
    resumePendingMotherRegistration:async()=>{calls.push(['recover-mother']);return null;},
    recoverRegisteredUserFromLegacyCache:async()=>{calls.push(['recover-cache']);return false;},
    recoverRegisteredUserFromBoundCard:async()=>{calls.push(['recover-card']);return false;},
    showActmasterStartupFailure:()=>calls.push(['retry']),
    showToast:(...args)=>calls.push(['toast',...args]),
    renderStandaloneWebCardPage:async(...args)=>calls.push(['web-card',...args]),
    handleLineOAKeywordShareEntry:async(...args)=>calls.push(['keyword-share',...args]),
    handleAutoSendCardEntry:async(...args)=>calls.push(['send-card',...args]),
    handleAutoShareCardEntry:async(...args)=>calls.push(['share-card',...args]),
    handleInstantSocialLikeEntry:async(...args)=>calls.push(['instant-like',...args])
  };
  context.window=context;
  vm.createContext(context);
  if(manageEntry){
    context.StoreShop={mount:()=>calls.push(['mount'])};
    vm.runInContext(readFileSync(new URL('../js/modules/store-shop-entry.js',import.meta.url),'utf8'),context);
  }
  vm.runInContext(block(configSource,'function readActmasterInitialParams()', 'function hasNfcCheckinParams'),context);
  // Exercise the real shared parser, not a second implementation of its route-conflict policy.
  vm.runInContext(readFileSync(new URL('../js/modules/store-invite-route.js',import.meta.url),'utf8'),context);
  vm.runInContext(block(source,'function getReferralStorageKey(', 'function pendingMotherRegistrationKey('),context);
  vm.runInContext(block(source,'function resolveReferralForRegistration(', 'function trackManualInputField('),context);
  vm.runInContext(block(source,'window.applyRegisteredUserSession = function(', 'window.setPointWalletStatus = function('),context);
  const applySession=context.applyRegisteredUserSession;
  context.applyRegisteredUserSession=(info,options)=>{calls.push(['session',{...info}]);return applySession(info,options);};
  vm.runInContext(block(source,'window.acceptStoreInviteLogin = async function(', 'window.reorderSettingsSections = function('),context);
  const start=source.lastIndexOf("document.addEventListener('DOMContentLoaded', async () => {");
  assert(start>0);vm.runInContext(source.slice(start),context);
  return {context,calls,storage,nodes,node,async run(){await context.ready();for(let i=0;i<timers.length;i++){assert(i<30);if(!cancelledTimers.has(i+1))await timers[i]();}}};
}

const events = f => f.calls.map(call=>call[0]);
test('direct manage overlaps static preparation but waits for verified member; no home loads even with cache',async()=>{
 for(const search of ['?shopSection=manage','?liff.state=%3FshopSection%3Dmanage']){
  let resolve;const pending=new Promise(r=>resolve=r);
  const f=fixture({search,manageEntry:true,cached:{userId:actor,role:'admin'},result:()=>pending});
  const running=f.run();for(let i=0;i<20;i++)await Promise.resolve();
  assert.match(f.node('page-store-shop:status').textContent,/確認會員資料/);
  assert(!events(f).includes('session'));assert(!events(f).includes('mount'));
  resolve({isRegistered:true,info:{userId:actor,role:'store'}});await running;
  assert.equal(events(f).filter(x=>x==='mount').length,1);assert.equal(f.context.userRole,'store');
  for(const kind of ['home-data','profile-home','wallet-home','inbox-home','card-data','all-data'])assert(!events(f).includes(kind),kind);
  assert(!f.calls.some(c=>c[0]==='page'&&c[1]==='home'));
  assert(events(f).indexOf('friendship')<events(f).indexOf('api'));
 }
});
test('manage authentication failure offers retry without trusting cached role or mounting private UI',async()=>{
 for(const result of [null,{error:'timeout'},{success:false},{isRegistered:true,info:[]}]){
  const f=fixture({search:'?shopSection=manage',manageEntry:true,cached:{role:'admin'},result});await f.run();
  assert.match(f.node('page-store-shop:status').textContent,/暫時無法確認/);
  assert.equal(f.node('page-store-shop').children.at(-1).textContent,'重新載入');
  assert(!events(f).includes('mount'));assert(!events(f).includes('session'));
 }
 for(const options of [{loggedIn:false},{friendship:false}]){
  const f=fixture({search:'?shopSection=manage',manageEntry:true,...options});await f.run();
  assert(!events(f).includes('mount'));assert(!events(f).includes('api'));
 }
});
test('manage static preload is deduplicated, retryable and excludes all mixed routes',async()=>{
 const f=fixture({manageEntry:true});delete f.context.StoreShop;
 for(const search of ['?shopSection=manage&shareCardId=x','?shopSection=manage&checkin=1','?shopSection=manage&ref=x','?shopSection=manage&shopId=x','?shopSection=sales','?shopSection=manage&shopSection=store']){
  assert.equal(f.context.prepareStoreManageEntry(new URLSearchParams(search)),false);
 }
 assert.equal(events(f).includes('asset'),false);
 const p=new URLSearchParams('shopSection=manage');
 assert.equal(f.context.prepareStoreManageEntry(p),true);assert.equal(f.context.prepareStoreManageEntry(p),true);
 let scripts=f.calls.filter(c=>c[0]==='asset'&&c[1].tag==='script');assert.equal(scripts.length,1);
 assert(!events(f).includes('api'));assert(!events(f).includes('mount'));
 scripts[0][1].onerror();await Promise.resolve();f.context.prepareStoreManageEntry(p);
 scripts=f.calls.filter(c=>c[0]==='asset'&&c[1].tag==='script');assert.equal(scripts.length,2);
 f.context.StoreShop={};scripts[1][1].onload();await Promise.resolve();
});
function noBusinessLoads(f) {
  for(const event of ['home-data','card-data','all-data','profile-home','card-reminder','wallet-home','inbox-home','recover-mother','recover-cache','recover-card','watcher']) assert(!events(f).includes(event),event);
  assert(!f.calls.some(call=>call[0]==='page'&&call[1]==='home'));
  assert.deepEqual(f.calls.filter(call=>call[0]==='api').map(call=>call[1]),['checkUser']);
}

test('registered store invite keeps authentication and referral gates, then opens the exact public store',async()=>{
  const f=fixture();await f.run();
  assert.deepEqual(f.calls.find(call=>call[0]==='store'),['store','','','','store',shopId]);
  assert(events(f).indexOf('friendship')<events(f).indexOf('api'));
  const check=f.calls.find(call=>call[0]==='api');
  assert.equal(check[2].userId,actor);assert.equal(check[2].lineAccessToken,'mock-access-token');
  assert.equal(JSON.parse(f.storage.get('ACTMASTER_FIRST_REF_'+actor)).referrerId,inviter);
  const accept=f.calls.find(call=>call[0]==='accept');
  assert.equal(accept[1],'https://worker.invalid/v1/store-shop/invite/accept');
  assert.equal(accept[2].headers.Authorization,'Bearer mock-access-token');
  assert.deepEqual(JSON.parse(accept[2].body),{shopId,referrerId:inviter});
  assert(events(f).indexOf('api')<events(f).indexOf('accept'));
  assert(events(f).indexOf('accept')<events(f).indexOf('session'));
  assert.equal(f.context.userRole,'store');noBusinessLoads(f);
});

test('confirmed unregistered invite binds a minimal user without completing personal registration or card recovery',async()=>{
  const f=fixture({result:{isRegistered:false},cached:{userId:actor,role:'admin'}});await f.run();
  assert.equal(f.context.currentUser.profileStatus,'incomplete');assert.equal(f.context.currentUser.needsProfileCompletion,true);assert.equal(f.context.userRole,'user');
  assert.equal(f.context.currentUser.userId,actor);assert.equal(f.context.currentUser.referrerId,inviter);
  for(const key of ['name','phone','industry','birthday'])assert.equal(f.context.currentUser[key],'',key);
  assert.equal(f.context.currentUser.points,0);
  assert.equal(JSON.parse(f.storage.get('ACTMASTER_USER_'+actor)).info.role,'user');
  assert.equal(f.calls.filter(call=>call[0]==='store').length,1);noBusinessLoads(f);
});

test('inconclusive checks never apply stale cached authority or run membership recovery',async()=>{
  for(const result of [null,{}, {error:'unavailable'}, {success:false,isRegistered:false}, {isRegistered:'true',info:{role:'admin'}}, {isRegistered:true}, {isRegistered:true,info:[]}]) {
    const f=fixture({result,cached:{userId:actor,role:'admin'}});await f.run();
    assert(!events(f).includes('session'));assert(!events(f).includes('store'));assert(events(f).includes('retry'));
    assert.equal(f.context.userRole,undefined);noBusinessLoads(f);
  }
});

test('thrown checkUser errors expose retry instead of entering the shop with cached roles',async()=>{
  const f=fixture({result:()=>{throw Error('offline');},cached:{userId:actor,role:'admin'}});await f.run();
  assert(events(f).includes('retry'));assert(!events(f).includes('session'));assert(!events(f).includes('store'));noBusinessLoads(f);
});

test('prior browser referral is not sent as authority, while direct self referrals are skipped',async()=>{
  const first={referrerId:'U'+'c'.repeat(32),networkId:'original-net'};
  const f=fixture({firstRef:first,result:{isRegistered:false}});await f.run();
  assert.deepEqual(JSON.parse(f.calls.find(call=>call[0]==='accept')[2].body),{shopId,referrerId:inviter});
  assert.equal(JSON.parse(f.storage.get('ACTMASTER_FIRST_REF_'+actor)).referrerId,inviter);
  assert.equal(f.context.currentUser.referrerId,inviter);assert.equal(f.context.currentUser.networkId,'owner-net');
  const self=fixture({search:invite.replace(inviter,actor),result:{isRegistered:false}});await self.run();
  assert.equal(self.storage.has('ACTMASTER_FIRST_REF_'+actor),false);
  assert.equal(self.context.currentUser.referrerId,'');
  assert(!events(self).includes('accept'));
});

test('nested LIFF state and short referral aliases reach the same store without impersonation',async()=>{
  const f=fixture({search:'?liff.state='+encodeURIComponent('/?shopSection=store&shopId='+shopId+'&r='+inviter+'&n=ref-net&v=ref-track')});await f.run();
  assert.equal(f.calls.find(call=>call[0]==='store').at(-1),shopId);
  assert.equal(f.context.currentUser.userId,actor);
  assert.equal(JSON.parse(f.storage.get('ACTMASTER_FIRST_REF_'+actor)).networkId,'owner-net');noBusinessLoads(f);
});

test('LINE login and friendship gates finish before lookup or store navigation',async()=>{
  const loggedOut=fixture({loggedIn:false});await loggedOut.run();
  assert(events(loggedOut).includes('login'));assert(!events(loggedOut).includes('api'));assert(!events(loggedOut).includes('store'));
  assert.equal(loggedOut.calls.find(call=>call[0]==='login')[1].redirectUri,loggedOut.context.location.href);
  const notFriend=fixture({friendship:false});await notFriend.run();
  assert(!events(notFriend).includes('api'));assert(!events(notFriend).includes('store'));
  assert.equal(notFriend.storage.has('ACTMASTER_FIRST_REF_'+actor),false);
});

test('competing web, share, like and keyword routes retain priority over store invitation',async()=>{
  for(const [query,event] of [['webCardId=card1','web-card'],['shareCardId=card1&share=1','share-card'],['shareCardId=card1&send=1','send-card'],['likeCardId=card1','instant-like'],['lineoaKeywordShare=rule1','keyword-share']]) {
    const f=fixture({search:invite+'&'+query});await f.run();
    assert(events(f).includes(event),query);assert(!f.calls.some(call=>call[0]==='store'&&call[4]==='store'),query);
  }
});

test('ordinary home and pre-existing shop-section routes keep their original behavior',async()=>{
  const home=fixture({search:'?ref='+inviter});await home.run();
  assert(events(home).includes('home-data'));assert(home.calls.some(call=>call[0]==='page'&&call[1]==='home'));assert(!events(home).includes('store'));
  const existing=fixture({search:'?shopSection=list'});await existing.run();
  assert.deepEqual(existing.calls.find(call=>call[0]==='store'),['store','','','','list']);
});

test('skipHome is opt-in and never changes the identity established by LINE',()=>{
  const f=fixture();f.context.currentUserProfile={userId:actor,displayName:'LINE會員'};
  f.context.applyUnregisteredHomeSession({userId:inviter,skipHome:true});
  assert.equal(f.context.currentUser.userId,actor);assert(!events(f).includes('page'));
  f.context.applyUnregisteredHomeSession({userId:inviter});
  assert(f.calls.some(call=>call[0]==='page'&&call[1]==='home'));
});

const accepted = (overrides={}) => ({success:true,shopId,actorUserId:actor,
  binding:{status:'bound',referrerId:inviter,networkId:'owner-net'},
  isRegistered:true,info:{userId:actor,lineId:actor,role:'user',referrerId:inviter,networkId:'owner-net',needsProfileCompletion:true,profileStatus:'incomplete'},...overrides});

test('store URLs without an invite browse without any attribution write',async()=>{
  const f=fixture({search:'?shopSection=store&shopId='+shopId,result:{isRegistered:false}});await f.run();
  assert(!events(f).includes('accept'));assert.equal(f.storage.has('ACTMASTER_FIRST_REF_'+actor),false);
  assert.equal(f.context.currentUser.isRegistered,false);assert(events(f).includes('store'));noBusinessLoads(f);
});

test('server existing attribution wins over both a new URL and a prior browser preference',async()=>{
  const original='U'+'c'.repeat(32);
  const answer=accepted({binding:{status:'existing',referrerId:original,networkId:'original-network'},
    info:{userId:actor,role:'reward',referrerId:original,networkId:'original-network',points:321,name:'既有姓名'}});
  const f=fixture({firstRef:{referrerId:inviter,networkId:'tampered'},acceptance:answer});await f.run();
  assert.equal(f.context.userRole,'reward');assert.equal(f.context.currentUser.points,321);assert.equal(f.context.currentUser.name,'既有姓名');
  const locked=JSON.parse(f.storage.get('ACTMASTER_FIRST_REF_'+actor));
  assert.equal(locked.referrerId,original);assert.equal(locked.networkId,'original-network');assert.equal(locked.confirmed,true);
  assert.equal(f.context.resolveReferralForRegistration(inviter,'new-network').referrerId,original);
  assert.equal(f.context.writeFirstReferral(actor,inviter,'new-network').referrerId,original);noBusinessLoads(f);
});

test('existing fixed network with empty ref remains empty when later saving a personal profile',async()=>{
  const answer=accepted({binding:{status:'existing',referrerId:'',networkId:'fixed-network'},
    info:{userId:actor,lineId:actor,role:'user',referrerId:'',networkId:'fixed-network'}});
  const f=fixture({firstRef:{referrerId:inviter,networkId:'untrusted'},acceptance:answer});await f.run();
  assert.equal(f.context.resolveReferralForRegistration(inviter,'url-network').referrerId,'');
  assert.equal(f.context.writeFirstReferral(actor,inviter,'new-network').referrerId,'');
  noBusinessLoads(f);
  f.node('profile-name').value='本人填寫';f.node('profile-phone').value='0900000000';
  f.node('profile-industry').value='';f.node('profile-birthday').value='';
  f.context.getSocialLikeActorId=()=>actor;
  f.context.requirePrivacyTermsAgreement=id=>{f.calls.push(['privacy',id]);return true;};
  f.context.fetchAPI=async(action,payload)=>{f.calls.push(['profile-api',action,payload]);return action==='checkUser'?{isRegistered:true,info:answer.info}:{success:true};};
  vm.runInContext(block(source,'window.saveProfileRegistration = async function(', 'window.submitClaimRegistration = async function('),f.context);
  await f.context.saveProfileRegistration();
  const update=f.calls.find(call=>call[0]==='profile-api'&&call[1]==='updateUserProfile');
  assert.equal(update[2].referrerId,'');assert.equal(update[2].networkId,'fixed-network');
  assert.equal(f.calls.filter(call=>call[0]==='privacy').length,1);
});

test('canonical alias-self acceptance does not bind or fake completed membership',async()=>{
  const f=fixture({result:{isRegistered:false},acceptance:accepted({binding:{status:'self',referrerId:'',networkId:'admin'},isRegistered:false,info:null})});await f.run();
  assert.equal(f.context.currentUser.isRegistered,false);assert.equal(f.context.currentUser.referrerId,'');
  assert.equal(f.storage.has('ACTMASTER_FIRST_REF_'+actor),false);assert(events(f).includes('store'));noBusinessLoads(f);
  const canonical='U'+'d'.repeat(32);
  const alias=fixture({acceptance:accepted({binding:{status:'existing',referrerId:inviter,networkId:'owner-net'},info:{userId:canonical,lineId:canonical,role:'user',referrerId:inviter,networkId:'owner-net'}})});await alias.run();
  assert.equal(alias.context.currentUser.userId,canonical);assert.equal(alias.context.currentUserProfile.userId,actor);
  assert(events(alias).includes('store'));noBusinessLoads(alias);
});

test('reopening an accepted invite still confirms durable attribution idempotently',async()=>{
  const first=fixture({acceptance:accepted()});await first.run();
  const locked=JSON.parse(first.storage.get('ACTMASTER_FIRST_REF_'+actor));
  const second=fixture({firstRef:locked,acceptance:accepted({binding:{status:'existing',referrerId:inviter,networkId:'owner-net'}})});await second.run();
  assert.equal(second.calls.filter(call=>call[0]==='accept').length,1);assert.equal(second.context.currentUser.referrerId,inviter);noBusinessLoads(second);
});

test('invalid invitation input and missing tokens fail without a write or applying cached authority',async()=>{
  for(const options of [{search:invite.replace(inviter,'not-a-LINE-UID')},{token:''}]) {
    const f=fixture({...options,cached:{userId:actor,role:'admin'}});await f.run();
    assert(events(f).includes('retry'));assert(!events(f).includes('accept'));assert(!events(f).includes('session'));assert(!events(f).includes('store'));
    assert.equal(f.storage.has('ACTMASTER_FIRST_REF_'+actor),false);noBusinessLoads(f);
  }
});

test('failed or malformed accept responses never establish local ownership or navigate as bound',async()=>{
  const malformed=[null,{},accepted({success:false}),accepted({httpOk:false}),accepted({error:'rejected'}),
    accepted({shopId:'another-shop'}),accepted({actorUserId:inviter}),accepted({binding:null}),
    accepted({binding:{status:'unknown',referrerId:inviter,networkId:'owner-net'}}),
    accepted({binding:{status:'bound',referrerId:'',networkId:'owner-net'}}),
    accepted({binding:{status:'existing',referrerId:inviter,networkId:''}}),
    accepted({info:{userId:actor,role:'user',referrerId:'different-ref',networkId:'owner-net'}}),
    accepted({info:{userId:actor,role:'user',referrerId:inviter,networkId:'different-net'}}),
    accepted({binding:{status:'self',referrerId:inviter,networkId:'owner-net'},info:{userId:actor,role:'user',referrerId:'',networkId:'owner-net'}}),
    accepted({binding:{status:'existing',referrerId:'',networkId:'owner-net'},isRegistered:false,info:null}),
    accepted({isRegistered:'true'}),accepted({info:null}),accepted({info:[]}),accepted({info:{role:'admin'}})];
  for(const acceptance of malformed) {
    const f=fixture({acceptance,cached:{userId:actor,role:'admin'}});await f.run();
    assert(events(f).includes('retry'));assert(!events(f).includes('session'));assert(!events(f).includes('store'));
    assert.equal(f.storage.has('ACTMASTER_FIRST_REF_'+actor),false);noBusinessLoads(f);
  }
  for(const fetchError of [Error('offline'),Object.assign(Error('timeout'),{name:'AbortError'})]) {
    const f=fixture({fetchError});await f.run();assert(events(f).includes('retry'));assert(!events(f).includes('session'));assert(!events(f).includes('store'));noBusinessLoads(f);
  }
});

test('account or token changes across either request are rejected before applying a session',async()=>{
  const changedDuringCheck=fixture({result:()=>{changedDuringCheck.context.currentUserProfile.userId=inviter;return {isRegistered:false};}});
  await changedDuringCheck.run();assert(!events(changedDuringCheck).includes('accept'));assert(events(changedDuringCheck).includes('retry'));
  for(const options of [
    {fetchHook:ctx=>{ctx.currentToken='another-token';}},
    {jsonHook:ctx=>{ctx.currentUserProfile.userId=inviter;}},
    {jsonHook:ctx=>{ctx.loggedIn=false;}}
  ]) {
    const f=fixture(options);await f.run();assert(events(f).includes('retry'));assert(!events(f).includes('session'));assert(!events(f).includes('store'));
    assert.equal(f.storage.has('ACTMASTER_FIRST_REF_'+actor),false);noBusinessLoads(f);
  }
});

test('authoritative empty referral remains in memory when browser storage is unavailable',async()=>{
  const f=fixture({acceptance:accepted({binding:{status:'existing',referrerId:'',networkId:'fixed-network'},
    info:{userId:actor,role:'user',referrerId:'',networkId:'fixed-network'}})});
  f.context.localStorage.setItem=()=>{throw Error('storage blocked');};
  await f.run();
  assert.equal(f.context.resolveReferralForRegistration(inviter,'tampered').referrerId,'');
  assert.equal(f.context.resolveReferralForRegistration(inviter,'tampered').networkId,'fixed-network');
  assert(events(f).includes('store'));noBusinessLoads(f);
});
