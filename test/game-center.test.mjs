import test from 'node:test';
import assert from 'node:assert/strict';
import {gameFixture} from './helpers/game-fixture.mjs';
import {winningBlockReplay} from './helpers/block-player.mjs';
import {winningReplay} from './helpers/tank-player.mjs';
import {createGame,stepGame,recordInput} from '../js/modules/block-supply-engine.mjs';
import worker from '../workerbackup.js';
const block=winningBlockReplay(1),tank=winningReplay(1,2);
test('either game first shares exactly one award with legacy tank API; practice saves both scores',async()=>{
 for(const blockFirst of [true,false]){const f=gameFixture();try{
  const b=await f.start(),t=await f.start('tank_defense',true);f.time+=120000;
  const a=blockFirst?await f.finish(b,block.replay):await f.finish(t,tank.replay,true);
  const z=blockFirst?await f.finish(t,tank.replay,true):await f.finish(b,block.replay);
  assert(a.data.awarded);assert(z.data.alreadyCompleted);assert(z.data.scoreSaved);assert.equal(f.sends,1);assert.equal(f.balance,400);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM point_awards').get().n,1);
  const stats=(await f.call('gameCenterStatus')).data;assert.equal(stats.state,'completed');assert(stats.games.filter(g=>g.gameId!=='gomoku').every(g=>g.completedToday&&g.bestScore>0));assert.deepEqual(stats.games.find(g=>g.gameId==='gomoku'),{gameId:'gomoku',bestScore:0,completedToday:false});assert.equal(stats.streak,1);assert.equal(stats.weeklyCompletions,2);
  assert.equal((await f.legacy('dailyTankStatus')).data.state,'completed');
  const again=await f.start();f.time+=20000;assert((await f.finish(again,block.replay)).data.alreadyCompleted);assert.equal(f.sends,1);assert.equal((await f.call('gameCenterStatus')).data.weeklyCompletions,3);
 }finally{f.sql.close();}}
});
test('cross-game parallel tabs and duplicate payloads reserve one upstream send; no double score',async()=>{
 const f=gameFixture();try{const b=await f.start(),t=await f.start('tank_defense',true);f.time+=120000;f.mode='wait';const first=f.finish(b,block.replay);while(!f.release)await new Promise(r=>setTimeout(r,1));
  const dup=await Promise.all(Array.from({length:12},(_,i)=>i%2?f.finish(t,tank.replay,true):f.finish(b,block.replay)));assert(dup.every(r=>r.data.state==='pending'));assert.equal(f.sends,1);f.release();assert((await first).data.awarded);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM game_play_events WHERE event_type='game_complete'").get().n,2);
 }finally{f.sql.close();}
});
test('nonce, ownership, game type, expired sessions, fake score and too-fast proofs are rejected',async()=>{
 const f=gameFixture();try{const s=await f.start(),p={sessionId:s.sessionId,gameId:s.gameId,nonce:s.nonce,replay:block.replay};
  assert.equal((await f.call('completeGame',p)).success,false);f.time+=30000;
  for(const extra of [{nonce:'fake'},{gameId:'tank_defense'},{sessionId:'unknown'},{replay:[[1,0]],score:99999},{replay:null}])assert.equal((await f.call('completeGame',{...p,...extra})).success,false);
  assert.equal((await f.call('completeGame',p,{...f.actor,userId:'other'})).success,false);assert.equal((await f.legacy('completeDailyTank',p)).success,false);
  f.time+=21*60000;assert.equal((await f.call('completeGame',p)).success,false);assert.equal(f.sends,0);
  for(const actor of [null,{...f.actor,token:''},{...f.actor,source:'d1_identity_fallback'}])assert.equal((await f.call('startGame',{gameId:'block_supply'},actor)).success,false);
  f.hasUser=false;assert.equal((await f.call('gameCenterStatus')).success,false);
 }finally{f.sql.close();}
});
test('Taipei next day, tenant and canonical member boundaries; old unresolved receipt stays confirmable',async()=>{
 const f=gameFixture();try{const s=await f.start();f.time+=20000;f.mode='committed-timeout';assert.equal((await f.finish(s,block.replay)).data.state,'pending');f.time=Date.parse('2026-09-21T16:00:00Z');assert.equal((await f.call('gameCenterStatus')).data.state,'available');assert.equal((await f.finish(s,block.replay)).data.state,'completed');assert.equal(f.sends,1);
  f.mode='success';const n=await f.start();f.time+=20000;assert((await f.finish(n,block.replay)).data.awarded);assert.equal((await f.call('gameCenterStatus')).data.streak,2);assert.equal(f.sends,2);
  f.env.MOTHER_CUS_ACCOUNT_SHOP_ID='79';assert.equal((await f.call('gameCenterStatus')).data.state,'available');assert.equal((await f.finish(n,block.replay)).success,false);
  f.env.MOTHER_CUS_ACCOUNT_SHOP_ID='78';f.member='other';assert.equal((await f.finish(n,block.replay)).success,false);
 }finally{f.sql.close();}
});
test('batch rollback never leaves a score or reservation; ambiguous upstream is never resent',async()=>{
 for(const mode of ['success','throw','ambiguous','committed-timeout']){const f=gameFixture();try{const s=await f.start();f.time+=20000;f.failBatch=true;assert.equal((await f.finish(s,block.replay)).success,false);assert.equal(f.sql.prepare('SELECT status FROM daily_tank_sessions').get().status,'started');assert.equal(f.sql.prepare('SELECT count(*) n FROM point_awards').get().n,0);assert.equal(f.sends,0);
  f.failBatch=false;f.mode=mode;await f.finish(s,block.replay);const r=await f.finish(s,block.replay);assert.equal(r.data.state,['throw','ambiguous'].includes(mode)?'pending':'completed');assert.equal(f.sends,1);
 }finally{f.sql.close();}}
});
test('failure saves score, never awards; repeated result cannot rewrite saved score',async()=>{
 const f=gameFixture();try{const s=await f.start(),g=createGame(1),replay=[];while(g.state==='playing'){stepGame(g);recordInput(replay,0);}f.time+=100000;const r=await f.finish(s,replay);assert.equal(r.data.state,'failed');assert(r.data.scoreSaved);assert.equal(f.sends,0);
  assert.equal((await f.finish(s,block.replay)).data.state,'failed');assert.equal(f.sql.prepare('SELECT status FROM daily_tank_sessions').get().status,'lost');assert.equal((await f.call('gameCenterStatus')).data.state,'available');
 }finally{f.sql.close();}
});
test('pre-upgrade legacy reservation is honored without adding a new reward key',async()=>{
 const f=gameFixture();try{f.sql.prepare("INSERT INTO point_awards(award_id,user_id,card_id,award_type,points,status) VALUES(?,?,?,?,100,'sent')").run('daily_tank_challenge:78:canonical:2026-09-21','canonical','78:2026-09-21','daily_tank_challenge');const s=await f.start();f.time+=20000;assert((await f.finish(s,block.replay)).data.alreadyCompleted);assert.equal(f.sends,0);
  f.sql.prepare("INSERT INTO point_awards(award_id,user_id,card_id,award_type,points,status) VALUES('checkin','canonical','2026-09-21','daily_checkin',10,'sent')").run();assert.equal(f.sql.prepare("SELECT points FROM point_awards WHERE award_id='checkin'").get().points,10);
 }finally{f.sql.close();}
});
test('events cannot mint scores/rewards or spoof identity; duplicates bounded',async()=>{
 const f=gameFixture();try{const s=await f.start();for(const eventType of ['daily_reward_granted','game_complete','game_fail','bogus'])assert.equal((await f.call('gameEvent',{...s,eventType,eventId:'valid-id-1'})).success,false);
  const p={...s,eventType:'game_pause',eventId:'valid-id-1',userId:'attacker',score:99999};await f.call('gameEvent',p);await f.call('gameEvent',p);const row=f.sql.prepare("SELECT * FROM game_play_events WHERE event_type='game_pause'").get();assert.equal(row.member_id,'canonical');assert.equal(row.score,0);assert(!JSON.stringify(row).includes('token'));
  for(let i=0;i<70;i++)await f.call('gameEvent',{...p,eventId:`bounded-id-${i}`});assert.equal(f.sql.prepare("SELECT count(*) n FROM game_play_events WHERE id LIKE 'client:%'").get().n,64);
  assert.equal(f.sends,0);
 }finally{f.sql.close();}
});
test('actual Worker dispatch denies forged UID-only calls for every game API',async()=>{
 for(const action of ['gameCenterStatus','startGame','completeGame','gameEvent']){const response=await worker.fetch(new Request('https://unit.test/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{userId:'member',authenticatedUserId:'member',role:'admin',gameId:'block_supply',points:100}})}),{});const r=await response.json();assert.equal(r.success,false);assert.match(r.error,/Token/);}
});
