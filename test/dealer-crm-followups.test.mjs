import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewardFixture, ADMIN, REWARD, OTHER} from './fixtures/reward-unit-directory.mjs';
import {dealerCrmFollowups} from '../worker/dealer-crm-followups.mjs';

test('dealer timeline survives reopen, isolates members and handles duplicate submissions', async t => {
  const {db,sql} = rewardFixture();
  t.after(() => sql.close());
  sql.exec(readFileSync(new URL('../migrations/0077_hand_sign_contracts.sql',import.meta.url),'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0080_dealer_crm_followups.sql',import.meta.url),'utf8'));
  const admin = {role:'admin',token:'test',userId:ADMIN};
  const record = {targetUserId:REWARD,requestId:crypto.randomUUID(),owner_name:'負責人',outcome:'已聯絡',next_action:'寄出報價',due_date:'2026-11-12'};
  const add = (body,actor=admin) => dealerCrmFollowups('adminAppendDealerFollowup',body,actor,db);
  const read = targetUserId => dealerCrmFollowups('adminListDealerFollowups',{targetUserId},admin,db);
  assert.equal((await add(record,{role:'store',token:'test'})).success,false);
  assert.equal((await add(record,{role:'admin'})).success,false);
  assert.equal((await add({...record,due_date:'2026-02-30'})).success,false);
  assert.equal((await add(record)).success,true);
  assert.equal((await add(record)).data.history.length,1);
  assert.equal((await add({...record,outcome:'不同內容'})).success,false);
  assert.equal((await add({...record,requestId:crypto.randomUUID(),outcome:'第二次聯絡'})).success,true);
  assert.deepEqual((await read(REWARD)).data.history.map(r=>r.outcome),['第二次聯絡','已聯絡']);
  assert.equal((await read(OTHER)).data.history.length,0);
  assert.equal((await read(REWARD)).data.signed,null);
});
