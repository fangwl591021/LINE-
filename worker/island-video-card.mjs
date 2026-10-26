// Personal title/desc for the existing island video card. No personal card,
// membership, points, role or media writes; GET and keyword display are read-only.
import {resolveIslandMember, IslandAccessError} from './island-interaction-access.mjs';
import {boundedJson} from './member-chat.mjs';
import {buildPeopleIslandVideoFlex, peopleIslandVideoConfig} from '../js/modules/people-island-flex.mjs';
const BASE='/v1/island-video-card', UID=/^U[0-9a-f]{32}$/i;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, PUT, OPTIONS'};
const fail=(code,message,status=400)=>{throw new IslandAccessError(code,message,status);};
const reply=(value,status=200)=>Response.json(value,{status,headers:HEADERS});
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
async function rows(db,sql,...args){const result=await db.prepare(sql).bind(...args).all();if(result.success===false||!Array.isArray(result.results))throw Error('ISLAND_COPY_READ_UNAVAILABLE');return result.results;}
const session=env=>env.ACTMASTER_DB?.withSession?env.ACTMASTER_DB.withSession('first-primary'):env.ACTMASTER_DB;
const cardValue=row=>row?{title:row.title,desc:row.description,revision:row.revision}:{title:peopleIslandVideoConfig().title,desc:peopleIslandVideoConfig().desc,revision:0};

async function identity(db,uid){
 if(!UID.test(uid||''))fail('AUTH_INVALID','無法確認 LINE 身分',401);
 const actor=await resolveIslandMember(db,uid),ids=new Set([uid,actor?.user.line_id].filter(id=>UID.test(id||'')));
 // member row IDs are storage identifiers, not proof of another LINE identity.
 // Only canonical line_id and explicit active old/new links may own this copy.
 // resolveIslandMember also validates unregistered callers; retain their single
 // explicit old/new link so a later canonical login can read the same copy.
 let links=[];
 for(let pass=0;pass<3;pass++){
  const previous=ids.size;
  links=await rows(db,"SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (SELECT value FROM json_each(?1)) OR new_line_id IN (SELECT value FROM json_each(?1))) ORDER BY old_line_id,new_line_id LIMIT 3",JSON.stringify([...ids]));
  if(links.length>1)fail('IDENTITY_CONFLICT','會員身分對應不唯一，請聯絡管理員',409);
  for(const link of links){if(!UID.test(link.old_line_id)||!UID.test(link.new_line_id)||link.old_line_id===link.new_line_id)fail('IDENTITY_CONFLICT','會員身分對應異常',409);ids.add(link.old_line_id);ids.add(link.new_line_id);}
  if(ids.size===previous)break;
  if(pass===2)fail('IDENTITY_CONFLICT','會員身分對應異常',409);
 }
 const list=[...ids].sort(),members=await rows(db,'SELECT row_id,line_id FROM users WHERE line_id IN (SELECT value FROM json_each(?)) ORDER BY row_id,line_id LIMIT 3',JSON.stringify(list));
 if(members.length>2||members.length>1&&(!links[0]||members.filter(row=>row.line_id===links[0].new_line_id).length!==1||members.some(row=>![links[0].old_line_id,links[0].new_line_id].includes(row.line_id))))fail('IDENTITY_CONFLICT','會員身分對應不唯一',409);
 return {uid:actor?.user.line_id||links[0]?.new_line_id||uid,ids:list,links:JSON.stringify(links),members:JSON.stringify(members)};
}
async function ownedCopy(db,context){
 const copies=await rows(db,'SELECT owner_uid,title,description,revision FROM island_video_card_copies WHERE owner_uid IN (SELECT value FROM json_each(?)) LIMIT 3',JSON.stringify(context.ids));
 if(copies.length>1)fail('COPY_IDENTITY_CONFLICT','身分移轉前後的文案需先核對，未覆寫任何資料',409);
 return copies[0]||null;
}
export async function readIslandVideoCardCopy(db,uid){
 if(!db)throw Error('ISLAND_DB_UNAVAILABLE');
 return cardValue(await ownedCopy(db,await identity(db,uid)));
}
const identityGuard=`(SELECT COALESCE(json_group_array(json_object('old_line_id',old_line_id,'new_line_id',new_line_id)),'[]') FROM (SELECT old_line_id,new_line_id FROM user_identity_links WHERE status='active' AND (old_line_id IN (SELECT value FROM json_each(?1)) OR new_line_id IN (SELECT value FROM json_each(?1))) ORDER BY old_line_id,new_line_id))=?2
 AND (SELECT COALESCE(json_group_array(json_object('row_id',row_id,'line_id',line_id)),'[]') FROM (SELECT row_id,line_id FROM users WHERE line_id IN (SELECT value FROM json_each(?1)) ORDER BY row_id,line_id))=?3`;
function normalizeSave(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!['title','desc','revision','requestKey'].includes(key)))fail('INVALID_FIELDS','只可修改本人的標題與說明');
 if(typeof data.title!=='string'||typeof data.desc!=='string'||!Number.isSafeInteger(data.revision)||data.revision<0||data.revision>=Number.MAX_SAFE_INTEGER||!UUID.test(data.requestKey||''))fail('INVALID_COPY','請提供標題、說明與有效版本');
 let config;try{config=peopleIslandVideoConfig(data);}catch{fail('INVALID_COPY','標題限80字、說明限800字，且不可空白或含控制字元');}
 return {title:config.title,desc:config.desc,revision:data.revision,requestKey:data.requestKey.toLowerCase()};
}
export async function saveIslandVideoCardCopy(db,uid,input){
 const data=normalizeSave(input),context=await identity(db,uid),existing=await ownedCopy(db,context),owner=existing?.owner_uid||context.uid;
 const requestJson=JSON.stringify({title:data.title,desc:data.desc,revision:data.revision}),command=await first(db,'SELECT request_json,response_json FROM island_video_card_copy_commands WHERE owner_uid=? AND request_key=?',owner,data.requestKey);
 if(command){if(command.request_json!==requestJson)fail('REQUEST_CONFLICT','同一次儲存已送出不同內容',409);return {...JSON.parse(command.response_json),replayed:true};}
 if((existing?.revision||0)!==data.revision)fail('COPY_CONFLICT','文案已在其他頁面更新；請重新載入，未覆寫資料',409);
 const at=new Date().toISOString(),nonce=crypto.randomUUID(),card={title:data.title,desc:data.desc,revision:data.revision+1},response={success:true,card};
 // Bind the identity fence first using numbered placeholders; all other binds
 // follow from ?4. Both writes share a per-operation nonce, never the retry key.
 const result=await db.batch([
  db.prepare(`INSERT INTO island_video_card_copies(owner_uid,title,description,revision,write_nonce,updated_at) SELECT ?4,?5,?6,?7,?8,?9 WHERE ${identityGuard}
   ON CONFLICT(owner_uid) DO UPDATE SET title=excluded.title,description=excluded.description,revision=excluded.revision,write_nonce=excluded.write_nonce,updated_at=excluded.updated_at WHERE island_video_card_copies.revision=?10`).bind(JSON.stringify(context.ids),context.links,context.members,owner,data.title,data.desc,card.revision,nonce,at,data.revision),
  db.prepare(`INSERT INTO island_video_card_copy_commands(owner_uid,request_key,request_json,response_json,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM island_video_card_copies WHERE owner_uid=? AND write_nonce=?)`).bind(owner,data.requestKey,requestJson,JSON.stringify(response),at,owner,nonce)
 ]);
 if(result[0].meta?.changes!==1||result[1].meta?.changes!==1){
  const replay=await first(db,'SELECT request_json,response_json FROM island_video_card_copy_commands WHERE owner_uid=? AND request_key=?',owner,data.requestKey);
  if(replay&&replay.request_json===requestJson)return {...JSON.parse(replay.response_json),replayed:true};
  fail('COPY_CONFLICT','登入身分或文案已更新；請重新載入，未覆寫資料',409);
 }
 return response;
}
async function lineUid(request,fetcher){
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];if(!token||token.length>4096)fail('AUTH_REQUIRED','請先使用 LINE 登入',401);
 let response;try{response=await fetcher('https://api.line.me/v2/profile',{headers:{Authorization:'Bearer '+token},redirect:'manual',signal:AbortSignal.timeout(8000)});}catch{fail('AUTH_UNAVAILABLE','LINE 驗證暫時無法完成，請稍後重試',503);}
 if([401,403].includes(response.status)){await response.body?.cancel();fail('AUTH_EXPIRED','請重新登入 LINE',401);}
 if(!response.ok){await response.body?.cancel();fail('AUTH_UNAVAILABLE','LINE 驗證暫時無法完成',503);}
 let profile;try{profile=await boundedJson(response,8192);}catch{fail('AUTH_UNAVAILABLE','LINE 驗證資料暫時無法確認',503);}
 if(!UID.test(profile.userId||''))fail('AUTH_INVALID','無法確認 LINE 身分',401);return profile.userId;
}
export async function handleIslandVideoCard(request,env,fetcher=fetch){
 const url=new URL(request.url);if(url.pathname!==BASE&&!url.pathname.startsWith(BASE+'/'))return null;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:HEADERS});
 try{
  if(url.pathname!==BASE||url.search)fail('INVALID_QUERY','此入口只提供本人文案，不接受其他身分或查詢條件');
  if(!['GET','PUT'].includes(request.method))fail('METHOD_NOT_ALLOWED','此入口只提供讀取與儲存',405);
  const uid=await lineUid(request,fetcher),db=session(env);if(!db)throw Error('ISLAND_DB_UNAVAILABLE');
  if(request.method==='GET')return reply({success:true,card:await readIslandVideoCardCopy(db,uid)});
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))fail('INVALID_CONTENT_TYPE','請使用 JSON 資料',415);
  return reply(await saveIslandVideoCardCopy(db,uid,await boundedJson(request,8192)));
 }catch(error){
  if(error instanceof IslandAccessError||['INVALID_BODY','BODY_TOO_LARGE'].includes(error?.code))return reply({success:false,code:error.code,error:error.message},error.status||400);
  console.error('island_video_copy_unavailable');return reply({success:false,code:'ISLAND_VIDEO_UNAVAILABLE',error:'影片名片文案暫時無法完成，請稍後重試'},503);
 }
}
export function isIslandVideoKeyword(event){return event?.type==='message'&&event.message?.type==='text'&&typeof event.message.text==='string'&&event.message.text.normalize('NFKC').trim()==='人脈島';}
// Only call after verifying the LINE signature. Each claimed event has exactly
// one reply owner and is never returned for downstream forwarding, even on error.
export async function consumeIslandVideoKeywords(events,env,replyFn,{personalShareLink,buildMessage=buildPeopleIslandVideoFlex}={}){
 const remaining=[],seenTokens=new Set();
 for(const event of Array.isArray(events)?events:[]){
  if(!isIslandVideoKeyword(event)){remaining.push(event);continue;}
  if(event.mode==='standby'||!event.replyToken)continue;
  if(seenTokens.has(event.replyToken))continue;
  seenTokens.add(event.replyToken);
  let message;
  if(event.source?.type!=='user'||!UID.test(event.source.userId||''))message={type:'text',text:'請在點數通官方帳號的一對一聊天室輸入「人脈島」，查看及編輯自己的影片名片。'};
  else try{
   const db=session(env);if(!db||typeof personalShareLink!=='function')throw Error('ISLAND_CONTEXT_UNAVAILABLE');
   const copy=await readIslandVideoCardCopy(db,event.source.userId),link=await personalShareLink(db,event.source.userId);
   message=buildMessage({entryUrl:link.entryUrl,config:copy,card:copy});
   const edit=new URL(link.entryUrl);edit.searchParams.delete('ref');edit.searchParams.delete('net');edit.searchParams.set('islandVideoEdit','1');
   message.quickReply={items:[{type:'action',action:{type:'uri',label:'編輯標題與說明',uri:edit.href}}]};
  }catch{message={type:'text',text:'人脈島影片名片暫時無法載入，請稍後重新輸入「人脈島」。'};}
  try{await replyFn({replyToken:event.replyToken,messages:[message]},env);}catch{console.error('island_video_reply_unavailable');}
 }
 return remaining;
}
