(function() {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusText = status => ({draft:'草稿',active:'已上架',archived:'已封存'}[status] || status);
  const categories = ['食','宿','遊','購','行','服務','製造'];
  function categoryTags(scope, selected='') {
    return `<div class="shop-category-tags" role="group" aria-label="商品分類篩選">${['',...categories].map(c=>`<button type="button" data-do="category" data-scope="${scope}" data-category="${c}" aria-pressed="${c===selected}">${c||'全部'}</button>`).join('')}</div>`;
  }
  function photo(url, cover=false) {
    try { if (new URL(url).protocol !== 'https:') return ''; } catch { return ''; }
    return `<img src="${esc(url)}" class="${cover?'shop-cover':''}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  function policy(p) {
    if(p.redeem_type==='fixed') return `預設最多折抵 ${p.redeem_value} 點`;
    if(p.redeem_type==='percent') return `預設最高折抵 ${p.redeem_value}%`;
    return p.redeem_type==='full'?'預設可全額折抵':'不提供點數折抵';
  }
  async function prepareImage(file) {
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('請選擇 JPG、PNG 或 WebP 圖片；HEIC 請先轉成 JPG');
    if(!file.size || file.size>10*1024*1024) throw new Error('圖片須小於 10MB，且不可為空檔案');
    const url=URL.createObjectURL(file), image=new Image();
    try {
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{image.onload=image.onerror=null;reject(new Error('圖片讀取逾時，請重新選擇'));},15000);
        image.onload=()=>{clearTimeout(timer);resolve();};
        image.onerror=()=>{clearTimeout(timer);reject(new Error('無法讀取圖片，請選擇有效的 JPG、PNG 或 WebP'));};
        image.src=url;
      });
      const width=image.naturalWidth,height=image.naturalHeight;
      if(!width||!height||width*height>40000000) throw new Error('圖片尺寸過大，請縮小後再上傳');
      const scale=Math.min(1,1600/Math.max(width,height));
      const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(width*scale)); canvas.height=Math.max(1,Math.round(height*scale));
      const context=canvas.getContext('2d'); if(!context) throw new Error('裝置無法處理圖片，請改用圖片網址');
      context.fillStyle='#fff'; context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(image,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',0.9);
      if(!data.startsWith('data:image/jpeg;base64,')||data.length>Math.ceil(4*1024*1024*4/3)+32) throw new Error('圖片處理後仍過大，請縮小後再上傳');
      return data;
    } finally { URL.revokeObjectURL(url); }
  }
  function mount(root, standalone, productId='', qrToken='', memberProduct='') {
    let shop=null, items=[], epoch=0, busy=false;
    let listCategory='', listQuery='';
    root.classList.add('store-shop');
    root.innerHTML = `<nav class="shop-bar" aria-label="商城導覽"><button data-do="exit">返回首頁</button><button data-do="list">店家列表</button>${standalone?'':'<button data-do="manage" class="primary">我的商城管理</button>'}</nav><h1>店家商城</h1><p class="shop-notice">店家可掃商品 QR 進入共用點數扣抵；須登入、確認顧客與折抵點數，才會送出交易。</p><p role="alert" aria-live="polite"></p><section class="shop-content"></section>`;
    const content=root.querySelector('.shop-content'), alert=root.querySelector('[role=alert]');
    const base=String(root.dataset.worker||window.Config?.WORKER_URL||'').replace(/\/+$/,'');
    async function api(path='',data,privateRead=false) {
      if(!base) throw new Error('商城服務網址尚未設定');
      const headers={};
      if(data || privateRead) {
        const token=window.liff?.isLoggedIn?.() ? window.liff.getAccessToken() : '';
        if(!token) throw new Error('請從登入後的首頁開啟「我的商城管理」');
        headers.Authorization=`Bearer ${token}`;
      }
      if(data) headers['Content-Type']='application/json';
      const response=await fetch(`${base}/v1/store-shop${path}`,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok||!result.success) throw new Error(result.error||'商城操作失敗');
      return result;
    }
    function shopLink(id) { const url=new URL('store-shop.html',location.href); url.searchParams.set('shop',id); return url.href; }
    function product(p,edit=false) {
      return `<article data-product-category="${esc(p.category||'')}">${photo(p.image_url)}<h3>${esc(p.title)}</h3><span class="shop-category-badge">${esc(p.category||'未分類')}</span><p class="shop-price">NT$ ${(Number(p.price_cents)/100).toLocaleString('zh-TW')}</p><p>${esc(p.description)}</p><p class="shop-meta">${esc(policy(p))}</p>${edit?`<p>${esc(statusText(p.status))}</p>`:''}<div class="shop-product-footer">${edit?`<button data-do="edit" data-id="${esc(p.id)}">編輯商品</button>`:''}<div class="shop-product-qr"><button type="button" data-do="member-qr" data-product-qr data-id="${esc(p.id)}">出示本人 QR</button></div></div></article>`;
    }
    async function list(after='',q='',category='') {
      const version=++epoch; alert.textContent=''; content.innerHTML='<p role="status">載入店家中…</p>';
      const result=await api(`?after=${encodeURIComponent(after)}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}`);
      if(version!==epoch) return;
      listCategory=category; listQuery=q;
      content.innerHTML=`<form data-form="search" class="shop-row"><input name="q" aria-label="搜尋店名、類別或地址" placeholder="搜尋店名、類別或地址" value="${esc(q)}" maxlength="80"><button class="primary">搜尋</button></form><p class="shop-meta">${result.shops.length} 家店家</p><div class="shop-grid">${result.shops.map(s=>`<article>${photo(s.image_url)}<h2>${esc(s.name)}</h2><p class="shop-meta">${esc(s.category)} · ${esc(s.address)}</p><p>${esc(s.description)}</p><button class="primary" data-do="view" data-id="${esc(s.id)}">進入商城</button></article>`).join('')}</div>${result.shops.length?'':'<p>目前沒有符合條件的已上架店家。</p>'}${result.next?`<button data-do="next" data-id="${esc(result.next)}" data-query="${esc(q)}">下一頁</button>`:''}`;
      content.insertAdjacentHTML('afterbegin',categoryTags('shops',category));
    }
    function filterProducts(category) {
      const cards=[...content.querySelectorAll('[data-product-category]')];
      cards.forEach(card=>card.hidden=!!category&&card.dataset.productCategory!==category);
      content.querySelectorAll('[data-scope="products"]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.category===category)));
      const empty=content.querySelector('.shop-category-empty');
      if(empty) empty.hidden=cards.some(card=>!card.hidden);
    }
    function addProductTags() {
      const grid=content.querySelector('.shop-grid'); if(!grid) return;
      grid.insertAdjacentHTML('beforebegin',categoryTags('products'));
      grid.insertAdjacentHTML('afterend','<p class="shop-category-empty" role="status" hidden>此分類目前沒有商品。</p>');
    }
    async function view(id,category='') {
      const version=++epoch; alert.textContent=''; content.innerHTML='<p role="status">載入店面中…</p>';
      const result=await api(`?shop=${encodeURIComponent(id)}`); if(version!==epoch) return;
      const s=result.shop;
      const details=[s.category,s.address,s.phone,s.hours].filter(Boolean).join('\n');
      content.innerHTML=`<article>${photo(s.image_url,true)}<h2>${esc(s.name)}</h2><p>${esc(s.description)}</p>${details?`<p class="shop-meta">${esc(details)}</p>`:''}<button data-do="copy" data-id="${esc(s.id)}">複製商城網址</button></article><h2>商品與服務</h2><div class="shop-grid">${result.products.map(p=>product(p)).join('')}</div>${result.products.length?'':'<p>店家尚未上架商品。</p>'}`;
      addProductTags(); if(category) filterProducts(category);
    }
    function input(key,label,value='',max=200,multiline=false,type='text') {
      return `<label>${label}${multiline?`<textarea name="${key}" maxlength="${max}">${esc(value)}</textarea>`:`<input name="${key}" type="${type}" maxlength="${max}" value="${esc(value)}" ${['name','title','price'].includes(key)?'required':''} ${type==='number'?'min="0" step="0.01"':''}>`}</label>`;
    }
    function select(key,label,options,value) {
      return `<label>${label}<select name="${key}">${options.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
    }
    function storeCategorySelect(value='') {
      const options=[['','未分類'],...categories.map(c=>[c,c])];
      if(value&&!categories.includes(value)) options.push([value,`${value}（原分類）`]);
      return select('category','店面分類',options,value||'');
    }
    function imageInput(label,value) {
      return `<div class="shop-image-field"><p>${label}</p><button type="button" data-do="upload-image" class="primary">上傳圖片</button><input type="file" class="shop-image-file" accept="image/jpeg,image/png,image/webp" hidden><p class="shop-meta">支援 JPG／PNG／WebP，最大 10MB。圖片會等比縮小，不裁切；上傳素材可公開存取，儲存後才更新店面或商品。</p><p class="shop-image-status" role="status"></p><div class="shop-upload-preview">${value?photo(value):''}</div><details><summary>進階：使用圖片網址</summary>${input('image_url','圖片 HTTPS 網址',value,2048,false,'url')}</details></div>`;
    }
    function renderManage() {
      const s=shop||{};
      content.innerHTML=`<h2>我的店面</h2><p>只有按「儲存店面」才會建立或更新。草稿不對外顯示。</p><form data-form="store" class="shop-box" data-version="${s.version||0}">${input('name','店家名稱 *',s.name,80)}${input('description','店家介紹',s.description,2000,true)}${storeCategorySelect(s.category)}${input('address','地址',s.address,200)}${input('phone','聯絡電話',s.phone,40)}${input('hours','營業時間',s.hours,200)}${imageInput('店面封面圖片',s.image_url)}${select('status','公開狀態',[['draft','草稿／暫不公開'],['active','公開店面']],s.status||'draft')}<button class="primary">儲存店面</button></form>${shop?`<div class="shop-row"><button data-do="view" data-id="${esc(shop.id)}" ${shop.status!=='active'?'disabled':''}>查看公開店面</button><button data-do="copy" data-id="${esc(shop.id)}">複製商城網址</button><button data-do="new" class="primary">新增商品</button></div><h2>商品管理（${items.length}/100）</h2><div class="shop-editor"></div><div class="shop-grid">${items.map(p=>product(p,true)).join('')}</div>`:'<p>儲存店面後即可新增商品。</p>'}`;
      addProductTags();
    }
    async function manage() {
      const version=++epoch; alert.textContent=''; content.innerHTML='<p role="status">驗證店家身分中…</p>';
      const result=await api('/manage',null,true); if(version!==epoch) return;
      shop=result.shop; items=result.products; renderManage();
    }
    function edit(p={}) {
      const editor=content.querySelector('.shop-editor'); if(!editor) return;
      editor.innerHTML=`<form data-form="product" class="shop-box" data-id="${esc(p.id||'')}" data-version="${p.version||0}"><h2>${p.id?'編輯':'新增'}商品</h2>${input('title','商品名稱 *',p.title,100)}${input('description','商品／服務說明',p.description,3000,true)}${imageInput('商品圖片',p.image_url)}${input('price','價格（NT$）*',p.price_cents===undefined?'':(p.price_cents/100),20,false,'number')}${select('redeem_type','點數折抵政策',[['none','不折抵'],['fixed','最多折抵指定點數'],['percent','最高折抵商品金額百分比'],['full','可全額折抵']],p.redeem_type||'none')}${input('redeem_value','折抵上限（點數或百分比；不折抵／全額請填 0）',p.redeem_value||0,10,false,'number')}${select('status','商品狀態',[['draft','草稿'],['active','上架'],...(p.id?[['archived','封存（不刪除紀錄）']]:[])],p.status||'draft')}<div class="shop-row"><button class="primary">儲存商品</button><button type="button" data-do="cancel">取消</button></div></form>`;
      editor.scrollIntoView({block:'start',behavior:'smooth'});
      editor.querySelector('[name="description"]').closest('label').insertAdjacentHTML('beforebegin',select('category','商品分類',[['','未分類'],...categories.map(c=>[c,c])],p.category||''));
      editor.querySelector('form').dataset.requestKey=crypto.randomUUID();
    }
    async function run(job) {
      try { await job(); } catch(error) { alert.textContent=error.name==='TimeoutError'?'連線逾時；若剛儲存，請重新載入確認結果，勿連續重送。':error.message; }
    }
    root.onclick=event=>{
      const button=event.target.closest('[data-do]'); if(!button||!root.contains(button)||busy) return;
      void run(async()=>{
        switch(button.dataset.do) {
          case 'exit': ++epoch; standalone?location.assign(new URL('index.html',location.href).href):window.goPage('home'); break;
          case 'list': await list(); break;
          case 'next': await list(button.dataset.id,button.dataset.query,listCategory); break;
          case 'category':
            if(button.dataset.scope==='shops') await list('',content.querySelector('[name="q"]')?.value??listQuery,button.dataset.category);
            else filterProducts(button.dataset.category);
            break;
          case 'view': await view(button.dataset.id,button.closest('.shop-grid')&&!content.querySelector('.shop-editor')?listCategory:''); break;
          case 'manage': await manage(); break;
          case 'member-qr': {
            const id=button.dataset.id;
            if(standalone||!window.liff?.isLoggedIn?.()) {
              const url=new URL('https://liff.line.me/'+(window.DEFAULT_LIFF_ID||'1660923784-vViMTZ1y'));
              url.searchParams.set('memberProduct',id);location.assign(url.href);break;
            }
            const target=button.parentElement;
            const module=await import('./member-product-qr.js?v=1');
            if(root.contains(target))await module.showMemberProductQr(target,id,()=>root.isConnected);
            break;
          }
          case 'new': edit(); break;
          case 'edit': edit(items.find(p=>p.id===button.dataset.id)); break;
          case 'cancel': content.querySelector('.shop-editor').innerHTML=''; break;
          case 'upload-image': button.closest('.shop-image-field').querySelector('input[type=file]').click(); break;
          case 'copy': await navigator.clipboard.writeText(shopLink(button.dataset.id)); alert.textContent='已複製商城網址'; break;
        }
      });
    };
    root.onchange=event=>{
      const picker=event.target;
      if(!picker.matches('.shop-image-file')||busy) return;
      const file=picker.files?.[0]; if(!file) return;
      const field=picker.closest('.shop-image-field'),form=picker.closest('form');
      const status=field.querySelector('.shop-image-status');
      const controls=[...root.querySelectorAll('button,input,select,textarea')];
      const disabled=controls.map(control=>control.disabled);
      busy=true; controls.forEach(control=>control.disabled=true); alert.textContent=''; status.textContent='處理圖片中…';
      void run(async()=>{
        try {
          const data=await prepareImage(file);
          await api('/manage',null,true);
          if(typeof window.fetchAPI!=='function') throw new Error('上傳服務尚未就緒，請重新開啟商城');
          status.textContent='上傳圖片中…';
          const result=await window.fetchAPI('uploadImageToR2',{base64Image:data},true);
          if(!result?.success||!result.url) throw new Error(result?.error||'圖片上傳失敗，原圖保持不變，請重試');
          const uploaded=new URL(result.url);
          if(uploaded.protocol!=='https:'||uploaded.username||uploaded.password) throw new Error('上傳服務回傳的圖片網址無效');
          if(!root.contains(form)) return;
          form.elements.image_url.value=uploaded.href;
          field.querySelector('.shop-upload-preview').innerHTML=photo(uploaded.href);
          status.textContent='圖片已上傳，請按儲存以更新店面或商品。';
        } catch(error) {
          status.textContent='未更新圖片：'+error.message;
          throw error;
        } finally {
          busy=false; picker.value=''; controls.forEach((control,i)=>control.disabled=disabled[i]);
        }
      });
    };
    root.onsubmit=event=>{
      const form=event.target.closest('[data-form]'); if(!form) return; event.preventDefault(); if(busy) return;
      const data=Object.fromEntries(new FormData(form));
      if(form.dataset.form==='search') { void run(()=>list('',data.q,listCategory)); return; }
      busy=true; alert.textContent=''; const buttons=[...root.querySelectorAll('button')]; const disabled=buttons.map(b=>b.disabled); buttons.forEach(b=>b.disabled=true);
      void run(async()=>{
        try {
          if(form.dataset.form==='store') {
            data.version=Number(form.dataset.version); const result=await api('/store',data); shop=result.shop; renderManage();
          } else {
            data.id=form.dataset.id; data.version=Number(form.dataset.version);
            data.request_key=form.dataset.requestKey;
            data.price_cents=Math.round(Number(data.price)*100); delete data.price;
            data.redeem_value=Number(data.redeem_value);
            const result=await api('/product',data); items=result.products; renderManage();
          }
          alert.textContent='已儲存；本次沒有扣除點數。';
        } finally { busy=false; buttons.forEach((b,i)=>b.disabled=disabled[i]); }
      });
    };
    const id=standalone?new URL(location.href).searchParams.get('shop'):'';
    void run(async()=>{
      if(memberProduct&&!standalone) {
        const version=++epoch;
        const module=await import('./member-product-qr.js?v=1');
        if(version===epoch)await module.showMemberProductQr(content,memberProduct,()=>version===epoch);
      }else if((productId||qrToken)&&!standalone) {
        const version=++epoch;
        const module=await import('./shop-product-checkout.js?v=2');
        if(version===epoch)await module.mountProductCheckout(content,productId,()=>version===epoch,qrToken);
      }else await (id?view(id):list());
    });
  }
  window.StoreShop={mount};
  const root=document.getElementById('public-store-shop'); if(root) mount(root,true);
})();
