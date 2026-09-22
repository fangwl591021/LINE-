import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyGomokuReplay,createGame,chooseMove,placeMove} from '../js/modules/gomoku-engine.mjs';
import {gomokuWin,gomokuLoss} from './helpers/gomoku-player.mjs';
import {gameFixture} from './helpers/game-fixture.mjs';
import {winningBlockReplay} from './helpers/block-player.mjs';
import {winningReplay} from './helpers/tank-player.mjs';
const loss=gomokuLoss(),block=winningBlockReplay(1).replay,tank=winningReplay(1,2).replay;
test('fixed normal seeded replay accepts actual win/loss and rejects forged or nonterminal input',()=>{
 assert.deepEqual(verifyGomokuReplay(1,gomokuWin,120000),{state:'won',score:100,moves:55,draw:false,durationMs:120000});
 assert.equal(verifyGomokuReplay(1,loss,120000).state,'lost');
 for(const proof of [null,[],[[0,0]],[[0,0],[0,0]],[[15,0]],[[1.5,0]],[[null,0]],[[0,'0']],[[0,0,1]],gomokuWin.slice(0,-1),[...gomokuWin,[14,14]],Array(114).fill([0,0])])assert.equal(verifyGomokuReplay(1,proof,120000),null);
 for(const duration of [0,100,NaN,Infinity,1200001])assert.equal(verifyGomokuReplay(1,gomokuWin,duration),null);
 for(const seed of [-1,NaN,4294967296])assert.equal(verifyGomokuReplay(seed,gomokuWin,120000),null);
 const game=createGame();while(!game.winner&&!game.draw){const m=chooseMove(game.board,game.turn,'normal',1);placeMove(game,m.x,m.y);}
 assert.equal(game.draw,true);const draw=game.moves.filter(m=>m.side===1).map(m=>[m.x,m.y]);assert.equal(verifyGomokuReplay(1,draw,120000).draw,true);assert.equal(verifyGomokuReplay(1,draw,120000).score,0);
});
test('any of three games can earn first; remaining victories share the original unique daily 100',async()=>{
 for(const order of [['gomoku','block_supply','tank_defense'],['tank_defense','gomoku','block_supply'],['block_supply','tank_defense','gomoku']]){
  const f=gameFixture();try{
   const sessions={};for(const id of order)sessions[id]=await f.start(id,id==='tank_defense');f.time+=120000;
   for(let i=0;i<order.length;i++){const id=order[i],r=await f.finish(sessions[id],{gomoku:gomokuWin,block_supply:block,tank_defense:tank}[id],id==='tank_defense');assert.equal(r.success,true);assert.equal(r.data.awarded,i===0);assert.equal(r.data.scoreSaved,true);}
   assert.equal(f.balance,400);assert.equal(f.sends,1);assert.equal(f.sql.prepare('SELECT count(*) n FROM point_awards').get().n,1);
   const status=(await f.call('gameCenterStatus')).data;assert.equal(status.games.length,3);assert(status.games.every(g=>g.completedToday));assert.equal(status.weeklyCompletions,3);
   if(order[0]==='gomoku'){assert.equal(f.last.eventName,'每日喵喵五子棋挑戰');assert.equal(f.last.shop_remark,'challenge_id=daily_tank_challenge:78:canonical:2026-09-21');}
  }finally{f.sql.close();}
 }
});
test('gomoku duplicate and parallel sessions reserve exactly one reward and persist each result once',async()=>{
 const f=gameFixture();try{const a=await f.start('gomoku'),b=await f.start('gomoku');f.time+=120000;f.mode='wait';const pending=f.finish(a,gomokuWin);while(!f.release)await new Promise(r=>setTimeout(r,1));
  const results=await Promise.all(Array.from({length:8},(_,i)=>f.finish(i%2?a:b,gomokuWin)));assert(results.every(r=>r.data.state==='pending'));assert.equal(f.sends,1);f.release();assert.equal((await pending).data.awarded,true);
  assert.equal((await f.finish(b,gomokuWin)).data.alreadyCompleted,true);assert.equal(f.sql.prepare("SELECT count(*) n FROM game_play_events WHERE event_type='game_complete'").get().n,2);
 }finally{f.sql.close();}
});
test('gomoku keeps LINE identity, nonce, tenant, deadline and server-only points protections',async()=>{
 const f=gameFixture();try{const s=await f.start('gomoku');f.time+=120000;const payload={...s,seed:-1,replay:gomokuWin,points:999999,score:999999,level:'easy'};
  for(const fields of [{nonce:'wrong'},{gameId:'tank_defense'},{gameId:'block_supply'},{replay:[[0,0]],winner:1}])assert.equal((await f.call('completeGame',{...payload,...fields})).success,false);
  assert.equal((await f.legacy('completeDailyTank',payload)).success,false);
  assert.equal((await f.call('completeGame',payload,{userId:'member',token:''})).success,false);
  assert.equal((await f.call('completeGame',payload,{userId:'other',token:'other-test'})).success,false);
  f.env.MOTHER_CUS_ACCOUNT_SHOP_ID='79';assert.equal((await f.finish(s,gomokuWin)).success,false);f.env.MOTHER_CUS_ACCOUNT_SHOP_ID='78';
  f.member='other';assert.equal((await f.finish(s,gomokuWin)).success,false);f.member='canonical';
  f.hasUser=false;assert.equal((await f.finish(s,gomokuWin)).success,false);f.hasUser=true;
  const result=await f.call('completeGame',payload);assert.equal(result.data.result.score,100);assert.equal(f.last.points,100);
  const expired=await f.start('gomoku');f.time+=1200001;assert.equal((await f.finish(expired,gomokuWin)).success,false);assert.equal(f.sends,1);
 }finally{f.sql.close();}
});
test('gomoku rollback, lost upstream response, retry and Taiwan midnight preserve existing receipt semantics',async()=>{
 const f=gameFixture();try{const s=await f.start('gomoku');f.time+=120000;f.failBatch=true;assert.equal((await f.finish(s,gomokuWin)).success,false);assert.equal(f.sql.prepare('SELECT status FROM daily_tank_sessions').get().status,'started');assert.equal(f.sends,0);
  f.failBatch=false;f.mode='committed-timeout';assert.equal((await f.finish(s,gomokuWin)).data.state,'pending');assert.equal((await f.finish(s,gomokuWin)).data.state,'completed');assert.equal(f.sends,1);
  const old=await f.start('gomoku');f.time=Date.parse('2026-09-21T16:00:00Z');assert.equal((await f.finish(old,gomokuWin)).success,false);assert.equal((await f.call('gameCenterStatus')).data.state,'available');
  f.mode='success';const next=await f.start('gomoku');f.time+=120000;assert.equal((await f.finish(next,gomokuWin)).data.awarded,true);assert.equal(f.sends,2);
 }finally{f.sql.close();}
});
test('gomoku loss saves no reward and cannot be rewritten as a win',async()=>{
 const f=gameFixture();try{const s=await f.start('gomoku');f.time+=120000;assert.equal((await f.finish(s,loss)).data.state,'failed');assert.equal((await f.finish(s,gomokuWin)).data.state,'failed');assert.equal(f.sends,0);assert.equal((await f.call('gameCenterStatus')).data.state,'available');}finally{f.sql.close();}
});
test('game center practice has no start/complete API; integration uses existing game session service',()=>{
 const source=readFileSync(new URL('../js/modules/game-center.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source.slice(source.indexOf('async function practiceGomoku'),source.indexOf('async function confirm')),/gameAPI\(|onComplete|pendingGame/);
 assert.match(source,/module\.createGomoku/);assert.match(source,/gameId==='gomoku'/);
});
