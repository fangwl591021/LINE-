import {generateCardBusinessDraft} from './store-ai-draft.mjs';
import {formatCardCopy,isIdentityOnlyCopy} from './card-copy-style.mjs';

const text=(value,max)=>typeof value==='string'?value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').trim().slice(0,max):'';
export function isContactBoilerplate(value){
  return /(?:可|歡迎|請|透過|藉由).{0,32}(?:名片|電話|電子郵件|[Ee]mail|聯絡方式).{0,32}(?:聯絡|洽詢|諮詢)|提供清楚完整的諮詢|協助媒合適合資源|歡迎加入好友了解/.test(String(value||''));
}
export function prepareCardBusinessInput(card={},brief=''){
  const website=text(card.website||card.websiteUrl,500);
  // Bare domains printed on business cards are common; unsafe schemes remain
  // unchanged so publicWebsiteUrl rejects them instead of silently fixing them.
  const websiteUrl=website&&!/^[a-z][a-z\d+.-]*:/i.test(website)?'https://'+website:website;
  const service=text(card.service||card.services,1600);
  return {
    name:text(card.company||card.companyName||card.name,80),websiteUrl,
    context:{personName:text(card.name,120),jobTitle:text(card.jobTitle||card.title,120),
      phone:text(card.phone,80),companyPhone:text(card.companyPhone,80),address:text(card.address,300),
      socials:(Array.isArray(card.socials)?card.socials:[]).slice(0,6).map(s=>({type:text(s?.type||s?.t,30),url:text(s?.url||s?.u,500)})),
      service:isContactBoilerplate(service)||isIdentityOnlyCopy(service)?'':service,brief:text(brief,800)}
  };
}
export async function generateCardBusinessCopy(card,brief,env,uid,fetcher=fetch){
  if(!uid)throw new Error('請重新登入後搜尋名片業務');
  const input=prepareCardBusinessInput(card,brief);
  const result=await generateCardBusinessDraft(input,env,uid,fetcher);
  const raw=text(result.fields?.description,600);
  if(result.match!=='matched'||!raw||isContactBoilerplate(raw)||isIdentityOnlyCopy(raw)){
    return {success:false,error:'已搜尋公開資料，但未確認這張名片的實際業務；原說明未變更。可補品牌／區域後重試，或手動編寫。',data:{sources:result.sources||[],warnings:result.warnings||[]}};
  }
  const service=formatCardCopy(raw);
  if(!service)return {success:false,error:'已找到業務來源，但介紹尚未整理成 4～5 行短句；請重新產生，原說明未變更。',data:{sources:result.sources||[],warnings:result.warnings||[]}};
  return {success:true,data:{service,headline:'',tips:[],sources:result.sources,warnings:result.warnings||[],needsSourceReview:!!result.reviewFields?.includes('description')}};
}
