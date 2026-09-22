import {ok,parse,eventStatement} from './game-session.mjs';
// Keep the deployed key: legacy and new clients contend on the SAME unique row.
export const CHALLENGE_KEY='daily_tank_challenge',REWARD_POINTS=100;
export function gameReward(c,points,date=c.today){
 const {db,member,tenant,time,today,env}=c,awardId=`${CHALLENGE_KEY}:${tenant}:${member}:${date}`,marker=`challenge_id=${awardId}`;
 const read=()=>db.prepare('SELECT * FROM point_awards WHERE award_id=? AND user_id=? AND award_type=?').bind(awardId,member,CHALLENGE_KEY).first();
 const pending=()=>ok({state:'pending',date,rewardPoints:100,message:'破關結果已保留，獎勵尚待確認。請按「重新確認獎勵」，勿重複送點。'});
 const balance=async()=>{try{const r=await points.queryPointBalanceFast({pointUserId:member,point_type:'gift_money'},env);return r?.success&&r.data?.source==='mother'&&Number.isFinite(r.data.balance)?r.data.balance:null;}catch{return null;}};
 const completed=async(awarded=false)=>ok({state:'completed',date,rewardPoints:100,awarded,alreadyCompleted:!awarded,balance:await balance(),message:date!==today?`${date} 的挑戰獎勵 100 點已確認入帳。`:awarded?'挑戰成功！今日獎勵 100 點已入帳。':'今日100點已領取，本局成績仍已保存。'});
 async function reconcile(row){
  if(row.status==='sent')return completed();
  const wallet=await points.queryUserPoints({pointUserId:member,point_type:'gift_money',page:1},env).catch(()=>null);
  const matched=wallet?.success&&wallet.data?.source==='mother'&&(wallet.data?.list||[]).find(r=>String(r.shop_remark||r.shopRemark||'').split(';').map(v=>v.trim()).includes(marker)&&String(r.point_type||r.pointType||'gift_money')==='gift_money'&&Number(r.get_point??r.point??r.points)===100);
  if(!matched)return pending();
  await db.prepare("UPDATE point_awards SET status='sent',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE award_id=?").bind(JSON.stringify({...parse(row.response_json),completedAt:new Date(time).toISOString(),pointTransactionId:matched.id||matched.row_id||null,confirmedBy:'ledger'}),awardId).run();
  return completed(true);
 }
 function reserve(session){return db.prepare(`INSERT OR IGNORE INTO point_awards
  (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
  SELECT ?,?,?,?,100,'gift_money','tank_processing',?,CURRENT_TIMESTAMP
  WHERE EXISTS (SELECT 1 FROM daily_tank_sessions WHERE id=? AND status='won')`).bind(awardId,member,`${tenant}:${date}`,CHALLENGE_KEY,JSON.stringify({sessionId:session.id,date,tenantId:tenant,gameId:session.game_id}),session.id);}
 async function send(session){
  let result;const names={block_supply:['每日方塊補給挑戰','方塊補給站'],gomoku:['每日喵喵五子棋挑戰','喵喵五子棋'],tank_defense:['每日坦克挑戰','坦克守衛挑戰']},[eventName,title]=names[session.game_id]||names.tank_defense;
  try{result=await points.insertUserPoint({userId:member,points:100,pointType:'gift_money',shop_id:Number(tenant),eventName,eventContent:`${title} ${date} 遊戲館每日首次破關獎勵`,shop_remark:marker,skipMotherMemberSetup:true,requireConfirmedResult:true},env);}catch{result=null;}
  const confirmed=result?.success===true&&result?.data?.success===true,detail={...parse((await read())?.response_json),completedAt:confirmed?new Date(time).toISOString():null,pointTransactionId:confirmed?(result.data?.data?.id||result.data?.id||null):null};
  await db.prepare('UPDATE point_awards SET status=?,response_json=?,updated_at=CURRENT_TIMESTAMP WHERE award_id=?').bind(confirmed?'sent':'tank_unknown',JSON.stringify(detail),awardId).run();
  if(confirmed)await eventStatement(c,'daily_reward_granted',{session,id:`reward:${awardId}`}).run();
  return confirmed?completed(true):pending();
 }
 return {read,pending,reconcile,reserve,send,completed};
}
