import baseWorker from './worker-entry.mjs';
import { AIUsageMeter } from './worker/ai-usage-metering.mjs';
import { GeminiCardOCR } from './worker/gemini-card-ocr.mjs';

const text = value => String(value ?? '').trim();
const ADMIN_ACTIONS = new Set(['getAiUsageDashboard','saveAiBillingRate']);
const OCR_ACTION = 'recognizeCardWithGPT4o';
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}})}

async function lineUserId(request,payload,env){
  const token=text(payload.lineAccessToken||request.headers.get('Authorization')?.replace(/^Bearer\s+/i,''));
  if(!token)return '';
  const cacheKey=`AUTH_${token.slice(0,30)}`;
  const cached=env.ACTMASTER_KV?text(await env.ACTMASTER_KV.get(cacheKey).catch(()=>'')):'';
  if(cached)return cached;
  const response=await fetch('https://api.line.me/v2/profile',{headers:{Authorization:`Bearer ${token}`}});
  if(!response.ok)return '';
  const profile=await response.json();
  const userId=text(profile.userId);
  if(userId&&env.ACTMASTER_KV)await env.ACTMASTER_KV.put(cacheKey,userId,{expirationTtl:3600});
  return userId;
}
async function isAdmin(request,payload,env){
  const userId=await lineUserId(request,payload,env);
  if(!userId)return false;
  const row=await env.ACTMASTER_DB.prepare('SELECT role FROM users WHERE line_id=? OR row_id=? LIMIT 1').bind(userId,userId).first();
  return text(row?.role).toLowerCase()==='admin';
}
async function handleAdmin(request,action,payload,env){
  if(!await isAdmin(request,payload,env))return json({success:false,error:'Access Denied: Admin only action'},403);
  try{
    const result=action==='saveAiBillingRate'?await AIUsageMeter.saveRate(env,payload):await AIUsageMeter.getDashboard(env,payload);
    return json(result,result?.success===false?400:200);
  }catch(error){
    console.error('AI usage admin failed',action,text(error?.message)||'UNKNOWN');
    return json({success:false,error:'AI_USAGE_ADMIN_FAILED'},500);
  }
}
async function logUsage(action,payload,body,ok,latencyMs,env,ctx){
  const task=AIUsageMeter.logAction({action,payload,body,ok,latencyMs},env).catch(error=>console.error('AI usage log failed',action,text(error?.message)||'UNKNOWN'));
  if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
}

export default {
  async fetch(request,env,ctx){
    let postBody=null;
    if(request.method==='POST'){
      postBody=await request.clone().json().catch(()=>null);
      const action=text(postBody?.action);
      const payload=postBody?.payload||{};
      if(ADMIN_ACTIONS.has(action))return await handleAdmin(request,action,payload,env);
      if(action===OCR_ACTION){
        const startedAt=Date.now();
        let geminiError='';
        try{
          const result=await GeminiCardOCR.recognize(payload,env);
          await logUsage(action,payload,result,true,Date.now()-startedAt,env,ctx);
          return json(result,200);
        }catch(error){
          geminiError=text(error?.name==='AbortError'?'GEMINI_TIMEOUT':error?.message)||'GEMINI_FAILED';
          console.warn('[OCR fallback] Gemini failed, trying existing OpenAI OCR:',geminiError);
        }
        const response=await baseWorker.fetch(request,env,ctx);
        const body=await response.clone().json().catch(()=>({success:false,error:'OPENAI_OCR_INVALID_RESPONSE'}));
        const enriched={...body,providerUsed:'openai',modelUsed:body?.modelUsed||'gpt-4o',fallbackUsed:true,fallbackReason:geminiError};
        await logUsage(action,payload,enriched,response.ok,Date.now()-startedAt,env,ctx);
        return json(enriched,response.status);
      }
    }
    const startedAt=Date.now();
    const response=await baseWorker.fetch(request,env,ctx);
    if(request.method==='POST'){
      const action=text(postBody?.action);
      if(AIUsageMeter.isTrackedAction(action)){
        const body=await response.clone().json().catch(()=>({}));
        await logUsage(action,postBody?.payload||{},body,response.ok,Date.now()-startedAt,env,ctx);
      }
    }
    return response;
  },
  async scheduled(controller,env,ctx){return await baseWorker.scheduled(controller,env,ctx)}
};
