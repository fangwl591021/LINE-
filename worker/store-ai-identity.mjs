// Identity is independent of service evidence. Model claims never establish an
// alias: a consulted, readable quote must link the company/tax ID to the brand.
export const identityNorm=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
export function pageTaxIds(value){
  return [...new Set([...String(value||'').matchAll(/(?:統一編號|統編|Tax\s*ID|VAT\s*No\.?)\s*[:：]?\s*(\d{8})(?!\d)/gi)].map(m=>m[1]))];
}
export function resolveStoreIdentity({draft,pages,companyName='',taxId='',queryName='',registrationSource}){
  const identity=draft.identity||{companyName:draft.fields.name,brandName:'',taxId:'',evidence:[]};
  const canonical=companyName||identity.companyName||draft.fields.name;
  const aliases=new Set(),proofUrls=new Set();let knownTax=taxId;
  const name=identityNorm(canonical),query=identityNorm(queryName);
  const quoted=e=>pages.has(e.url)&&identityNorm(e.quote)&&identityNorm(pages.get(e.url)).includes(identityNorm(e.quote));
  const conflicts=body=>knownTax&&pageTaxIds(body).some(id=>id!==knownTax);
  const officialCompanyPage=url=>{const u=new URL(url);return u.hostname==='findbiz.nat.gov.tw'&&/^\/fts\/company\/\d{8}\/?$/.test(u.pathname);};
  const identityPage=url=>(!registrationSource(url)||officialCompanyPage(url))&&!conflicts(pages.get(url))&&(!officialCompanyPage(url)||pageTaxIds(pages.get(url)).every(id=>id===new URL(url).pathname.match(/\d{8}/)[0]));
  // The provider may cite an unreadable registration page for `name` while a
  // separately consulted company page visibly contains the same full name.
  // Use the text we actually read; its URL is retained as identity evidence.
  const observedName=[...pages].find(([url,body])=>name.length>=4&&identityPage(url)&&identityNorm(body).includes(name));
  const nameProof=draft.evidence.find(e=>e.field==='name'&&quoted(e)&&identityPage(e.url)&&identityNorm(e.quote).includes(name))||(observedName?{url:observedName[0],quote:canonical}:null);
  // Only official registration, not a model-provided number, can anchor a tax
  // ID from name-only research. Other pages may confirm a previously known ID.
  if(!knownTax&&nameProof&&officialCompanyPage(nameProof.url))knownTax=new URL(nameProof.url).pathname.match(/\d{8}/)[0];
  const links=identity.evidence.filter(e=>quoted(e)&&!registrationSource(e.url)&&!conflicts(pages.get(e.url)));
  if(identity.brandName&&identityNorm(identity.brandName)!==name){
    const brand=identityNorm(identity.brandName);
    const link=links.find(e=>{
      const quote=identityNorm(e.quote);
      if(!quote.includes(brand)||/不是|並非|并非|無關|不(?:隸屬|屬於|属于)|非.{0,80}(?:旗下|品牌|經營|營運|所屬)|假冒/.test(e.quote))return false;
      // Two names plus a generic word like "brand" in the same paragraph do
      // not prove a relationship. Require explicit adjacent relational text.
      const forward=new RegExp(name+'(?:旗下(?:的)?(?:品牌)?|品牌|經營(?:的)?(?:品牌)?|營運(?:的)?(?:品牌)?|更名|原名|所屬品牌|operates|owns)(?:為|是|包括|包含|叫做)?'+brand);
      const reverse=new RegExp(brand+'(?:(?:隸屬|所屬|屬於|(?:的)?(?:營運公司|經營公司|營運商|品牌所有人)(?:為|是)?)'+name+'|由'+name+'(?:經營|營運|提供)|(?:operatedby|ownedby|abrandof)'+name+')');
      return forward.test(quote)||reverse.test(quote)||knownTax&&pageTaxIds(e.quote).includes(knownTax);
    });
    if(link){aliases.add(brand);proofUrls.add(link.url);}
  }
  // A company name supplied by the user must match the anchored company, or a
  // proven brand. We never relax this to suffix stripping or fuzzy similarity.
  const anchored=Boolean(companyName||nameProof)&&Boolean(companyName||query===name||aliases.has(query));
  const modelName=identityNorm(draft.fields.name);
  const validModelName=Boolean(!modelName&&companyName||modelName===name||aliases.has(modelName));
  if(nameProof)proofUrls.add(nameProof.url);
  const names=[name,...aliases].filter(Boolean);
  const samePage=(body,url='')=>anchored&&validModelName&&!conflicts(body)&&(names.some(n=>(n.length>=4||n===name&&n.length>=2&&proofUrls.has(url))&&identityNorm(body).includes(n))||knownTax&&pageTaxIds(body).includes(knownTax));
  const sameTitle=title=>names.some(n=>n.length>=4&&identityNorm(title).includes(n));
  return {verified:anchored&&validModelName,name:companyName||draft.fields.name||canonical,samePage,sameTitle,proofUrls};
}
