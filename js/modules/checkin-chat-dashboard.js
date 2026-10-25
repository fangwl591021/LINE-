// Editor only: configuration draft/preview/publish, never a check-in, wallet write or LINE send.
(() => {
  'use strict';
  const controllers=new WeakMap(),clone=value=>JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const id=prefix=>prefix+'_'+crypto.randomUUID().replace(/-/g,'');
  const validId=value=>typeof value==='string'&&/^[a-z][a-z0-9_-]{0,39}$/.test(value);
  const shopId=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
  const productId=value=>typeof value==='string'&&/^[A-Za-z0-9-]{1,80}$/.test(value);
  const productKey=ref=>String(ref.shopId).toLowerCase()+'/'+ref.productId;
  const color=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:'#078655';
  function imageUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash&&!/[\s\\]/.test(value)?url.href:'';}catch{return '';}}
  function validate(config){
    if(config?.schemaVersion!==1||typeof config.altText!=='string'||!config.altText.trim()||config.altText.length>120||!/^#[0-9a-f]{6}$/i.test(config.themeColor||''))throw Error('請填寫訊息替代文字（120字內）及完整六碼色碼。');
    if(!Array.isArray(config.pages)||config.pages.length<2||config.pages.length>12)throw Error('整組卡片須有2至12頁。');
    const ids=new Set(),productRefs=new Set();
    for(const [index,page]of config.pages.entries()){
      if(!validId(page.id)||ids.has(page.id))throw Error('頁面編號重複或格式不符。');ids.add(page.id);
      if(page.kind==='product'){
        if(index===0||Object.keys(page).some(key=>!['id','kind','shopId','productId'].includes(key))||!shopId(page.shopId)||!productId(page.productId)||productRefs.has(productKey(page)))throw Error('商品頁只能引用不同的已上架商品，購物金須保留為首頁。');
        productRefs.add(productKey(page));continue;
      }
      if(page.kind!==(index===0?'wallet':'info'))throw Error('購物金頁須固定為第一頁，其餘為說明頁。');
      if(typeof page.title!=='string'||!page.title.trim()||page.title.length>60||typeof page.body!=='string'||page.body.length>600)throw Error('每頁標題須為1至60字，說明須在600字內。');
      if(typeof page.heroImageUrl!=='string'||page.heroImageUrl.length>2000||(index===0&&page.heroImageUrl)||page.heroImageUrl&&!imageUrl(page.heroImageUrl))throw Error('說明頁圖片請使用有效HTTPS網址，購物金首頁不放圖片。');
      if(!Array.isArray(page.buttons)||page.buttons.length>(index===0?2:3)||(index===0&&(page.buttons.length!==2||new Set(page.buttons.map(b=>b.target)).size!==2)))throw Error('首頁須保留商城與明細各一個按鈕；說明頁最多3個按鈕。');
      const buttons=new Set();for(const button of page.buttons){if(!validId(button.id)||buttons.has(button.id)||!['mall','details'].includes(button.target)||typeof button.label!=='string'||!button.label.trim()||button.label.length>20)throw Error('按鈕文字須為1至20字，目的地只能選商城或明細。');buttons.add(button.id);}
    }
    return config;
  }
  window.mountCheckinChatDashboard=async function(root,{api,isCurrent=()=>true}={}){
    if(!root||typeof api!=='function')throw Error('編輯器設定不完整');
    if(controllers.has(root)){const existing=controllers.get(root);existing.resume();await existing.ready;return existing;}
    let disposed=false,busy=false,config=null,saved='',published='',draftRevision=0,publishedRevision=0,pageId='',selection='title',mobile='preview',conflict=false,sequence=0,picker=null,alignment=0,aligning=false;
    const products=new Map(),unavailableProducts=new Map();
    const requestKeys=new Map(),listeners=[];let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
    const listen=(type,handler)=>{root.addEventListener(type,handler);listeners.push([type,handler]);};
    const current=()=>!disposed&&root.isConnected&&isCurrent();
    const dirty=()=>!!config&&JSON.stringify(config)!==saved;
    const selected=()=>config?.pages.find(page=>page.id===pageId)||config?.pages[0];
    const resolved=page=>page.kind==='product'&&!unavailableProducts.has(productKey(page))?products.get(productKey(page)):null;
    const pageTitle=page=>page.kind==='product'?(resolved(page)?.display?.title||resolved(page)?.title||'商品目前不可用'):page.title;
    const productReason=page=>{const value=unavailableProducts.get(productKey(page));return value&&value!=='not_public'?String(value):'商品目前未上架或店家未公開，請移除或更換。';};
    const price=value=>Number.isSafeInteger(value)&&value>=0?'NT$ '+(value/100).toLocaleString('zh-TW',{maximumFractionDigits:2}):'價格依商品詳情確認';
    const unavailable=()=>config?.pages.some(page=>page.kind==='product'&&!resolved(page));
    function readProducts(result,replace=false){
      if(replace){products.clear();unavailableProducts.clear();}
      for(const item of result?.products||[]){if(shopId(item?.shopId)&&productId(item?.productId)){products.set(productKey(item),clone(item));unavailableProducts.delete(productKey(item));}}
      for(const item of result?.unavailableProducts||[]){if(shopId(item?.shopId)&&productId(item?.productId)){unavailableProducts.set(productKey(item),String(item.reason||'not_public'));products.delete(productKey(item));}}
    }
    const status=(text,error=false)=>{const node=root.querySelector('[data-status]');if(node){node.textContent=text;node.dataset.error=String(error);}};
    const controller={ready,hasUnsavedChanges:dirty,isBusy:()=>busy,resume(){if(current())syncToolbar();},dispose(){if(disposed)return;closePicker(false);disposed=true;sequence++;config=null;clearInterval(authWatch);listeners.forEach(([type,handler])=>root.removeEventListener(type,handler));controllers.delete(root);root.replaceChildren();},isValid:current};
    controllers.set(root,controller);
    root.classList.add('ccd-app');root.innerHTML='<div class="ccd-loader" role="status">卡片編輯器載入中…</div>';
    const authWatch=setInterval(()=>{if(!current())controller.dispose();},500);
    const beforeUnload=event=>{if(current()&&(dirty()||busy)){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',beforeUnload);
    const dispose=controller.dispose;controller.dispose=()=>{window.removeEventListener('beforeunload',beforeUnload);dispose();};
    function syncToolbar(){
      if(!config||disposed)return;
      root.querySelector('[data-save]').disabled=busy||!dirty();root.querySelector('[data-publish]').disabled=busy||dirty()||unavailable();root.querySelector('[data-preview-check]').disabled=busy;
      root.querySelector('[data-reload]').disabled=busy;root.querySelector('[data-reload]').textContent=dirty()?'重新載入（捨棄本機修改）':'重新載入';
      root.querySelector('[data-dirty]').textContent=dirty()?'尚有未儲存修改':saved===published?(publishedRevision?'目前草稿已發布':'目前使用預設版本'):'草稿尚未發布';
      root.querySelector('[data-revisions]').textContent=`草稿版本 ${draftRevision} · 已發布版本 ${publishedRevision}`;
      root.querySelector('[data-conflict]').hidden=!conflict;
      root.querySelectorAll('input,textarea,select,[data-add-page],[data-open-picker],[data-replace-product],[data-move-page],[data-remove-page],[data-add-button],[data-button-action]').forEach(node=>{if(!node.closest('[data-product-picker]'))node.disabled=busy||node.dataset.locked==='true';});
    }
    function shell(){
      root.innerHTML=`<header class="ccd-top"><div><h2>LINE 會員打卡卡片</h2><p>編輯多頁卡片，先存草稿，再發布給後續打卡使用。</p></div><div class="ccd-actions"><button type="button" data-preview-check>檢查 LINE 格式</button><button type="button" data-save>儲存草稿</button><button type="button" class="ccd-primary" data-publish>發布卡片</button></div></header><div class="ccd-versions"><span class="ccd-badge" data-dirty></span><span data-revisions></span><button type="button" data-reload>重新載入${dirty()?'（捨棄本機修改）':''}</button></div><p class="ccd-status" data-status role="status" aria-live="polite"></p><div class="ccd-conflict" data-conflict hidden>內容已由其他管理員更新；你的編輯仍保留。要捨棄本機修改時，再按「重新載入」。</div><nav class="ccd-mobile-tabs" aria-label="編輯區域"><button type="button" data-mobile="pages">頁面</button><button type="button" data-mobile="preview">預覽</button><button type="button" data-mobile="properties">屬性</button></nav><div class="ccd-workbench"><aside class="ccd-panel" data-panel="pages"><h3 class="ccd-panel-heading">頁面與順序</h3><div class="ccd-pages" data-pages></div></aside><section class="ccd-panel" data-panel="preview"><header class="ccd-preview-heading"><h3>即時預覽</h3><div class="ccd-preview-nav"><button type="button" data-previous aria-label="預覽上一頁">‹</button><output data-position aria-live="polite"></output><button type="button" data-next aria-label="預覽下一頁">›</button></div></header><div class="ccd-preview-space"><div class="ccd-carousel" data-carousel tabindex="0" role="region" aria-label="LINE 多頁卡片橫向預覽"></div><p class="ccd-preview-caption">左右滑看整組卡片。點文字或按鈕選取編輯；預覽不會開連結、發訊或記錄點擊。</p></div></section><aside class="ccd-panel" data-panel="properties"><h3 class="ccd-panel-heading">內容與按鈕</h3><div class="ccd-properties" data-properties></div></aside></div><p class="ccd-note">發布只更新之後的打卡卡片，不會立即發訊、執行打卡或變更點數。實際打卡結果仍以母站文字回覆為準。</p>`;
      root.querySelector('.ccd-actions').insertAdjacentHTML('afterbegin','<button type="button" data-open-picker>挑選店家商品</button>');
      root.querySelector('[data-carousel]').addEventListener('scroll',()=>{if(aligning||picker)return;const track=root.querySelector('[data-carousel]');const cards=[...track.children];if(!cards.length)return;const center=track.getBoundingClientRect().left+track.clientWidth/2;const distance=card=>Math.abs(card.getBoundingClientRect().left+card.offsetWidth/2-center);const nearest=cards.reduce((a,b)=>distance(b)<distance(a)?b:a);if(nearest.dataset.pageId!==pageId){pageId=nearest.dataset.pageId;selection=selected().kind==='product'?'product':'title';renderPageList();renderProperties();syncSelection();}});
      renderPageList();renderPreview();renderProperties();syncMobile();syncToolbar();
    }
    function renderPageList(){
      const box=root.querySelector('[data-pages]'),scroll=box.scrollTop;
      box.innerHTML=config.pages.map((page,index)=>`<div class="ccd-page-row" data-list-page="${esc(page.id)}" data-active="${page.id===pageId}"><button type="button" class="ccd-page-select" data-select-page="${esc(page.id)}"><span class="ccd-page-number">${index+1}</span><span class="ccd-page-caption"><strong>${esc(pageTitle(page)||'未命名頁面')}</strong><small>${page.kind==='wallet'?'購物金 · 固定首頁':page.kind==='product'?'店家商品':'說明頁'}</small></span></button>${index?`<div class="ccd-page-actions"><button type="button" data-move-page="${esc(page.id)}" data-offset="-1" ${index===1?'disabled data-locked="true"':''} aria-label="第${index+1}頁上移">↑</button><button type="button" data-move-page="${esc(page.id)}" data-offset="1" ${index===config.pages.length-1?'disabled data-locked="true"':''} aria-label="第${index+1}頁下移">↓</button><button type="button" class="ccd-danger" data-remove-page="${esc(page.id)}" ${config.pages.length<=2?'disabled data-locked="true"':''}>刪除</button></div>`:'<p class="ccd-note">動態額度與時間由系統帶入。</p>'}</div>`).join('')+`<button type="button" class="ccd-add-page" data-add-page ${config.pages.length>=12?'disabled data-locked="true"':''}>＋ 新增說明頁（${config.pages.length}/12）</button><button type="button" class="ccd-add-page" data-open-picker>☑ 從店家商品挑選</button>`;
      box.scrollTop=scroll;
    }
    function renderPreview(){
      const track=root.querySelector('[data-carousel]'),left=track.scrollLeft;
      track.innerHTML=config.pages.map(page=>page.kind==='product'?productPreview(page):`<article class="ccd-card" data-page-id="${esc(page.id)}" style="--ccd-theme:${color(config.themeColor)}"><header class="ccd-card-header"><small>點數通 · 會員服務</small><button type="button" class="ccd-editable" data-preview-page="${esc(page.id)}" data-select-field="title">${esc(page.title||'頁面標題')}</button></header>${page.kind==='info'&&imageUrl(page.heroImageUrl)?`<button type="button" class="ccd-card-image-select" data-preview-page="${esc(page.id)}" data-select-field="heroImageUrl" aria-label="編輯本頁圖片"><img class="ccd-card-image" src="${esc(imageUrl(page.heroImageUrl))}" alt="說明頁圖片" referrerpolicy="no-referrer"></button>`:''}<div class="ccd-card-body">${page.kind==='wallet'?`<button type="button" class="ccd-dynamic" data-preview-page="${esc(page.id)}" data-select-field="dynamic"><span>會員可用購物金 · 動態欄位</span><strong>依登入會員即時查詢</strong><small>實際餘額與查詢時間由系統帶入</small></button>`:''}<button type="button" class="ccd-editable" data-preview-page="${esc(page.id)}" data-select-field="body">${esc(page.body||'點這裡編輯說明')}</button></div><div class="ccd-card-buttons">${page.buttons.map(button=>`<button type="button" data-preview-page="${esc(page.id)}" data-select-field="button:${esc(button.id)}">${esc(button.label||'按鈕文字')}</button>`).join('')}</div><footer class="ccd-card-footer">${page.kind==='wallet'?'實際打卡結果請以母站文字回覆為準。<br>':''}實際折抵以商品與結帳確認為準。<br>正式卡片的商城／明細入口會記錄登入身分與時間；此預覽不記錄。</footer></article>`).join('');
      track.scrollLeft=left;syncSelection();
    }
    function productPreview(page){
      const item=resolved(page),image=item?imageUrl(item.display?.heroImageUrl||item.imageUrl):'';
      return `<article class="ccd-card ccd-product-card" data-page-id="${esc(page.id)}" style="--ccd-theme:${color(config.themeColor)}"><header class="ccd-card-header"><small>${esc(item?.shopName||'店家商品')}</small><button type="button" class="ccd-editable" data-preview-page="${esc(page.id)}" data-select-field="product">${esc(pageTitle(page))}</button></header>${image?`<button type="button" class="ccd-card-image-select" data-preview-page="${esc(page.id)}" data-select-field="product" aria-label="查看商品來源"><img class="ccd-card-image" src="${esc(image)}" alt="店家商品圖片" referrerpolicy="no-referrer"></button>`:''}<div class="ccd-card-body">${item?`<p class="ccd-product-body">${esc(item.display?.body||'商品內容與折抵規則以商品詳情為準。')}</p>`:`<p class="ccd-unavailable">${esc(productReason(page))}</p>`}</div><div class="ccd-card-buttons"><button type="button" data-preview-page="${esc(page.id)}" data-select-field="product">${item?'查看商品':'商品目前不可用'}</button></div><footer class="ccd-card-footer">商品資訊由店家上架內容帶入；此處只預覽，不會開啟商品、下單或記錄點擊。</footer></article>`;
    }
    function syncSelection(){
      const index=config.pages.findIndex(page=>page.id===pageId);
      root.querySelector('[data-position]').textContent=`${index+1} / ${config.pages.length}`;
      root.querySelector('[data-previous]').disabled=index<=0;root.querySelector('[data-next]').disabled=index>=config.pages.length-1;
      root.querySelectorAll('[data-select-field]').forEach(node=>node.dataset.selected=String(node.dataset.previewPage===pageId&&node.dataset.selectField===selection));
      root.querySelectorAll('[data-list-page]').forEach(node=>node.dataset.active=String(node.dataset.listPage===pageId));
    }
    function renderProperties(){
      const page=selected(),box=root.querySelector('[data-properties]'),top=box.scrollTop;
      if(page.kind==='product'){
        const item=resolved(page);
        box.innerHTML=`<label>訊息替代文字<input name="altText" maxlength="120" value="${esc(config.altText)}"></label><label>整組主色<div class="ccd-color"><input type="color" name="themePicker" value="${color(config.themeColor)}" aria-label="選擇整組主色"><input type="text" name="themeColor" maxlength="7" value="${esc(config.themeColor)}" aria-label="整組主色色碼"></div></label><h4>第 ${config.pages.indexOf(page)+1} 頁 · 店家商品</h4><div data-product-info tabindex="-1" class="ccd-lock">商品名稱、價格、圖片與文案沿用店家資料，這裡不修改原商品或上架狀態。</div>${item?`<dl class="ccd-product-fields"><dt>店家</dt><dd>${esc(item.shopName)}</dd><dt>商品</dt><dd>${esc(item.display?.title||item.title)}</dd><dt>價格</dt><dd>${esc(price(item.priceCents))}</dd><dt>商品說明</dt><dd>${esc(item.display?.body||'依商品詳情為準')}</dd></dl>`:`<p class="ccd-unavailable">${esc(productReason(page))}</p><p class="ccd-note">失效引用可留在草稿；發布前請移除、替換或按「檢查 LINE 格式」重新核對。</p>`}<p class="ccd-note">預覽按鈕只選取商品來源，不會開啟商品或產生點擊紀錄。</p><button type="button" data-replace-product="${esc(page.id)}">更換這頁商品</button><button type="button" data-open-picker>調整商品勾選</button>`;
        box.scrollTop=top;syncToolbar();return;
      }
      box.innerHTML=`<label>訊息替代文字<input name="altText" maxlength="120" value="${esc(config.altText)}"></label><label>整組主色<div class="ccd-color"><input type="color" name="themePicker" value="${color(config.themeColor)}" aria-label="選擇整組主色"><input type="text" name="themeColor" maxlength="7" value="${esc(config.themeColor)}" aria-label="整組主色色碼"></div></label><h4>第 ${config.pages.indexOf(page)+1} 頁 · ${page.kind==='wallet'?'購物金首頁':'說明頁'}</h4><label>頁面標題<input name="title" maxlength="60" value="${esc(page.title)}"></label><label>說明文字<textarea name="body" rows="4" maxlength="600">${esc(page.body)}</textarea></label>${page.kind==='wallet'?'<div class="ccd-lock" data-dynamic-help>🔒 餘額與查詢時間由系統依會員資料帶入，這裡不填金額或打卡結果。首頁固定保留商城與明細兩個目的地。</div>':`<label>圖片網址（選填）<input type="url" name="heroImageUrl" maxlength="2000" placeholder="https://圖片網址" value="${esc(page.heroImageUrl)}"></label><p class="ccd-note">使用公開HTTPS圖片，固定2:1比例裁切。預覽只載入圖片，不開啟任何按鈕連結。</p>`}<h4>按鈕（${page.buttons.length}/${page.kind==='wallet'?2:3}）</h4>${page.buttons.map((button,index)=>`<section class="ccd-property-button" data-property-button="${esc(button.id)}" data-selected="${selection==='button:'+button.id}"><label>按鈕${index+1}文字<input name="buttonLabel" data-button-id="${esc(button.id)}" maxlength="20" value="${esc(button.label)}"></label><label>目的地<select name="buttonTarget" data-button-id="${esc(button.id)}"><option value="mall" ${button.target==='mall'?'selected':''}>商城</option><option value="details" ${button.target==='details'?'selected':''}>點數與購物金明細</option></select></label><div class="ccd-button-actions"><button type="button" data-button-action="up" data-button-id="${esc(button.id)}" ${index===0?'disabled data-locked="true"':''}>上移</button><button type="button" data-button-action="down" data-button-id="${esc(button.id)}" ${index===page.buttons.length-1?'disabled data-locked="true"':''}>下移</button>${page.kind==='info'?`<button type="button" class="ccd-danger" data-button-action="remove" data-button-id="${esc(button.id)}">移除</button>`:''}</div></section>`).join('')}${page.kind==='info'?`<button type="button" data-add-button ${page.buttons.length>=3?'disabled data-locked="true"':''}>＋ 新增按鈕</button>`:''}`;
      box.scrollTop=top;syncToolbar();
    }
    function alignSelectedPage(){
      const track=root.querySelector('[data-carousel]'),card=[...(track?.children||[])].find(node=>node.dataset.pageId===pageId);if(!card||!track.clientWidth||!card.getClientRects().length)return;
      const ticket=++alignment,selectedId=pageId;aligning=true;
      const place=()=>{const activeCard=[...track.children].find(node=>node.dataset.pageId===selectedId);if(!activeCard||!track.clientWidth||!activeCard.getClientRects().length)return;const trackBounds=track.getBoundingClientRect(),cardBounds=activeCard.getBoundingClientRect(),inset=Math.max(12,(track.clientWidth-cardBounds.width)/2);track.scrollTo({left:Math.max(0,track.scrollLeft+cardBounds.left-trackBounds.left-track.clientLeft-inset),behavior:'instant'});};
      place();requestAnimationFrame(()=>{if(!current()||ticket!==alignment)return;place();requestAnimationFrame(()=>{if(current()&&ticket===alignment)aligning=false;});});
    }
    function syncMobile(){root.querySelectorAll('[data-panel]').forEach(node=>node.dataset.mobileActive=String(node.dataset.panel===mobile));root.querySelectorAll('[data-mobile]').forEach(node=>node.setAttribute('aria-selected',String(node.dataset.mobile===mobile)));if(mobile==='preview')alignSelectedPage();}
    function selectPage(nextId,field='title',focus=false){
      if(!config.pages.some(page=>page.id===nextId))return;pageId=nextId;selection=field;renderProperties();syncSelection();
      alignSelectedPage();
      if(focus){if(matchMedia('(max-width:900px)').matches){mobile='properties';syncMobile();}const input=selected().kind==='product'?root.querySelector('[data-product-info]'):field.startsWith('button:')?[...root.querySelectorAll('[name=buttonLabel]')].find(node=>node.dataset.buttonId===field.slice(7)):root.querySelector('[name="'+field+'"]');if(input){input.focus({preventScroll:true});}else root.querySelector('[data-dynamic-help]')?.scrollIntoView({block:'nearest'});}
    }
    function closePicker(restoreFocus=true){
      if(!picker)return;const previous=picker;picker=null;previous.productSequence++;previous.shopSequence++;previous.dialog.close();previous.dialog.remove();
      if(restoreFocus&&current()&&previous.opener?.isConnected)previous.opener.focus({preventScroll:true});
    }
    const pickerCurrent=p=>current()&&picker===p&&p.dialog.isConnected;
    function pickerError(p,error){
      if(!pickerCurrent(p))return;
      if([401,403].includes(error.status)){controller.dispose();root.textContent='管理權限或登入已變更，請重新登入。';return;}
      p.dialog.querySelector('[data-picker-status]').textContent=error.message||'商品暫時無法載入；原勾選仍保留。';
    }
    function syncPicker(p){
      if(!pickerCurrent(p))return;
      const nonProducts=config.pages.filter(page=>page.kind!=='product').length,capacity=p.targetPageId?1:12-nonProducts;
      p.dialog.querySelector('[data-picker-count]').textContent=p.targetPageId?`本頁勾選 ${p.chosen.size} / 1 件`:`已勾選 ${p.chosen.size} 件商品 · 可放 ${capacity} 件（其他頁 ${nonProducts} / 總上限12頁）`;
      const total=p.targetPageId?config.pages.length:nonProducts+p.chosen.size;
      p.dialog.querySelector('[data-picker-apply]').disabled=p.loadingProducts||p.loadingShops||total<2||total>12||(p.targetPageId&&p.chosen.size!==1);
      p.dialog.querySelectorAll('[data-picker-choice]').forEach(node=>{const key=node.dataset.pickerChoice;node.checked=p.chosen.has(key);node.disabled=p.otherKeys.has(key)||(!node.checked&&p.chosen.size>=capacity&&!p.targetPageId);node.closest('label').dataset.checked=String(node.checked);});
      p.dialog.querySelector('[data-picker-more]').hidden=!p.next;p.dialog.querySelector('[data-picker-more]').disabled=p.loadingProducts;
      p.dialog.querySelector('[data-picker-more-shops]').hidden=!p.shopNext;p.dialog.querySelector('[data-picker-more-shops]').disabled=p.loadingShops;
      const chips=p.dialog.querySelector('[data-picker-selected]');chips.innerHTML=[...p.chosen].map(([key,ref])=>`<span>${esc(products.get(key)?.title||'既有商品 '+ref.productId.slice(0,8))}<button type="button" data-picker-remove="${esc(key)}" aria-label="取消勾選${esc(products.get(key)?.title||ref.productId)}">×</button></span>`).join('')||'<small>尚未勾選商品；只會調整商品頁，購物金與自訂說明頁會保留。</small>';
    }
    function renderPickerProducts(p){
      if(!pickerCurrent(p))return;
      const box=p.dialog.querySelector('[data-picker-products]');
      box.innerHTML=p.items.map(item=>{const key=productKey(item),photo=imageUrl(item.display?.heroImageUrl||item.imageUrl);return `<label class="ccd-picker-product"><input type="checkbox" data-picker-choice="${esc(key)}"><span class="ccd-picker-photo">${photo?`<img src="${esc(photo)}" alt="商品圖片" referrerpolicy="no-referrer">`:'商品'}</span><span class="ccd-picker-copy"><strong>${esc(item.title||item.display?.title||'店家商品')}</strong><small>${esc(item.shopName||'店家')}</small><b>${esc(price(item.priceCents))}</b>${p.otherKeys.has(key)?'<small>此商品已在其他頁，請選擇不同商品。</small>':''}</span></label>`;}).join('')||(p.loadingProducts?'<p class="ccd-note">商品載入中…</p>':'<p class="ccd-note">沒有符合條件的已公開上架商品。</p>');syncPicker(p);
    }
    async function loadPickerProducts(p,append=false){
      if(!pickerCurrent(p))return;const ticket=++p.productSequence;p.loadingProducts=true;if(!append){p.items=[];p.next='';}renderPickerProducts(p);
      p.dialog.querySelector('[data-picker-status]').textContent='讀取公開上架商品…';
      try{
        const query=new URLSearchParams({view:'products',shop:p.shop,q:p.query,after:append?p.next:''});
        const result=await api('/catalog?'+query,{method:'GET'});if(!pickerCurrent(p)||ticket!==p.productSequence)return;
        if(result?.success!==true||!Array.isArray(result.products))throw Error('商品清單格式不完整');
        const items=result.products.filter(item=>shopId(item?.shopId)&&productId(item?.productId));readProducts({products:items});
        p.items=[...new Map([...(append?p.items:[]),...items].map(item=>[productKey(item),item])).values()];p.next=String(result.next||'');
        p.dialog.querySelector('[data-picker-status]').textContent=`本次顯示 ${p.items.length} 件已上架商品；勾選不會修改原商品。`;
      }catch(error){if(ticket===p.productSequence)pickerError(p,error);}
      finally{if(pickerCurrent(p)&&ticket===p.productSequence){p.loadingProducts=false;renderPickerProducts(p);}}
    }
    async function loadPickerShops(p,append=false){
      if(!pickerCurrent(p))return;const ticket=++p.shopSequence;p.loadingShops=true;syncPicker(p);
      try{
        const query=new URLSearchParams({view:'shops',after:append?p.shopNext:''});const result=await api('/catalog?'+query,{method:'GET'});
        if(!pickerCurrent(p)||ticket!==p.shopSequence)return;if(result?.success!==true||!Array.isArray(result.shops))throw Error('店家清單格式不完整');
        p.shops=[...new Map([...(append?p.shops:[]),...result.shops.filter(row=>shopId(row?.id))].map(row=>[row.id,row])).values()];p.shopNext=String(result.next||'');
        const select=p.dialog.querySelector('[data-picker-shop]');select.innerHTML='<option value="">全部公開店家</option>'+p.shops.map(row=>`<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('');select.value=p.shop;
      }catch(error){if(ticket===p.shopSequence)pickerError(p,error);}
      finally{if(pickerCurrent(p)&&ticket===p.shopSequence){p.loadingShops=false;syncPicker(p);}}
    }
    async function openPicker(targetPageId=''){
      if(busy||!current()||!config)return;closePicker(false);
      const target=config.pages.find(page=>page.id===targetPageId&&page.kind==='product');if(targetPageId&&!target)return;
      const refs=config.pages.filter(page=>page.kind==='product');
      const chosen=new Map((target?[target]:refs).map(page=>[productKey(page),{shopId:page.shopId,productId:page.productId}]));
      const dialog=document.createElement('dialog');dialog.className='ccd-picker';dialog.dataset.productPicker='';dialog.setAttribute('aria-label',target?'更換這頁商品':'從店家商品挑選');
      dialog.innerHTML=`<header><div><h3>${target?'更換這頁商品':'從店家商品挑選'}</h3><p>${target?'勾選一件商品替換來源；這一頁的位置與編號會保留。':'勾選商品加入多頁卡片；取消既有勾選會移除該商品頁。'}</p></div><button type="button" data-picker-close aria-label="關閉商品選取">×</button></header><form class="ccd-picker-filters"><label>店家<select data-picker-shop name="pickerShop"><option value="">全部公開店家</option></select></label><label>商品關鍵字<input name="pickerQuery" maxlength="80" placeholder="搜尋商品或店家名稱"></label><button type="submit">搜尋商品</button><button type="button" data-picker-more-shops hidden>載入更多店家</button></form><p class="ccd-picker-status" data-picker-status role="status" aria-live="polite"></p><div class="ccd-picker-selected" data-picker-selected></div><div class="ccd-picker-results" data-picker-products></div><div class="ccd-picker-more"><button type="button" data-picker-more hidden>載入更多商品</button></div><footer><p data-picker-count></p><div><button type="button" data-picker-close>取消</button><button type="button" class="ccd-primary" data-picker-apply>${target?'套用這件商品':'套用選取'}</button></div></footer>`;
      const p={dialog,opener:document.activeElement,targetPageId,chosen,otherKeys:new Set(target?refs.filter(page=>page.id!==targetPageId).map(productKey):[]),shop:'',query:'',items:[],shops:[],next:'',shopNext:'',loadingProducts:false,loadingShops:false,productSequence:0,shopSequence:0};picker=p;root.append(dialog);dialog.showModal();
      dialog.addEventListener('cancel',event=>{event.preventDefault();closePicker();});
      dialog.querySelector('form').addEventListener('submit',event=>{event.preventDefault();if(!pickerCurrent(p))return;p.query=dialog.querySelector('[name=pickerQuery]').value.trim();void loadPickerProducts(p);});
      syncPicker(p);await Promise.all([loadPickerShops(p),loadPickerProducts(p)]);
    }
    function applyPicker(){
      const p=picker;if(!p||!pickerCurrent(p)||p.loadingProducts||p.loadingShops)return;
      let pages,focusId=pageId;
      if(p.targetPageId){
        if(p.chosen.size!==1)return;const ref=[...p.chosen.values()][0];if(p.otherKeys.has(productKey(ref)))return;
        pages=config.pages.map(page=>page.id===p.targetPageId?{id:page.id,kind:'product',shopId:ref.shopId,productId:ref.productId}:page);focusId=p.targetPageId;
      }else{
        pages=config.pages.filter(page=>page.kind!=='product'||p.chosen.has(productKey(page)));
        const kept=new Set(pages.filter(page=>page.kind==='product').map(productKey));let firstNew='';
        for(const [key,ref]of p.chosen)if(!kept.has(key)){const page={id:id('product'),kind:'product',shopId:ref.shopId,productId:ref.productId};pages.push(page);kept.add(key);if(!firstNew)firstNew=page.id;}
        if(firstNew)focusId=firstNew;else if(!pages.some(page=>page.id===focusId))focusId=pages[Math.min(config.pages.findIndex(page=>page.id===pageId),pages.length-1)]?.id;
      }
      try{validate({...config,pages});}catch(error){p.dialog.querySelector('[data-picker-status]').textContent=error.message;return;}
      config.pages=pages;pageId=focusId||pages[0].id;selection=selected().kind==='product'?'product':'title';closePicker(false);renderPageList();renderProperties();changed();selectPage(pageId,selection);status('商品選取已套用到本機草稿；儲存並發布後才會顯示。');
    }
    function changed(){conflict=false;renderPreview();syncToolbar();root.querySelector('[data-reload]').textContent='重新載入（捨棄本機修改）';}
    function newInfo(){return {id:id('page'),kind:'info',title:'新說明頁',body:'請輸入本頁說明。',heroImageUrl:'',buttons:[]};}
    function accept(result){
      const template=result?.template;if(result?.success!==true||!template||!Number.isSafeInteger(template.draftRevision)||!Number.isSafeInteger(template.publishedRevision))throw Error('卡片版本資料不完整');
      validate(template.draftConfig);readProducts(result,true);config=clone(template.draftConfig);saved=JSON.stringify(config);published=template.publishedConfig?JSON.stringify(template.publishedConfig):'';draftRevision=template.draftRevision;publishedRevision=template.publishedRevision;
      if(!config.pages.some(page=>page.id===pageId))pageId=config.pages[0].id;conflict=false;
    }
    async function operation(kind){
      if(busy||!current()||!config)return;let snapshot;
      try{snapshot=clone(validate(config));}catch(error){status(error.message,true);return;}
      if(kind==='publish'&&dirty()){status('請先儲存草稿，再發布。',true);return;}
      const body=kind==='draft'?{expectedDraftRevision:draftRevision,config:snapshot}:kind==='publish'?{expectedDraftRevision:draftRevision,expectedPublishedRevision:publishedRevision}:{config:snapshot};
      if(kind!=='preview'){const fingerprint=kind+JSON.stringify(body);if(!requestKeys.has(fingerprint))requestKeys.set(fingerprint,crypto.randomUUID());body.requestKey=requestKeys.get(fingerprint);}
      const ticket=++sequence;busy=true;syncToolbar();status(kind==='draft'?'草稿儲存中…':kind==='publish'?'發布中…':'LINE格式檢查中…');
      try{
        const result=await api('/'+kind,{method:'POST',body});if(!current()||ticket!==sequence)return;
        if(kind==='preview'){if(result?.success!==true||!result.message)throw Error('LINE格式檢查尚未完成');readProducts(result,true);renderPageList();renderPreview();renderProperties();status(unavailable()?'LINE格式已檢查；部分商品目前不可用，請移除或更換後再發布。':'LINE格式檢查通過，未儲存或發送訊息。',unavailable());}
        else {accept(result);requestKeys.clear();renderPageList();renderPreview();renderProperties();status(kind==='draft'?'草稿已儲存，尚未發布。':'卡片已發布；後續會員打卡將使用此版本。');}
      }catch(error){
        if(!current()||ticket!==sequence)return;
        if(error.status===401||error.status===403){controller.dispose();root.textContent='管理權限或登入已變更，請重新登入。';return;}
        if(error.code==='REVISION_CONFLICT'){conflict=true;status('內容版本已更新；你的本機編輯仍保留，這次沒有覆寫其他版本。',true);}
        else if(['PRODUCT_UNAVAILABLE','PRODUCT_CHANGED'].includes(error.code)){readProducts(error);renderPageList();renderPreview();renderProperties();status((error.message||'商品資料已變更')+'；本機內容已保留，請按「檢查 LINE 格式」重新核對商品。',true);}
        else status(error.name==='TimeoutError'||error.name==='AbortError'?'操作逾時；本機內容已保留。可用相同內容重試，或重新載入核對結果。':/Failed to fetch|NetworkError/i.test(error.message||'')?'網路連線中斷；本機內容已保留，可用相同內容重試。':error.message||'暫時無法完成，本機內容已保留。',true);
      }finally{busy=false;if(current()&&ticket===sequence)syncToolbar();}
    }
    async function load(){
      if(busy||!current())return;busy=true;const ticket=++sequence;
      if(config)syncToolbar();
      try{const result=await api('',{method:'GET'});if(!current()||ticket!==sequence)return;accept(result);shell();status('已載入草稿。發布前可先檢查LINE格式。');}
      catch(error){if(!current()||ticket!==sequence)return;if(!config){root.innerHTML='<div class="ccd-loader"><p data-status role="alert"></p><button type="button" data-reload>重新讀取卡片設定</button></div>';}status(error.message||'設定暫時無法載入',true);if([401,403].includes(error.status)){controller.dispose();root.textContent='僅限管理員 LINE 帳號編輯。';}}
      finally{busy=false;if(current()&&config)syncToolbar();resolveReady();}
    }
    listen('input',event=>{
      if(busy||!current()||!config)return;const node=event.target,page=selected(),name=node.name;
      if(name==='altText')config.altText=node.value;
      else if(name==='themeColor'||name==='themePicker'){config.themeColor=node.value;const peer=root.querySelector('[name="'+(name==='themeColor'?'themePicker':'themeColor')+'"]');if(peer)peer.value=name==='themeColor'?color(node.value):node.value;}
      else if(page.kind==='product')return;
      else if(['title','body','heroImageUrl'].includes(name)){page[name]=node.value;if(name==='title'){const label=root.querySelector('[data-list-page="'+page.id+'"] strong');if(label)label.textContent=node.value||'未命名頁面';}}
      else if(name==='buttonLabel'){const button=page.buttons.find(b=>b.id===node.dataset.buttonId);if(button)button.label=node.value;}
      else return;changed();
    });
    listen('change',event=>{
      if(picker&&pickerCurrent(picker)){
        const p=picker,node=event.target;
        if(node.hasAttribute('data-picker-shop')){p.shop=node.value;p.query=p.dialog.querySelector('[name=pickerQuery]').value.trim();void loadPickerProducts(p);return;}
        if(node.hasAttribute('data-picker-choice')){
          const key=node.dataset.pickerChoice,item=p.items.find(item=>productKey(item)===key);if(!item||p.otherKeys.has(key))return;
          if(!node.checked)p.chosen.delete(key);
          else if(p.targetPageId){p.chosen.clear();p.chosen.set(key,{shopId:item.shopId,productId:item.productId});}
          else if(p.chosen.has(key)||p.chosen.size<12-config.pages.filter(page=>page.kind!=='product').length)p.chosen.set(key,{shopId:item.shopId,productId:item.productId});
          syncPicker(p);return;
        }
      }
      if(busy||!current()||!config||event.target.name!=='buttonTarget')return;
      const page=selected(),button=page.buttons?.find(b=>b.id===event.target.dataset.buttonId);if(!button)return;
      const previous=button.target;button.target=event.target.value;if(page.kind==='wallet'){const other=page.buttons.find(b=>b.id!==button.id);if(other?.target===button.target)other.target=previous;renderProperties();}changed();
    });
    listen('click',event=>{
      const button=event.target.closest('button');if(!button||!root.contains(button)||button.disabled||!current())return;
      if(button.closest('[data-product-picker]')){
        const p=picker;if(!p||!pickerCurrent(p))return;
        if(button.hasAttribute('data-picker-close'))closePicker();
        else if(button.hasAttribute('data-picker-apply'))applyPicker();
        else if(button.hasAttribute('data-picker-more'))void loadPickerProducts(p,true);
        else if(button.hasAttribute('data-picker-more-shops'))void loadPickerShops(p,true);
        else if(button.dataset.pickerRemove){p.chosen.delete(button.dataset.pickerRemove);syncPicker(p);}
        return;
      }
      if(button.dataset.mobile){mobile=button.dataset.mobile;syncMobile();return;}
      if(button.hasAttribute('data-reload')){void load();return;}
      if(!config)return;
      if(button.hasAttribute('data-open-picker')){void openPicker();return;}
      if(button.dataset.replaceProduct){void openPicker(button.dataset.replaceProduct);return;}
      if(button.hasAttribute('data-save')){void operation('draft');return;}if(button.hasAttribute('data-publish')){void operation('publish');return;}if(button.hasAttribute('data-preview-check')){void operation('preview');return;}
      if(button.dataset.selectPage){selectPage(button.dataset.selectPage);return;}if(button.dataset.selectField){selectPage(button.dataset.previewPage,button.dataset.selectField,true);return;}
      const index=config.pages.findIndex(page=>page.id===pageId);
      if(button.hasAttribute('data-previous')||button.hasAttribute('data-next')){const next=index+(button.hasAttribute('data-next')?1:-1);if(config.pages[next])selectPage(config.pages[next].id);return;}
      if(busy)return;
      if(button.hasAttribute('data-add-page')){if(config.pages.length>=12)return;const page=newInfo();config.pages.push(page);pageId=page.id;selection='title';renderPageList();renderProperties();changed();selectPage(pageId);return;}
      if(button.dataset.movePage){const at=config.pages.findIndex(page=>page.id===button.dataset.movePage),to=at+Number(button.dataset.offset);if(at<1||to<1||to>=config.pages.length)return;const page=config.pages.splice(at,1)[0];config.pages.splice(to,0,page);renderPageList();changed();selectPage(pageId);return;}
      if(button.dataset.removePage){const at=config.pages.findIndex(page=>page.id===button.dataset.removePage);if(at<1||config.pages.length<=2)return;config.pages.splice(at,1);if(pageId===button.dataset.removePage)pageId=config.pages[Math.min(at,config.pages.length-1)].id;renderPageList();renderProperties();changed();return;}
      const page=selected();if(button.hasAttribute('data-add-button')){if(page.kind!=='info'||page.buttons.length>=3)return;const next={id:id('button'),label:'前往商城',target:'mall'};page.buttons.push(next);selection='button:'+next.id;renderProperties();changed();return;}
      if(button.dataset.buttonAction){const at=page.buttons.findIndex(b=>b.id===button.dataset.buttonId),action=button.dataset.buttonAction;if(at<0)return;if(action==='remove'&&page.kind==='info')page.buttons.splice(at,1);else{const to=at+(action==='up'?-1:1);if(to<0||to>=page.buttons.length)return;const item=page.buttons.splice(at,1)[0];page.buttons.splice(to,0,item);}renderProperties();changed();}
    });
    await load();return controller;
  };
  window.loadAdminCheckinChatDashboard=async function(){
    const root=document.getElementById('checkin-chat-dashboard-content'),tab=document.getElementById('tab-checkin-chat-dashboard');if(!root||!tab)return;
    const role=()=>typeof adminRole!=='undefined'?adminRole:window.userRole;
    const accessToken=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
    if(role()!=='admin'||!accessToken){controllers.get(root)?.dispose();root.textContent='僅限管理員 LINE 帳號編輯。';return;}
    const previous=controllers.get(root);if(previous?.isValid()){previous.resume();window.adminCheckinChatDashboardController=previous;await previous.ready;return;}
    previous?.dispose();
    const current=()=>role()==='admin'&&window.liff?.isLoggedIn?.()&&window.liff.getAccessToken()===accessToken;
    const base=String(typeof WORKER_URL!=='undefined'?WORKER_URL:window.Config?.WORKER_URL||'').replace(/\/+$/,'');
    const api=async(path='',{method='GET',body}={})=>{
      if(!current()||tab.classList.contains('hidden'))throw Error('登入或頁面已變更，請回到編輯器再試。');
      const response=await fetch(base+'/v1/checkin-chat-dashboard'+path,{method,headers:{Authorization:'Bearer '+accessToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});
      const data=await response.json();if(!current())throw Error('登入已變更');if(!response.ok||data?.success!==true){const error=new Error(data?.error||'設定暫時無法完成');Object.assign(error,{status:response.status,code:data?.code,products:data?.products,unavailableProducts:data?.unavailableProducts});throw error;}return data;
    };
    const mounting=window.mountCheckinChatDashboard(root,{api,isCurrent:current});window.adminCheckinChatDashboardController=controllers.get(root);return await mounting;
  };
})();
