// Presentation only. The caller owns authentication, queries, sorting and local favorites.
export const exploreViewStylesheet=new URL('../../css/store-explore-view.css?v=1',import.meta.url).href;
const banner=new URL('../../assets/home-discover-shops-20261110.webp',import.meta.url).href;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={
  store:'M3 10V5h18v5M4 10v11h16V10M2 10l2-6h16l2 6M2 10c0 3 5 3 5 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 5 3 5 0M9 21v-7h6v7',
  coins:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM9 17V7h4a3 3 0 0 1 0 6H9',
  scan:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10',
  history:'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3Zm0 0v12c0 2-4 3-8 3s-8-1-8-3V6m0 6c0 2 4 3 8 3s8-1 8-3',
  bag:'M4 7h16l1 14H3L4 7Zm4 0V5a4 4 0 0 1 8 0v2',
  search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  food:'M5 3v7m3-7v7M2 3v7c0 3 6 3 6 0M5 12v10M17 3c-4 3-4 10 0 10h3V3h-3Zm3 10v9',
  scissors:'M9 9 20 2M9 15 20 22M4 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM9 9l5 3-5 3',
  cart:'M2 3h3l3 13h12l2-10H6M10 21h.01M19 21h.01',
  bed:'M3 18V7m18 11V9H7v7M3 14h18M5 9h3V6H5v3ZM3 18v3m18-3v3',
  travel:'M4 7h16v14H4V7Zm5 0V3h6v4M8 7v14m8-14v14',
  bus:'M5 3h14v15H5V3Zm0 9h14M8 18v3m8-3v3M8 15h.01m8-.01h.01M8 6h8',
  factory:'M3 21V9l6 3V7l6 4V3h5l1 18H3ZM7 16h1m4 0h1m4 0h1',
  more:'M5 5h3v3H5V5Zm11 0h3v3h-3V5ZM5 16h3v3H5v-3Zm11 0h3v3h-3v-3Z',
  pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  star:'m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1 3-6Z',
  heart:'M12 21 3 12C-3 4 6-1 12 6c6-7 15-2 9 6l-9 9Z',
  arrow:'m9 5 7 7-7 7'
};
const icon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.store}"/></svg>`;
const categories=[['食','美食餐飲','food','orange'],['服務','專業服務','scissors','pink'],['購','生活零售','cart','blue'],['宿','住宿旅宿','bed','mint'],['遊','休閒旅遊','travel','purple'],['行','交通出行','bus','blue'],['製造','產業製造','factory','orange']];
function safeImageUrl(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
function picture(value,photo){
  const url=safeImageUrl(value);
  return (url&&(typeof photo==='function'?photo(url):`<img src="${escape(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`))||`<span class="shop-explore-no-photo">${icon('store')}<span>探索在地好店</span></span>`;
}

export function renderExploreCards(shops=[],{photo,favoriteIds=[]}={}){
  const favorites=new Set(favoriteIds);
  return shops.map(shop=>{
    const saved=favorites.has(shop.id),category=categories.find(item=>item[0]===shop.category),name=shop.name||'未命名店家';
    return `<article class="shop-explore-card">
      <div class="shop-explore-media"><button type="button" class="shop-explore-photo" data-do="view" data-id="${escape(shop.id)}" aria-label="查看${escape(name)}">${picture(shop.image_url,photo)}</button><button type="button" class="shop-explore-favorite" data-do="explore-favorite" data-id="${escape(shop.id)}" aria-pressed="${saved}" aria-label="${saved?'取消收藏':'收藏'}${escape(name)}">${icon('heart')}</button></div>
      <div class="shop-explore-card-body"><h3 class="shop-explore-card-name" title="${escape(name)}">${escape(name)}</h3>
        <div class="shop-explore-card-facts"><div class="shop-explore-card-location"><span class="shop-explore-badge shop-explore-tone-${category?.[3]||'mint'}">${icon(category?.[2]||'store')}${escape(category?.[1]||shop.category||'未分類')}</span><p class="shop-explore-address" title="${escape(shop.address||'')}">${icon('pin')}${escape(shop.address||'地址請洽店家')}</p></div><div class="shop-explore-benefit"><span>購物金折抵</span><strong>依店家設定</strong></div></div>
        <p class="shop-explore-description">${escape(shop.description||'歡迎查看店家介紹與服務。')}</p>
        <button type="button" class="shop-explore-view-link" data-do="view" data-id="${escape(shop.id)}">前往店家${icon('arrow')}</button>
      </div></article>`;
  }).join('');
}

export function renderExploreView({shops=[],photo,q='',category='',next='',walletLabel='登入查看',filter='all',sort='recommended',favoriteIds=[],total}={}){
  const activeFilter=['all','newest','favorites'].includes(filter)?filter:'all';
  const categoryButton=([value,label,name,tone])=>`<button type="button" class="shop-explore-category shop-explore-tone-${tone}" data-do="search-category" data-category="${escape(value)}" aria-pressed="${category===value}">${icon(name)}<span>${label}</span></button>`;
  const count=Number.isSafeInteger(total)&&total>=shops.length?`共 ${total} 家`:`本頁 ${shops.length} 家`;
  return `<section class="shop-explore-view" aria-label="探索好店">
    <header class="shop-explore-hero"><img class="shop-explore-hero-art" src="${escape(banner)}" alt=""><div class="shop-explore-hero-copy"><span class="shop-explore-hero-mark">${icon('store')}</span><div><h2>探索<span>好店</span></h2><p>發現合作店家・使用購物金<br>享受生活裡的小美好</p></div></div></header>
    <section class="shop-explore-wallet" aria-label="本人購物金與 QR"><div class="shop-explore-wallet-label">${icon('coins')}<strong>我的購物金<span>（點數）</span></strong></div><strong class="shop-explore-balance" data-explore-balance>${escape(walletLabel)}</strong><button type="button" class="shop-explore-qr" data-do="wallet">${icon('scan')}<span>出示 QR 折抵</span></button></section>
    <nav class="shop-explore-shortcuts" aria-label="我的購物金服務"><button type="button" class="shop-explore-shortcut shop-explore-shortcut-green" data-do="wallet">${icon('scan')}<span><strong>我要使用點數</strong><small>出示本人 QR</small></span>${icon('arrow')}</button><button type="button" class="shop-explore-shortcut shop-explore-shortcut-purple" data-do="spending-history">${icon('history')}<span><strong>我的點數紀錄</strong><small>贈點・折抵明細</small></span>${icon('arrow')}</button><button type="button" class="shop-explore-shortcut shop-explore-shortcut-blue" data-do="online-orders">${icon('bag')}<span><strong>我的網路訂單</strong><small>訂購・訂單查詢</small></span>${icon('arrow')}</button></nav>
    <form class="shop-explore-search" data-form="search" role="search">${icon('search')}<input name="q" type="search" aria-label="搜尋店名、類別或地址" placeholder="搜尋店家、類別或地區" maxlength="80" value="${escape(q)}"><input name="category" type="hidden" value="${escape(category)}"><button type="submit">搜尋</button></form>
    <div class="shop-explore-categories" aria-label="店家分類">${categories.slice(0,5).map(categoryButton).join('')}<details class="shop-explore-more"><summary class="shop-explore-category shop-explore-tone-slate${['行','製造'].includes(category)?' is-active':''}">${icon('more')}<span>更多分類</span></summary><div class="shop-explore-more-panel"><button type="button" data-do="search-category" data-category="" aria-pressed="${!category}">全部分類</button>${categories.slice(5).map(categoryButton).join('')}</div></details></div>
    <nav class="shop-explore-tabs" aria-label="店家瀏覽方式"><button type="button" data-do="explore-filter" data-filter="all" aria-pressed="${activeFilter==='all'}">${icon('store')}<span>全部店家</span></button><button type="button" data-do="region">${icon('pin')}<span>地區搜尋</span></button><button type="button" data-do="explore-filter" data-filter="newest" aria-pressed="${activeFilter==='newest'}">${icon('star')}<span>新上架</span></button><button type="button" data-do="explore-filter" data-filter="favorites" aria-pressed="${activeFilter==='favorites'}">${icon('heart')}<span>我的收藏</span></button></nav>
    ${activeFilter==='favorites'?'<p class="shop-explore-filter-note">本機收藏・僅顯示目前裝置儲存的店家；未載入的收藏可繼續查看。</p>':activeFilter==='newest'?'<p class="shop-explore-filter-note">最近公開上架的合作店家</p>':''}
    <div class="shop-explore-list-heading"><h2>${activeFilter==='favorites'?'本機收藏':activeFilter==='newest'?'新上架店家':'合作店家'}<span>（${count}）</span></h2><label class="shop-explore-sort">排序<select name="explore-sort" data-explore-sort aria-label="店家排序"><option value="recommended"${sort!=='name'?' selected':''}>推薦順序</option><option value="name"${sort==='name'?' selected':''}>本頁名稱 A–Z</option></select></label></div>
    <div class="shop-explore-grid">${renderExploreCards(shops,{photo,favoriteIds})}</div>
    ${shops.length?'':`<p class="shop-explore-empty" role="status">${activeFilter==='favorites'?'目前沒有可顯示的本機收藏店家。':'目前沒有符合條件的已上架店家，試試其他分類或搜尋條件。'}</p>`}
    ${next?`<button type="button" class="shop-explore-next" data-do="next" data-id="${escape(next)}" data-query="${escape(q)}" data-category="${escape(category)}">下一頁店家${icon('arrow')}</button>`:''}
    <p class="shop-explore-footnote">購物金折抵與商品服務依各店設定，交易前請向店家確認。</p>
  </section>`;
}
