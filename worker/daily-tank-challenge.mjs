import {verifyReplay} from '../js/modules/tank-engine.mjs';

export const CHALLENGE_KEY='daily_tank_challenge', REWARD_POINTS=100;
export const taiwanDate=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,10);
const fail=error=>({success:false,error});
const ok=data=>({success:true,data});
const json=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};
const pendingMessage='破關結果已保留，獎勵尚待確認。請按「重新確認獎勵」，勿重複送點。';

// This service deliberately never falls back to a second/local balance or retries an ambiguous insert.
export async function handleDailyTank(action,payload,env,actor,deps) {
  try{return await run(action,payload,env,actor,deps);}
  catch{return fail('挑戰服務暫時無法確認，請重新確認獎勵；本次不會自動重送點數。');}
}
async function run(action,payload,env,actor,{findIdentity,points,now=Date.now}) {
  if(!actor?.userId||!actor.token||actor.source==='d1_identity_fallback')return fail('請重新進入 LINE LIFF 登入後挑戰');
  if(!env.ACTMASTER_DB)return fail('無法取得會員資料，未贈送點數');
  const identity=await findIdentity(env,actor.userId);
  if(!identity?.user)return fail('無法取得會員資料，請先完成 LINE 會員登入');
  const member=String(identity.user.point_line_id||identity.canonicalId||identity.user.line_id||'').trim();
  if(!member)return fail('找不到會員點數身分，未贈送點數');
  const tenant=String(env.POINT_SHOP_ID||env.MOTHER_CUS_ACCOUNT_SHOP_ID||78);
  const db=env.ACTMASTER_DB.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB;
  const time=now(),today=taiwanDate(time);
  let session=null,date=today;
  if(payload.sessionId) {
    session=await db.prepare('SELECT * FROM daily_tank_sessions WHERE id=? AND tenant_id=? AND member_id=? AND actor_id=?')
      .bind(String(payload.sessionId),tenant,member,actor.userId).first();
    if(!session)return fail('挑戰憑證無效，請重新開始');
    date=session.challenge_date;
  }
  const awardId=`${CHALLENGE_KEY}:${tenant}:${member}:${date}`;
  const marker=`challenge_id=${awardId}`;
  const read=()=>db.prepare('SELECT * FROM point_awards WHERE award_id=? AND user_id=? AND award_type=?')
    .bind(awardId,member,CHALLENGE_KEY).first();
  const balance=async()=>{
    try{
      const r=await points.queryPointBalanceFast({pointUserId:member,point_type:'gift_money'},env);
      return r?.success && r.data?.source==='mother' && Number.isFinite(r.data.balance)?r.data.balance:null;
    }catch{return null;}
  };
  const completeResult=async(awarded=false)=>ok({state:'completed',date,rewardPoints:REWARD_POINTS,
    awarded,alreadyCompleted:!awarded,balance:await balance(),
    message:date!==today?`${date} 的挑戰獎勵 100 點已確認入帳。`:
      awarded?'挑戰成功！今日獎勵 100 點已入帳。':'今日挑戰已完成，明天可以再次獲得獎勵。'});
  const reconcile=async(row)=>{
    if(row.status==='sent')return completeResult();
    const wallet=await points.queryUserPoints({pointUserId:member,point_type:'gift_money',page:1},env).catch(()=>null);
    const matched=wallet?.success && wallet.data?.source!=='local' && (wallet.data?.list||[]).find(r=>
      String(r.shop_remark||r.shopRemark||'').split(';').map(v=>v.trim()).includes(marker) &&
      String(r.point_type||r.pointType||'gift_money')==='gift_money' &&
      Number(r.get_point??r.point??r.points)===REWARD_POINTS);
    if(matched) {
      await db.prepare("UPDATE point_awards SET status='sent',response_json=?,updated_at=CURRENT_TIMESTAMP WHERE award_id=?")
        .bind(JSON.stringify({completedAt:new Date(time).toISOString(),pointTransactionId:matched.id||matched.row_id||null,confirmedBy:'ledger'}),awardId).run();
      return completeResult(true);
    }
    return ok({state:'pending',date,rewardPoints:REWARD_POINTS,message:pendingMessage});
  };
  let row=await read();
  if(action==='dailyTankStatus') {
    if(row)return reconcile(row);
    return ok({state:'available',date:today,rewardPoints:REWARD_POINTS,message:'每日首次破關贈送 100 點'});
  }
  if(action==='startDailyTank') {
    const recent=await db.prepare('SELECT created_at FROM daily_tank_sessions WHERE tenant_id=? AND member_id=? ORDER BY created_at DESC LIMIT 1')
      .bind(tenant,member).first();
    if(recent && time-recent.created_at<1500)return fail('請稍候一下再開始挑戰');
    const mapVersion=payload.mapVersion===2?2:1;
    const id=(mapVersion===2?'v2:':'')+crypto.randomUUID(),seed=crypto.getRandomValues(new Uint32Array(1))[0];
    await db.prepare('INSERT INTO daily_tank_sessions (id,tenant_id,member_id,actor_id,challenge_date,seed,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(id,tenant,member,actor.userId,today,seed,time,time+20*60000).run();
    return ok({sessionId:id,seed,mapVersion,date:today,rewardPoints:REWARD_POINTS,alreadyCompleted:row?.status==='sent'});
  }
  if(action!=='completeDailyTank')return fail('未知挑戰操作');
  // Read an existing receipt before checking expiration: even yesterday's ambiguous request can be confirmed.
  if(row)return reconcile(row);
  if(!session||session.expires_at<time||date!==today)return fail('挑戰已逾時或已跨日，請重新開始；尚未發點');
  if(!verifyReplay(session.seed,payload.replay,time-session.created_at,String(session.id).startsWith('v2:')?2:1))return fail('尚未通過挑戰驗證，請重新挑戰');
  // Existing unique index (user_id,card_id,award_type) + award_id: only one request owns the send.
  const reserved=await db.prepare(`INSERT OR IGNORE INTO point_awards
    (award_id,user_id,card_id,award_type,points,point_type,status,response_json,updated_at)
    VALUES (?,?,?,?,100,'gift_money','tank_processing',?,CURRENT_TIMESTAMP)`)
    .bind(awardId,member,`${tenant}:${today}`,CHALLENGE_KEY,JSON.stringify({sessionId:session.id,date,tenantId:tenant})).run();
  if(Number(reserved.meta?.changes)!==1) {
    row=await read();return row?reconcile(row):fail('領獎紀錄需核對，請稍後重新確認');
  }
  let result;
  try {
    result=await points.insertUserPoint({userId:member,points:REWARD_POINTS,pointType:'gift_money',
      shop_id:Number(tenant),eventName:'每日坦克挑戰',eventContent:`坦克守衛挑戰 ${today} 首次破關獎勵`,
      shop_remark:marker,skipMotherMemberSetup:true,requireConfirmedResult:true},env);
  }catch{result=null;}
  const confirmed=result?.success===true && result?.data?.success===true;
  const detail={...json((await read())?.response_json),completedAt:confirmed?new Date(time).toISOString():null,
    pointTransactionId:confirmed?(result.data?.data?.id||result.data?.id||null):null};
  await db.prepare('UPDATE point_awards SET status=?,response_json=?,updated_at=CURRENT_TIMESTAMP WHERE award_id=?')
    .bind(confirmed?'sent':'tank_unknown',JSON.stringify(detail),awardId).run();
  return confirmed?completeResult(true):ok({state:'pending',date,rewardPoints:REWARD_POINTS,message:pendingMessage});
}
