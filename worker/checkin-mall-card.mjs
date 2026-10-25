// Display/analytics sidecar only. The mother remains the only check-in/reply owner.
import { authorizeStoreAdmin } from './store-admin.mjs';
import { defaultCheckinDashboardConfig, buildCheckinDashboardMessage } from './checkin-chat-dashboard-render.mjs';
import { readPublishedCheckinDashboard } from './checkin-chat-dashboard.mjs';
const UID = /^U[0-9a-f]{32}$/i;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ROOT = '/v1/checkin-mall';
const HEADERS = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Authorization, Content-Type', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS' };
const reply = (data, status=200) => Response.json(data,{status,headers:HEADERS});
const day = time => new Date(time+8*3600000).toISOString().slice(0,10);
const error = (message,status=400) => { const e=new Error(message);e.status=status;throw e; };
export function isCheckinMallEvent(event) {
  return event?.type==='message' && event.mode!=='standby' && event.source?.type==='user' && UID.test(event.source.userId||'') &&
    event.message?.type==='text' && String(event.message.text||'').normalize('NFKC').trim()==='會員打卡';
}
export function buildCheckinMallCard(env,id,balance,now=Date.now(),config=defaultCheckinDashboardConfig()) {
  return buildCheckinDashboardMessage(env,id,balance,now,config);
}

export async function supplementCheckinMallCards(events,env,forwardResult,points,fetcher=fetch,now=Date.now()) {
  if(env.CHECKIN_MALL_CARD_ENABLED!=='true'||!env.ACTMASTER_DB||!env.LINE_CHANNEL_ACCESS_TOKEN||!forwardResult?.success||forwardResult.skipped)return;
  const db=env.ACTMASTER_DB;
  await Promise.all(events.filter(isCheckinMallEvent).slice(0,20).map(async event => {
    const time=Number(event.timestamp),eventId=String(event.webhookEventId||event.message.id||'');
    if(!Number.isSafeInteger(time)||time<now-86400000||time>now+300000||day(time)!==day(now)||!eventId||eventId.length>180)return;
    try {
      const id=crypto.randomUUID(),key=crypto.randomUUID();
      const claim=await db.prepare(`INSERT OR IGNORE INTO checkin_mall_cards(id,event_id,recipient_uid,taipei_day,created_at,state,retry_key) VALUES(?,?,?,?,?,'preparing',?)`).bind(id,eventId,event.source.userId,day(time),now,key).run();
      if(Number(claim.meta?.changes)!==1)return;
      let balance=null;
      try { const wallet=await points.read(event.source.userId,env);if(UID.test(wallet?.identity||'')&&Number.isSafeInteger(wallet.balance)&&wallet.balance>=0)balance=wallet.balance; }
      catch { /* Never use a local fallback or invent a successful check-in. */ }
      const published=await readPublishedCheckinDashboard(db);
      const message=buildCheckinMallCard(env,id,balance,now,published.config);
      // Persist the exact compiled message before sending. Later edits never rewrite it.
      // Failure closes this attempt without sending or changing the daily claim/retry key.
      const snapshot=await db.prepare(`INSERT INTO checkin_chat_dashboard_snapshots(card_id,template_revision,config_json,message_json,created_at)
        SELECT id,?,?,?,created_at FROM checkin_mall_cards WHERE id=? AND state='preparing'`)
        .bind(published.revision,JSON.stringify(published.config),JSON.stringify(message),id).run();
      if(Number(snapshot.meta?.changes)!==1)return;
      const sending=await db.prepare("UPDATE checkin_mall_cards SET state='sending',balance=? WHERE id=? AND state='preparing'").bind(balance,id).run();
      if(Number(sending.meta?.changes)!==1)return;
      let state='unknown';
      try {
        const result=await fetcher('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json','X-Line-Retry-Key':key},
          body:JSON.stringify({to:event.source.userId,messages:[message]}),signal:AbortSignal.timeout(8000),redirect:'manual'});
        state=result.ok||(result.status===409&&result.headers.get('x-line-accepted-request-id'))?'accepted':result.status>=400&&result.status<500?'failed':'unknown';
        await result.body?.cancel();
      } catch { /* May have been accepted. Never send again with another key. */ }
      await db.prepare('UPDATE checkin_mall_cards SET state=?,accepted_at=? WHERE id=? AND state=\'sending\'').bind(state,state==='accepted'?now:null,id).run();
      console.log(JSON.stringify({event:'checkin_mall_card_result',state}));
    } catch { console.error(JSON.stringify({event:'checkin_mall_card_failed'})); }
  }));
}

async function boundedJson(source,max=8192) {
  if(Number(source.headers.get('Content-Length'))>max)error('資料過大',413);
  const reader=source.body?.getReader();if(!reader)error('資料格式不正確');
  const chunks=[];let length=0;
  try { while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>max){await reader.cancel();error('資料過大',413);}chunks.push(value);} }
  finally { reader.releaseLock(); }
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let value;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{error('資料格式不正確');}
  if(!value||typeof value!=='object'||Array.isArray(value))error('資料格式不正確');return value;
}
async function clickActor(request,env,fetcher) {
  const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if(!token||token.length>4096)error('請先使用 LINE 登入',401);
  const verified=await fetcher('https://api.line.me/oauth2/v2.1/verify?access_token='+encodeURIComponent(token),{signal:AbortSignal.timeout(5000),redirect:'manual'});
  if(!verified.ok)error('LINE 登入已失效',401);
  const info=await boundedJson(verified);
  if(String(info.client_id)!==String(env.MOTHER_CUS_ACCOUNT_CLIENT_ID||'1660923784')||!Number.isFinite(Number(info.expires_in))||Number(info.expires_in)<=0)error('LINE 登入驗證不符',401);
  const response=await fetcher('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000),redirect:'manual'});
  if(!response.ok)error('LINE 登入已失效',401);
  const profile=await boundedJson(response);if(!UID.test(profile.userId||''))error('無法確認登入身分',401);
  return {uid:profile.userId,name:String(profile.displayName||'').slice(0,80),token,profile};
}
function reportRange(params,now) {
  for(const key of params.keys())if(!['from','to','after'].includes(key)||params.getAll(key).length!==1)error('報告篩選格式不正確');
  const to=params.get('to')||day(now),from=params.get('from')||day(now-6*86400000),after=params.get('after')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||after&&!/^[1-9]\d{0,14}$/.test(after))error('報告篩選格式不正確');
  const start=Date.parse(from+'T00:00:00+08:00'),end=Date.parse(to+'T00:00:00+08:00')+86400000;
  if(!Number.isFinite(start)||!Number.isFinite(end)||day(start)!==from||day(end-1)!==to||end<=start||end-start>31*86400000)error('報告範圍須為1至31日');
  return {from,to,start,end,after:Number(after)||Number.MAX_SAFE_INTEGER};
}
export async function handleCheckinMall(request,env,profileMapper,fetcher=fetch,now=Date.now()) {
  const url=new URL(request.url);if(!url.pathname.startsWith(ROOT+'/'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  try {
    if(!['/entry','/report'].includes(url.pathname.slice(ROOT.length)))return reply({success:false,error:'查無此功能'},404);
    if(request.method!==(url.pathname.endsWith('/entry')?'POST':'GET'))return reply({success:false,error:'不支援的操作'},405);
    if(url.pathname.endsWith('/entry')&&url.search)error('不接受網址資料');
    const actor=await clickActor(request,env,fetcher);
    if(!env.ACTMASTER_DB)error('紀錄服務暫時無法使用',503);
    const db=env.ACTMASTER_DB.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB;
    if(url.pathname.endsWith('/entry')) {
      const input=await boundedJson(request);
      if(Object.keys(input).some(k=>!['cardId','action'].includes(k))||!UUID.test(input.cardId||'')||!['mall','details'].includes(input.action))error('卡片入口格式不正確');
      const result=await db.prepare(`INSERT OR IGNORE INTO checkin_mall_clicks(card_id,actor_uid,actor_name,action,clicked_at,minute_bucket)
        SELECT id,?,?,?,?,? FROM checkin_mall_cards WHERE id=? AND state IN ('sending','accepted','unknown')`).bind(actor.uid,actor.name,input.action,now,Math.floor(now/60000),input.cardId).run();
      if(result.success===false||!Number.isSafeInteger(result.meta?.changes))error('紀錄服務暫時無法使用',503);
      if(Number(result.meta?.changes)!==1){
        const card=await db.prepare("SELECT id FROM checkin_mall_cards WHERE id=? AND state IN ('sending','accepted','unknown')").bind(input.cardId).first();
        if(!card)error('卡片來源不存在',404);
      }
      return reply({success:true,recorded:true,duplicate:Number(result.meta?.changes)!==1});
    }
    // Reuse established canonical/hard-admin policy, not role/UID supplied by caller.
    const authFetcher=(target,options)=>target==='https://api.line.me/v2/profile'&&options?.headers?.Authorization==='Bearer '+actor.token?Promise.resolve(Response.json(actor.profile)):fetcher(target,options);
    await authorizeStoreAdmin(request,env,profileMapper,authFetcher);
    const range=reportRange(url.searchParams,now),args=[range.start,range.end];
    const [summary,cards,list]=await Promise.all([
      db.prepare('SELECT COUNT(*) entries,COUNT(DISTINCT actor_uid) people,COALESCE(SUM(action=\'mall\'),0) mall,COALESCE(SUM(action=\'details\'),0) details FROM checkin_mall_clicks WHERE clicked_at>=? AND clicked_at<?').bind(...args).first(),
      db.prepare('SELECT COUNT(*) total,COALESCE(SUM(state=\'accepted\'),0) accepted,COALESCE(SUM(state IN (\'unknown\',\'sending\')),0) unknown,COALESCE(SUM(state=\'preparing\'),0) preparing,COALESCE(SUM(state=\'failed\'),0) failed FROM checkin_mall_cards WHERE created_at>=? AND created_at<?').bind(...args).first(),
      db.prepare(`SELECT c.id,c.actor_name,c.action,c.clicked_at,c.card_id FROM checkin_mall_clicks c WHERE clicked_at>=? AND clicked_at<? AND id<? ORDER BY id DESC LIMIT 51`).bind(...args,range.after).all()
    ]);
    if(!summary||!cards||!Array.isArray(list.results)||list.success===false)error('報告暫時無法取得',503);
    const rows=list.results.slice(0,50);
    return reply({success:true,range:{from:range.from,to:range.to},summary,cards,rows,next:list.results.length>50?String(rows.at(-1).id):''});
  } catch(e) {
    const status=e.status||503;
    if(status>=500)console.error(JSON.stringify({event:'checkin_mall_service_failed'}));
    return reply({success:false,error:status>=500?'服務暫時無法使用，請稍後重試':e.message},status);
  }
}
