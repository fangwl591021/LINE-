import {identityNorm as norm} from './store-ai-identity.mjs';

// Card-only corroboration: an OCR company typo or a different public brand is
// not silently corrected. Two matching contact clues may link the public brand
// for a reviewable service draft, never for changing ownership/company fields.
export function resolveCardBusinessIdentity({base,draft,pages,context,queryName,registrationSource}){
  if(!context)return base;
  const brand=norm(draft.identity?.brandName),person=norm(context.personName);
  const address=norm(context.address).replace(/臺/g,'台');
  const phones=[context.companyPhone,context.phone].map(v=>String(v||'').replace(/\D/g,'')).filter(v=>v.length>=8&&v.length<=15)
    .flatMap(v=>[v,...(v.startsWith('0')?['886'+v.slice(1)]:v.startsWith('886')?['0'+v.slice(3)]:[])]);
  const contactsMatch=quote=>{
    const q=norm(quote),a=q.replace(/臺/g,'台');
    return phones.some(p=>q.includes(p))&&(address.length>=10&&/[路街道]/.test(address)&&a.includes(address)||person.length>=2&&q.includes(person));
  };
  if(brand.length<2)return base;
  const proofs=(draft.identity?.evidence||[]).filter(e=>!registrationSource(e.url)&&pages.has(e.url)&&norm(e.quote).includes(brand)&&
    norm(pages.get(e.url)).includes(norm(e.quote))&&contactsMatch(e.quote)&&!/不是|並非|無關|假冒/.test(e.quote));
  if(!proofs.length)return base;
  // A supplier's multi-shop page can establish this contact, but services for
  // its other shops cannot be borrowed: the quoted service block must name the
  // corroborated brand. A bare brand elsewhere in the page is insufficient.
  const quoteMatches=(body,url,quote)=>norm(body).includes(brand)&&norm(quote).includes(brand)&&norm(body).includes(norm(quote));
  return {verified:true,name:queryName,contactMatched:true,
    proofUrls:new Set([...base.proofUrls,...proofs.map(e=>e.url)]),
    samePage:(body,url)=>base.samePage(body,url)||norm(body).includes(brand),
    sameTitle:title=>base.sameTitle(title)||norm(title).includes(brand),
    sameEvidence:(body,url,quote)=>base.verified&&base.samePage(body,url)||quoteMatches(body,url,quote)};
}
