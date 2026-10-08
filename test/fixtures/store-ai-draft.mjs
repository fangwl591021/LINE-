import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleStoreShop} from '../../worker/store-shop.mjs';
import {registryApis} from '../../worker/store-registration.mjs';
export const UID='U'+'a'.repeat(32),OTHER='U'+'b'.repeat(32),SOURCE='https://www.merchant.com/';
export const sampleFields={name:'測試咖啡公司',description:'提供咖啡、茶飲與甜點。',category:'食',address:'台北市測試路 1 號',phone:'02-12345678',hours:'週一至週五 09:00–18:00'};
const quotes={...sampleFields,category:'提供咖啡、茶飲與甜點。'};
export const REGISTRY_TAX='24456660',registryCompany={Business_Accounting_NO:REGISTRY_TAX,Company_Name:'米樂數位行銷股份有限公司',Company_Location:'新北市板橋區文化路2段486號3樓之2',Company_Status_Desc:'核准設立'};
export const sampleDraft=()=>({match:'matched',fields:{...sampleFields},evidence:Object.keys(sampleFields).map(field=>({field,url:SOURCE,quote:quotes[field]})),warnings:[]});
export const providerResult=draft=>({status:'completed',output:[{type:'web_search_call',status:'completed',action:{sources:[{type:'url',url:SOURCE,title:'測試咖啡公司官網'}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify(draft)}]}]});
export function createFixture(){
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE users(line_id TEXT PRIMARY KEY,role TEXT,name TEXT);');
  for(const [uid,role]of [[UID,'user'],[OTHER,'store']])sql.prepare('INSERT INTO users VALUES(?,?,?)').run(uid,role,'合成測試會員');
  for(const file of ['0029_store_shop_catalog.sql','0031_store_product_category.sql','0035_store_product_purchase_mode.sql','0041_partner_onboarding_ai_usage.sql'])sql.exec(readFileSync(new URL('../../migrations/'+file,import.meta.url),'utf8'));
  const writes=[],calls=[],metrics={analyses:0,saves:0};let output=providerResult(sampleDraft()),upstream=200,noKey=false,websitePrivate=false,html='<h1>'+sampleFields.name+'</h1><p>'+Object.values(sampleFields).join(' ')+'</p>',throwProvider=false,delay=0;
  let registryData={company:[registryCompany],business:[],items:[]},registryStatus=200,registryType='application/json';
  const db={prepare(query){const statement=(args=[])=>({bind(...values){return statement(values);},async first(){return sql.prepare(query).get(...args)||null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){writes.push(query);if(!query.startsWith('INSERT INTO partner_onboarding_ai_usage'))metrics.saves++;const result=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(result.changes)}};}});return statement();}};
  const fetcher=async(url,opts)=>{
    calls.push({url,opts});
    if(url==='https://api.line.me/v2/profile'){const uid=opts.headers.Authorization.slice(7);return /^U[0-9a-f]{32}$/.test(uid)?Response.json({userId:uid}):new Response('',{status:401});}
    if(url.includes('cloudflare-dns.com/dns-query'))return Response.json({Status:0,Answer:[{type:1,data:websitePrivate?'10.0.0.1':'93.184.216.34'}]});
    if(url.startsWith(SOURCE))return new Response(html,{headers:{'Content-Type':'text/html'}});
    if(url.startsWith('https://data.gcis.nat.gov.tw/od/data/api/')){const kind=Object.keys(registryApis).find(k=>url.includes(registryApis[k]));if(!kind)throw Error('Unexpected registry API');return new Response(JSON.stringify(registryData[kind]),{status:registryStatus,headers:{'Content-Type':registryType}});}
    if(url==='https://api.openai.com/v1/responses'){metrics.analyses++;if(delay)await new Promise(r=>setTimeout(r,delay));if(throwProvider)throw new DOMException('private provider secret','TimeoutError');return Response.json(output,{status:upstream});}
    throw Error('Unexpected external target: '+url);
  };
  const env=()=>({ACTMASTER_DB:db,OPENAI_API_KEY:noKey?'':'server-only-test-secret'});
  const call=async(data={name:sampleFields.name},uid=UID,extra={})=>{
    const response=await handleStoreShop(new Request('https://app.com/v1/store-shop/store-ai-draft',{method:'POST',headers:{...(uid?{Authorization:'Bearer '+uid}:{}),'Content-Type':'application/json',...extra.headers},body:JSON.stringify(data)}),{...env(),...extra.env},fetcher);
    return {status:response.status,headers:response.headers,...await response.json()};
  };
  const resetQuota=()=>sql.exec('DELETE FROM partner_onboarding_ai_usage');
  return {sql,db,env,fetcher,calls,writes,metrics,call,resetQuota,close:()=>sql.close(),setOutput:v=>output=v,setStatus:v=>upstream=v,setHtml:v=>html=v,setPrivate:v=>websitePrivate=v,setNoKey:v=>noKey=v,setThrow:v=>throwProvider=v,setDelay:v=>delay=v,setRegistry:(v,status=200,type='application/json')=>{registryData=v;registryStatus=status;registryType=type;}};
}
