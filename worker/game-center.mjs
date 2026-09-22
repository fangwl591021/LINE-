import {verifyReplay as verifyBlock} from '../js/modules/block-supply-engine.mjs';
import {verifyTankResult} from '../js/modules/tank-engine.mjs';
import {verifyGomokuReplay} from '../js/modules/gomoku-engine.mjs';
import {gameContext,eventStatement,sessionById,GAMES,taiwanDate,parse,ok,fail} from './game-session.mjs';
import {gameReward} from './game-reward.mjs';
const CLIENT_EVENTS=new Set(['game_center_view','game_card_click','game_pause','game_resume','game_exit']);
export async function handleGameCenter(action,payload={},env,actor,deps,{legacy=false}={}){
 let c;try{c=await gameContext(env,actor,deps);}catch(e){return fail(e.message);}
 try{return await run(c,action,payload,deps,legacy);}catch{return fail('挑戰服務暫時無法確認，請重新確認獎勵；本次不會自動重送點數。');}
}
async function run(c,action,p,dep,legacy){
 const {db,member,tenant,time,today,actor}=c;let session=null;
 if(p.sessionId){session=await sessionById(c,p.sessionId);if(!session)return fail('挑戰憑證無效，請重新開始');
  if(legacy&&session.game_id!=='tank_defense')return fail('挑戰類型不符');
  if(!legacy&&(p.gameId!==session.game_id||typeof p.nonce!=='string'||p.nonce!==session.nonce))return fail('挑戰憑證無效，請重新開始');
 }
 const rewards=gameReward(c,dep.points,session?.challenge_date||today);
 if(action==='dailyTankStatus'){
  const row=await rewards.read();return row?rewards.reconcile(row):ok({state:'available',date:today,rewardPoints:100,message:'遊戲館每日首次破關贈送 100 點'});
 }
 if(action==='gameCenterStatus'){
  const row=await rewards.read(),reward=row?await rewards.reconcile(row):ok({state:'available',date:today,rewardPoints:100});
  const games=(await db.prepare(`SELECT game_id,MAX(score) best_score,MAX(CASE WHEN challenge_date=? AND status='won' THEN 1 ELSE 0 END) completed_today FROM daily_tank_sessions WHERE tenant_id=? AND member_id=? AND status IN ('won','lost') GROUP BY game_id`).bind(today,tenant,member).all()).results;
  const days=(await db.prepare("SELECT DISTINCT challenge_date FROM daily_tank_sessions WHERE tenant_id=? AND member_id=? AND status IN ('won','lost') ORDER BY challenge_date DESC LIMIT 366").bind(tenant,member).all()).results.map(r=>r.challenge_date);
  let streak=0,d=days.includes(today)?today:taiwanDate(time-86400000);while(days.includes(d)){streak++;d=new Date(Date.parse(d+'T00:00:00Z')-86400000).toISOString().slice(0,10);}
  const weekday=new Date(time+28800000).getUTCDay(),monday=taiwanDate(time-((weekday+6)%7)*86400000);
  const week=await db.prepare("SELECT count(*) n FROM daily_tank_sessions WHERE tenant_id=? AND member_id=? AND status='won' AND challenge_date>=? AND challenge_date<=?").bind(tenant,member,monday,today).first();
  return ok({...reward.data,message:reward.data.state==='completed'?'今日100點已領取，仍可遊玩並保存成績。':reward.data.message||'完成任一遊戲，每日共領 100 點',streak,weeklyCompletions:week.n,games:GAMES.map(gameId=>{const g=games.find(r=>r.game_id===gameId);return {gameId,bestScore:g?.best_score||0,completedToday:!!g?.completed_today};})});
 }
 if(action==='startGame'||action==='startDailyTank'){
  const gameId=legacy?'tank_defense':p.gameId;if(!GAMES.includes(gameId))return fail('未知遊戲');
  const recent=await db.prepare('SELECT created_at FROM daily_tank_sessions WHERE tenant_id=? AND member_id=? ORDER BY created_at DESC LIMIT 1').bind(tenant,member).first();
  if(recent&&time-recent.created_at<1500)return fail('請稍候一下再開始挑戰');
  const mapVersion=gameId==='tank_defense'?(legacy?(p.mapVersion===2?2:1):2):1;
  const id=(gameId==='gomoku'?'gomoku:':gameId==='block_supply'?'block:':mapVersion===2?'v2:':'')+crypto.randomUUID(),nonce=crypto.randomUUID(),seed=crypto.getRandomValues(new Uint32Array(1))[0];session={id,game_id:gameId};
  await db.batch([db.prepare('INSERT INTO daily_tank_sessions (id,tenant_id,member_id,actor_id,challenge_date,seed,created_at,expires_at,game_id,nonce) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,tenant,member,actor.userId,today,seed,time,time+20*60000,gameId,nonce),eventStatement(c,'game_start',{session,device:p.deviceType}),...(p.replay===true?[eventStatement(c,'game_replay',{session,device:p.deviceType})]:[])]);
  const row=await rewards.read();return ok({sessionId:id,nonce,gameId,seed,mapVersion,date:today,rewardPoints:100,alreadyCompleted:row?.status==='sent'});
 }
 if(action==='gameEvent'){
  if(!CLIENT_EVENTS.has(p.eventType)||typeof p.eventId!=='string'||!/^[\w-]{8,80}$/.test(p.eventId))return fail('事件格式錯誤');
  if(!session&&!['game_center_view','game_card_click'].includes(p.eventType))return fail('事件需要遊戲憑證');
  if(session&&session.expires_at<time)return fail('挑戰已逾時');
  const gameId=session?.game_id||(GAMES.includes(p.gameId)?p.gameId:'');
  const write=await eventStatement(c,p.eventType,{session,gameId,id:`client:${tenant}:${member}:${p.eventId}`,device:p.deviceType,result:session?parse(session.result_json):{},limit:session?64:200}).run();return ok({recorded:Number(write.meta?.changes)===1});
 }
 if(!['completeGame','completeDailyTank'].includes(action))return fail('未知挑戰操作');
 if(!session)return fail('挑戰憑證無效，請重新開始');
 const row=await rewards.read();
 if(legacy&&row&&session.status==='started'&&session.nonce==='')return rewards.reconcile(row);
 let result=parse(session.result_json);
 if(session.status==='started'){
  if(session.expires_at<time||session.challenge_date!==today)return fail('挑戰已逾時或已跨日，請重新開始；尚未發點');
  const verify={block_supply:verifyBlock,gomoku:verifyGomokuReplay,tank_defense:verifyTankResult}[session.game_id];
  result=verify?.(session.seed,p.replay,time-session.created_at,String(session.id).startsWith('v2:')?2:1);
  if(!result||(legacy&&result.state!=='won'))return fail('尚未通過挑戰驗證，請重新挑戰');
 }
 const won=result.state==='won',batch=[db.prepare("UPDATE daily_tank_sessions SET status=?,completed_at=?,score=?,result_json=? WHERE id=? AND status='started'").bind(result.state,time,result.score,JSON.stringify(result),session.id)];
 if(won)batch.push(rewards.reserve(session));batch.push(eventStatement(c,won?'game_complete':'game_fail',{session,id:`result:${session.id}`,result}));
 const saved=await db.batch(batch),stored=await sessionById(c,session.id);result=parse(stored.result_json);
 if(stored.status!=='won')return ok({state:'failed',scoreSaved:true,result,message:'本局成績已保存，可重新挑戰。'});
 let response;
 if(won&&Number(saved[1]?.meta?.changes)===1)response=await rewards.send(session);
 else {const receipt=await rewards.read();response=receipt?await rewards.reconcile(receipt):rewards.pending();if(receipt?.status==='sent')await eventStatement(c,'daily_reward_already_claimed',{session,id:`claimed:${session.id}`,result}).run();}
 return {...response,data:{...response.data,scoreSaved:true,result}};
}
