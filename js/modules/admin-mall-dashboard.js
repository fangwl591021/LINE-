// Standalone admin bridge: uses the same authenticated catalog modules as mobile.
async function loadAdminMall(){
  const container=document.getElementById('admin-mall-content'),tab=document.getElementById('tab-mall');
  if(!container||!tab)return;
  container.textContent='載入商城管理中…';
  const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
  if(adminRole!=='admin'||!token){container.textContent='請使用管理員 LINE 帳號登入後管理商城。';return;}
  const stamp=String(Number(container.dataset.epoch||0)+1);container.dataset.epoch=stamp;
  const current=()=>container.dataset.epoch===stamp&&!tab.classList.contains('hidden')&&adminRole==='admin'&&window.liff?.isLoggedIn?.()&&window.liff.getAccessToken()===token;
  const api=async(path,data)=>{
    if(!current())throw new Error('頁面或登入已變更，請重新進入商城管理');
    const headers={Authorization:'Bearer '+token};if(data)headers['Content-Type']='application/json';
    const response=await fetch(WORKER_URL.replace(/\/+$/,'')+'/v1/store-shop'+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(15000)});
    const result=await response.json();
    if(!current())throw new Error('登入已變更');
    if(!response.ok||result?.success!==true)throw new Error(result?.error||'商城服務暫時無法使用');
    return result;
  };
  async function directory(){
    const module=await import('./store-admin.js?v=4');if(!current())return;
    await module.mountStoreAdmin(container,{api,isCurrent:current,onBack:()=>switchTab('partners'),onManagePartners:()=>switchTab('partners'),
      onUploadProducts:upload,onManageCatalog:catalog,onReviewDrafts:drafts,onView:id=>{
        if(!current())return;
        const url=new URL('store-shop.html',location.href);url.searchParams.set('shop',id);
        window.open(url.href,'_blank','noopener,noreferrer');
      }});
  }
  async function drafts(){
    const module=await import('./store-admin-catalog.js?v=1');if(!current())return;
    await module.mountAdminDrafts(container,{api,isCurrent:current,onBack:directory,onManageCatalog:id=>catalog(id,'draft')});
  }
  async function catalog(shopId,initialMode='products'){
    const module=await import('./store-admin-catalog.js?v=1');if(!current())return;
    await module.mountAdminCatalog(container,{shopId,initialMode,api,isCurrent:current,onBack:directory,onUploadProducts:upload,prepareImage:prepareAdminMallImage,
      uploadImage:async base64Image=>{
        await api('/admin/catalog?shop='+encodeURIComponent(shopId));
        if(!current())throw new Error('登入已變更');
        return fetchAPI('uploadImageToR2',{base64Image});
      }});
  }
  async function upload(shopId){
    const module=await import('./store-admin-products.js?v=1');if(!current())return;
    await module.mountAdminProducts(container,{shopId,api,isCurrent:current,onBack:()=>catalog(shopId),prepareImage:prepareAdminMallImage,
      uploadImage:async base64Image=>{
        await api('/admin/products?shop='+encodeURIComponent(shopId));
        if(!current())throw new Error('登入已變更');
        return fetchAPI('uploadImageToR2',{base64Image});
      }});
  }
  try{await directory();}catch(error){if(current())container.textContent=(error.message||'商城載入失敗')+'，請重新點選商城管理。';}
}
async function prepareAdminMallImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw new Error('請選擇 10MB 以下的 JPG、PNG 或 WebP');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('圖片無法讀取'));image.src=url;});
    const width=image.naturalWidth,height=image.naturalHeight;
    if(!width||!height||width*height>40000000)throw new Error('圖片尺寸過大');
    const scale=Math.min(1,1600/Math.max(width,height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
    const context=canvas.getContext('2d');if(!context)throw new Error('無法處理圖片');
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',.9);
    if(!result.startsWith('data:image/jpeg;base64,')||result.length>Math.ceil(4*1024*1024*4/3)+32)throw new Error('圖片過大，請縮小後重試');
    return result;
  }finally{URL.revokeObjectURL(url);}
}
