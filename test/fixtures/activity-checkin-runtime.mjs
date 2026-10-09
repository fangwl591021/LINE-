// Imports the actual production Worker; only synthetic cached identities and local D1.
import worker from '../../worker-entry.mjs';
const identities={'AUTH_owner-a':'owner-a','AUTH_owner-b':'owner-b','AUTH_member-a':'member-a'};
export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/fixture-state')return Response.json(await env.ACTMASTER_DB.prepare('SELECT row_id,checked_in,nfc_checkin_time,nfc_checkin_source FROM registrants ORDER BY row_id').all());
    if(request.method!=='POST')return new Response('Local synthetic checkin only');
    const body=await request.clone().json();
    if(!['toggleCheckin','redeemActivityCheckin','getActivityRegistrants'].includes(body.action))return new Response('Not in test scope',{status:403});
    const token=body.payload?.lineAccessToken;
    if(token&&!identities['AUTH_'+token])return Response.json({success:false,error:'Unknown synthetic token'},{status:403});
    return worker.fetch(request,{ACTMASTER_DB:env.ACTMASTER_DB,ACTMASTER_KV:{get:async key=>identities[key]||null,put:async()=>{throw Error('Provider calls disabled');}}},ctx);
  }
};
