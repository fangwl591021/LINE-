// Public, user-selected source only. Never executes source scripts or reads source nonces/accounts.
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export const sourceGroups = {
  '北部地區':[2695,4249,3089,3091,1482,1058,1668,2039,2637,1273,2056,1763,2591,2600,2026,2607,8313,685,2305,1011,943,2499,898,1769,1172,4100,2500,956,5476,1018,2097,8314],
  '中部地區':[2929,2275,5249,5396,2408,2409,3157,9826,2382,2381,3824],
  '南部地區':[4991,3014,5349,2701,2297,2090],
  '東部地區':[6821]
};
const strings=(source,key)=>[...source.matchAll(new RegExp('"'+key+'"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")','g'))].map(match=>JSON.parse(match[1]));
export function parseCard(html,id,region) {
  const bodyStart=html.lastIndexOf('"body":'),footerStart=html.lastIndexOf('"footer":');
  if(bodyStart<0||footerStart<bodyStart)throw Error('無法辨識公開名片內容');
  const body=strings(html.slice(bodyStart,footerStart),'text');
  const name=(body.shift()||'').trim(),description=body.join('\n').trim();
  const heroStart=Math.max(html.lastIndexOf('"hero":',bodyStart),html.lastIndexOf('"header":',bodyStart));
  const image_url=strings(html.slice(heroStart,bodyStart),'url')[0]||'';
  const links=strings(html.slice(footerStart),'uri');
  const phone=(links.find(url=>url.startsWith('tel:'))||'').slice(4).replace(/[^+\d\s()-]/g,'').trim();
  const safe=url=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname.includes('.')&&!u.username&&!u.password&&!/xxxxxx/.test(u.pathname)&&!['access.line.me','liff.line.me'].includes(u.hostname)&&!(/^\/$/.test(u.pathname)&&['google.com','www.google.com','line.me'].includes(u.hostname))?u.href:'';}catch{return '';}};
  const line_url=safe(links.find(url=>/^https:\/\/(?:line\.me|lin\.ee)\//.test(url))||'');
  const maps_url=safe(links.find(url=>/maps|goo\.gl|g\.co\/kgs\//.test(url)&&!url.includes('facebook'))||'');
  const website_url=safe(links.find(url=>url.startsWith('https:')&&!url.includes('liff.line.me')&&url!==line_url&&url!==maps_url)||'');
  const address=(description.match(/(?:地址[：:]?\s*)?((?:臺|台)北市|新北市|桃園市|新竹[縣市]|苗栗縣|(?:臺|台)中市|彰化縣|南投縣|雲林縣|嘉義[縣市]|(?:臺|台)南市|高雄市|屏東縣|宜蘭縣|花蓮縣|(?:臺|台)東縣)[^\n]{3,100}/)?.[0]||'').replace(/^地址[：:]?\s*/,'').trim();
  const hours=description.split('\n').find(line=>/^營業時間/.test(line))||'';
  const reasons=[];
  if(name.length<2||name.length>160)reasons.push('店名不足或過長');
  if(/^(業務店家|測試店家|範例店家)$/.test(name))reasons.push('店名仍為泛用名稱');
  if(phone==='0912345678'||(phone&&phone.replace(/\D/g,'').length<8))reasons.push('電話疑似預設值或不完整');
  if(description.length<15||description.length>2000)reasons.push('介紹不足或過長');
  if(/請填寫|建議4.?～?5行|公司\/店家介紹…|公司\/店家服務…/.test(description))reasons.push('介紹仍有預設填寫文字');
  if(/趕緊來使用環保LINE電子名片/.test(description))reasons.push('介紹為電子名片通用宣傳文字，非店家介紹');
  if(!safe(image_url))reasons.push('缺少 HTTPS 封面');
  if(!phone&&!line_url&&!website_url)reasons.push('缺少公開聯絡方式');
  return {source_id:String(id),source_url:`https://aiwe.cc/index.php/linecard_13/${id}/?share=1`,region,name,description,image_url,phone,line_url,website_url,maps_url,address,hours,reasons};
}
async function readPublic(url) {
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'follow'});
  if(!response.ok)throw Error('來源 HTTP '+response.status);
  const reader=response.body.getReader();let size=0;const chunks=[];
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>1024*1024){await reader.cancel();throw Error('來源內容過大');}chunks.push(value);}}finally{reader.releaseLock();}
  return new TextDecoder().decode(Buffer.concat(chunks));
}
async function main(){
  const pending=Object.entries(sourceGroups).flatMap(([region,ids])=>ids.map(id=>({region,id}))),results=[];
  async function work(){while(pending.length){const {region,id}=pending.shift();try{
    const card=parseCard(await readPublic(`https://aiwe.cc/index.php/linecard_13/${id}/?share=1`),id,region);
    if(!card.reasons.length){try{const response=await fetch(card.image_url,{method:'HEAD',signal:AbortSignal.timeout(10000)});if(!response.ok||!/^image\//.test(response.headers.get('content-type')||''))card.reasons.push('封面無法讀取');}catch{card.reasons.push('封面驗證逾時');}}
    results.push(card);console.log(JSON.stringify({id,name:card.name,reasons:card.reasons}));
  }catch(error){results.push({source_id:String(id),region,reasons:[error.message]});console.log(JSON.stringify({id,error:error.message}));}}}
  await Promise.all([work(),work(),work()]);
  results.sort((a,b)=>Number(a.source_id)-Number(b.source_id));
  const output=path.resolve('.wrangler/partner-import-20260919');await mkdir(output,{recursive:true});
  await writeFile(path.join(output,'candidates.json'),JSON.stringify({source:'https://aiwe.cc/index.php/search_linecard/?shop_id=78&submitted=1',captured_at:new Date().toISOString(),candidates:results},null,2));
  console.log(JSON.stringify({total:results.length,complete:results.filter(row=>!row.reasons.length).length,output}));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
