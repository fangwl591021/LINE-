// Synthetic provider only. No production key, network, DB, or runtime bypass flag.
import {readFileSync} from 'node:fs';
import {listingCategories} from '../../worker/store-listing-review.mjs';
export function allowListing(imageCount=0){return {decision:'allow',checked_categories:[...listingCategories],image_count:imageCount,issues:[]};}
export function listingTestEnv(sql,db,{bypassQuota=true}={}){
  sql.exec(readFileSync(new URL('../../migrations/0058_store_listing_reviews.sql',import.meta.url),'utf8'));
  const wrapped={...db,withSession(){return this;},prepare(query){
    if(!/store_listing_review/.test(query))return db.prepare(query);
    const stmt=(args=[])=>({bind(...values){return stmt(values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {success:true,results:sql.prepare(query).all(...args)};},async run(){
      // Existing catalog tests exercise quotas/concurrency separately from AI quotas.
      if(bypassQuota&&query.startsWith('INSERT INTO store_listing_review_usage'))sql.prepare('DELETE FROM store_listing_review_usage WHERE actor_uid=?').run(args[0]);
      return {success:true,meta:{changes:Number(sql.prepare(query).run(...args).changes)}};
    }});return stmt();
  }};
  return {ACTMASTER_DB:wrapped,OPENAI_API_KEY:'synthetic-listing-key'};
}
export function listingTestFetch(base,{review=(_body,count)=>allowListing(count),image=()=>new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),{headers:{'Content-Type':'image/png'}})}={}){
  return async(url,opts={})=>{
    if(String(url).startsWith('https://cloudflare-dns.com/dns-query'))return Response.json({Status:0,Answer:[{type:1,data:'93.184.216.34'}]});
    if(url==='https://api.openai.com/v1/responses'){
      const body=JSON.parse(opts.body);
      if(body.text?.format?.name==='store_listing_review'){
        const value=await review(body,body.input[0].content.filter(c=>c.type==='input_image').length);
        if(value instanceof Response)return value;
        return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]});
      }
    }
    if(url!=='https://api.line.me/v2/profile'&&opts.headers?.Accept==='image/jpeg,image/png,image/webp')return image(url,opts);
    return base(url,opts);
  };
}
