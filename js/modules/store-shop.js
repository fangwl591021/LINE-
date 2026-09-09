(function() {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusText = status => ({draft:'草稿',active:'已上架',archived:'已封存'}[status] || status);
  function photo(url, cover=false) {
    try { if (new URL(url).protocol !== 'https:') return ''; } catch { return ''; }
    return `<img src="${esc(url)}" class="${cover?'shop-cover':''}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  }
  function policy(p) {
    if(p.redeem_type==='fixed') return `預設最多折抵 ${p.redeem_value} 點`;
    if(p.redeem_type==='percent') return `預設最高折抵 ${p.redeem_value}%`;
    return p.redeem_type==='full'?'預設可全額折抵':'不提供點數折抵';
  }
  function mount(root, standalone) {
    let shop=null, items=[], epoch=0, busy=false;
    root.classList.add('store-shop');
    root.innerHTML = `<nav class="shop-bar" aria-label="商城導覽"><button data-do="exit">返回首頁</button><button data-do="list">店家列表</button>${standalone?'':'<button data-do="manage" class="primary">我的商城管理</button>'}</nav><h1>店家商城</h1><p class="shop-notice">目前開放店家展示與商品管理；點數折抵與核銷尚未開放，不會扣除點數。</p><p role="alert" aria-live="polite"></p><section class="shop-content"></section>`;
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
      return `<article>${photo(p.image_url)}<h3>${esc(p.title)}</h3><p class="shop-price">NT$ ${(Number(p.price_cents)/100).toLocaleString('zh-TW')}</p><p>${esc(p.description)}</p><p class="shop-meta">${esc(policy(p))}（規則設定，尚未啟用）</p>${edit?`<p>${esc(statusText(p.status))}</p><button data-do="edit" data-id="${esc(p.id)}">編輯商品</button>`:''}</article>`;
    }
    async function list(after='',q='') {
      const version=++epoch; alert.textContent=''; content.innerHTML='<p role="status">載入店家中…</p>';
      const result=await api(`?after=${encodeURIComponent(after)}&q=${encodeURIComponent(q)}`);
      if(version!==epoch) return;
      content.innerHTML=`<form data-form="search" class="shop-row"><input name="q" aria-label="搜尋店名、類別或地址" placeholder="搜尋店名、類別或地址" value="${esc(q)}" maxlength="80"><button class="primary">搜尋</button></form><p class="shop-meta">${result.shops.length} 家店家</p><div class="shop-grid">${result.shops.map(s=>`<article>${photo(s.image_url)}<h2>${esc(s.name)}</h2><p class="shop-meta">${esc(s.category)} · ${esc(s.address)}</p><p>${esc(s.description)}</p><button class="primary" data-do="view" data-id="${esc(s.id)}">進入商城</button></article>`).join('')}</div>${result.shops.length?'':'<p>目前沒有符合條件的已上架店家。</p>'}${result.next?`<button data-do="next" data-id="${esc(result.next)}" data-query="${esc(q)}">下一頁</button>`:''}`;
    }
    async function view(id) {
      const version=++epoch; alert.textContent=''; content.innerHTML='<p role="status">載入店面中…</p>';
      const result=await api(`?shop=${encodeURIComponent(id)}`); if(version!==epoch) return;
      const s=result.shop;
      const details=[s.category,s.address,s.phone,s.hours].filter(Boolean).join('\n');
      content.innerHTML=`<article>${photo(s.image_url,true)}<h2>${esc(s.name)}</h2><p>${esc(s.description)}</p>${details?`<p class="shop-meta">${esc(details)}</p>`:''}<button data-do="copy" data-id="${esc(s.id)}">複製商城網址</button></article><h2>商品與服務</h2><div class="shop-grid">${result.products.map(p=>product(p)).join('')}</div>${result.products.length?'':'<p>店家尚未上架商品。</p>'}`;
    }
    function input(key,label,value='',max=200,multiline=false,type='text') {
      return `<label>${label}${multiline?`<textarea name="${key}" maxlength="${max}">${esc(value)}</textarea>`:`<input name="${key}" type="${type}" maxlength="${max}" value="${esc(value)}" ${['name','title','price'].includes(key)?'required':''} ${type==='number'?'min="0" step="0.01"':''}>`}</label>`;
    }
    function select(key,label,options,value) {
      return `<label>${label}<select name="${key}">${options.map(([v,t])=>`<option value="${v}" ${v===value?'selected':''}>${t}</option>`).join('')}</select></label>`;
    }
    function renderManage() {
      const s=shop||{};
      content.innerHTML=`<h2>我的店面</h2><p>只有按「儲存店面」才會建立或更新。草稿不對外顯示。</p><form data-form="store" class="shop-box" data-version="${s.version||0}">${input('name','店家名稱 *',s.name,80)}${input('description','店家介紹',s.description,2000,true)}${input('category','分類',s.category,40)}${input('address','地址',s.address,200)}${input('phone','聯絡電話',s.phone,40)}${input('hours','營業時間',s.hours,200)}${input('image_url','封面圖片 HTTPS 網址',s.image_url,2048,false,'url')}${select('status','公開狀態',[['draft','草稿／暫不公開'],['active','公開店面']],s.status||'draft')}<button class="primary">儲存店面</button></form>${shop?`<div class="shop-row"><button data-do="view" data-id="${esc(shop.id)}" ${shop.status!=='active'?'disabled':''}>查看公開店面</button><button data-do="copy" data-id="${esc(shop.id)}">複製商城網址</button><button data-do="new" class="primary">新增商品</button></div><h2>商品管理（${items.length}/100）</h2><div class="shop-editor"></div><div class="shop-grid">${items.map(p=>product(p,true)).join('')}</div>`:'<p>儲存店面後即可新增商品。</p>'}`;
    }
    async function manage() {
      const version=++epoch; alert.textContent=''; content.innerHTML='<p role="status">驗證店家身分中…</p>';
      const result=await api('/manage',null,true); if(version!==epoch) return;
      shop=result.shop; items=result.products; renderManage();
    }
    function edit(p={}) {
      const editor=content.querySelector('.shop-editor'); if(!editor) return;
      editor.innerHTML=`<form data-form="product" class="shop-box" data-id="${esc(p.id||'')}" data-version="${p.version||0}"><h2>${p.id?'編輯':'新增'}商品</h2>${input('title','商品名稱 *',p.title,100)}${input('description','商品／服務說明',p.description,3000,true)}${input('image_url','商品圖片 HTTPS 網址',p.image_url,2048,false,'url')}${input('price','價格（NT$）*',p.price_cents===undefined?'':(p.price_cents/100),20,false,'number')}${select('redeem_type','點數折抵政策（尚未啟用）',[['none','不折抵'],['fixed','最多折抵指定點數'],['percent','最高折抵商品金額百分比'],['full','可全額折抵']],p.redeem_type||'none')}${input('redeem_value','折抵上限（點數或百分比；不折抵／全額請填 0）',p.redeem_value||0,10,false,'number')}${select('status','商品狀態',[['draft','草稿'],['active','上架'],...(p.id?[['archived','封存（不刪除紀錄）']]:[])],p.status||'draft')}<div class="shop-row"><button class="primary">儲存商品</button><button type="button" data-do="cancel">取消</button></div></form>`;
      editor.scrollIntoView({block:'start',behavior:'smooth'});
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
          case 'next': await list(button.dataset.id,button.dataset.query); break;
          case 'view': await view(button.dataset.id); break;
          case 'manage': await manage(); break;
          case 'new': edit(); break;
          case 'edit': edit(items.find(p=>p.id===button.dataset.id)); break;
          case 'cancel': content.querySelector('.shop-editor').innerHTML=''; break;
          case 'copy': await navigator.clipboard.writeText(shopLink(button.dataset.id)); alert.textContent='已複製商城網址'; break;
        }
      });
    };
    root.onsubmit=event=>{
      const form=event.target.closest('[data-form]'); if(!form) return; event.preventDefault(); if(busy) return;
      const data=Object.fromEntries(new FormData(form));
      if(form.dataset.form==='search') { void run(()=>list('',data.q)); return; }
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
    void run(()=>id?view(id):list());
  }
  window.StoreShop={mount};
  const root=document.getElementById('public-store-shop'); if(root) mount(root,true);
})();
