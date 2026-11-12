const stylesheetId='store-admin-styles';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
const number=value=>count(value).toLocaleString('zh-TW');
const canPin=shop=>uuid.test(String(shop.id))&&typeof shop.pinned==='boolean'&&Number.isSafeInteger(shop.pin_version)&&shop.pin_version>=0&&['shop','partner'].includes(shop.pin_source);

// Private directory data stays in this mount only, never in a shared/global cache.
export async function mountStoreAdmin(container,{api,isCurrent,onView,onBack,onManagePartners,onUploadProducts,onManageCatalog,onReviewDrafts}) {
  if(!isCurrent())return;
  const doc=container.ownerDocument;
  if(!doc.getElementById(stylesheetId)){
    const link=doc.createElement('link');link.id=stylesheetId;link.rel='stylesheet';
    link.href=new URL('../../css/store-admin.css?v=3',import.meta.url).href;doc.head.append(link);
  }
  const make=(tag,className,text)=>{
    const node=doc.createElement(tag);if(className)node.className=className;
    if(text!==undefined)node.textContent=String(text);return node;
  };
  const button=(text,action)=>{
    const node=make('button','',text);node.type='button';node.setAttribute('data-admin-action',action);return node;
  };
  const panel=make('section','store-admin');panel.setAttribute('aria-label','管理員店家列表');
  const active=()=>isCurrent()&&container.contains(panel);
  const toolbar=make('div','store-admin-toolbar'),back=button('返回商城管理','back'),refresh=button('重新整理','refresh');
  toolbar.append(back,refresh);
  if(onReviewDrafts){
    const drafts=button('全站商品草稿','drafts');
    drafts.addEventListener('click',()=>{if(active())void navigate(onReviewDrafts);});toolbar.append(drafts);
  }
  if(onManagePartners){
    const manage=button('代建／管理合作店家','partners');
    manage.addEventListener('click',()=>{if(active())void navigate(onManagePartners);});toolbar.append(manage);
  }
  const heading=make('h2','store-admin-heading','管理員・店家列表');
  const intro=make('p','store-admin-intro','查看全站店家與負責人，包含草稿及未公開店家。');
  const pinHelp=make('p','store-admin-intro','勾選「置頂」只影響已公開店家的目錄排序，不會公開草稿或變更商品。');pinHelp.hidden=true;
  const summary=make('div','store-admin-summary');summary.setAttribute('aria-label','全站店家統計');
  const totalValues={};
  for(const [key,label]of [['total','全部店家'],['active','已上架'],['draft','草稿']]){
    const item=make('div','store-admin-total'),value=make('strong','','—');
    value.setAttribute('data-admin-count',key);item.append(make('span','',label),value);summary.append(item);totalValues[key]=value;
  }
  const form=make('form','store-admin-search');form.setAttribute('data-admin-form','');
  const searchLabel=make('label','store-admin-query','搜尋店家或負責人'),query=make('input');
  query.type='search';query.name='q';query.maxLength=80;query.placeholder='店名、負責人、地址或電話';searchLabel.append(query);
  const filterLabel=make('label','store-admin-filter','店家狀態'),filter=make('select');filter.name='status';
  for(const [value,label]of [['','全部狀態'],['active','已上架'],['draft','草稿']]){
    const option=make('option','',label);option.value=value;filter.append(option);
  }
  filterLabel.append(filter);const searchButton=button('查詢','search');searchButton.type='submit';form.append(searchLabel,filterLabel,searchButton);
  const status=make('p','store-admin-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const retry=button('重試','retry');retry.hidden=true;
  const list=make('div','store-admin-list');list.setAttribute('role','list');list.setAttribute('aria-label','店家查詢結果');
  const pager=make('nav','store-admin-pager');pager.setAttribute('aria-label','店家列表分頁');
  const previous=button('上一頁','previous'),pageLabel=make('span','','第 1 頁'),next=button('下一頁','next');
  previous.disabled=true;next.disabled=true;pager.append(previous,pageLabel,next);
  panel.append(toolbar,heading,intro,pinHelp,summary,form,status,retry,list,pager);container.replaceChildren(panel);
  let sequence=0,page=0,cursors=[''],nextCursor='',shown=false,busy=false,search={q:'',status:''},lastRequest={page:0,cursor:''};
  const controls=()=>{refresh.disabled=busy;retry.disabled=busy;previous.disabled=busy||!shown||page===0;next.disabled=busy||!shown||!nextCursor;};
  const navigate=async(callback,...args)=>{
    if(!active())return;
    ++sequence;
    try{await callback(...args);}catch{if(active()){busy=false;controls();status.textContent='無法開啟頁面，請重試。';}}
  };
  const pinControl=(shop,card,renderVersion)=>{
    const control=make('div','store-admin-pin-control'),label=make('label','store-admin-pin-label'),checkbox=make('input');
    checkbox.type='checkbox';checkbox.checked=shop.pinned;checkbox.setAttribute('data-admin-pin','');checkbox.setAttribute('aria-label','置頂 '+String(shop.name||'未填店名'));
    label.append(checkbox,make('span','','置頂'));
    const message=make('p','store-admin-pin-status');message.setAttribute('data-admin-pin-status','');message.setAttribute('role','status');message.setAttribute('aria-live','polite');
    const retryPin=button('重試置頂儲存','pin-retry');retryPin.hidden=true;control.append(label,message,retryPin);
    let pending=null,saving=false,needsRefresh=false,hadUnknown=false;
    const current=()=>active()&&sequence===renderVersion&&list.contains(card);
    const lock=()=>{checkbox.disabled=saving||!!pending||needsRefresh;retryPin.disabled=saving;retryPin.hidden=!pending||saving;};
    const save=async()=>{
      if(!current()||saving||!pending)return;
      const request=pending;saving=true;message.className='store-admin-pin-status';message.textContent='儲存置頂中…';lock();
      try{
        const result=await api('/admin/stores/pin',{...request},true);
        if(!current()||pending!==request)return;
        if(result?.success!==true||result.id!==request.id||result.source!==request.source||result.pinned!==request.pinned||!Number.isSafeInteger(result.pin_version)||result.pin_version<=request.version)throw new Error('尚未取得可確認的置頂儲存結果');
        shop.pinned=result.pinned;shop.pin_version=result.pin_version;checkbox.checked=shop.pinned;pending=null;hadUnknown=false;
        message.textContent=shop.pinned?'已置頂；只影響已公開店家的目錄排序。':'已取消置頂。';
      }catch(error){
        if(!current()||pending!==request)return;
        checkbox.checked=shop.pinned;message.className='store-admin-pin-status is-error';
        const detail=String(error?.message||'置頂暫時無法儲存').slice(0,300),known=Number.isInteger(error?.status)&&error.status>=400&&error.status<500;
        if(known){pending=null;needsRefresh=true;message.textContent=hadUnknown?'前次結果仍未確認，請重新整理後確認。'+detail:'置頂未儲存，已還原。'+detail+'；請重新整理後再操作。';}
        else{hadUnknown=true;message.textContent='置頂儲存結果未確認，已還原原選擇。'+detail+'；請重試同一筆置頂儲存。';}
      }finally{if(current()){saving=false;lock();}}
    };
    checkbox.addEventListener('change',()=>{
      if(!current()||saving||pending||needsRefresh){checkbox.checked=shop.pinned;return;}
      hadUnknown=false;pending={source:shop.pin_source,id:shop.id,pinned:checkbox.checked,version:shop.pin_version,request_key:crypto.randomUUID()};void save();
    });
    retryPin.addEventListener('click',()=>{void save();});
    return control;
  };
  const row=(shop,pinningEnabled,renderVersion)=>{
    const card=make('article','store-admin-card');card.setAttribute('role','listitem');card.setAttribute('data-admin-shop-id',String(shop.id||''));
    const main=make('div','store-admin-main'),title=make('div','store-admin-title');
    title.append(make('h3','',shop.name||'未填店名'));
    title.append(make('span','store-admin-badge'+(shop.status==='active'?' is-active':''),shop.status==='active'?'已上架':shop.status==='draft'?'草稿':'未公開'));
    if(shop.status==='active'&&!shop.public_visible)title.append(make('span','store-admin-badge is-hidden','未公開'));
    main.append(title,make('p','store-admin-owner','負責人：'+(shop.owner_name||'未填姓名')));
    const details=[shop.category,shop.phone,shop.address].filter(Boolean);
    if(details.length)main.append(make('p','store-admin-contact',details.join(' · ')));
    const stats=make('p','store-admin-products');
    if(shop.listing_only===1)stats.append(make('span','','店家資訊上架・未綁定帳號；認領需由管理員核實'));
    else stats.append(make('span','','商品 '+number(shop.active_product_count)+' / '+number(shop.product_count)),make('span','','網購 '+number(shop.online_product_count)));
    stats.title='已上架商品 / 未封存商品總數；網購為已上架網購商品';
    main.append(stats);card.append(main);
    if(pinningEnabled&&canPin(shop))card.append(pinControl(shop,card,renderVersion));
    if(shop.public_visible===true&&uuid.test(String(shop.id))){
      const view=button('查看店面','view');view.setAttribute('data-admin-shop',String(shop.id));
      view.addEventListener('click',()=>{void navigate(onView,shop.id);});card.append(view);
    }else card.append(make('span','store-admin-unavailable','無公開店面'));
    if(onUploadProducts&&shop.listing_only!==1&&shop.owner_uid&&uuid.test(String(shop.id))&&['store','店長','admin','總管','redeem','扣點用戶'].includes(String(shop.owner_role).toLowerCase())){
      const upload=button(onManageCatalog?'店家／商品管理':'代上傳商品','upload-products');upload.setAttribute('data-admin-shop',String(shop.id));
      upload.addEventListener('click',()=>{void navigate(onManageCatalog||onUploadProducts,shop.id);});card.append(upload);
    }
    return card;
  };
  async function load(targetPage=0,targetCursor='') {
    if(!active())return;
    const version=++sequence,requestSearch={...search};lastRequest={page:targetPage,cursor:targetCursor};busy=true;shown=false;retry.hidden=true;controls();
    list.replaceChildren();pinHelp.hidden=true;list.setAttribute('aria-busy','true');status.textContent='讀取店家列表中…';
    const params=new URLSearchParams();if(requestSearch.q)params.set('q',requestSearch.q);if(requestSearch.status)params.set('status',requestSearch.status);if(targetCursor)params.set('after',targetCursor);
    try{
      const report=await api('/admin/stores'+(params.size?'?'+params:''),null,true);
      if(!active()||version!==sequence)return;
      if(report?.success!==true||!Array.isArray(report.shops)||!report.summary||typeof report.summary!=='object'||(report.next&&!uuid.test(String(report.next))))throw new Error('invalid directory response');
      page=targetPage;cursors[page]=targetCursor;cursors.length=page+1;nextCursor=report.next||'';shown=true;
      for(const key of Object.keys(totalValues))totalValues[key].textContent=number(report.summary[key]);
      pinHelp.hidden=report.pinning_enabled!==true;
      if(report.shops.length)list.append(...report.shops.map(shop=>row(shop,report.pinning_enabled===true,version)));
      else list.append(make('p','store-admin-empty',requestSearch.q||requestSearch.status?'沒有符合條件的店家。':'目前沒有店家。'));
      pageLabel.textContent='第 '+(page+1)+' 頁';
      status.textContent='符合條件 '+number(report.filtered_total)+' 家'+(report.shops.length?' · 本頁 '+report.shops.length+' 家':'');
    }catch{
      if(!active()||version!==sequence)return;
      status.textContent='無法讀取店家列表，請重新整理或重試。';retry.hidden=false;
    }finally{
      if(active()&&version===sequence){busy=false;list.setAttribute('aria-busy','false');controls();}
    }
  }
  back.addEventListener('click',()=>{void navigate(onBack);});
  refresh.addEventListener('click',()=>{if(active()&&!busy){cursors=[''];void load();}});
  retry.addEventListener('click',()=>{if(active()&&!busy)void load(lastRequest.page,lastRequest.cursor);});
  form.addEventListener('submit',event=>{
    event.preventDefault();event.stopPropagation();if(!active())return;
    search={q:query.value.trim().slice(0,80),status:['active','draft'].includes(filter.value)?filter.value:''};
    cursors=[''];page=0;void load();
  });
  previous.addEventListener('click',()=>{if(active()&&!previous.disabled)void load(page-1,cursors[page-1]||'');});
  next.addEventListener('click',()=>{if(active()&&!next.disabled)void load(page+1,nextCursor);});
  await load();
}
