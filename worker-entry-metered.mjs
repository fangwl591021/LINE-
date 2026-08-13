import baseWorker from './worker-entry.mjs';
import { AIUsageMeter } from './worker/ai-usage-metering.mjs';

const text = value => String(value ?? '').trim();
const ADMIN_ACTIONS = new Set(['getAiUsageDashboard','saveAiBillingRate']);

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

export default {
  async fetch(request,env,ctx){
    let postBody=null;
    if(request.method==='POST'){
      postBody=await request.clone().json().catch(()=>null);
      const action=text(postBody?.action);
      if(ADMIN_ACTIONS.has(action))return await handleAdmin(request,action,postBody?.payload||{},env);
    }
    const startedAt=Date.now();
    const response=await baseWorker.fetch(request,env,ctx);
    if(request.method==='POST'){
      const action=text(postBody?.action);
      if(AIUsageMeter.isTrackedAction(action)){
        const task=response.clone().json().catch(()=>({})).then(body=>AIUsageMeter.logAction({action,payload:postBody?.payload||{},body,ok:response.ok,latencyMs:Date.now()-startedAt},env)).catch(error=>console.error('AI usage log failed',action,text(error?.message)||'UNKNOWN'));
        if(ctx?.waitUntil)ctx.waitUntil(task);else await task;
      }
    }
    return response;
  },
  async scheduled(controller,env,ctx){return await baseWorker.scheduled(controller,env,ctx)}
};
