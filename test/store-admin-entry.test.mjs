import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker from '../worker-entry.mjs';
import {storeInviteProfileView} from '../workerbackup.js';

const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const front=read('js/modules/store-shop.js'),core=read('js/core.js'),html=read('index.html');
const uid='U'+'a'.repeat(32);
const block=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);};

test('settings entry follows admin-only permissions and hides after switching to lower roles',()=>{
  assert.match(html,/id="admin-store-list-entry"[^>]*onclick="window.openStoreShop\('', '', '', 'admin-stores'\)"[^>]*class="hidden /);
  const elements=new Map(),document={querySelector(selector){if(!elements.has(selector))elements.set(selector,{textContent:'',classList:{toggle(name,hidden){this.hidden=hidden;}}});return elements.get(selector);}};
  const window={};vm.runInNewContext(block(core,'    window.applyUserPermissions = function()', '    // 名片資料載入'),{window,document});
  for(const role of ['admin','store','user','reward']){
    window.userRole=role;window.currentUser={role};window.applyUserPermissions();
    assert.equal(elements.get('#admin-store-list-entry').classList.hidden,role!=='admin');
  }
});

test('cache versions and private entry are wired without eager directory loading',()=>{
  const entry=read('js/modules/store-shop-entry.js'),publicPage=read('store-shop.html');
  assert.match(html,/core\.js\?v=7\.33/);assert.match(html,/store-shop-entry\.js\?v=33/);
  for(const source of [entry,publicPage]){assert.match(source,/store-shop\.css\?v=22/);assert.match(source,/store-shop\.js\?v=31/);}
  assert.match(front,/const canAdmin=\(\)=>!standalone/);
  assert.match(front,/case 'admin-stores': await adminStores\(\); break;/);
  assert.match(front,/!standalone&&section==='admin-stores'/);
  assert.doesNotMatch(html+publicPage,/<script[^>]+src="[^"]*store-admin\.js/);
  assert.match(front,/封面建議使用橫式 16:9/);
});

test('actual Worker rejects unauthenticated directory reads and every write before DB access',async()=>{
  const accesses=[];const env={ACTMASTER_DB:{prepare(){accesses.push('db');throw Error('unexpected DB access');},batch(){accesses.push('batch');throw Error('unexpected batch');}}};
  for(const [method,status]of [['GET',401],['POST',405],['PUT',405],['DELETE',405],['OPTIONS',204]]){
    const response=await worker.fetch(new Request('https://worker.test/v1/store-shop/admin/stores',{method}),env,{});
    assert.equal(response.status,status,method);assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.deepEqual(accesses,[]);
});

test('directory is given the existing canonical admin policy, not raw database admin role',()=>{
  const info=storeInviteProfileView({line_id:uid,row_id:uid,role:'admin',name:'測試帳號',phone:'0900000000'});
  assert.equal(info.role,'user');
  assert.match(read('worker-entry.mjs'),/handleStoreAdmin\(request, env, storeInviteProfileView\)/);
});

function setup(){
  const state={allowed:true,loads:0,mounts:[],inserted:[]};
  const root={isConnected:true,dataset:{shopView:''}},content={innerHTML:'',insertAdjacentHTML(_position,text){state.inserted.push(text);}};
  const window={currentPage:'store-shop',currentUserProfile:{userId:uid},liff:{isLoggedIn:()=>true,getAccessToken:()=>state.token||'token-a'}};
  const context={window,root,content,alert:{textContent:''},epoch:0,viewedShop:null,canAdmin:()=>state.allowed,api:async()=>({}),
    pageKind:kind=>root.dataset.shopView=kind,run:fn=>fn(),manage:async()=>{state.back=true;},
    loadModule:async()=>{state.loads++;return {mountStoreAdmin:async(_node,options)=>state.mounts.push(options)};}};
  context.view=async id=>{context.epoch++;context.viewedShop={id};root.dataset.shopView='store';};
  const code=block(front,'    async function adminStores()', '    async function api(').replace("await import('./store-admin.js?v=1')",'await loadModule()');
  context.open=vm.runInNewContext(code+';adminStores',context);
  return {state,context,window,root,content};
}

test('private directory wrapper mounts for current admin and offers public view plus return',async()=>{
  const s=setup();await s.context.open();assert.equal(s.state.mounts.length,1);
  assert.equal(s.state.mounts[0].isCurrent(),true);await s.state.mounts[0].onView('shop-fixture');
  assert.match(s.state.inserted[0],/返回店家列表/);assert.equal(s.state.mounts[0].isCurrent(),false);
});

test('non-admin and logged-out sessions never import or request directory data',async()=>{
  const s=setup();s.state.allowed=false;await assert.rejects(s.context.open(),/僅開放管理員/);assert.equal(s.state.loads,0);
  s.state.allowed=true;s.window.liff.isLoggedIn=()=>false;await assert.rejects(s.context.open(),/請先/);assert.equal(s.state.loads,0);
});

for(const change of ['role','token','account','navigation'])test(`pending admin module is ignored after ${change} changes`,async()=>{
  const s=setup();let release;
  s.context.loadModule=()=>new Promise(resolve=>{release=()=>resolve({mountStoreAdmin:async()=>s.state.mounts.push('stale')});});
  const pending=s.context.open();
  if(change==='role')s.state.allowed=false;
  if(change==='token')s.state.token='token-b';
  if(change==='account')s.window.currentUserProfile.userId='U'+'b'.repeat(32);
  if(change==='navigation')s.window.currentPage='home';
  release();await pending;assert.deepEqual(s.state.mounts,[]);
});
