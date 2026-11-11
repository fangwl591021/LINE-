// One editor used by the mobile mall and standalone admin. No token/storage globals.
const reviewFields={name:'店家名稱',title:'商品名稱',description:'介紹',category:'分類',summary:'摘要',website:'網站',line:'LINE',branch:'分店',policy_note:'政策說明',parent_name:'店家名稱',parent_description:'店家介紹',image:'圖片'};
const reviewCategories={adult_industry:'八大／陪侍行業',fraud:'不實宣稱／詐騙疑義',tobacco_alcohol:'菸酒／電子菸',medical:'醫療用品／藥品／醫材',crime:'犯罪交易',sexual:'色情／性交易',gambling:'賭博',other:'其他待核對內容'};
function appendListingReview(host,record,make){
  const review=record?.listing_review;
  if(!review||!['reject','manual'].includes(review.decision)||!Array.isArray(review.issues)||!review.issues.length)return false;
  const box=make('section');box.className='mall-catalog-review';box.setAttribute('aria-label','上架審核疑義');
  box.append(make('p',review.decision==='manual'?'最近審核待核對；該次變更未公開':'最近審核未通過；該次變更未公開'));
  for(const issue of review.issues.slice(0,6)){
    const item=make('p');item.append(make('strong',(reviewFields[issue.field]||'展示內容')+'｜'+(reviewCategories[issue.category]||'待核對')+'：'+String(issue.reason||'')));
    if(issue.evidence)item.append(make('span','原文／圖片說明：'+String(issue.evidence)));
    box.append(item);
  }
  host.append(box);return true;
}
export async function mountAdminCatalog(container,{shopId,api,isCurrent,onBack,onUploadProducts,initialMode='products',prepareImage,uploadImage}){
  if(!isCurrent())return;
  const doc=container.ownerDocument;
  if(!doc.getElementById('store-admin-catalog-css')){
    const link=doc.createElement('link');link.id='store-admin-catalog-css';link.rel='stylesheet';
    link.href=new URL('../../css/store-admin-catalog.css?v=3',import.meta.url).href;doc.head.append(link);
  }
  const make=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const panel=make('section');panel.className='mall-catalog';container.replaceChildren(panel);
  const active=()=>isCurrent()&&container.contains(panel);
  const bar=make('nav'),back=make('button','← 返回店家列表'),refresh=make('button','重新載入'),add=make('button','新增商品／優惠');
  for(const button of [back,refresh,add])button.type='button';bar.append(back,refresh,add);
  const title=make('h2','商城管理'),message=make('p','讀取中…');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const note=make('p','與手機商城共用資料，可設定商品折抵方式與上限。草稿待確認不代表已送審；此處不變更會員權限、點數帳本、既有交易或收款設定。');
  const tabs=make('nav'),store=make('button','店家資料'),products=make('button','商品／優惠'),drafts=make('button','草稿待確認');
  for(const button of [store,products,drafts])button.type='button';tabs.append(store,products,drafts);
  const confirmationHost=make('div'),body=make('div');panel.append(bar,title,note,tabs,message,confirmationHost,body);
  let epoch=0,shop=null,onlineAllowed=false,cooperationPlan=null,mode=initialMode==='draft'?'draft':'products',cursor='',next='',busy=false,dirty=false,confirming=false,lockEditor=()=>{},catalogActions=[];
  const failures=new Map();
  const setMessage=(text,failed=false)=>{message.textContent=text;message.classList.toggle('mall-catalog-error',failed);};
  const lockNavigation=()=>{for(const button of [back,refresh,add,store,products,drafts])button.disabled=busy||confirming;for(const [button,enabled]of catalogActions)button.disabled=busy||confirming||!enabled;};
  const ask=(text,yes='確認送出',no='返回修改')=>{
    if(confirming||!active())return Promise.resolve(false);
    confirming=true;lockNavigation();lockEditor();
    return new Promise(resolve=>{
      const box=make('section');box.className='mall-catalog-confirm';box.setAttribute('role','dialog');box.setAttribute('aria-label','請確認商城操作');
      const confirm=make('button',yes),cancel=make('button',no);confirm.type=cancel.type='button';
      const finish=result=>{box.remove();confirming=false;lockNavigation();lockEditor();resolve(result&&active());};
      confirm.onclick=()=>finish(true);cancel.onclick=()=>finish(false);box.append(make('p',text),confirm,cancel);confirmationHost.replaceChildren(box);confirm.focus();
    });
  };
  const safeLeave=async()=>!dirty||await ask('尚有未儲存或待確認的資料。確認離開將放棄表單修改；已送出但結果不明的儲存，請先重新確認同一筆儲存。','確認離開','繼續編輯');
  async function navigate(callback,...args){
    if(!active()||busy||confirming||!await safeLeave())return;
    ++epoch;
    try{await callback(...args);}catch(error){if(active())setMessage((error.message||'頁面載入失敗')+'，請重試。',true);}
  }
  back.onclick=()=>{void navigate(onBack);};
  add.onclick=()=>{if(shop)void navigate(onUploadProducts,shop.id);};
  refresh.onclick=async()=>{if(active()&&!busy&&!confirming&&await safeLeave())void load();};
  store.onclick=async()=>{if(active()&&!busy&&!confirming&&await safeLeave()){mode='store';void load();}};
  products.onclick=async()=>{if(active()&&!busy&&!confirming&&await safeLeave()){mode='products';void load();}};
  drafts.onclick=async()=>{if(active()&&!busy&&!confirming&&await safeLeave()){mode='draft';void load();}};
  const statusName=value=>({draft:'草稿／未公開',active:'已上架',archived:'已封存'}[value]||value);
  function editor(type,record){
    dirty=false;body.replaceChildren();
    const form=make('form'),fields={},heading=make('h3',type==='store'?'店家資料':'編輯商品／優惠'),reviewHost=make('div');reviewHost.className='mall-catalog-review-host';form.append(heading,reviewHost);
    appendListingReview(reviewHost,record,make);
    form.append(make('p','公開／上架修改需經 AI 審核文案與圖片；疑似、違反政策或審核未完成不公開。可修改重送或明確選擇草稿。'));
    const label=(key,text,tag='input',options={})=>{
      const wrapper=make('label',text),input=make(tag);input.name=key;Object.assign(input,options);
      input.value=record[key]??'';wrapper.append(input);form.append(wrapper);fields[key]=input;return input;
    };
    label(type==='store'?'name':'title',type==='store'?'店家名稱':'商品／優惠名稱','input',{required:true,maxLength:type==='store'?80:100});
    label('description','介紹','textarea',{maxLength:type==='store'?2000:3000,rows:type==='store'?4:10});
    const category=label('category','業種分類','select');
    for(const value of [...new Set(['','食','宿','遊','購','行','服務','製造',record.category||''])]){
      const option=make('option',value||'未分類');option.value=value;category.append(option);
    }category.value=record.category||'';
    const imageUrl=label('image_url','圖片網址（HTTPS，僅使用有權公開的素材）','input',{type:'url',maxLength:2048});
    const preview=make('img');preview.className='mall-catalog-preview';preview.alt='商城圖片預覽';preview.referrerPolicy='no-referrer';preview.hidden=true;form.append(preview);
    const validImage=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
    const showPreview=()=>{const url=validImage(imageUrl.value.trim());preview.hidden=!url;if(url)preview.src=url;else preview.removeAttribute('src');};
    preview.onerror=()=>{preview.hidden=true;};imageUrl.addEventListener('input',showPreview);showPreview();
    let imageFile=null,imageUploadHint=null;
    if(prepareImage&&uploadImage){
      const wrapper=make('label','直接上傳圖片（建議 800 × 533，JPG／PNG／WebP，10MB 以下）');
      imageFile=make('input');imageFile.type='file';imageFile.name='image_file';imageFile.accept='image/jpeg,image/png,image/webp';wrapper.append(imageFile);form.append(wrapper);
      imageUploadHint=make('p','上傳後請按「確認儲存」才會更新商城；取消不會替換原有圖片。');form.append(imageUploadHint);
      imageFile.onchange=async()=>{
        const file=imageFile.files?.[0];if(!file||!active()||busy||pending||finished)return;
        const requestEpoch=epoch,stillHere=()=>active()&&requestEpoch===epoch&&body.contains(form);
        busy=true;lock();setMessage('圖片處理及上傳中…');
        try{
          const base64Image=await prepareImage(file);if(!stillHere())return;
          const result=await uploadImage(base64Image);if(!stillHere())return;
          const url=validImage(result?.url||result?.imageUrl||'');
          if(result?.success!==true||!url)throw new Error('未取得有效圖片網址');
          imageUrl.value=url;dirty=true;showPreview();setMessage('圖片已上傳，請確認預覽後按「確認儲存」。');
        }catch(error){if(stillHere())setMessage((error.message||'圖片上傳失敗')+'，原圖片未變更。',true);}
        finally{busy=false;if(stillHere()){imageFile.value='';lock();}}
      };
    }
    if(type==='product'){
      const overview=make('div'),media=make('div'),description=fields.description.closest('label'),categoryLabel=category.closest('label');
      overview.className='mall-catalog-product-overview';media.className='mall-catalog-product-media';description.className='mall-catalog-product-description';
      fields.title.closest('label').after(categoryLabel);categoryLabel.after(overview);
      overview.append(description,media);media.append(imageUrl.closest('label'),preview);
      if(imageFile)media.append(imageFile.closest('label'),imageUploadHint);
    }
    if(type==='store'){
      label('address','地址','input',{maxLength:200});label('phone','電話','input',{maxLength:40});label('hours','營業時間','input',{maxLength:200});
    }else{
      const price=label('price','售價（NT$）','input',{type:'number',min:'0',max:'1000000',step:'0.01',required:true,inputMode:'decimal'});price.value=String(record.price_cents/100);
      const shipping=label('shipping_fee','商品運費（NT$；0 免運，留白沿用店家運費）','input',{type:'number',min:'0',max:'10000',step:'0.01',inputMode:'decimal'});shipping.value=record.shipping_fee_cents==null?'':String(record.shipping_fee_cents/100);
      form.append(make('p','同一家店每筆訂單計一次運費；本次選購商品運費設定不一致時，請店家統一後才能結帳。運費不折抵，不修改舊訂單。'));
      if(onlineAllowed){
        const purchaseMode=label('purchase_mode','銷售方式','select');
        for(const [value,text]of [['in_store','店內消費折抵'],['online','線上購買與折抵']]){const option=make('option',text);option.value=value;purchaseMode.append(option);}
        purchaseMode.value=record.purchase_mode||'in_store';
        const redeemType=label('redeem_type','購物金折抵方式','select');
        for(const [value,text]of [['none',cooperationPlan?.id==='redeem'?'尚未設定折抵（僅限草稿）':'不折抵'],['fixed','最多折抵指定點數'],['percent','最高折抵商品金額百分比'],['full','可全額折抵']]){const option=make('option',text);option.value=value;redeemType.append(option);}
        redeemType.value=record.redeem_type||'none';
        const redeemValue=label('redeem_value','折抵上限（固定填點數／百分比填 1–100）','input',{type:'number',min:'0',max:'1000000',step:'1'});redeemValue.value=String(record.redeem_value||0);
        const refreshRedeem=()=>{redeemValue.disabled=!['fixed','percent'].includes(redeemType.value);redeemValue.max=redeemType.value==='percent'?'100':'1000000';if(redeemValue.disabled)redeemValue.value='0';};
        redeemType.addEventListener('change',refreshRedeem);refreshRedeem();
        if(cooperationPlan?.id==='redeem')form.append(make('p','折抵店家上架商品必須提供購物金折抵；原設定'+(record.redeem_type==='none'?'尚未提供折抵':'已提供折抵')+'、'+(record.purchase_mode==='online'?'可網購':'限店內')+'。請自行確認銷售方式、折抵額度並儲存，不會自動替換舊設定。'));
        form.append(make('p','網購仍需店家完成收款設定，並以結帳查核為準；修改後請重新確認訂單。'));
      }else form.append(make('p','此帳號未具店家商品管理資格，請先核對合作方案。'));
      form.append(make('p','商品折抵方式與上限儲存後才生效，不修改既有訂單、點數帳本或發放點數。'));
    }
    let manualConfirmation=null;
    if(type==='product'&&onlineAllowed&&record.manual_online_release?.reference){
      const wrapper=make('label','我確認已獲店主同意，只對本商品現有內容人工放行網購（NT$11,800／最高折抵50%不變）');
      manualConfirmation=make('input');manualConfirmation.type='checkbox';manualConfirmation.name='manual_release_confirm';
      manualConfirmation.style.cssText='width:22px;min-height:22px;display:inline-block;margin-right:10px;vertical-align:middle';wrapper.prepend(manualConfirmation);form.append(wrapper);
      form.append(make('p','僅此商品本次版本適用。只可把銷售方式改為網購，不可同時改文案、圖片、價格或狀態；保留原AI待確認紀錄及人工同意，不代表型號、醫療用途或安全認證。'));
    }
    const status=label('status','公開狀態','select');
    for(const value of type==='store'?['draft','active']:['draft','active','archived']){const option=make('option',statusName(value));option.value=value;status.append(option);}status.value=record.status;
    const save=make('button','確認儲存'),cancel=make('button','取消／返回商品列表');save.type='submit';cancel.type='button';
    cancel.onclick=async()=>{if(active()&&!busy&&!confirming&&await safeLeave()){mode='products';void load();}};form.append(save,cancel);body.append(form);
    let pending=null,finished=false;
    const saveLabel=()=>manualConfirmation?.checked?'確認人工放行網購':'確認儲存';
    form.oninput=()=>{dirty=true;if(!pending&&!finished)save.textContent=saveLabel();};
    const lock=()=>{lockNavigation();for(const input of Object.values(fields))input.disabled=busy||confirming||!!pending||finished;if(fields.redeem_value&&!busy&&!confirming&&!pending&&!finished)fields.redeem_value.disabled=!['fixed','percent'].includes(fields.redeem_type.value);if(manualConfirmation)manualConfirmation.disabled=busy||confirming||!!pending||finished;if(imageFile)imageFile.disabled=busy||confirming||!!pending||finished;cancel.disabled=busy||confirming;save.disabled=busy||confirming||finished;save.textContent=pending&&!finished?'重新確認同一筆儲存':saveLabel();};
    lockEditor=lock;
    form.onsubmit=async event=>{
      event.preventDefault();event.stopPropagation();if(!active()||busy||confirming||finished)return;
      if(!pending){
        const changes=Object.fromEntries(Object.entries(fields).filter(([key])=>!['price','shipping_fee','redeem_value'].includes(key)).map(([key,input])=>[key,input.value.trim()]));
        if(type==='product'){
          if(!/^\d+(?:\.\d{1,2})?$/.test(fields.price.value)||Number(fields.price.value)>1000000){setMessage('請填寫有效售價',true);return;}
          const fee=fields.shipping_fee.value;
          if(fee!==''&&(!/^\d+(?:\.\d{1,2})?$/.test(fee)||Number(fee)>10000)){setMessage('請填寫有效商品運費（0 至 10,000 元），0 表示免運',true);return;}
          changes.shipping_fee_cents=fee===''?null:Math.round(Number(fee)*100);
          changes.price_cents=Math.round(Number(fields.price.value)*100);
          if(fields.redeem_type){
            const type=fields.redeem_type.value,amount=['none','full'].includes(type)?0:Number(fields.redeem_value.value);
            if(!['none','fixed','percent','full'].includes(type)||!Number.isSafeInteger(amount)||amount<0||amount>(type==='percent'?100:1000000)||(['fixed','percent'].includes(type)&&amount===0)){setMessage('請填寫有效的購物金折抵方式與上限。',true);return;}
            if(cooperationPlan?.id==='redeem'&&changes.status==='active'&&type==='none'){setMessage('折抵店家上架商品必須提供購物金折抵；請設定折抵方式與上限，尚未設定請先存草稿。',true);return;}
            changes.redeem_value=amount;
          }
        }
        const manual=manualConfirmation?.checked===true;
        if(manual&&(changes.purchase_mode!=='online'||Object.entries(changes).some(([key,value])=>key!=='purchase_mode'&&value!==(key==='shipping_fee_cents'?(record[key]??null):(record[key]??''))))){setMessage('單品人工放行只能切換網購，請還原其他欄位修改，價格、文案、圖片與狀態必須保持原值。',true);return;}
        // The pinned exception retains its explicit checkbox and named submit.
        // Other saves use an accessible inline confirmation, never a native modal.
        if(!manual&&!await ask(`確定儲存「${record.name||record.title}」？狀態：${statusName(changes.status)}。${changes.purchase_mode?'銷售方式：'+(changes.purchase_mode==='online'?'網購':'限店內')+'。':''}將同步影響手機商城顯示。`))return;
        if(!active())return;
        pending={type,id:record.id,shop_id:shop.id,version:record.version,shop_version:shop.version,request_key:crypto.randomUUID(),changes:manual?{purchase_mode:'online'}:changes,...(manual?{manual_release:{reference:record.manual_online_release.reference,confirmed:true}}:{})};dirty=true;
      }
      const requestEpoch=epoch;busy=true;lock();setMessage(pending.manual_release?'核對本商品人工同意、內容指紋與原審核紀錄中…':(pending.changes.status||record.status)==='active'?'檢查商品設定中…涉及內容或上架變更須通過 AI 審核。':'儲存中…');
      try{
        const result=await api('/admin/catalog',pending);
        if(!active()||requestEpoch!==epoch)return;
        if(result?.success!==true||result.id!==record.id)throw new Error('未確認儲存結果');
        finished=true;dirty=false;failures.delete(record.id);reviewHost.replaceChildren();setMessage('已儲存；手機商城重新載入即使用更新資料。請重新載入後繼續編輯。');
      }catch(error){if(active()&&requestEpoch===epoch){
        const reviewFailure=String(error.code||'').startsWith('LISTING_');if(reviewFailure)pending=null;
        const structuredReview=reviewFailure&&['reject','manual'].includes(error.review?.decision)&&Array.isArray(error.review?.issues)&&error.review.issues.length;
        const detail=structuredReview?(error.review.decision==='manual'?'上架內容待核對':'上架審核未通過')+'；本次未儲存，原有設定保留。請核對下方紅字後重新送審，或選擇草稿。':(error.message||'儲存失敗')+(reviewFailure?`。尚未儲存；${type==='product'?'銷售方式仍為「'+(record.purchase_mode==='online'?'網購':'限店內')+'」。':''}請重試或選擇草稿。`:'。可重新確認同一筆儲存；若版本衝突請重新載入。');
        if(reviewFailure){failures.set(record.id,{version:record.version,shopVersion:shop.version,detail,review:error.review});reviewHost.replaceChildren();appendListingReview(reviewHost,{listing_review:error.review},make);}
        setMessage(detail,true);message.scrollIntoView({block:'center'});
      }}
      finally{busy=false;if(active()&&requestEpoch===epoch)lock();}
    };
  }
  async function checkDraft(product){
    if(!active()||busy||confirming||product.status!=='draft')return;
    const requestEpoch=epoch,shopVersion=shop.version;
    const data={type:'product',id:product.id,shop_id:shop.id,version:product.version,shop_version:shopVersion,request_key:crypto.randomUUID(),changes:{status:'active'}};
    let completion='';let failed=false;
    busy=true;lockNavigation();setMessage(`正在檢查「${product.title}」上架內容；只檢查，不會公開。`);
    try{
      const result=await api('/admin/catalog/review',data);
      if(!active()||epoch!==requestEpoch)return;
      if(result?.success!==true||result.id!==product.id||result.reviewed!==true||result.decision!=='allow'||result.published!==false)throw new Error('未確認檢查結果，請重新檢查。');
      failures.delete(product.id);completion=`「${product.title}」：內容審核通過，尚未公開；實際上架仍需確認目前資格與商品名額。需要上架時，請進入編輯並確認儲存。`;
    }catch(error){
      if(!active()||epoch!==requestEpoch)return;
      const structured=['reject','manual'].includes(error.review?.decision)&&Array.isArray(error.review?.issues)&&error.review.issues.length;
      completion=`「${product.title}」：`+(structured?(error.review.decision==='manual'?'檢查待核對':'檢查未通過')+'，請核對紅字原因。':'檢查未完成，尚未判定內容違規。'+(error.message||'請稍後重試。'))+' 本次檢查不會公開商品。';failed=true;
      failures.set(product.id,{version:product.version,shopVersion,detail:completion,review:structured?error.review:null});
    }finally{
      busy=false;
      if(active()&&epoch===requestEpoch){
        lockNavigation();const reloadEpoch=epoch+1,reloaded=await load(cursor);
        if(active()&&epoch===reloadEpoch)setMessage(completion+(reloaded?'':' 清單讀回失敗，請重新載入。'),failed||!reloaded);
      }
    }
  }
  async function load(after=''){
    if(!active()||busy)return;
    const sequence=++epoch;dirty=false;lockEditor=()=>{};catalogActions=[];body.replaceChildren();setMessage('讀取商城資料中…');add.disabled=true;
    try{
      const params=new URLSearchParams({shop:shopId});if(after)params.set('after',after);if(mode==='draft')params.set('status','draft');
      const result=await api('/admin/catalog?'+params,null,true);
      if(!active()||sequence!==epoch)return;
      if(!result?.success||result.shop?.id!==shopId||!Array.isArray(result.products))throw new Error('商城回傳格式不正確');
      shop=result.shop;onlineAllowed=result.online_product_allowed===true;cooperationPlan=result.cooperation_plan||shop.cooperation_plan||null;cursor=after;next=result.next||'';title.textContent=shop.name+'｜商城管理';add.disabled=false;
      for(const [button,key]of [[store,'store'],[products,'products'],[drafts,'draft']])button.setAttribute('aria-pressed',String(mode===key));
      setMessage(`店面：${statusName(shop.status)} · 商品 ${result.summary.total} 件 · 草稿 ${result.summary.draft} 件。`);
      if(mode==='store'){editor('store',shop);return true;}
      appendListingReview(body,shop,make);
      if(!result.products.length)body.append(make('p',mode==='draft'?'目前沒有待確認的商品草稿。':'目前沒有商品。'));
      for(const product of result.products){
        const row=make('article'),name=make('h3',product.title),detail=make('p',`NT$ ${(product.price_cents/100).toLocaleString('zh-TW')} · ${statusName(product.status)} · ${product.category||'未分類'}`);
        row.append(name,detail);
        appendListingReview(row,product,make);
        const failure=failures.get(product.id);
        if(failure&&failure.version===product.version&&failure.shopVersion===shop.version&&!product.listing_review&&!appendListingReview(row,{listing_review:failure.review},make)){const explanation=make('p',failure.detail);explanation.className='mall-catalog-review';row.append(explanation);}
        if(product.status!=='archived'){
          const edit=make('button','編輯／上下架');edit.type='button';edit.onclick=()=>{if(active()&&!busy&&!confirming)editor('product',product);};row.append(edit);catalogActions.push([edit,true]);
          if(product.status==='draft'){
            const check=make('button','檢查上架內容');check.type='button';check.onclick=()=>{void checkDraft(product);};row.append(check,make('p','只檢查，不會公開；內容通過後仍需另外確認資格、名額並上架。'));catalogActions.push([check,true]);
          }
        }else row.append(make('p','封存保留歷史，不可在此恢復。'));
        body.append(row);
      }
      const pager=make('nav'),first=make('button','回第一頁'),more=make('button','下一頁');first.type=more.type='button';first.disabled=!cursor;more.disabled=!next;
      first.onclick=()=>{if(!busy&&!confirming)void load();};more.onclick=()=>{if(!busy&&!confirming)void load(next);};pager.append(first,more);body.append(pager);catalogActions.push([first,!!cursor],[more,!!next]);return true;
    }catch(error){if(active()&&sequence===epoch)setMessage((error.message||'商城讀取失敗')+'，請按重新載入。',true);return false;}
  }
  await load();
}

// Read-only cross-shop queue; publication still goes through the shared versioned editor.
export async function mountAdminDrafts(container,{api,isCurrent,onBack,onManageCatalog}){
  if(!isCurrent())return;
  const doc=container.ownerDocument,make=(tag,text)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  if(!doc.getElementById('store-admin-catalog-css')){
    const link=make('link');link.id='store-admin-catalog-css';link.rel='stylesheet';link.href=new URL('../../css/store-admin-catalog.css?v=3',import.meta.url).href;doc.head.append(link);
  }
  const panel=make('section');panel.className='mall-catalog';container.replaceChildren(panel);
  const active=()=>isCurrent()&&container.contains(panel),bar=make('nav'),back=make('button','← 返回店家列表'),refresh=make('button','重新載入');
  back.type=refresh.type='button';bar.append(back,refresh);
  const message=make('p');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
  const setMessage=(text,failed=false)=>{message.textContent=text;message.classList.toggle('mall-catalog-error',failed);};
  const body=make('div');panel.append(bar,make('h2','全站商品草稿'),make('p','集中查看既有商品草稿；進入店家確認內容後才決定是否上架，不會自動送審或發布。'),message,body);
  let epoch=0;
  async function navigate(callback,...args){if(!active())return;++epoch;try{await callback(...args);}catch(error){if(active())setMessage((error.message||'載入失敗')+'，請重試。',true);}}
  back.onclick=()=>void navigate(onBack);refresh.onclick=()=>void load();
  async function load(after=''){
    if(!active())return;
    const sequence=++epoch;body.replaceChildren();setMessage('讀取全站草稿中…');
    try{
      const result=await api('/admin/catalog?queue=draft'+(after?'&after='+encodeURIComponent(after):''),null,true);
      if(!active()||sequence!==epoch)return;
      if(result?.success!==true||!Array.isArray(result.products))throw new Error('草稿回傳格式不正確');
      setMessage(result.products.length?`本頁 ${result.products.length} 件草稿。`:'目前沒有待確認的商品草稿。');
      for(const product of result.products){
        const row=make('article'),edit=make('button','進入店家草稿');edit.type='button';
        row.append(make('h3',product.title),make('p',`${product.shop_name} · NT$ ${(product.price_cents/100).toLocaleString('zh-TW')} · ${product.category||'未分類'}`),edit);
        appendListingReview(row,product,make);
        edit.onclick=()=>void navigate(onManageCatalog,product.shop_id);body.append(row);
      }
      const pager=make('nav'),first=make('button','回第一頁'),more=make('button','下一頁');first.type=more.type='button';first.disabled=!after;more.disabled=!result.next;
      first.onclick=()=>void load();more.onclick=()=>void load(result.next);pager.append(first,more);body.append(pager);
    }catch(error){if(active()&&sequence===epoch)setMessage((error.message||'讀取失敗')+'，請按重新載入。',true);}
  }
  await load();
}
