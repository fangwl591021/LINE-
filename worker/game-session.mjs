export const taiwanDate=(now=Date.now())=>new Date(now+28800000).toISOString().slice(0,10);
export const parse=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};
export const ok=data=>({success:true,data});
export const fail=error=>({success:false,error});
export const GAMES=Object.freeze(['tank_defense','block_supply']);
export async function gameContext(env,actor,{findIdentity,now=Date.now}){
 if(!actor?.userId||!actor.token||actor.source==='d1_identity_fallback')throw Error('請重新進入 LINE LIFF 登入後挑戰');
 if(!env.ACTMASTER_DB)throw Error('無法取得會員資料，未贈送點數');
 const identity=await findIdentity(env,actor.userId);
 if(!identity?.user)throw Error('無法取得會員資料，請先完成 LINE 會員登入');
 const member=String(identity.user.point_line_id||identity.canonicalId||identity.user.line_id||'').trim();
 if(!member)throw Error('找不到會員點數身分，未贈送點數');
 const tenant=String(env.POINT_SHOP_ID||env.MOTHER_CUS_ACCOUNT_SHOP_ID||78),time=now();
 return {db:env.ACTMASTER_DB.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB,member,tenant,time,today:taiwanDate(time),actor,env};
}
export function eventStatement(c,type,{session=null,gameId='',id=crypto.randomUUID(),device='unknown',result={},limit=null}={}){
 const params=[id,c.tenant,c.member,session?.game_id||gameId,session?.id||'',type,c.today,c.time,['mobile','desktop'].includes(device)?device:'unknown',result.score||0,result.durationMs||0,result.state||''];
 let suffix='';if(limit!==null){suffix=" WHERE (SELECT count(*) FROM game_play_events WHERE tenant_id=? AND member_id=? AND event_date=? AND session_id=? AND id LIKE 'client:%') < ?";params.push(c.tenant,c.member,c.today,session?.id||'',limit);}
 return c.db.prepare(`INSERT OR IGNORE INTO game_play_events
 (id,tenant_id,member_id,game_id,session_id,event_type,event_date,created_at,device_type,score,duration_ms,result)
 SELECT ?,?,?,?,?,?,?,?,?,?,?,?${suffix}`).bind(...params);
}
export const sessionById=(c,id)=>c.db.prepare('SELECT * FROM daily_tank_sessions WHERE id=? AND tenant_id=? AND member_id=? AND actor_id=?').bind(String(id),c.tenant,c.member,c.actor.userId).first();
