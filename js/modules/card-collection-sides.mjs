// Pure helpers: keep existing records/identity/config intact when adding a back.
export function cardConfig(card) {
  const value=card?.['自訂名片設定']||card?.customConfig||card?.custom_config||{};
  try {const parsed=typeof value==='string'?JSON.parse(value):value;return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};}catch{return {};}
}
export function imageUrl(value) {
  try {const u=new URL(String(value||''));return ['https:','http:'].includes(u.protocol)?u.href:'';}catch{return '';}
}
export function collectionImages(card) {
  const cfg=cardConfig(card);
  return {front:imageUrl(cfg.collectionImages?.front||card?.['名片圖檔']||card?.image_url||cfg.imgUrlLandscape||cfg.imgUrl),back:imageUrl(cfg.collectionImages?.back)};
}
export function mergeReviewedFields(existing, recognized) {
  const result={...recognized},conflicts=[];
  for(const [key,value] of Object.entries(existing||{})) {
    if(value===undefined||value===null||String(value).trim()==='')continue;
    const next=String(recognized?.[key]||'').trim(),old=String(value).trim();
    result[key]=value;
    if(next&&next!==old){
      if(key==='服務項目'||key==='社群其他')result[key]=old.includes(next)?old:old+'\n'+next;
      else conflicts.push(key);
    }
  }
  return {fields:result,conflicts};
}
export function withCollectionImages(config, front, back) {
  const cfg={...config};
  cfg.collectionImages={...cfg.collectionImages,front:imageUrl(front||cfg.collectionImages?.front),back:imageUrl(back||cfg.collectionImages?.back)};
  return cfg;
}
