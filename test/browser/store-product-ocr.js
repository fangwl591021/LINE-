// Run only against the local synthetic store-commerce server. AI/upload are mocked.
async()=>{
 if(location.origin!=='http://127.0.0.1:8794')throw Error('Local test only');
 const until=async(fn)=>{for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(document.body.innerText);};
 const check=(v,m)=>{if(!v)throw Error(m);};
 const originalFetch=window.fetch,originalConfirm=window.confirm,originalUpload=window.fetchAPI;
 let saves=0,ocrCalls=0,uploads=0;
 try{
  window.confirm=()=>true;
  window.fetch=(url,options)=>{if(String(url).endsWith('/product')&&options?.method==='POST')saves++;if(String(url).endsWith('/product-ocr'))ocrCalls++;return originalFetch(url,options);};
  window.testToken='a';await openStoreShop();document.querySelector('[data-do=manage]').click();await until(()=>document.querySelector('[data-do=new]'));
  document.querySelector('[data-do=new]').click();
  let form=document.querySelector('[data-form=product]');form.elements.purchase_mode.value='online';
  const before=await originalFetch('/v1/store-shop/manage',{headers:{Authorization:'Bearer a'}}).then(r=>r.json());
  document.querySelector('[data-do=dm-import]').click();await until(()=>form.querySelector('.shop-dm-file'));
  const canvas=document.createElement('canvas');canvas.width=500;canvas.height=300;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,500,300);ctx.fillStyle='black';ctx.font='30px sans-serif';ctx.fillText('TEST TEA NT$ 350',30,100);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
  const attach=()=>{const transfer=new DataTransfer();transfer.items.add(new File([blob],'test-dm.jpg',{type:'image/jpeg'}));const input=form.querySelector('.shop-dm-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
  attach();await until(()=>form.querySelector('.shop-dm-panel [role=status]').textContent.includes('已辨識'));
  const panel=form.querySelector('.shop-dm-panel'),select=panel.querySelector('select'),apply=panel.querySelector('button.primary'),image=panel.querySelector('.shop-dm-use-image');
  check(select.options.length===2,'missing candidates');check(!image.checked,'DM public by default');
  check(form.elements.title.value===''&&saves===0,'OCR wrote a product');check(!panel.querySelector('img[src=x]'),'XSS');
  apply.click();await until(()=>form.elements.title.value==='合成測試茶葉');
  check(form.elements.price.value==='350'&&form.elements.category.value==='食','field extraction');
  check(form.elements.purchase_mode.value==='online'&&form.elements.status.value==='draft'&&form.elements.redeem_type.value==='none','AI changed sale policies');
  select.value='1';select.dispatchEvent(new Event('change'));apply.click();await until(()=>form.elements.title.value.includes('多規格'));
  check(form.elements.price.value===''&&!form.checkValidity(),'unknown price became zero');
  select.value='0';select.dispatchEvent(new Event('change'));image.checked=true;
  window.fetchAPI=async()=>{uploads++;return {success:false};};apply.click();
  await until(()=>panel.querySelector('[role=status]').textContent.includes('上傳失敗'));check(form.elements.price.value==='350'&&form.elements.title.value==='合成測試茶葉','failed image upload lost text draft');
  window.fetchAPI=async(action,payload)=>{uploads++;check(action==='uploadImageToR2'&&payload.base64Image.startsWith('data:image/jpeg;base64,'),'wrong DM upload');return {success:true,url:'https://127.0.0.1:8794/test-public-dm.jpg'};};
  apply.click();await until(()=>form.elements.image_url.value==='https://127.0.0.1:8794/test-public-dm.jpg');
  check(form.elements.image_url.value==='https://127.0.0.1:8794/test-public-dm.jpg','DM image not applied');
  const beforeSave=await originalFetch('/v1/store-shop/manage',{headers:{Authorization:'Bearer a'}}).then(r=>r.json());
  check(beforeSave.products.length===before.products.length&&saves===0,'product saved before confirmation');
  form.requestSubmit();await until(()=>!document.querySelector('[data-form=product]'));
  const after=await originalFetch('/v1/store-shop/manage',{headers:{Authorization:'Bearer a'}}).then(r=>r.json());
  check(after.products.length===before.products.length+1&&saves===1,'normal save not exactly once');
  check(after.products.find(p=>p.title==='合成測試茶葉').status==='draft','auto-published');
  check(document.documentElement.scrollWidth<=innerWidth,'mobile overflow');
  check(!JSON.stringify(localStorage).includes('test-dm'),'stored DM locally');
  // A late OCR response after account switch must not populate the existing form.
  document.querySelector('[data-do=new]').click();form=document.querySelector('[data-form=product]');document.querySelector('[data-do=dm-import]').click();await until(()=>form.querySelector('.shop-dm-file'));
  let release;
  window.fetch=(url,options)=>String(url).endsWith('/product-ocr')?new Promise(resolve=>release=()=>resolve(Response.json({success:true,products:[{title:'錯誤帳號商品',description:'',category:'食',price_cents:100,price_note:''}]}))):originalFetch(url,options);
  attach();await until(()=>release);window.testToken='c';release();await new Promise(r=>setTimeout(r,80));
  check(form.elements.title.value===''&&form.querySelector('.shop-dm-panel select').options.length===0,'late account response applied');
  return {width:innerWidth,ocrCalls,uploads,candidates:true,noAutoSave:true,fields:true,policyPreserved:true,unknownPriceRequired:true,uploadFailureSafe:true,optionalDmImage:true,explicitSaveOnce:true,noXss:true,noOverflow:true,lateAccountIgnored:true};
 }finally{window.fetch=originalFetch;window.confirm=originalConfirm;window.fetchAPI=originalUpload;window.testToken='a';}
}
