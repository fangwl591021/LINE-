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

function fixture({search=invite, result={isRegistered:true, info:{userId:actor, role:'store'}}, loggedIn=true, friendship=true, cached, firstRef}={}) {
  const calls=[], timers=[], nodes=new Map(), storage=new Map();
  if(cached) storage.set('ACTMASTER_USER_' + actor, JSON.stringify({info:cached, savedAt:Date.now()}));
  if(firstRef) storage.set('ACTMASTER_FIRST_REF_' + actor, JSON.stringify(firstRef));
  const node = id => {
    if(!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, {id, textContent:'', classList:{add:name=>classes.add(name), remove:name=>classes.delete(name), contains:name=>classes.has(name)}, classes});
    }
    return nodes.get(id);
  };
  const location = new URL('https://example.invalid/LINE-/index.html' + search);
  location.replace = url => calls.push(['replace',url]);
  const context = {
    URL,URLSearchParams,Date,console:{warn(){},error(){}},LIFF_ID:'mock-liff',location,
    document:{getElementById:node,addEventListener(name,fn){if(name==='DOMContentLoaded')context.ready=fn;}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
    setTimeout:fn=>{timers.push(fn);return timers.length;},
    liff:{isLoggedIn:()=>loggedIn,getAccessToken:()=> 'mock-access-token'},
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
    goPage:page=>calls.push(['page',page]),
    fetchAPI:async(action,payload)=>{calls.push(['api',action,payload]);if(action!=='checkUser')throw Error('Unexpected API '+action);return typeof result==='function'?result():result;},
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
  vm.runInContext(block(configSource,'function readActmasterInitialParams()', 'function hasNfcCheckinParams'),context);
  // Exercise the real shared parser, not a second implementation of its route-conflict policy.
  vm.runInContext(readFileSync(new URL('../js/modules/store-invite-route.js',import.meta.url),'utf8'),context);
  vm.runInContext(block(source,'function getReferralStorageKey(', 'function pendingMotherRegistrationKey('),context);
  vm.runInContext(block(source,'function resolveReferralForRegistration(', 'function trackManualInputField('),context);
  vm.runInContext(block(source,'window.applyRegisteredUserSession = function(', 'window.setPointWalletStatus = function('),context);
  const applySession=context.applyRegisteredUserSession;
  context.applyRegisteredUserSession=(info,options)=>{calls.push(['session',{...info}]);return applySession(info,options);};
  vm.runInContext(block(source,'window.applyUnregisteredHomeSession = function(', 'window.reorderSettingsSections = function('),context);
  const start=source.lastIndexOf("document.addEventListener('DOMContentLoaded', async () => {");
  assert(start>0);vm.runInContext(source.slice(start),context);
  return {context,calls,storage,nodes,async run(){await context.ready();for(let i=0;i<timers.length;i++){assert(i<30);await timers[i]();}}};
}

const events = f => f.calls.map(call=>call[0]);
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
  assert.equal(f.context.userRole,'store');noBusinessLoads(f);
});

test('confirmed unregistered invite browses as user without auto-registration or card recovery',async()=>{
  const f=fixture({result:{isRegistered:false},cached:{userId:actor,role:'admin'}});await f.run();
  assert.equal(f.context.currentUser.isRegistered,false);assert.equal(f.context.userRole,'user');
  assert.equal(f.context.currentUser.userId,actor);assert.equal(f.context.currentUser.referrerId,inviter);
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

test('existing first referral survives a different store invite and self referrals are not recorded',async()=>{
  const first={referrerId:'U'+'c'.repeat(32),networkId:'original-net'};
  const f=fixture({firstRef:first,result:{isRegistered:false}});await f.run();
  assert.deepEqual(JSON.parse(f.storage.get('ACTMASTER_FIRST_REF_'+actor)),first);
  assert.equal(f.context.currentUser.referrerId,first.referrerId);assert.equal(f.context.currentUser.networkId,first.networkId);
  const self=fixture({search:invite.replace(inviter,actor),result:{isRegistered:false}});await self.run();
  assert.equal(self.storage.has('ACTMASTER_FIRST_REF_'+actor),false);
  assert.equal(self.context.currentUser.referrerId,'');
});

test('nested LIFF state and short referral aliases reach the same store without impersonation',async()=>{
  const f=fixture({search:'?liff.state='+encodeURIComponent('/?shopSection=store&shopId='+shopId+'&r='+inviter+'&n=ref-net&v=ref-track')});await f.run();
  assert.equal(f.calls.find(call=>call[0]==='store').at(-1),shopId);
  assert.equal(f.context.currentUser.userId,actor);
  assert.equal(JSON.parse(f.storage.get('ACTMASTER_FIRST_REF_'+actor)).networkId,'ref-net');noBusinessLoads(f);
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
