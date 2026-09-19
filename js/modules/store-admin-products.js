// Admin-only editor. Server revalidates both actor and target; no owner UID is posted.
export async function mountAdminProducts(container,{shopId,api,isCurrent,onBack,prepareImage,uploadImage}){
  if(!isCurrent())return;
  const doc=container.ownerDocument;
  if(!doc.getElementById('admin-product-styles')){
    const css=doc.createElement('link');css.id='admin-product-styles';css.rel='stylesheet';
    css.href=new URL('../../css/store-admin-products.css?v=1',import.meta.url).href;doc.head.append(css);
  }
  const make=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const panel=make('section');panel.className='admin-product-editor';
  const active=()=>isCurrent()&&container.contains(panel);
  const back=make('button','← 返回店家列表');back.type='button';
  back.addEventListener('click',()=>{if(active())void onBack();});
  const title=make('h2','代上傳商品'),status=make('p','確認店家資格中…');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  panel.append(back,title,status);container.replaceChildren(panel);
  let report;
  try{
    report=await api('/admin/products?shop='+encodeURIComponent(shopId),null,true);
    if(!active())return;
    if(report?.success!==true||report.shop?.id!==shopId||!Number.isSafeInteger(report.shop.version)||!Array.isArray(report.products))throw new Error('店家回傳資料不完整');
  }catch(error){if(active())status.textContent=error.message||'無法確認店家，請返回列表重試';return;}
  const shop=report.shop,limited=shop.product_limit===1;
  title.textContent='代上傳商品｜'+shop.name;
  panel.append(make('p','負責人：'+(shop.owner_name||'未填姓名')+'。新商品歸此店家，店家之後可自行維護。'));
  panel.append(make('p','本次新增前商品 '+shop.product_count+' 件'+(limited?'／上限 1 件':'')+'。'+(shop.status==='draft'?'此店面仍為草稿，商品上架也不會自動公開店面。':'')));
  if(report.products.length){
    const recent=make('details'),summary=make('summary','最近新增／更新商品（最多 10 件）');recent.append(summary);
    for(const p of report.products)recent.append(make('p',p.title+' · NT$ '+(p.price_cents/100).toLocaleString('zh-TW')+' · '+(p.status==='active'?'已上架':'草稿')));
    panel.append(recent);
  }
  if(limited&&shop.product_count>=1){status.textContent='此店家已達商品件數上限，請由店家先整理原有商品。';return;}
  const form=make('form');form.setAttribute('data-admin-product-form','');
  const fields={};
  const field=(name,label,tag='input',options={})=>{
    const wrap=make('label',label),input=make(tag);input.name=name;input.setAttribute('name',name);
    Object.assign(input,options);wrap.append(input);form.append(wrap);fields[name]=input;return input;
  };
  const select=(name,label,values)=>{
    const input=field(name,label,'select');
    for(const [value,text]of values){const option=make('option',text);option.value=value;input.append(option);}
    input.value=values[0][0];return input;
  };
  field('title','商品名稱','input',{required:true,maxLength:100});
  field('description','商品介紹','textarea',{maxLength:3000,rows:4});
  field('price','售價（NT$）','input',{type:'number',min:'0',max:'1000000',step:'0.01',required:true,inputMode:'decimal'});
  select('category','業種分類',[['','請選擇分類'],...['食','宿','遊','購','行','服務','製造'].map(value=>[value,value])]).required=true;
  const picker=field('image_file','商品圖片（JPG／PNG／WebP，最大 10 MB）','input',{type:'file',accept:'image/jpeg,image/png,image/webp'});
  const preview=make('img');preview.alt='商品圖片預覽';preview.hidden=true;form.append(preview);
  form.append(make('p','圖片會上傳為公開素材；請勿上傳個資或無權使用的圖片。'));
  select('purchase_mode','銷售方式',limited?[['in_store','店內展示']]:[['in_store','店內購買'],['online','網路選購']]);
  if(!limited)form.append(make('p','網購沿用店家既有收款與運費設定；店家尚未完成設定或交易未開放時，上架不代表顧客可下單。'));
  select('redeem_type','折抵規則',limited?[['none','不折抵']]:[['none','不折抵'],['fixed','固定點數上限'],['percent','百分比上限'],['full','全額上限']]);
  const value=field('redeem_value','折抵上限（固定填點數／百分比填 1–100）','input',{type:'number',min:'0',max:'1000000',step:'1',value:'0'});
  value.disabled=true;
  fields.redeem_type.addEventListener('change',()=>{value.disabled=['none','full'].includes(fields.redeem_type.value);if(value.disabled)value.value='0';});
  select('status','建立後狀態',[['draft','先存草稿'],['active','立即上架']]);
  const confirm=field('confirm','我已確認資料與目標店家：'+shop.name,'input',{type:'checkbox',required:true});
  const save=make('button','確認新增商品');save.type='submit';save.className='primary';save.setAttribute('data-admin-save','');form.append(save);
  panel.append(form);
  status.textContent='請填寫資料；尚未建立商品。';
  let busy=false,imageUrl='',pending=null,complete=false;
  function lock(){
    for(const input of Object.values(fields))input.disabled=busy||!!pending||complete;
    if(!busy&&!pending&&!complete){value.disabled=['none','full'].includes(fields.redeem_type.value);if(limited){fields.purchase_mode.disabled=true;fields.redeem_type.disabled=true;}}
    save.disabled=busy||complete;save.textContent=pending&&!complete?'重試同一筆新增':'確認新增商品';
  }
  lock();
  picker.addEventListener('change',async event=>{
    event.stopPropagation();if(!active()||busy||pending||complete)return;
    const file=picker.files?.[0];if(!file)return;busy=true;lock();status.textContent='處理圖片中…';
    try{
      const data=await prepareImage(file);if(!active())return;
      status.textContent='上傳圖片中…';const result=await uploadImage(data);if(!active())return;
      if(!result?.success||!result.url)throw new Error(result?.error||'圖片上傳失敗');
      const url=new URL(result.url);if(url.protocol!=='https:'||url.username||url.password)throw new Error('圖片網址無效');
      imageUrl=url.href;preview.src=imageUrl;preview.hidden=false;status.textContent='圖片已上傳，請確認商品資料後新增。';
    }catch(error){if(active())status.textContent='圖片未更新：'+error.message;}
    finally{busy=false;picker.value='';if(active())lock();}
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();event.stopPropagation();if(!active()||busy||complete)return;
    if(!pending){
      const price=fields.price.value.trim();
      if(!confirm.checked||!fields.title.value.trim()||!fields.category.value||!/^\d+(?:\.\d{1,2})?$/.test(price)||Number(price)>1000000){status.textContent='請確認店家並完整填寫名稱、分類與有效售價。';return;}
      const type=fields.redeem_type.value,amount=['none','full'].includes(type)?0:Number(value.value);
      if(!Number.isSafeInteger(amount)||amount<0||amount>(type==='percent'?100:1000000)||(['fixed','percent'].includes(type)&&amount===0)){status.textContent='請填寫有效折抵上限。';return;}
      pending={shop_id:shopId,shop_version:shop.version,request_key:crypto.randomUUID(),
        title:fields.title.value.trim(),description:fields.description.value.trim(),price_cents:Math.round(Number(price)*100),
        category:fields.category.value,image_url:imageUrl,purchase_mode:fields.purchase_mode.value,redeem_type:type,redeem_value:amount,status:fields.status.value};
    }
    busy=true;lock();status.textContent='為「'+shop.name+'」建立商品中…';
    try{
      const result=await api('/admin/products',pending);if(!active())return;
      if(result?.success!==true||result.shop_id!==shopId||!result.product_id)throw new Error('尚未確認建立結果');
      complete=true;status.textContent='已為「'+shop.name+'」新增商品（'+(pending.status==='active'?'已上架':'草稿')+'）。'+(shop.status==='draft'?'店面尚未公開。':'')+' 可返回列表繼續新增。';
    }catch(error){if(active())status.textContent=(error.message||'無法確認建立結果')+'。為避免重複商品，重試會沿用同一筆資料；若需修改請先返回列表確認是否已建立。';}
    finally{busy=false;if(active()){lock();status.scrollIntoView?.({block:'center',behavior:'smooth'});}}
  });
}
