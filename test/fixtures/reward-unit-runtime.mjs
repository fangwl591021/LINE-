import {handleRewardUnits} from '../../worker/reward-unit-directory.mjs';
import {listingCategories} from '../../worker/store-listing-review.mjs';
export default {async fetch(request,bindings){
  const mode=request.headers.get('X-Fixture-Mode')||'allow';
  const env={...bindings,OPENAI_API_KEY:'synthetic-runtime-key'};
  const fetcher=async(url,options)=>{
    if(url==='https://api.line.me/v2/profile'){if(options.redirect!=='manual')throw Error('Invalid redirect');return Response.json({userId:'U'+'a'.repeat(32)});}
    if(url==='https://api.openai.com/v1/responses'){
      if(mode==='error')return new Response('',{status:500});
      const body=JSON.parse(options.body),content=JSON.parse(body.input[0].content[0].text);
      const review={decision:mode==='manual'?'manual':'allow',checked_categories:listingCategories,image_count:0,issues:mode==='manual'?[{category:'other',field:'name',evidence:content.name,reason:'合成執行環境：需要人工核對'}]:[]};
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(review)}]}]});
    }
    throw Error('Unexpected network request');
  };
  return await handleRewardUnits(request,env,row=>({role:row.role}),fetcher)||new Response('',{status:404});
}};
