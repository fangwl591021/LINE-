// LOCAL TEST ONLY: real Workers/D1 execution, fake outbound providers, no real keys or identities.
import { handleAiAdvance, processAiAdvanceReminders } from '../../worker/ai-advance.mjs';
export default { async fetch(request, bindings, ctx) {
  const pushes=[],env={...bindings,OPENAI_API_KEY:'runtime-fixture',OPENAI_MODEL:'runtime-fixture',LINE_CHANNEL_ACCESS_TOKEN:'runtime-fixture'};
  const fetcher=async (url,options)=>{
    if(url==='https://api.line.me/v2/profile'){
      const token=options.headers.Authorization.slice(7),uid=token==='a'?'U'+'a'.repeat(32):token==='b'?'U'+'b'.repeat(32):'';
      return new Response(JSON.stringify({userId:uid}),{status:uid?200:401});
    }
    if(url==='https://api.openai.com/v1/responses')return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({createNextTask:true,title:'Runtime 下一步',description:'測試回報後續',dueInDays:7,priority:'normal',reason:'依執行回報提出下一步'})}]}]});
    if(url==='https://api.line.me/v2/bot/message/push'){pushes.push(JSON.parse(options.body));return new Response('{}');}
    throw Error('UNEXPECTED_OUTBOUND');
  };
  if(new URL(request.url).pathname==='/fixture/reminders'){await processAiAdvanceReminders(env,fetcher);return Response.json({pushes});}
  return await handleAiAdvance(request,env,ctx,fetcher) || new Response('Not found',{status:404});
} };
