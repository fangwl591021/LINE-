import {handlePartnerContracts,createPartnerV2Order,markPartnerV2OrderPaid,updatePartnerV2OrderStatus} from '../../worker/partner-bonus-v2.mjs';
export default {async fetch(request,env){
 const url=new URL(request.url),fetcher=async(url,options)=>{if(url!=='https://api.line.me/v2/profile'||options.redirect!=='manual')throw Error('Unexpected network');return Response.json({userId:'U'+(options.headers.Authorization==='Bearer admin'?'a':'b').repeat(32)});};
 if(url.pathname.startsWith('/fixture/')){
  const body=await request.json();let value;
  if(url.pathname==='/fixture/create')value=await createPartnerV2Order(env,body,undefined,body.authenticatedUserId);
  else if(url.pathname==='/fixture/pay')value=await markPartnerV2OrderPaid(env,body);
  else if(url.pathname==='/fixture/refund')value=await updatePartnerV2OrderStatus(env,body,'refunded');
  return Response.json(value);
 }
 return await handlePartnerContracts(request,env,row=>({role:row.role}),fetcher)||new Response('',{status:404});
}};
