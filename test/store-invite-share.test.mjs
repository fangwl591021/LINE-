import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read = file => readFileSync(new URL('../'+file, import.meta.url), 'utf8');
const crm = read('js/modules/crm.js');
const share = crm.slice(crm.indexOf('let storeInviteDialog = null;'));
const helper = read('js/modules/store-invite-route.js');
const shopId = '11111111-2222-4333-8444-555555555555';
const shop = {id:shopId, status:'active', name:'我的測試店'};
function setup() {
  const elements = new Map(), requests = [], copied = [], shared = [], toasts = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set(id === 'invite-link-modal' ? ['hidden'] : []);
      elements.set(id, {value:'', src:'', hidden:false, disabled:false, textContent:'', attributes:{},
        classList:{contains:x=>classes.has(x), add:x=>classes.add(x), remove:x=>classes.delete(x),
          toggle:(x,on)=>on?classes.add(x):classes.delete(x)},
        setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this[key];},select(){}});
    }
    return elements.get(id);
  }
  let token = 'test-token';
  const liff = {isLoggedIn:()=>!!token, getAccessToken:()=>token,
    shareTargetPicker:async messages=>{shared.push(messages);return {status:'success'};}};
  const window = {location:new URL('https://store.test/LINE-/index.html?code=secret&ref=old'), liff,
    Config:{WORKER_URL:'https://worker.test/'}, showToast:(...args)=>toasts.push(args),
    buildMemberInviteUrl:params=>'https://liff.line.me/test?'+new URLSearchParams(params)};
  const context = vm.createContext({window,liff,URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout,
    navigator:{clipboard:{writeText:async url=>copied.push(url)}}, document:{getElementById:element},
    currentUserProfile:{userId:'U_OWNER'}, currentUser:{name:'店主',storeid:'not-a-shop-uuid',role:'user'},
    currentNetworkId:'owner-network', LIFF_ID:'test',
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,resolve})), console});
  vm.runInContext(helper+'\n'+share,context);
  function reply(index=0, payload={success:true,shop}, ok=true) {
    requests[index].resolve({ok,json:async()=>payload});
  }
  return {window,context,element,requests,reply,copied,shared,toasts,setToken:value=>token=value};
}
test('default remains original invitation without a shop lookup; QR, copy and LINE all use that URL',async()=>{
  const s=setup();s.window.showInviteLink();
  const url=s.element('invite-link-input').value;
  assert.match(url,/^https:\/\/liff.line.me\/test\?/);assert.equal(s.requests.length,0);
  assert.equal(new URL(url).searchParams.get('ref'),'U_OWNER');
  await s.window.copyInviteLink();await s.window.shareInviteLink();
  assert.equal(s.copied[0],url);assert.ok(s.shared[0][0].text.endsWith(url));
  assert.equal(new URL(s.element('invite-qr-img').src).searchParams.get('data'),url);
});
test('explicit store choice resolves own active store with a read-only authenticated lookup and one coherent URL',async()=>{
  const s=setup();const pending=s.window.showInviteLink('store');
  assert.equal(s.element('invite-link-input').value,'');assert.equal(s.element('invite-copy-button').disabled,true);
  assert.equal(s.element('invite-qr-img').hidden,true);
  assert.equal(s.requests[0].url,'https://worker.test/v1/store-shop/manage');
  assert.equal(s.requests[0].options.method,'GET');assert.equal(s.requests[0].options.headers.Authorization,'Bearer test-token');
  assert.equal(s.requests[0].options.body,undefined);
  s.reply();await pending;
  const url=s.element('invite-link-input').value, parsed=new URL(url);
  assert.equal(parsed.pathname,'/LINE-/store-shop.html');assert.equal(parsed.searchParams.get('shop'),shopId);
  assert.deepEqual([...parsed.searchParams.keys()],['shop','ref','net','via']);
  assert.equal(parsed.searchParams.get('ref'),'U_OWNER');assert.equal(parsed.searchParams.get('net'),'owner-network');
  assert.equal(s.element('invite-copy-button').disabled,false);
  await s.window.copyInviteLink();await s.window.shareInviteLink();
  assert.equal(s.copied[0],url);assert.ok(s.shared[0][0].text.endsWith(url));
  assert.doesNotMatch(s.shared[0][0].text,/名片庫|商機配對/);
  assert.equal(new URL(s.element('invite-qr-img').src).searchParams.get('data'),url);
});
test('missing, draft, archived and invalid stores cannot create a shareable invitation or auto-publish',async()=>{
  for (const invalid of [null,{...shop,status:'draft'},{...shop,status:'archived'},{...shop,id:'not-a-shop'}]) {
    const s=setup();const pending=s.window.showInviteLink('store');s.reply(0,{success:true,shop:invalid});await pending;
    assert.equal(s.element('invite-link-input').value,'');assert.equal(s.element('invite-copy-button').disabled,true);
    assert.match(s.element('invite-destination-status').textContent,/建立並公開店面/);
    await s.window.copyInviteLink();await s.window.shareInviteLink();
    assert.equal(s.copied.length+s.shared.length,0);assert.equal(s.requests.length,1);
  }
});
test('switching back to functional invite cancels lookup and late response cannot replace its QR/link',async()=>{
  const s=setup();const pending=s.window.showInviteLink('store');await s.window.selectInviteDestination('function');
  const original=s.element('invite-link-input').value;assert.equal(s.requests[0].options.signal.aborted,true);
  s.reply();await pending;assert.equal(s.element('invite-link-input').value,original);
  assert.equal(new URL(s.element('invite-qr-img').src).searchParams.get('data'),original);
});
test('close, reopen, account changes and token changes discard late store responses',async()=>{
  for (const action of ['close','reopen','account','token']) {
    const s=setup();const pending=s.window.showInviteLink('store');
    if(action==='close')s.window.closeInviteModal();
    if(action==='reopen'){s.window.closeInviteModal();s.window.showInviteLink();}
    if(action==='account')s.context.currentUserProfile={userId:'U_OTHER'};
    if(action==='token')s.setToken('different-token');
    const before=s.element('invite-link-input').value;s.reply();await pending;
    assert.equal(s.element('invite-link-input').value,before);assert.doesNotMatch(before,/store-shop.html/);
  }
});
test('second store lookup wins and HTTP failures never leave the previous destination shareable',async()=>{
  const s=setup();const first=s.window.showInviteLink('store');const second=s.window.selectInviteDestination('store');
  s.reply(1,{success:true,shop});await second;s.reply(0,{success:true,shop:{...shop,id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}});await first;
  assert.equal(new URL(s.element('invite-link-input').value).searchParams.get('shop'),shopId);
  const third=s.window.selectInviteDestination('store');s.reply(2,{error:'private provider details'},false);await third;
  assert.equal(s.element('invite-link-input').value,'');assert.doesNotMatch(s.element('invite-destination-status').textContent,/private provider/);
});
test('logged out and tampered input cannot share or perform an owner lookup',async()=>{
  const s=setup();s.setToken('');await s.window.showInviteLink('store');assert.equal(s.requests.length,0);
  assert.match(s.element('invite-destination-status').textContent,/請先登入/);
  s.setToken('test-token');s.window.showInviteLink();s.element('invite-link-input').value='https://evil.test/';
  await s.window.copyInviteLink();await s.window.shareInviteLink();assert.equal(s.copied.length+s.shared.length,0);
});
test('main and public pages load the same helper before their consumers; lazy store version is synchronized',()=>{
  const html=read('index.html'),publicHtml=read('store-shop.html'),entry=read('js/modules/store-shop-entry.js');
  for(const consumer of ['js/modules/store-shop-entry.js?v=42','js/modules/crm.js?v=7.9','js/auth.js?v=11.03'])
    assert.ok(html.indexOf('js/modules/store-invite-route.js?v=1')<html.indexOf(consumer) && html.includes(consumer));
  assert.ok(publicHtml.indexOf('js/modules/store-invite-route.js?v=1')<publicHtml.indexOf('js/modules/store-shop.js?v=40'));
  assert.match(entry,/store-shop\.js\?v=40/);
  assert.doesNotMatch(publicHtml,/js\/auth|sdk\.line|liff\.init|modules\/home|modules\/cardmaster/);
  for(const id of ['invite-destination-function','invite-destination-store','invite-copy-button','invite-share-button','invite-destination-status'])assert.ok(html.includes('id="'+id+'"'));
  assert.match(html,/aria-label="關閉邀約連結"/);
});
