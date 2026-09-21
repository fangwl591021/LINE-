import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleGameCenter} from '../../worker/game-center.mjs';
import {handleDailyTank} from '../../worker/daily-tank-challenge.mjs';
export function gameFixture(){
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT)');
 for(const name of ['0004_point_awards','0043_daily_tank_sessions','0044_game_center'])sql.exec(readFileSync(new URL(`../../migrations/${name}.sql`,import.meta.url),'utf8'));
 const f={sql,time:Date.parse('2026-09-21T03:00:00Z'),sends:0,balance:300,ledger:[],mode:'success',actor:{userId:'member',token:'verified-test-token'},member:'canonical',hasUser:true};
 const execute=(q,args)=>{if(f.failReceipt&&q.startsWith('UPDATE point_awards'))throw Error('receipt failed');return {success:true,meta:{changes:Number(sql.prepare(q).run(...args).changes)}};};
 const db={prepare(q){return {bind(...args){return {q,args,first:async()=>sql.prepare(q).get(...args)||null,all:async()=>({success:true,results:sql.prepare(q).all(...args)}),run:async()=>execute(q,args)};}};},
  async batch(stmts){sql.exec('BEGIN');try{const r=stmts.map(({q,args},i)=>{if(f.failBatch&&i===1)throw Error('batch failed');return execute(q,args);});sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};db.withSession=()=>db;
 f.env={ACTMASTER_DB:db,MOTHER_CUS_ACCOUNT_SHOP_ID:'78'};
 f.deps={now:()=>f.time,findIdentity:async()=>f.hasUser?{user:{line_id:f.actor.userId,point_line_id:f.member}}:null,points:{
  async insertUserPoint(p){f.sends++;f.last=p;if(f.mode==='wait')await new Promise(r=>f.release=r);if(f.mode==='throw')throw Error('timeout');if(f.mode==='ambiguous')return {success:true,data:{}};f.balance+=p.points;f.ledger.push({id:`tx-${f.sends}`,shop_remark:p.shop_remark,get_point:p.points,point_type:p.pointType});if(f.mode==='committed-timeout')throw Error('lost response');return {success:true,data:{success:true,data:{id:`tx-${f.sends}`}}};},
  async queryUserPoints(){return {success:true,data:{source:'mother',list:f.ledger}};},async queryPointBalanceFast(){return {success:true,data:{source:'mother',balance:f.balance}};}
 }};
 f.call=(action,p={},actor=f.actor)=>handleGameCenter(action,p,f.env,actor,f.deps);f.legacy=(action,p={},actor=f.actor)=>handleDailyTank(action,p,f.env,actor,f.deps);
 f.start=async(gameId='block_supply',legacy=false)=>{f.time+=2000;const r=await(legacy?f.legacy('startDailyTank',{mapVersion:2}):f.call('startGame',{gameId}));if(!r.success)throw Error(r.error);sql.prepare('UPDATE daily_tank_sessions SET seed=1 WHERE id=?').run(r.data.sessionId);return {...r.data,seed:1};};
 f.finish=async(session,proof,legacy=false)=>{const payload={sessionId:session.sessionId,nonce:session.nonce,gameId:session.gameId,replay:proof};return legacy?f.legacy('completeDailyTank',payload):f.call('completeGame',payload);};
 return f;
}
