import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const helperSource=readFileSync(new URL('../js/modules/store-invite-route.js',import.meta.url),'utf8');
const configSource=readFileSync(new URL('../js/config.js',import.meta.url),'utf8');
const parserStart=configSource.indexOf('function readActmasterInitialParams()');
const parserEnd=configSource.indexOf('function hasNfcCheckinParams',parserStart);
assert.ok(parserStart>=0&&parserEnd>parserStart,'Extract the production LIFF initial-params parser');
const parserSource=configSource.slice(parserStart,parserEnd);
const shopId='abcdefab-1234-5678-9abc-def012345678';
const otherShop='98765432-abcd-4321-abcd-123456789abc';
const base='https://store.example.test/LINE-/';

function setup(search='',pathname='index.html'){
 const url=new URL(pathname+search,base);
 const location={href:url.href,search:url.search,origin:url.origin,pathname:url.pathname};
 const forbidden=()=>{throw new Error('Routing must not perform network, identity, AI, or storage operations');};
 const window={location,fetch:forbidden,liff:{init:forbidden,getProfile:forbidden,getAccessToken:forbidden},localStorage:{getItem:forbidden,setItem:forbidden}};
 const context={window,location,URL,URLSearchParams,decodeURIComponent,console,fetch:forbidden};
 vm.runInNewContext(helperSource+'\n'+parserSource+'\nwindow.readActmasterInitialParams=readActmasterInitialParams;',context);
 return {route:window.StoreInviteRoute,parse:window.readActmasterInitialParams,window};
}

test('accepts only complete UUID shop IDs and canonicalizes valid IDs to lowercase',()=>{
 const {route}=setup();
 for(const id of [shopId,shopId.toUpperCase(),'00000000-0000-0000-0000-000000000000'])assert.equal(route.isShopId(id),true,id);
 for(const id of ['',null,undefined,42,{},['abcdefab-1234-5678-9abc-def012345678'],' '+shopId,shopId+' ',shopId+'\n',shopId.slice(1),'U'+'a'.repeat(32),'abcdefag-1234-5678-9abc-def012345678','../store-shop.html','https://evil.test/'+shopId,shopId+'?admin=1']){
  assert.equal(route.isShopId(id),false,String(id));
  assert.equal(route.buildPublicUrl(id), '');
  assert.equal(route.buildLoginUrl(id), '');
 }
 assert.equal(new URL(route.buildPublicUrl(shopId.toUpperCase())).searchParams.get('shop'),shopId);
 assert.equal(route.readTarget({shopSection:'store',shopId:shopId.toUpperCase()}),shopId);
});

test('public and login builders use fixed same-origin paths and strip original query and fragment',()=>{
 const {route}=setup('?code=original-secret&access_token=secret&shopId='+otherShop+'#private','store-shop.html');
 const hostile={ref:'referrer',net:'network',via:'store-invite',redirect:'https://evil.test/',returnTo:'//evil.test/',url:'javascript:alert(1)',shop:otherShop,shopId:otherShop,shopSection:'cashier'};
 const publicUrl=new URL(route.buildPublicUrl(shopId,hostile));
 const loginUrl=new URL(route.buildLoginUrl(shopId,hostile));
 assert.equal(publicUrl.origin,new URL(base).origin);
 assert.equal(publicUrl.pathname,'/LINE-/store-shop.html');
 assert.equal(loginUrl.origin,new URL(base).origin);
 assert.equal(loginUrl.pathname,'/LINE-/index.html');
 assert.equal(publicUrl.hash,'');assert.equal(loginUrl.hash,'');
 assert.deepEqual([...publicUrl.searchParams], [['shop',shopId],['ref','referrer'],['net','network'],['via','store-invite']]);
 assert.deepEqual([...loginUrl.searchParams], [['shopSection','store'],['shopId',shopId],['ref','referrer'],['net','network'],['via','store-invite']]);
});

test('attribution accepts params, object, and default location while excluding every unapproved source key',()=>{
 const source=new URLSearchParams({ref:'  invite-user  ',net:'network',via:'qr',code:'oauth-secret',state:'oauth-state','liff.state':'nested-secret',access_token:'access-secret',id_token:'id-secret',lineAccessToken:'line-secret',token:'secret',password:'secret',uid:'private-uid',userId:'private-user',shopProduct:'product',shopQr:'redemption-token',memberProduct:'1'});
 const {route}=setup('?'+source);
 for(const input of [source,Object.fromEntries(source),source.toString(),undefined]){
  const url=new URL(route.buildLoginUrl(shopId,input));
  assert.deepEqual([...url.searchParams], [['shopSection','store'],['shopId',shopId],['ref','invite-user'],['net','network'],['via','qr']]);
  assert.equal(route.readTarget(url.searchParams),shopId);
 }
});

test('attribution omits empty, oversize, and embedded control values without blocking a valid shop route',()=>{
 const {route}=setup();
 for(const invalid of ['', '   ', 'x'.repeat(257), 'a\u0000b', 'a\nb', 'a\rb', 'a\tb', 'a\u007fb']){
  const url=new URL(route.buildPublicUrl(shopId,{ref:invalid,net:'valid-net',via:'valid-via'}));
  assert.equal(url.searchParams.has('ref'),false,JSON.stringify(invalid));
  assert.equal(url.searchParams.get('net'),'valid-net');
  assert.equal(url.searchParams.get('via'),'valid-via');
 }
 assert.equal(new URL(route.buildPublicUrl(shopId,{ref:'x'.repeat(256)})).searchParams.get('ref').length,256);
});

test('attribution preserves existing approved LIFF intent but never copies source secrets or redirects',()=>{
 const {route}=setup();
 const href='https://liff.line.me/1660923784-vViMTZ1y?shopProduct=product-id&memberProduct=1&shopQr=existing-intent';
 const result=new URL(route.withAttribution(href,{ref:'invite-user',net:'network',via:'qr',shopProduct:'different-product',shopQr:'bad-token',code:'source-secret',access_token:'source-secret',redirect:'https://evil.test/'}));
 assert.equal(result.origin,'https://liff.line.me');
 assert.deepEqual([...result.searchParams],[['shopProduct','product-id'],['memberProduct','1'],['shopQr','existing-intent'],['ref','invite-user'],['net','network'],['via','qr']]);
 const cashier=new URL(route.withAttribution('https://liff.line.me/1660923784-vViMTZ1y?shopSection=cashier',{via:'store-invite'}));
 assert.equal(cashier.searchParams.get('shopSection'),'cashier');
 assert.equal(new URL(route.withAttribution('index.html?shopSection=store&shopId='+shopId,{ref:'invite-user'})).origin,new URL(base).origin);
});

test('attribution target rejects foreign origins, lookalike LIFF hosts, and executable protocols',()=>{
 const {route}=setup();
 for(const href of ['https://evil.test/','//evil.test/','https://store.example.test.evil.test/','https://liff.line.me.evil.test/','http://liff.line.me/','https://liff.line.me:8443/','https://liff.line.me@evil.test/','javascript:alert(1)','data:text/html,test','file:///tmp/index.html','mailto:test@example.test'])assert.equal(route.withAttribution(href,{ref:'invite-user'}),'',href);
});

test('main target requires exact explicit store section and one UUID shopId',()=>{
 const {route}=setup();
 for(const source of [{}, {shopId}, {shopSection:'store'}, {shopSection:'Store',shopId}, {shopSection:'mine',shopId}, {shopSection:'store',shop:shopId}, {shopSection:'store',shopId:'invalid'}, {shopSection:'store',shopId:' '+shopId}])assert.equal(route.readTarget(source),'',JSON.stringify(source));
 assert.equal(route.readTarget({shopSection:'store',shopId,ref:'invite-user',net:'network',via:'qr'}),shopId);
});

test('main storefront target rejects existing feature, wallet, admin, and redemption intent conflicts',()=>{
 const {route}=setup();
 const conflicts=['shareCardId','likeCardId','webCardId','web','claim','shopQr','memberProduct','shopProduct','checkin','nfcAct','nfcCheckin','verifyCheckin','checkinRowId','registrationId','activityId','a','admin','adminPage','monitor','lineoaMonitor','open','mode','lineoaKeywordShare','keywordShareRuleId','send','share','autoShare','action','pt_uid','uid','userId','LINE_user_id','lineUserId','pointUserId','wallet_uid'];
 for(const key of conflicts)assert.equal(route.readTarget({shopSection:'store',shopId,[key]:'1'}),'',key);
});

test('main target rejects duplicate shop IDs or sections even when values are identical',()=>{
 const {route}=setup();
 for(const extra of ['&shopId='+shopId,'&shopId='+otherShop,'&shopSection=store','&shopSection=mine'])assert.equal(route.readTarget('shopSection=store&shopId='+shopId+extra),'',extra);
 assert.equal(setup('?shopSection=store&shopId='+shopId+'&shopId='+otherShop).route.readTarget(),'');
});

test('duplicate attribution is normalized to one first value and cannot duplicate route keys',()=>{
 const {route}=setup();
 const params=new URLSearchParams('ref=first&ref=second&net=first-net&net=second-net&via=qr&via=other&shopId='+otherShop+'&shopId='+otherShop);
 const result=new URL(route.buildLoginUrl(shopId,params));
 assert.deepEqual([...result.searchParams],[['shopSection','store'],['shopId',shopId],['ref','first'],['net','first-net'],['via','qr']]);
});

test('production initial-params parser resolves direct, LIFF state, state alias, and double-encoded store routes',()=>{
 const nested='/?shopSection=store&shopId='+shopId.toUpperCase()+'&r=invite-user&n=network&v=qr';
 const encoded=encodeURIComponent(nested);
 for(const search of ['?shopSection=store&shopId='+shopId,'?liff.state='+encoded,'?state='+encoded,'?liff.state='+encodeURIComponent(encoded)]){
  const {route,parse}=setup(search);
  const params=parse();
  assert.equal(route.readTarget(params),shopId,search);
  if(search.includes('state')){
   assert.equal(params.get('ref'),'invite-user');assert.equal(params.get('net'),'network');assert.equal(params.get('via'),'qr');
  }
 }
});

test('production LIFF merge respects explicit outer values and rejects inherited conflicting feature aliases',()=>{
 const nested=encodeURIComponent('/?shopSection=store&shopId='+otherShop+'&ref=inner&net=network&via=qr');
 const {route,parse}=setup('?shopSection=store&shopId='+shopId+'&ref=outer&liff.state='+nested);
 const params=parse();
 assert.equal(route.readTarget(params),shopId);assert.equal(params.get('ref'),'outer');assert.equal(params.get('net'),'network');
 const different=setup('?shopSection=mine&liff.state='+nested);
 assert.equal(different.route.readTarget(different.parse()),'');
 for(const query of ['s=card-id','c=claim-id','a=activity-id','shopQr=redemption-token','memberProduct=1','pt_uid=wallet-user']){
  const current=setup('?liff.state='+encodeURIComponent('/?shopSection=store&shopId='+shopId+'&'+query));
  assert.equal(current.route.readTarget(current.parse()),'',query);
 }
});

test('existing LIFF parser keeps first nested values while explicit outer route fields take precedence',()=>{
 // readTarget rejects duplicates in the params it receives. The shared legacy parser
 // already normalizes nested LIFF state to first values; this public-view route does not change that contract.
 const nested=encodeURIComponent('/?shopSection=store&shopSection=mine&shopId='+shopId+'&shopId='+otherShop);
 const current=setup('?liff.state='+nested),params=current.parse();
 assert.deepEqual(params.getAll('shopSection'),['store']);
 assert.deepEqual(params.getAll('shopId'),[shopId]);
 assert.equal(current.route.readTarget(params),shopId);
 const outer=setup('?shopSection=store&shopId='+otherShop+'&liff.state='+nested);
 assert.equal(outer.route.readTarget(outer.parse()),otherShop);
 const outerDuplicates=setup('?shopSection=store&shopId='+shopId+'&shopId='+otherShop+'&liff.state='+nested);
 assert.equal(outerDuplicates.route.readTarget(outerDuplicates.parse()),'');
});

test('a parsed LIFF login return rebuilds the original store share URL with attribution but no OAuth transport',()=>{
 const {route,parse}=setup('?code=oauth-secret&access_token=access-secret&liff.state='+encodeURIComponent('/?shopSection=store&shopId='+shopId+'&r=invite-user&n=network&v=qr'));
 const params=parse(),target=route.readTarget(params);
 assert.equal(target,shopId);
 assert.equal(route.buildPublicUrl(target,params),base+'store-shop.html?shop='+shopId+'&ref=invite-user&net=network&via=qr');
 assert.equal(route.buildLoginUrl(target,params),base+'index.html?shopSection=store&shopId='+shopId+'&ref=invite-user&net=network&via=qr');
});
