import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../worker-entry.mjs';
import {storeInviteProfileView} from '../workerbackup.js';

const uid='U'+'a'.repeat(32),owner='U'+'b'.repeat(32),shopId='11111111-2222-4333-8444-555555555555';
test('production mapper retains canonical member data and existing reward-only permission',()=>{
  const row={row_id:'row-a',line_id:uid,name:'方萬隆',phone:'0900000000',role:'reward',referrer_id:owner,network_id:'existing-network',points:123,
    birthday:'2000-01-01',store_id:'my-store-code',legacy_line_id:'U'+'c'.repeat(32),point_line_id:uid};
  const original=JSON.stringify(row),info=storeInviteProfileView(row);
  assert.equal(info.userId,uid);assert.equal(info.role,'reward');assert.equal(info.referrerId,owner);
  assert.equal(info.networkId,'existing-network');assert.equal(info.points,123);assert.equal(info.phone,row.phone);
  assert.equal(info.storeid,'my-store-code');assert.equal(info.legacyLineId,row.legacy_line_id);
  assert.equal(JSON.stringify(row),original);assert.equal(storeInviteProfileView(null),null);
});
test('bare stored member mapping does not invent personal fields or point balance',()=>{
  const info=storeInviteProfileView({row_id:uid,line_id:uid,role:'user',referrer_id:owner,network_id:owner});
  assert.equal(info.role,'user');assert.equal(info.phone,'');assert.equal(info.birthday,'');assert.equal(info.points,0);
  assert.equal(info.referrerId,owner);assert.equal(info.networkId,owner);assert.equal(info.privacyAccepted,undefined);
});
test('actual Worker routes invite preflight and unauthenticated POST before catalog or legacy writes',async()=>{
  const mutations=[];
  const env={ACTMASTER_DB:{prepare(){mutations.push('db');throw Error('Unauthenticated request may not query users');}},
    ACTMASTER_KV:{put(){mutations.push('kv');throw Error('Unauthenticated request may not persist');}}};
  const options=await worker.fetch(new Request('https://worker.test/v1/store-shop/invite/accept',{method:'OPTIONS'}),env,{});
  assert.equal(options.status,204);assert.match(options.headers.get('Access-Control-Allow-Headers'),/Authorization/i);
  const response=await worker.fetch(new Request('https://worker.test/v1/store-shop/invite/accept',{method:'POST',
    headers:{'Content-Type':'application/json'},body:JSON.stringify({shopId,referrerId:owner})}),env,{});
  assert.equal(response.status,401);assert.equal((await response.json()).success,false);assert.deepEqual(mutations,[]);
});
test('public store browsing still passes through the old read-only catalog route',async()=>{
  const queries=[];
  const env={ACTMASTER_DB:{prepare(sql){queries.push(sql);return {bind(){return this;},
    async first(){return {id:shopId,name:'Public fixture',status:'active'};},async all(){return{results:[]};},
    async run(){throw Error('Public browsing cannot mutate');}};}}};
  const response=await worker.fetch(new Request('https://worker.test/v1/store-shop?shop='+shopId),env,{});
  assert.equal(response.status,200);assert.equal((await response.json()).shop.id,shopId);
  assert.ok(queries.every(sql=>sql.trim().startsWith('SELECT')));assert.equal(queries.length,2);
});
test('new binding endpoint is isolated from generic registration, rewards and cards',()=>{
  const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
  const binding=read('worker/store-invite-binding.mjs'),entry=read('worker-entry.mjs');
  for(const call of ['registerUser(',"fetchAPI('registerUser'",'ensureReferralPlaceholderCard(',
    'storeAdjustCustomerPoints(', 'insertUserPoint(', 'syncMotherMemberRegistration(', 'upsertBoundUserFromCard('])assert.ok(!binding.includes(call),call);
  assert.ok(entry.indexOf('await handleStoreInviteBinding(')<entry.indexOf('await handleStoreShop('));
  assert.match(read('index.html'),/js\/auth\.js\?v=11\.02/);
  assert.match(read('js/modules/crm.js'),/LINE 登入後自動記錄邀請歸屬/);
});
