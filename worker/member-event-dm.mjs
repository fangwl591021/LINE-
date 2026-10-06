// Draft extraction only; authenticated caller supplies canonical memberId, never a client role.
import { activityDmImage, normalizeActivityDraft, ACTIVITY_DM_PROMPT } from './activity-dm-ai.mjs';
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
  try{
    const response=await fetcher('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(45000),...(signal?[signal]:[])]),
      headers:{Authorization:'Bearer '+env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:env.OPENAI_VISION_MODEL||env.OPENAI_MODEL||'gpt-4o',store:false,max_output_tokens:4000,
        instructions:ACTIVITY_DM_PROMPT,input:[{role:'user',content:[{type:'input_text',text:'忠實擷取附件活動資料，逐項核對名稱、時段、地點與說明；只產生待確認草稿。'},file]}],text:{format:{type:'json_object'}}})});
    if(!response.ok){await response.body?.cancel();fail('AI_UNAVAILABLE','AI 辨識服務暫時無法使用，原表單未變更',503);}
    const result=await boundedJson(response,128000);
    if(result.status&&result.status!=='completed')throw Error('Incomplete AI');
    const value=(result.output||[]).flatMap(r=>r.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
    if(!value||value.length>30000)throw Error('Invalid AI');
    const draft=normalizeActivityDraft(JSON.parse(value));
    if(draft.timeStatus==='multiple')draft.confidenceNote=draft.confidenceNote.replace('DM 有多個場次，請依時間原文勾選本次要建立的梯次，並補齊日期、時間與費用','DM 有多個時段，本次會員活動請單選一個時段，其他時段不會另建活動');
    if(!draft.activityName||!(draft.location||draft.description||draft.scheduleText))fail('DM_UNCLEAR','未辨識到活動資料，請换清楚的檔案或手動填寫',422);
    // Same existing field limits; do not silently truncate material that the host must verify.
    if(draft.activityName.length>100||draft.description.length>2000)draft.confidenceNote+='；内容超出活動欄位限制，請手動精簡後發布';
    return {success:true,draft};
  }catch(e){
    if(e.code&&['DM_UNCLEAR','AI_UNAVAILABLE'].includes(e.code))throw e;
    fail('DM_FAILED',['AbortError','TimeoutError'].includes(e.name)?'辨識逾時或已取消，原表單未變更':'AI 未能完成辨識，原表單未變更；可重新辨識或手動填寫',503);
  }
}
