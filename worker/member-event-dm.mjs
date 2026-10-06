// Draft extraction only; authenticated caller supplies canonical memberId, never a client role.
import { activityDmImage } from './activity-dm-ai.mjs';
import { MEMBER_EVENT_DM_MODEL, MEMBER_EVENT_DM_SCHEMA, MEMBER_EVENT_DM_INSTRUCTIONS, normalizeMemberEventDmDraft, memberEventDmOutputText } from './member-event-dm-schema.mjs';
import { boundedJson } from './member-chat.mjs';
export const MEMBER_DM_BODY_LIMIT=Math.ceil(4*1024*1024/3)*4+4096;
const fail=(code,message,status=400)=>{throw Object.assign(new Error(message),{code,status});};
function inputFile(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||!body.file||typeof body.file!=='object'||Array.isArray(body.file))fail('INVALID_FILE','請重新選擇 DM／PDF');
  if(Object.keys(body).some(k=>k!=='file')||!body.file||Object.keys(body.file).some(k=>!['type','data'].includes(k)))fail('INVALID_FILE','請重新選擇 DM／PDF');
  const {type,data}=body.file;
  if(type==='application/pdf'){
    const m=typeof data==='string'&&data.length<=MEMBER_DM_BODY_LIMIT-4000&&data.match(/^data:application\/pdf;base64,([A-Za-z0-9+/]+={0,2})$/);
    if(!m||m[1].length%4)fail('INVALID_FILE','PDF 請使用 4 MB 以內的有效檔案');
    const bytes=atob(m[1]);if(!bytes.startsWith('%PDF-')||bytes.length>4*1024*1024)fail('INVALID_FILE','PDF 內容或大小不正確');
    return {type:'input_file',filename:'activity.pdf',file_data:data};
  }
  if(!['image/jpeg','image/png','image/webp'].includes(type)||!String(data).startsWith('data:'+type+';base64,'))fail('INVALID_FILE','請選 JPG、PNG、WebP 或 PDF');
  try{return {type:'input_image',image_url:activityDmImage(data),detail:'high'};}catch(e){fail('INVALID_FILE',e.message);}
}
export async function extractMemberEventDm(body,env,db,actor,fetcher=fetch,signal){
  const file=inputFile(body);
  if(!env.OPENAI_API_KEY)fail('AI_UNAVAILABLE','活動辨識暫未設定，仍可手動填寫',503);
  const now=Date.now(),day=new Date(now+8*3600000).toISOString().slice(0,10);
  const claim=await db.prepare(`INSERT INTO member_event_dm_usage(member_id,usage_day,attempts,next_allowed_at) VALUES(?,?,1,?)
    ON CONFLICT(member_id) DO UPDATE SET usage_day=excluded.usage_day,
    attempts=CASE WHEN usage_day=excluded.usage_day THEN attempts+1 ELSE 1 END,next_allowed_at=excluded.next_allowed_at
    WHERE next_allowed_at<=? AND (usage_day!=excluded.usage_day OR attempts<20)`).bind(actor.memberId,day,now+15000,now).run();
  if(claim.success===false)fail('AI_UNAVAILABLE','活動辨識暫時無法使用',503);
  if(!claim.meta?.changes)fail('DM_LIMIT','辨識請間隔 15 秒，每日最多 20 次；仍可手動填寫',429);
  // Only fixed categories and numeric metadata may leave this request. Never log raw errors or AI text.
  const diagnostic={message:'member_event_dm_failed',diagnosticCode:'DM-'+crypto.randomUUID().replace(/-/g,'').slice(0,12),stage:'provider_request',reason:'unexpected_error',httpStatus:0,responseStatus:'unknown',incompleteReason:'unknown',providerCode:'unknown',outputTextChars:0,elapsedMs:0};
  try{
    // The deployed Workers runtime rejects redirect:error before network I/O. Manual keeps credentials on this fixed origin; 3xx is rejected below.
    const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'manual',signal:AbortSignal.any([AbortSignal.timeout(45000),...(signal?[signal]:[])]),
      headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:MEMBER_EVENT_DM_MODEL,reasoning:{effort:'low'},store:false,max_output_tokens:4000,
        instructions:MEMBER_EVENT_DM_INSTRUCTIONS,input:[{role:'user',content:[{type:'input_text',text:'忠實擷取附件活動資料，逐項核對名稱、時段、地點與說明；只產生待確認草稿。'},file]}],text:{format:{type:'json_schema',name:'member_activity_dm',strict:true,schema:MEMBER_EVENT_DM_SCHEMA}}})});
    diagnostic.httpStatus=response.status;
    if(!response.ok){
      diagnostic.stage='provider_http';diagnostic.reason='provider_http_error';
      const errorBody=await boundedJson(response,8192).catch(()=>null),code=errorBody?.error?.code;
      if(['invalid_api_key','insufficient_quota','rate_limit_exceeded','model_not_found','invalid_request_error','unsupported_parameter','invalid_image','invalid_image_format','invalid_image_url','server_error'].includes(code))diagnostic.providerCode=code;
      fail('AI_UNAVAILABLE','AI 辨識服務暫時無法使用，原表單未變更',503);
    }
    diagnostic.stage='provider_json';
    const result=await boundedJson(response,128000);
    diagnostic.responseStatus=['completed','incomplete','failed','in_progress','queued','cancelled'].includes(result.status)?result.status:'unknown';
    if(['max_output_tokens','content_filter'].includes(result.incomplete_details?.reason))diagnostic.incompleteReason=result.incomplete_details.reason;
    diagnostic.stage='provider_status';
    if(result.status&&result.status!=='completed'){diagnostic.reason='incomplete_response';throw Error('Incomplete AI');}
    diagnostic.stage='output_text';
    const value=memberEventDmOutputText(result);
    diagnostic.outputTextChars=value.length;
    if(!value||value.length>30000){diagnostic.reason=!value?'missing_output_text':'output_too_large';throw Error('Invalid AI');}
    diagnostic.stage='draft_json';const parsed=JSON.parse(value);
    diagnostic.stage='normalize_draft';const draft=normalizeMemberEventDmDraft(parsed);
    if(draft.timeStatus==='multiple')draft.confidenceNote=draft.confidenceNote.replace('DM 有多個場次，請依時間原文勾選本次要建立的梯次，並補齊日期、時間與費用','DM 有多個時段，本次會員活動請單選一個時段，其他時段不會另建活動');
    diagnostic.stage='core_fields';
    if(!draft.activityName||!(draft.location||draft.description||draft.scheduleText)){diagnostic.reason='missing_core_fields';fail('DM_UNCLEAR','未辨識到活動資料，請换清楚的檔案或手動填寫',422);}
    // Same existing field limits; do not silently truncate material that the host must verify.
    if(draft.activityName.length>100||draft.description.length>2000)draft.confidenceNote+='；内容超出活動欄位限制，請手動精簡後發布';
    return {success:true,draft};
  }catch(e){
    const aborted=['AbortError','TimeoutError'].includes(e.name);
    if(aborted)diagnostic.reason='timeout_or_cancelled';
    else if(diagnostic.reason==='unexpected_error')diagnostic.reason=diagnostic.stage==='provider_request'?'network_or_request_failure':diagnostic.stage==='provider_json'?(e.code==='BODY_TOO_LARGE'?'response_too_large':'invalid_provider_json'):diagnostic.stage==='draft_json'?'invalid_draft_json':diagnostic.stage==='normalize_draft'?'invalid_draft_schema':'unexpected_error';
    diagnostic.elapsedMs=Math.max(0,Date.now()-now);
    try{console.error(JSON.stringify(diagnostic));}catch{} // Diagnostics must never mask the original failure.
    const suffix='（診斷碼：'+diagnostic.diagnosticCode+'）';
    if(e.code&&['DM_UNCLEAR','AI_UNAVAILABLE'].includes(e.code)){e.message+=suffix;throw e;}
    fail('DM_FAILED',(aborted?'辨識逾時或已取消，原表單未變更':'AI 未能完成辨識，原表單未變更；可重新辨識或手動填寫')+suffix,503);
  }
}
