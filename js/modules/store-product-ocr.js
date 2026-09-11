// Lazy DM assistant. OCR only proposes fields; the ordinary Save button creates products.
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export function openProductDm(form,{base,prepareImage,isCurrent}){
  if(form.querySelector('.shop-dm-panel')){form.querySelector('.shop-dm-file').click();return;}
  const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
  if(!token)throw Error('請先登入店家帳號');
  const panel=el('section');panel.className='shop-dm-panel shop-box';
  const current=()=>form.isConnected&&panel.isConnected&&isCurrent()&&window.liff?.getAccessToken?.()===token;
  let serial=0,busy=false,controller,dmImage='',candidates=[],applied=null;
  const keys=['title','description','price','category'];
  const values=()=>keys.map(key=>form.elements[key].value);
  const untouched=()=>applied&&applied.product===candidates[Number(select.value)]&&JSON.stringify(values())===applied.values;
  function fill(p){
    form.elements.title.value=p.title;form.elements.description.value=p.description;
    form.elements.price.value=p.price_cents===null?'':String(p.price_cents/100);
    form.elements.category.value=p.category;applied={product:p,values:JSON.stringify(values())};
  }
  const title=el('h3','上傳 DM，AI 辨識建商品');
  const note=el('p','圖片會送交 AI 服務辨識，最多列出 8 項供逐項選用；不會自動建立商品。僅支援 JPG／PNG／WebP（10MB 內），PDF 請先轉成圖片。');
  const picker=el('input');picker.type='file';picker.accept='image/jpeg,image/png,image/webp';picker.hidden=true;picker.className='shop-dm-file';
  const choose=el('button','選擇／重新上傳 DM');choose.type='button';
  const close=el('button','關閉辨識');close.type='button';
  const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const preview=el('img');preview.alt='本次 DM 預覽';preview.hidden=true;preview.style.maxHeight='240px';preview.style.objectFit='contain';
  const result=el('div');result.hidden=true;
  const source=el('details'),summary=el('summary','檢視 DM 與辨識說明');source.append(summary,preview);
  const label=el('label','選擇要帶入的商品');const select=el('select');select.setAttribute('aria-label','DM 辨識商品');label.append(select);
  const details=el('p'),warning=el('p');
  const imageLabel=el('label'),useImage=el('input');useImage.type='checkbox';useImage.className='shop-dm-use-image';
  imageLabel.append(useImage,document.createTextNode(' 同時將 DM 上傳為商品圖片（圖片網址可公開存取）'));
  const apply=el('button','帶入商品表單');apply.type='button';apply.className='primary';
  source.append(details,warning);
  result.append(label,source,imageLabel,apply);
  panel.append(title,note,choose,close,picker,status,result);
  form.querySelector('h2').after(panel);
  function showCandidate(){
    const p=candidates[Number(select.value)];if(!p)return;
    details.textContent=p.description;
    warning.textContent=(p.price_cents===null?'售價未確認，帶入後請手動填寫。':'售價 NT$ '+(p.price_cents/100).toLocaleString('zh-TW')+'。')+' '+p.price_note+'；AI 辨識可能有誤，請核對後儲存。';
  }
  choose.onclick=()=>{if(!busy&&current())picker.click();};
  close.onclick=()=>{serial++;controller?.abort();dmImage='';candidates=[];panel.remove();};
  select.onchange=()=>{showCandidate();source.open=true;apply.textContent='帶入商品表單';};
  useImage.onchange=()=>{apply.textContent=useImage.checked&&untouched()?'上傳 DM 圖片':'帶入商品表單';};
  picker.onchange=async()=>{
    const file=picker.files?.[0];picker.value='';if(!file||busy||!current())return;
    const id=++serial;busy=true;choose.disabled=true;result.hidden=true;candidates=[];dmImage='';preview.hidden=true;
    status.textContent='正在處理 DM 圖片…';controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),55000);
    try{
      const image=await prepareImage(file);if(!current()||id!==serial)return;
      dmImage=image;preview.src=image;preview.hidden=false;status.textContent='AI 辨識中…尚未建立商品，可以關閉取消。';
      const response=await fetch(base+'/v1/store-shop/product-ocr',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({base64Image:image}),signal:controller.signal});
      const data=await response.json();if(!current()||id!==serial)return;
      if(!response.ok||!data.success)throw Error(data.error||'DM 辨識失敗，請重試');
      if(!Array.isArray(data.products)||!data.products.length||data.products.length>8)throw Error('沒有可用的辨識商品');
      candidates=data.products;select.replaceChildren();
      candidates.forEach((p,i)=>{const option=el('option',p.title);option.value=String(i);select.append(option);});
      select.value='0';showCandidate();result.hidden=false;source.open=true;
      if(candidates.length===1&&!values().some(Boolean)){
        fill(candidates[0]);source.open=false;
        apply.textContent=useImage.checked?'上傳 DM 圖片':'查看已帶入欄位';
        status.textContent='已辨識 1 項並帶入下方表單，尚未儲存。'+(candidates[0].price_cents===null?'售價尚不明確，請手動填寫。':'請核對名稱、組合規格與售價。')+'圖片需勾選並按鈕上傳。';
      }else{
        apply.textContent='帶入商品表單';
        status.textContent='已辨識 '+candidates.length+' 項，請選擇並帶入表單。'+(values().some(Boolean)?'已保留原有手填內容。':'')+'多於 8 項請分張辨識。';
      }
    }catch(error){if(current()&&id===serial){dmImage='';status.textContent=error.name==='AbortError'?'辨識已取消或逾時，請重新選擇 DM；原商品表單未更動。':error.message;}}
    finally{clearTimeout(timer);if(id===serial){busy=false;choose.disabled=false;}}
  };
  apply.onclick=async()=>{
    if(busy||!current())return;
    const p=candidates[Number(select.value)];if(!p)return;
    const fields=form.elements;
    if(!untouched()&&values().some(Boolean)&&!window.confirm('將以辨識結果替換商品名稱、說明、價格與分類。銷售方式、折抵規則及上架狀態保持不變。是否帶入？'))return;
    // Text is a local draft and must not depend on optional public image upload.
    fill(p);source.open=false;
    const id=serial,controls=[...form.querySelectorAll('button,input,select,textarea')],disabled=controls.map(c=>c.disabled);
    busy=true;controls.forEach(c=>c.disabled=true);
    try{
      let imageUrl='';
      if(useImage.checked){
        status.textContent='正在上傳公開商品圖片…';
        if(typeof window.fetchAPI!=='function')throw Error('圖片上傳服務尚未就緒；可取消勾選後先帶入文字');
        // Recheck the live store role before the existing image upload service.
        const check=await fetch(base+'/v1/store-shop/manage',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
        if(!check.ok)throw Error('店家登入已失效，請重新登入');
        if(!current()||id!==serial)return;
        const uploaded=await window.fetchAPI('uploadImageToR2',{base64Image:dmImage},true);
        if(!uploaded?.success||!uploaded.url)throw Error('DM 圖片上傳失敗，請重試或改用「上傳圖片」');
        const url=new URL(uploaded.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('圖片網址無效');
        imageUrl=url.href;
      }
      if(!current()||id!==serial)return;
      if(imageUrl){
        fields.image_url.value=imageUrl;
        const imageHost=form.querySelector('.shop-upload-preview');
        if(imageHost){const image=el('img');image.src=imageUrl;image.alt='商品 DM';image.referrerPolicy='no-referrer';imageHost.replaceChildren(image);}
      }
      status.textContent='已帶入，尚未建立商品。請核對價格、銷售方式與圖片，最後按「儲存商品」。';
    }catch(error){if(current()&&id===serial)status.textContent='商品文字已帶入並保留，圖片尚未更新。'+error.message;}
    finally{busy=false;controls.forEach((c,i)=>c.disabled=disabled[i]);}
    if(current()&&id===serial)fields.title.focus();
  };
  picker.click();
}
