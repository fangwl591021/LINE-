// Local mocked responses only: checks UI behavior, not model accuracy.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local test only');
 const check=(v,m)=>{if(!v)throw Error(m);};
 const until=async(fn)=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timeout: '+document.body.innerText);};
 const originalFetch=window.fetch,originalConfirm=window.confirm,originalUpload=window.fetchAPI;
 const bundle={title:'漂浮檸檬茶 3盒組（買2送1）',description:'每盒5入，共3盒\n原價900元，特價600元\n限定限時優惠',category:'食',price_cents:60000,price_note:'每組3盒，整組售價600元'};
 let reply=bundle,release,delay=false,saves=0,uploads=0,confirmations=0;
 try{
  window.testToken='a';window.confirm=()=>{confirmations++;return false;};
  window.fetch=(url,options)=>{
   if(String(url).endsWith('/product-ocr')){
    const result=()=>Response.json({success:true,products:[reply]});
    return delay?new Promise(r=>release=()=>r(result())):Promise.resolve(result());
   }
   if(String(url).endsWith('/product')&&options?.method==='POST')saves++;
   return originalFetch(url,options);
  };
  await openStoreShop();document.querySelector('[data-do=manage]').click();await until(()=>document.querySelector('[data-do=new]'));document.querySelector('[data-do=new]').click();
  const form=document.querySelector('[data-form=product]'),f=form.elements;
  f.purchase_mode.value='online';f.redeem_type.value='none';
  document.querySelector('[data-do=dm-import]').click();await until(()=>form.querySelector('.shop-dm-file'));
  const canvas=document.createElement('canvas');canvas.width=400;canvas.height=200;
  const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,400,200);ctx.fillStyle='black';ctx.fillText('3 BOXES TWD600',10,30);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg'));
  const attach=()=>{const dt=new DataTransfer();dt.items.add(new File([blob],'bundle.jpg',{type:'image/jpeg'}));const input=form.querySelector('.shop-dm-file');input.files=dt.files;input.dispatchEvent(new Event('change'));};
  const panel=form.querySelector('.shop-dm-panel'),status=panel.querySelector('[role=status]'),apply=panel.querySelector('button.primary'),image=panel.querySelector('.shop-dm-use-image');
  attach();await until(()=>status.textContent.includes('已辨識 1 項並帶入'));
  check(f.title.value===bundle.title&&f.price.value==='600'&&f.category.value==='食'&&f.description.value.includes('共3盒'),'single bundle not filled');
  check(!panel.querySelector('details').open,'single result not compact');
  check(f.purchase_mode.value==='online'&&f.status.value==='draft'&&f.redeem_type.value==='none','policies changed');
  check(!image.checked&&uploads===0&&saves===0&&confirmations===0,'unexpected write/consent');
  f.title.value='手動修改';attach();await until(()=>status.textContent.includes('已保留原有手填內容'));
  check(f.title.value==='手動修改','OCR overwrote manual edit');apply.click();check(f.title.value==='手動修改'&&confirmations===1,'declined replacement ignored');
  window.confirm=()=>true;image.checked=true;image.dispatchEvent(new Event('change'));
  f.image_url.value='https://example.test/original.jpg';
  let uploadDone;window.fetchAPI=()=>{uploads++;return new Promise(r=>uploadDone=r);};
  apply.click();await until(()=>uploadDone);
  check(f.title.value===bundle.title&&f.price.value==='600','text waits for upload');
  uploadDone({success:false});await until(()=>status.textContent.includes('圖片尚未更新'));
  check(f.image_url.value==='https://example.test/original.jpg'&&f.price.value==='600'&&!f.title.disabled,'upload failure erased draft/image');
  // Unknown prices stay required; automatically filled fields are not guessed.
  for(const key of ['title','description','price','category'])f[key].value='';
  reply={...bundle,price_cents:null,price_note:'無明確價格'};
  attach();await until(()=>status.textContent.includes('售價尚不明確'));
  check(f.price.value===''&&!f.price.checkValidity(),'unknown price became zero');
  // An edit made while awaiting OCR must survive a late response.
  for(const key of ['title','description','price','category'])f[key].value='';
  delay=true;attach();await until(()=>release);f.title.value='辨識中手填';release();await until(()=>status.textContent.includes('已保留原有手填內容'));
  check(f.title.value==='辨識中手填','mid-flight edit overwritten');
  check(saves===0&&uploads===1,'unexpected auto write');
  check(document.documentElement.scrollWidth<=innerWidth,'horizontal overflow');
  return {width:innerWidth,singleAutoFill:true,bundlePrice:600,manualEditsPreserved:true,uploadDoesNotBlockText:true,uploadFailurePreservesOriginalImage:true,unknownPriceRequired:true,noAutoSave:true,noAutoPublicUpload:true,noOverflow:true};
 }finally{window.fetch=originalFetch;window.confirm=originalConfirm;window.fetchAPI=originalUpload;}
}
