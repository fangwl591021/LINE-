// Workerd/D1 validation, synthetic outbound services, no production credentials.
import {handleStoreShop} from '../../worker/store-shop.mjs';
import {listingCategories} from '../../worker/store-listing-review.mjs';
export default {async fetch(request,bindings){
  const mode=request.headers.get('X-Fixture-Mode')||'allow';
  const env={...bindings,OPENAI_API_KEY:mode==='no-key'?'':'synthetic-runtime-key',OPENAI_MODEL:'synthetic-runtime-model'};
  const fetcher=async(url,options)=>{
    if(options.redirect==='error')throw Error('Unsupported no-follow option');
    if(url==='https://api.line.me/v2/profile')return Response.json({userId:'U'+'a'.repeat(32)});
    if(url.startsWith('https://cloudflare-dns.com/dns-query'))return Response.json({Status:0,Answer:[{type:1,data:'93.184.216.34'}]});
    if(url==='https://img.example.com/card.png'){const b=atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==');return new Response(Uint8Array.from(b,c=>c.charCodeAt(0)),{headers:{'Content-Type':'image/png'}});}
    if(url==='https://api.openai.com/v1/responses'){
      if(mode==='error')return new Response('',{status:500});
      const body=JSON.parse(options.body),content=JSON.parse(body.input[0].content[0].text),count=body.input[0].content.filter(x=>x.type==='input_image').length;
      if(body.store!==false||body.text.format.strict!==true||!options.signal)throw Error('Provider policy mismatch');
      const value={decision:mode==='manual'?'manual':'allow',checked_categories:listingCategories,image_count:count,issues:mode==='manual'?[{category:'other',field:'name',evidence:content.name,reason:'合成執行環境：需要人工核對。'}]:[]};
      return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
    }
    throw Error('Unexpected outbound request');
  };
  return await handleStoreShop(request,env,fetcher)||new Response('Not found',{status:404});
}};
