// Semantic port of VEO member-events. One authoritative event; no private task/course/point writes.
import { resolveMemberIdentity, boundedJson } from './member-chat.mjs';
import { extractMemberEventDm, MEMBER_DM_BODY_LIMIT } from './member-event-dm.mjs';
import { MEMBER_MEDIA_LIMIT, mediaRef, visibleCover, storeMedia, readMedia } from './member-event-media.mjs';
const BASE='/v1/member-events';
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const stmt=(db,query,...args)=>db.prepare(query).bind(...args);
const fail=(code,error,status=400)=>{throw Object.assign(new Error(error),{code,status});};
const at=()=>new Date().toISOString();
const safeErrors={hosted_event_active:'你已有一場未結束活動，請先結束或取消原活動。',hosted_event_closed:'活動已結束或取消，不能重新開放。',hosted_owner_invalid:'你不能管理這場活動。',hosted_event_full:'活動已額滿。',hosted_registration_closed:'活動已截止報名、結束或取消。',hosted_capacity_too_small:'人數上限不能低於目前有效報名人數。'};
function fields(body,allowed){if(Object.keys(body).some(key=>!allowed.includes(key)))fail('INVALID_FIELDS','資料欄位不正確');}
function text(value,label,max,required=false){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail('INVALID_INPUT',`${label}不正確`);return value.trim();}
function key(value){if(!UUID.test(value||''))fail('INVALID_KEY','請重新送出');return value;}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))fail('INVALID_DATE','請填寫有效活動時間');const d=new Date(value);if(d.toISOString().slice(0,19)!==value.slice(0,19)||d.getUTCFullYear()<2020||d.getUTCFullYear()>2100)fail('INVALID_DATE','日期不正確');return d.toISOString();}
function input(body){
  const value={title:text(body.title,'活動名稱',100,true),description:text(body.description,'活動內容',2000,true),location:text(body.location,'活動地點',300,true),starts_at:date(body.startsAt),ends_at:date(body.endsAt),registration_closes_at:date(body.registrationClosesAt||body.startsAt),capacity:body.capacity,fee_text:text(body.feeText??'免費','收費說明',100,true),cover_url:text(body.coverUrl??'','封面網址',2048),category:text(body.category===undefined?'活動':body.category,'活動分類',40,true)};
  if(!Number.isInteger(value.capacity)||value.capacity<0||value.capacity>10000)fail('INVALID_CAPACITY','人數上限須為 0–10000 的整數，0 表示不限。');
  if(value.ends_at<=value.starts_at||value.registration_closes_at>value.ends_at)fail('INVALID_DATE','結束時間須晚於開始，截止不可晚於結束。');
  if(value.cover_url){try{const u=new URL(value.cover_url);if(u.protocol!=='https:'||u.username||u.password)throw Error();}catch{fail('INVALID_COVER','封面須使用 HTTPS 圖片網址。');}}
  return value;
}
async function actorFor(request,db,fetcher){
  const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];if(!token||token.length>4096)fail('AUTH_REQUIRED','請先從 LINE 登入',401);
  let response;try{response=await fetcher('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{fail('AUTH_UNAVAILABLE','LINE 驗證暫時無法完成',503);}
  if([401,403].includes(response.status))fail('AUTH_EXPIRED','登入已失效，請重新進入 LINE',401);
  if(!response.ok)fail('AUTH_UNAVAILABLE','LINE 驗證暫時無法完成',503);
  const profile=await boundedJson(response,8192);if(!/^U[0-9a-f]{32}$/i.test(profile.userId||''))fail('AUTH_INVALID','無法確認 LINE 身分',401);
  const actor=await resolveMemberIdentity(db,profile.userId);
  // Canonical membership is unchanged; affiliation comes from the verified row, never the upload body.
  const member=await stmt(db,'SELECT line_id,role,network_id,referrer_id FROM users WHERE row_id=?',actor.memberId).first();
  if(!member)fail('MEMBER_REQUIRED','請先完成會員註冊',403);
  const role=String(member.role||'').toLowerCase();
  actor.networkId=['admin','總管'].includes(role)?'admin':['store','tenant','店長','租戶'].includes(role)?member.line_id:
    (member.network_id&&member.network_id!=='admin'?member.network_id:member.referrer_id)||'admin';
  return actor;
}
async function rows(db,query,...args){const r=await stmt(db,query,...args).all();if(r.success===false||!Array.isArray(r.results))throw Error('MEMBER_EVENTS_READ_FAILED');return r.results;}
async function run(db,query,...args){const r=await stmt(db,query,...args).run();if(r.success===false)throw Error('MEMBER_EVENTS_WRITE_FAILED');return r;}
const SELECT=`SELECT e.*,COALESCE(NULLIF(u.name,''),'活動主辦人') AS organizerName,
 (SELECT COUNT(*) FROM member_event_registrations r WHERE r.event_id=e.id AND r.status='registered') AS registrationCount,
 (SELECT COUNT(*) FROM member_event_registrations r WHERE r.event_id=e.id AND r.status='registered' AND r.checked_in_at IS NOT NULL) AS checkedInCount,
 (SELECT COUNT(*) FROM member_event_registrations r WHERE r.event_id=e.id AND r.status='cancelled') AS cancelledCount
 FROM member_hosted_events e LEFT JOIN users u ON u.row_id=e.owner_id`;
function mapped(row,memberId){return {id:row.id,title:row.title,category:row.category||'活動',visibility:row.visibility,description:row.description,location:row.location,startsAt:row.starts_at,endsAt:row.ends_at,registrationClosesAt:row.registration_closes_at,capacity:row.capacity,feeText:row.fee_text,coverUrl:visibleCover(row.cover_url),status:row.status,revision:row.revision,organizerName:row.organizerName,isOwner:row.owner_id===memberId,registrationCount:row.registrationCount,checkedInCount:row.checkedInCount,cancelledCount:row.cancelledCount};}
function visibleTo(e,actor){return e.owner_id===actor.memberId||e.visibility==='platform'||(e.visibility==='network'&&e.network_id===actor.networkId);}
async function eventFor(db,id,actor,owned=false,history=true){
  const e=await stmt(db,SELECT+' WHERE e.id=?',id).first();if(!e)fail('NOT_FOUND','找不到這場活動',404);
  if(owned){if(e.owner_id!==actor.memberId)fail('FORBIDDEN','你不能管理這場活動',403);}
  else if(!visibleTo(e,actor)&&!(history&&await registration(db,id,actor.memberId)))fail('FORBIDDEN','這場活動僅開放歸屬會員查看',403);
  return e;
}
async function overview(db,actor){
  const [all,my,hosting]=await Promise.all([
    rows(db,SELECT+" WHERE e.status='active' AND julianday(e.ends_at)>julianday('now') AND (e.visibility='platform' OR (e.visibility='network' AND e.network_id=?) OR e.owner_id=?) ORDER BY e.starts_at,e.id LIMIT 200",actor.networkId,actor.memberId),
    rows(db,SELECT+' WHERE EXISTS(SELECT 1 FROM member_event_registrations r WHERE r.event_id=e.id AND r.member_id=?) ORDER BY e.starts_at DESC,e.id LIMIT 200',actor.memberId),
    rows(db,SELECT+' WHERE e.owner_id=? ORDER BY e.starts_at DESC,e.id LIMIT 200',actor.memberId)
  ]);
  const mine=await rows(db,'SELECT event_id,status,registered_at,checked_in_at FROM member_event_registrations WHERE member_id=? ORDER BY registered_at DESC,id DESC LIMIT 200',actor.memberId),byId=new Map(my.map(e=>[e.id,e]));
  return {sessions:all.map(e=>mapped(e,actor.memberId)),hosting:hosting.map(e=>mapped(e,actor.memberId)),my:mine.filter(r=>byId.has(r.event_id)).map(r=>({...mapped(byId.get(r.event_id),actor.memberId),registrationStatus:r.status,registeredAt:r.registered_at,checkedInAt:r.checked_in_at||''}))};
}
const INPUT_FIELDS=['title','description','location','startsAt','endsAt','registrationClosesAt','capacity','feeText','coverUrl','category','visibility'];
async function save(db,actor,body,id='',bucket){
  fields(body,[...INPUT_FIELDS,'requestKey','dmFile',...(id?['revision']:[])]);
  const metadata={...body};delete metadata.dmFile;if(new TextEncoder().encode(JSON.stringify(metadata)).length>16384)fail('BODY_TOO_LARGE','活動文字資料過大',413);
  const requestKey=key(body.requestKey),value=input(body);
  const current=id?await eventFor(db,id,actor,true):await stmt(db,'SELECT * FROM member_hosted_events WHERE owner_id=? AND create_key=?',actor.memberId,requestKey).first();
  if(id&&body.category===undefined)value.category=current.category||'活動';
  value.visibility=body.visibility===undefined?(current?.visibility||'platform'):body.visibility;
  if(!['platform','network'].includes(value.visibility))fail('INVALID_VISIBILITY','請選擇公開或僅歸屬可見');
  value.network_id=current?.network_id||actor.networkId;
  if(current&&(!id||current.last_key===requestKey))return mapped(await eventFor(db,current.id,actor),actor.memberId);
  if(!id&&(value.registration_closes_at<=at()||value.ends_at<=at()))fail('PAST_EVENT','請設定未來的截止及結束時間');
  if(id&&(!Number.isInteger(body.revision)||body.revision!==current.revision))fail('STALE_EVENT','活動已更新，請重新整理',409);
  if(id&&current.status!=='active')fail('hosted_event_closed',safeErrors.hosted_event_closed,409);
  if(mediaRef(value.cover_url)){
    if(!current||value.cover_url!==visibleCover(current.cover_url))fail('INVALID_COVER','請選擇自己的 DM 檔案，不可引用其他活動附件');
    value.cover_url=current.cover_url;
  }
  const eventId=id||crypto.randomUUID(),now=at(),args=Object.values(value);
  let media;
  try{
  if('dmFile' in body){media=await storeMedia(bucket,eventId,body.dmFile);value.cover_url=media.url;args[8]=media.url;}
  const result=id?await run(db,`UPDATE member_hosted_events SET title=?,description=?,location=?,starts_at=?,ends_at=?,registration_closes_at=?,capacity=?,fee_text=?,cover_url=?,category=?,visibility=?,network_id=?,revision=revision+1,last_key=?,updated_at=? WHERE id=? AND owner_id=? AND revision=?`,...args,requestKey,now,id,actor.memberId,body.revision):
    await run(db,`INSERT INTO member_hosted_events(id,owner_id,create_key,title,description,location,starts_at,ends_at,registration_closes_at,capacity,fee_text,cover_url,category,visibility,network_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,eventId,actor.memberId,requestKey,...args,now,now);
  if(!result.meta?.changes)fail('STALE_EVENT','活動已更新，請重新整理',409);return mapped(await eventFor(db,eventId,actor),actor.memberId);
  }catch(error){
    // Do not remove a committed reference if a later response/read failed.
    if(media)try{const saved=await stmt(db,'SELECT cover_url FROM member_hosted_events WHERE id=?',eventId).first();if(saved?.cover_url!==media.url)await bucket.delete(media.objectKey);}catch{}
    throw error;
  }
}
async function sha(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('');}
async function registration(db,eventId,memberId){return stmt(db,'SELECT * FROM member_event_registrations WHERE event_id=? AND member_id=?',eventId,memberId).first();}
async function action(db,actor,id,verb,body,bucket){
  const event=await eventFor(db,id,actor,['update','cancel-event','redeem'].includes(verb));
  if(verb==='update')return {event:await save(db,actor,body,id,bucket)};
  if(verb==='cancel-event'){
    fields(body,['requestKey','revision']);const k=key(body.requestKey);
    if(event.status==='cancelled')return {success:true};
    if(!Number.isInteger(body.revision))fail('INVALID_REVISION','請重新整理活動');
    const result=await run(db,"UPDATE member_hosted_events SET status='cancelled',revision=revision+1,last_key=?,updated_at=? WHERE id=? AND owner_id=? AND revision=?",k,at(),id,actor.memberId,body.revision);
    if(!result.meta?.changes)fail('STALE_EVENT','活動已更新，請重新整理',409);return {success:true};
  }
  if(verb==='register'){
    fields(body,[]);const old=await registration(db,id,actor.memberId);if(old?.status==='registered')return {duplicate:true};
    if(!visibleTo(event,actor))fail('FORBIDDEN','這場活動僅開放歸屬會員報名',403);
    const result=await run(db,`INSERT INTO member_event_registrations(id,event_id,member_id)
      SELECT ?,e.id,? FROM member_hosted_events e WHERE e.id=? AND (e.visibility='platform' OR (e.visibility='network' AND e.network_id=?) OR e.owner_id=?)
      ON CONFLICT(event_id,member_id) DO UPDATE SET status='registered',registered_at=CURRENT_TIMESTAMP,cancelled_at=NULL,ticket_hash=NULL,ticket_expires_at=NULL WHERE member_event_registrations.status='cancelled' AND member_event_registrations.checked_in_at IS NULL`,crypto.randomUUID(),actor.memberId,id,actor.networkId,actor.memberId);
    if(!result.meta?.changes)fail('FORBIDDEN','活動範圍已變更，請重新確認',403);
    return {duplicate:false};
  }
  if(verb==='cancel'){
    fields(body,[]);const old=await registration(db,id,actor.memberId);if(!old)fail('NOT_REGISTERED','找不到你的報名',404);if(old.checked_in_at)fail('ALREADY_CHECKED_IN','已核銷，不能取消報名',409);
    const result=await run(db,"UPDATE member_event_registrations SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,ticket_hash=NULL,ticket_expires_at=NULL WHERE event_id=? AND member_id=? AND checked_in_at IS NULL",id,actor.memberId);
    if(!result.meta?.changes)fail('REGISTRATION_CHANGED','報名狀態已變更，請重新整理',409);return {};
  }
  if(verb==='ticket'){
    fields(body,[]);const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join(''),expiresAt=new Date(Date.now()+300000).toISOString();
    const result=await run(db,`UPDATE member_event_registrations SET ticket_hash=?,ticket_expires_at=? WHERE event_id=? AND member_id=? AND status='registered' AND checked_in_at IS NULL AND EXISTS(SELECT 1 FROM member_hosted_events WHERE id=? AND status='active' AND julianday(ends_at)>julianday('now'))`,await sha(token),expiresAt,id,actor.memberId,id);
    if(!result.meta?.changes)fail('INVALID_REGISTRATION','報名不存在、已核銷，或活動已結束／取消',409);return {ticket:`point-event:${id}:${token}`,expiresAt};
  }
  if(verb==='redeem'){
    fields(body,['ticket']);const match=typeof body.ticket==='string'&&body.ticket.match(/^point-event:([0-9a-f-]{36}):([a-f0-9]{64})$/i);if(!match||match[1]!==id)fail('WRONG_TICKET','不是這場活動的報名 QR');
    const hash=await sha(match[2]),result=await run(db,`UPDATE member_event_registrations SET checked_in_at=CURRENT_TIMESTAMP,checked_in_by=? WHERE event_id=? AND ticket_hash=? AND status='registered' AND checked_in_at IS NULL AND julianday(ticket_expires_at)>julianday('now') AND EXISTS(SELECT 1 FROM member_hosted_events WHERE id=? AND owner_id=? AND status='active' AND julianday(starts_at)<=julianday('now') AND julianday(ends_at)>julianday('now'))`,actor.memberId,id,hash,id,actor.memberId);
    const row=await stmt(db,`SELECT r.checked_in_at FROM member_event_registrations r JOIN member_hosted_events e ON e.id=r.event_id WHERE r.event_id=? AND r.ticket_hash=? AND r.status='registered' AND r.checked_in_at IS NOT NULL AND e.owner_id=? AND e.status='active' AND julianday(e.starts_at)<=julianday('now') AND julianday(e.ends_at)>julianday('now')`,id,hash,actor.memberId).first();
    if(!row)fail('TICKET_UNAVAILABLE','無法核銷：請確認活動已開始、報名有效，並請參加者重新出示 QR',409);return {duplicate:!result.meta?.changes,checkedInAt:row.checked_in_at};
  }
  fail('NOT_FOUND','找不到這個操作',404);
}
export async function handleMemberEvents(request,env,fetcher=fetch){
  const url=new URL(request.url);if(url.pathname!==BASE&&!url.pathname.startsWith(BASE+'/'))return null;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
  try{
    if(String(env.MEMBER_EVENTS_DISABLED)==='1')fail('FEATURE_DISABLED','會員辦活動暫未開放',503);
    if(!['GET','POST'].includes(request.method))fail('METHOD_NOT_ALLOWED','不支援的操作',405);
    const db=env.ACTMASTER_DB.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB,actor=await actorFor(request,db,fetcher),path=url.pathname.slice(BASE.length);
    if(request.method==='POST'&&path==='/dm-draft')return reply(await extractMemberEventDm(await boundedJson(request,MEMBER_DM_BODY_LIMIT),env,db,actor,fetcher,request.signal));
    if(request.method==='GET'&&path==='/overview')return reply({success:true,...await overview(db,actor)});
    if(request.method==='GET'&&path==='/eligibility'){
      const active=await stmt(db,"SELECT id FROM member_hosted_events WHERE owner_id=? AND status='active' AND julianday(ends_at)>julianday('now') LIMIT 1",actor.memberId).first();
      return reply({success:true,canHost:!active,activeEventId:active?.id||''});
    }
    if(request.method==='POST'&&path==='/events')return reply({success:true,event:await save(db,actor,await boundedJson(request,MEMBER_MEDIA_LIMIT),'',env.IMG_BUCKET)});
    const media=path.match(/^\/([0-9a-f-]{36})\/media\/([0-9a-f-]{36})\.(jpg|png|webp|pdf)$/i);
    if(request.method==='GET'&&media&&UUID.test(media[1])&&UUID.test(media[2])){const e=await eventFor(db,media[1],actor);return await readMedia(env.IMG_BUCKET,e.cover_url,url,HEADERS);}
    const match=path.match(/^\/([0-9a-f-]{36})(?:\/([a-z-]+))?$/i);if(!match||!UUID.test(match[1]))fail('NOT_FOUND','找不到這個操作',404);const [,id,verb]=match;
    if(request.method==='POST')return reply({success:true,...await action(db,actor,id,verb,await boundedJson(request,verb==='update'?MEMBER_MEDIA_LIMIT:16384),env.IMG_BUCKET)});
    const event=await eventFor(db,id,actor,verb==='registrations');
    if(!verb){const mine=await registration(db,id,actor.memberId);return reply({success:true,event:mapped(event,actor.memberId),registration:mine?{status:mine.status,registeredAt:mine.registered_at,checkedInAt:mine.checked_in_at||''}:null});}
    if(verb==='registrations'){
      const offset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(offset)||offset<0||offset>10000)fail('INVALID_OFFSET','分頁位置不正確');
      const registrations=await rows(db,`SELECT r.id,r.status,r.registered_at AS registeredAt,r.checked_in_at AS checkedInAt,COALESCE(NULLIF(u.name,''),'會員') AS displayName FROM member_event_registrations r LEFT JOIN users u ON u.row_id=r.member_id WHERE r.event_id=? ORDER BY r.registered_at DESC,r.id DESC LIMIT 101 OFFSET ?`,id,offset);
      return reply({success:true,event:mapped(event,actor.memberId),registrations:registrations.slice(0,100),nextOffset:registrations.length>100?offset+100:null});
    }
    fail('NOT_FOUND','找不到這個操作',404);
  }catch(error){
    if(error.code&&error.status)return reply({success:false,code:error.code,error:error.message},error.status);
    const found=Object.keys(safeErrors).find(code=>String(error.message).includes(code));if(found)return reply({success:false,code:found,error:safeErrors[found]},409);
    console.error(JSON.stringify({message:'member_events_request_failed'}));return reply({success:false,code:'SERVICE_UNAVAILABLE',error:'會員活動暫時無法完成，請稍後重試'},503);
  }
}
