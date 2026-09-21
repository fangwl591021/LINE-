// Local workerd/D1 validation only; no remote database or mother calls.
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {handleDailyTank} from '../worker/daily-tank-challenge.mjs';
import {handleGameCenter} from '../worker/game-center.mjs';
import {winningBlockReplay} from './helpers/block-player.mjs';
import {winningReplay} from './helpers/tank-player.mjs';
const require=createRequire(import.meta.url);
const {Miniflare}=require('C:/Users/User/AppData/Local/npm-cache/_npx/eee532e0614edcc8/node_modules/miniflare');
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("local tank test");}}',
 compatibilityDate:'2026-04-23',d1Databases:{ACTMASTER_DB:'tank-local-test'}});
try {
 const db=await mf.getD1Database('ACTMASTER_DB');
 await db.prepare('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)').run();
 for(const file of ['0004_point_awards.sql','0043_daily_tank_sessions.sql','0044_game_center.sql']){
  const migration=readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8').replace(/--[^\n]*/g,'');
  for(const q of migration.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(q).run();
 }
 const actor={userId:'test-member',token:'verified-test'},env={ACTMASTER_DB:db,MOTHER_CUS_ACCOUNT_SHOP_ID:'78'};
 let sends=0;
 const deps={findIdentity:async()=>({user:{line_id:'test-member'}}),points:{
  insertUserPoint:async()=>{sends++;return {success:true,data:{success:true,id:'test-tx'}};},
  queryPointBalanceFast:async()=>({success:true,data:{source:'mother',balance:400}}),
  queryUserPoints:async()=>({success:true,data:{list:[]}})
 }};
 const begin=await handleDailyTank('startDailyTank',{},env,actor,deps);assert.equal(begin.success,true,JSON.stringify(begin));
 await db.prepare('UPDATE daily_tank_sessions SET seed=1,created_at=created_at-30000 WHERE id=?').bind(begin.data.sessionId).run();
 const payload={sessionId:begin.data.sessionId,replay:winningReplay(1).replay};
 const block=await handleGameCenter('startGame',{gameId:'block_supply'},env,actor,deps);assert.equal(block.success,true,JSON.stringify(block));
 await db.prepare('UPDATE daily_tank_sessions SET seed=1,created_at=created_at-120000 WHERE id=?').bind(block.data.sessionId).run();
 const blockPayload={sessionId:block.data.sessionId,nonce:block.data.nonce,gameId:'block_supply',replay:winningBlockReplay(1).replay};
 const results=await Promise.all(Array.from({length:8},(_,i)=>i%2?handleDailyTank('completeDailyTank',payload,env,actor,deps):handleGameCenter('completeGame',blockPayload,env,actor,deps)));
 assert.ok(results.every(r=>r.success),JSON.stringify(results));assert.equal(sends,1);
 assert.equal((await db.prepare('SELECT count(*) n FROM point_awards').first()).n,1);
 assert.equal((await handleDailyTank('dailyTankStatus',{},env,actor,deps)).data.state,'completed');
 assert.equal((await db.prepare("SELECT count(*) n FROM daily_tank_sessions WHERE status='won'").first()).n,2);
 console.log('PASS local workerd/D1: additive migration, two games, 8 parallel requests / 1 upstream call / 2 saved scores.');
}finally{await mf.dispose();}
