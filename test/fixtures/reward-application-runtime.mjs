import {handleRewardApplications} from '../../worker/reward-applications.mjs';
export default {async fetch(request,env){
 const fetcher=async(url,options)=>{if(url!=='https://api.line.me/v2/profile'||options.redirect!=='manual')throw Error('Unexpected network');return Response.json({userId:'U'+(options.headers.Authorization==='Bearer admin'?'a':'b').repeat(32)});};
 return await handleRewardApplications(request,env,row=>({role:row.role}),fetcher)||new Response('',{status:404});
}};
