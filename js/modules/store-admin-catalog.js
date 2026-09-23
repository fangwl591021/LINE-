// One editor used by the mobile mall and standalone admin. No token/storage globals.
export async function mountAdminCatalog(container,{shopId,api,isCurrent,onBack,onUploadProducts,initialMode='products',prepareImage,uploadImage}){
  if(!isCurrent())return;
  const doc=container.ownerDocument;
  if(!doc.getElementById('store-admin-catalog-css')){
    const link=doc.createElement('link');link.id='store-admin-catalog-css';link.rel='stylesheet';
    link.href=new URL('../../css/store-admin-catalog.css?v=1',import.meta.url).href;doc.head.append(link);
  }
  const make=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const panel=make('section');panel.className='mall-catalog';container.replaceChildren(panel);
  const active=()=>isCurrent()&&container.contains(panel);
  const bar=make('nav'),back=make('button','← 返回店家列表'),refresh=make('button','重新載入'),add=make('button','新增商品／優惠');
  for(const button of [back,refresh,add])button.type='button';bar.append(back,refresh,add);
  const title=make('h2','商城管理'),message=make('p','讀取中…');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const note=make('p','與手機商城共用資料。草稿待確認不代表已送審；此處不變更會員權限、點數規則或收款設定。');
  const tabs=make('nav'),store=make('button','店家資料'),products=make('button','商品／優惠'),drafts=make('button','草稿待確認');
  for(const button of [store,products,drafts])button.type='button';tabs.append(store,products,drafts);
  const body=make('div');panel.append(bar,title,note,tabs,message,body);
  let epoch=0,shop=null,mode=initialMode==='draft'?'draft':'products',cursor='',next='',busy=false,dirty=false;
  const lockNavigation=()=>{for(const button of [back,refresh,add,store,products,drafts])button.disabled=busy;};
  const ask=text=>doc.defaultView.confirm(text);
  const safeLeave=()=>!dirty||ask('尚有未儲存或待確認的資料，確定離開？');
  async function navigate(callback,...args){
    if(!active()||busy||!safeLeave())return;
    ++epoch;
    try{await callback(...args);}catch(error){if(active())message.textContent=(error.message||'頁面載入失敗')+'，請重試。';}
  }
  back.onclick=()=>{void navigate(onBack);};
  add.onclick=()=>{if(shop)void navigate(onUploadProducts,shop.id);};
  refresh.onclick=()=>{if(active()&&!busy&&safeLeave())void load();};
  store.onclick=()=>{if(active()&&!busy&&safeLeave()){mode='store';void load();}};
  products.onclick=()=>{if(active()&&!busy&&safeLeave()){mode='products';void load();}};
  drafts.onclick=()=>{if(active()&&!busy&&safeLeave()){mode='draft';void load();}};
  const statusName=value=>({draft:'草稿／未公開',active:'已上架',archived:'已封存'}[value]||value);
  function editor(type,record){
    dirty=false;body.replaceChildren();
    const form=make('form'),fields={},heading=make('h3',type==='store'?'店家資料':'編輯商品／優惠');form.append(heading);
    const label=(key,text,tag='input',options={})=>{
      const wrapper=make('label',text),input=make(tag);input.name=key;Object.assign(input,options);
      input.value=record[key]??'';wrapper.append(input);form.append(wrapper);fields[key]=input;return input;
    };
    label(type==='store'?'name':'title',type==='store'?'店家名稱':'商品／優惠名稱','input',{required:true,maxLength:type==='store'?80:100});
    label('description','介紹','textarea',{maxLength:type==='store'?2000:3000,rows:4});
    const category=label('category','業種分類','select');
    for(const value of [...new Set(['','食','宿','遊','購','行','服務','製造',record.category||''])]){
      const option=make('option',value||'未分類');option.value=value;category.append(option);
    }category.value=record.category||'';
    const imageUrl=label('image_url','圖片網址（HTTPS，僅使用有權公開的素材）','input',{type:'url',maxLength:2048});
    const preview=make('img');preview.className='mall-catalog-preview';preview.alt='商城圖片預覽';preview.referrerPolicy='no-referrer';preview.hidden=true;form.append(preview);
    const validImage=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
    const showPreview=()=>{const url=validImage(imageUrl.value.trim());preview.hidden=!url;if(url)preview.src=url;else preview.removeAttribute('src');};
    preview.onerror=()=>{preview.hidden=true;};imageUrl.addEventListener('input',showPreview);showPreview();
    let imageFile=null;
    if(prepareImage&&uploadImage){
      const wrapper=make('label','直接上傳圖片（建議 800 × 533，JPG／PNG／WebP，10MB 以下）');
      imageFile=make('input');imageFile.type='file';imageFile.name='image_file';imageFile.accept='image/jpeg,image/png,image/webp';wrapper.append(imageFile);form.append(wrapper);
      form.append(make('p','上傳後請按「確認儲存」才會更新商城；取消不會替換原有圖片。'));
      imageFile.onchange=async()=>{
        const file=imageFile.files?.[0];if(!file||!active()||busy||pending||finished)return;
        const requestEpoch=epoch,stillHere=()=>active()&&requestEpoch===epoch&&body.contains(form);
        busy=true;lock();message.textContent='圖片處理及上傳中…';
        try{
          const base64Image=await prepareImage(file);if(!stillHere())return;
          const result=await uploadImage(base64Image);if(!stillHere())return;
          const url=validImage(result?.url||result?.imageUrl||'');
          if(result?.success!==true||!url)throw new Error('未取得有效圖片網址');
          imageUrl.value=url;dirty=true;showPreview();message.textContent='圖片已上傳，請確認預覽後按「確認儲存」。';
        }catch(error){if(stillHere())message.textContent=(error.message||'圖片上傳失敗')+'，原圖片未變更。';}
        finally{busy=false;if(stillHere()){imageFile.value='';lock();}}
      };
    }
    if(type==='store'){
      label('address','地址','input',{maxLength:200});label('phone','電話','input',{maxLength:40});label('hours','營業時間','input',{maxLength:200});
    }else{
      const price=label('price','售價（NT$）','input',{type:'number',min:'0',max:'1000000',step:'0.01',required:true,inputMode:'decimal'});price.value=String(record.price_cents/100);
      form.append(make('p','原銷售方式及折抵政策保持不變；不修改既有訂單或發放點數。'));
    }
    const status=label('status','公開狀態','select');
    for(const value of type==='store'?['draft','active']:['draft','active','archived']){const option=make('option',statusName(value));option.value=value;status.append(option);}status.value=record.status;
    const save=make('button','確認儲存'),cancel=make('button','取消／返回商品列表');save.type='submit';cancel.type='button';
    cancel.onclick=()=>{if(active()&&!busy&&safeLeave()){mode='products';void load();}};form.append(save,cancel);body.append(form);
    let pending=null,finished=false;
    form.oninput=()=>{dirty=true;};
    const lock=()=>{lockNavigation();for(const input of Object.values(fields))input.disabled=busy||!!pending||finished;if(imageFile)imageFile.disabled=busy||!!pending||finished;cancel.disabled=busy;save.disabled=busy||finished;save.textContent=pending&&!finished?'重新確認同一筆儲存':'確認儲存';};
    form.onsubmit=async event=>{
      event.preventDefault();event.stopPropagation();if(!active()||busy||finished)return;
      if(!pending){
        const changes=Object.fromEntries(Object.entries(fields).filter(([key])=>key!=='price').map(([key,input])=>[key,input.value.trim()]));
        if(type==='product'){
          if(!/^\d+(?:\.\d{1,2})?$/.test(fields.price.value)||Number(fields.price.value)>1000000){message.textContent='請填寫有效售價';return;}
          changes.price_cents=Math.round(Number(fields.price.value)*100);
        }
        if(!ask(`確定儲存「${record.name||record.title}」？狀態：${statusName(changes.status)}。將同步影響手機商城顯示。`))return;
        pending={type,id:record.id,shop_id:shop.id,version:record.version,shop_version:shop.version,request_key:crypto.randomUUID(),changes};dirty=true;
      }
      const requestEpoch=epoch;busy=true;lock();message.textContent='儲存中…';
      try{
        const result=await api('/admin/catalog',pending);
        if(!active()||requestEpoch!==epoch)return;
        if(result?.success!==true||result.id!==record.id)throw new Error('未確認儲存結果');
        finished=true;dirty=false;message.textContent='已儲存；手機商城重新載入即使用更新資料。請重新載入後繼續編輯。';
      }catch(error){if(active()&&requestEpoch===epoch)message.textContent=(error.message||'儲存失敗')+'。可重新確認同一筆儲存；若版本衝突請重新載入。';}
      finally{busy=false;if(active()&&requestEpoch===epoch)lock();}
    };
  }
  async function load(after=''){
    if(!active()||busy)return;
    const sequence=++epoch;dirty=false;body.replaceChildren();message.textContent='讀取商城資料中…';add.disabled=true;
    try{
      const params=new URLSearchParams({shop:shopId});if(after)params.set('after',after);if(mode==='draft')params.set('status','draft');
      const result=await api('/admin/catalog?'+params,null,true);
      if(!active()||sequence!==epoch)return;
      if(!result?.success||result.shop?.id!==shopId||!Array.isArray(result.products))throw new Error('商城回傳格式不正確');
      shop=result.shop;cursor=after;next=result.next||'';title.textContent=shop.name+'｜商城管理';add.disabled=false;
      for(const [button,key]of [[store,'store'],[products,'products'],[drafts,'draft']])button.setAttribute('aria-pressed',String(mode===key));
      message.textContent=`店面：${statusName(shop.status)} · 商品 ${result.summary.total} 件 · 草稿 ${result.summary.draft} 件。`;
      if(mode==='store'){editor('store',shop);return;}
      if(!result.products.length)body.append(make('p',mode==='draft'?'目前沒有待確認的商品草稿。':'目前沒有商品。'));
      for(const product of result.products){
        const row=make('article'),name=make('h3',product.title),detail=make('p',`NT$ ${(product.price_cents/100).toLocaleString('zh-TW')} · ${statusName(product.status)} · ${product.category||'未分類'}`);
        row.append(name,detail);
        if(product.status!=='archived'){
          const edit=make('button','編輯／上下架');edit.type='button';edit.onclick=()=>{if(active()&&!busy)editor('product',product);};row.append(edit);
        }else row.append(make('p','封存保留歷史，不可在此恢復。'));
        body.append(row);
      }
      const pager=make('nav'),first=make('button','回第一頁'),more=make('button','下一頁');first.type=more.type='button';first.disabled=!cursor;more.disabled=!next;
      first.onclick=()=>void load();more.onclick=()=>void load(next);pager.append(first,more);body.append(pager);
    }catch(error){if(active()&&sequence===epoch)message.textContent=(error.message||'商城讀取失敗')+'，請按重新載入。';}
  }
  await load();
}

// Read-only cross-shop queue; publication still goes through the shared versioned editor.
export async function mountAdminDrafts(container,{api,isCurrent,onBack,onManageCatalog}){
  if(!isCurrent())return;
  const doc=container.ownerDocument,make=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  if(!doc.getElementById('store-admin-catalog-css')){
    const link=make('link');link.id='store-admin-catalog-css';link.rel='stylesheet';link.href=new URL('../../css/store-admin-catalog.css?v=1',import.meta.url).href;doc.head.append(link);
  }
  const panel=make('section');panel.className='mall-catalog';container.replaceChildren(panel);
  const active=()=>isCurrent()&&container.contains(panel),bar=make('nav'),back=make('button','← 返回店家列表'),refresh=make('button','重新載入');
  back.type=refresh.type='button';bar.append(back,refresh);
  const message=make('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const body=make('div');panel.append(bar,make('h2','全站商品草稿'),make('p','集中查看既有商品草稿；進入店家確認內容後才決定是否上架，不會自動送審或發布。'),message,body);
  let epoch=0;
  async function navigate(callback,...args){if(!active())return;++epoch;try{await callback(...args);}catch(error){if(active())message.textContent=(error.message||'載入失敗')+'，請重試。';}}
  back.onclick=()=>void navigate(onBack);refresh.onclick=()=>void load();
  async function load(after=''){
    if(!active())return;
    const sequence=++epoch;body.replaceChildren();message.textContent='讀取全站草稿中…';
    try{
      const result=await api('/admin/catalog?queue=draft'+(after?'&after='+encodeURIComponent(after):''),null,true);
      if(!active()||sequence!==epoch)return;
      if(result?.success!==true||!Array.isArray(result.products))throw new Error('草稿回傳格式不正確');
      message.textContent=result.products.length?`本頁 ${result.products.length} 件草稿。`:'目前沒有待確認的商品草稿。';
      for(const product of result.products){
        const row=make('article'),edit=make('button','進入店家草稿');edit.type='button';
        row.append(make('h3',product.title),make('p',`${product.shop_name} · NT$ ${(product.price_cents/100).toLocaleString('zh-TW')} · ${product.category||'未分類'}`),edit);
        edit.onclick=()=>void navigate(onManageCatalog,product.shop_id);body.append(row);
      }
      const pager=make('nav'),first=make('button','回第一頁'),more=make('button','下一頁');first.type=more.type='button';first.disabled=!after;more.disabled=!result.next;
      first.onclick=()=>void load();more.onclick=()=>void load(result.next);pager.append(first,more);body.append(pager);
    }catch(error){if(active()&&sequence===epoch)message.textContent=(error.message||'讀取失敗')+'，請按重新載入。';}
  }
  await load();
}
