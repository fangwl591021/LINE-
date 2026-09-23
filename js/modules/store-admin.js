const stylesheetId='store-admin-styles';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const count=value=>Number.isSafeInteger(Number(value))&&Number(value)>=0?Number(value):0;
const number=value=>count(value).toLocaleString('zh-TW');

// Private directory data stays in this mount only, never in a shared/global cache.
export async function mountStoreAdmin(container,{api,isCurrent,onView,onBack,onManagePartners,onUploadProducts,onManageCatalog,onReviewDrafts}) {
  if(!isCurrent())return;
  const doc=container.ownerDocument;
  if(!doc.getElementById(stylesheetId)){
    const link=doc.createElement('link');link.id=stylesheetId;link.rel='stylesheet';
    link.href=new URL('../../css/store-admin.css?v=2',import.meta.url).href;doc.head.append(link);
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
  panel.append(toolbar,heading,intro,summary,form,status,retry,list,pager);container.replaceChildren(panel);
  let sequence=0,page=0,cursors=[''],nextCursor='',shown=false,busy=false,search={q:'',status:''},lastRequest={page:0,cursor:''};
  const controls=()=>{refresh.disabled=busy;retry.disabled=busy;previous.disabled=busy||!shown||page===0;next.disabled=busy||!shown||!nextCursor;};
  const navigate=async(callback,...args)=>{
    if(!active())return;
    ++sequence;
    try{await callback(...args);}catch{if(active()){busy=false;controls();status.textContent='無法開啟頁面，請重試。';}}
  };
  const row=shop=>{
    const card=make('article','store-admin-card');card.setAttribute('role','listitem');
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
    if(shop.public_visible===true&&uuid.test(String(shop.id))){
      const view=button('查看店面','view');view.setAttribute('data-admin-shop',String(shop.id));
      view.addEventListener('click',()=>{void navigate(onView,shop.id);});card.append(view);
    }else card.append(make('span','store-admin-unavailable','無公開店面'));
    if(onUploadProducts&&shop.listing_only!==1&&shop.owner_uid&&uuid.test(String(shop.id))&&['store','店長','admin','總管','user','用戶'].includes(String(shop.owner_role).toLowerCase())){
      const upload=button(onManageCatalog?'店家／商品管理':'代上傳商品','upload-products');upload.setAttribute('data-admin-shop',String(shop.id));
      upload.addEventListener('click',()=>{void navigate(onManageCatalog||onUploadProducts,shop.id);});card.append(upload);
    }
    return card;
  };
  async function load(targetPage=0,targetCursor='') {
    if(!active())return;
    const version=++sequence,requestSearch={...search};lastRequest={page:targetPage,cursor:targetCursor};busy=true;shown=false;retry.hidden=true;controls();
    list.replaceChildren();list.setAttribute('aria-busy','true');status.textContent='讀取店家列表中…';
    const params=new URLSearchParams();if(requestSearch.q)params.set('q',requestSearch.q);if(requestSearch.status)params.set('status',requestSearch.status);if(targetCursor)params.set('after',targetCursor);
    try{
      const report=await api('/admin/stores'+(params.size?'?'+params:''),null,true);
      if(!active()||version!==sequence)return;
      if(report?.success!==true||!Array.isArray(report.shops)||!report.summary||typeof report.summary!=='object'||(report.next&&!uuid.test(String(report.next))))throw new Error('invalid directory response');
      page=targetPage;cursors[page]=targetCursor;cursors.length=page+1;nextCursor=report.next||'';shown=true;
      for(const key of Object.keys(totalValues))totalValues[key].textContent=number(report.summary[key]);
      if(report.shops.length)list.append(...report.shops.map(row));
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
