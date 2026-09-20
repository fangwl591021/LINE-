// Presentation only. Every operation remains in the existing authenticated module.
export function merchantRole(role) {
  return ({admin:'admin','總管':'admin',store:'store',tenant:'store','店長':'store','租戶':'store',reward:'reward','贈點用戶':'reward',redeem:'redeem','扣點用戶':'redeem'})[String(role||'').toLowerCase()]||'';
}
const paths={coins:'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3Zm0 0v12c0 2-4 3-8 3s-8-1-8-3V6m0 6c0 2 4 3 8 3s8-1 8-3',gift:'M3 8h18v4H3zM5 12v9h14v-9M12 8v13m0-13H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',history:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',scan:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10',bag:'M4 7h16l1 14H3L4 7Zm4 0V5a4 4 0 0 1 8 0v2',chart:'M5 20V13m7 7V8m7 12V3',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',home:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3'};
export const pointIcon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.coins}"/></svg>`;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tile=(action,icon,title,note,color)=>`<button type="button" data-do="${action}" class="points-tile points-tile-${color}">${pointIcon(icon)}<strong>${title}<span aria-hidden="true">›</span></strong><small>${note}</small></button>`;

export function renderPointsHome({merchant=false,rewardOnly=false,redeemOnly=false,standalone=false,canManage=false}={}) {
  return `<section class="points-home" aria-label="${merchant?'商家':'消費者'}首頁">
    ${merchant?`<div class="points-merchant-heading"><span class="points-avatar">${pointIcon('bag')}</span><div><h2>${rewardOnly?'贈點工作台':redeemOnly?'扣點工作台':'店家工作台'}</h2><p>${rewardOnly?'掃描會員 QR，核對後贈點':redeemOnly?'核對會員後折抵，不能贈點':'贈點・折抵・管理'}</p></div><span class="points-role-label">${rewardOnly?'贈點單位':redeemOnly?'扣點用戶':'商家版'}</span></div>`:''}
    <section class="points-wallet" aria-label="本人點數與 QR"><div class="points-wallet-copy"><h2>我的共用點數</h2><strong data-home-balance>${standalone?'登入查看':'讀取點數中…'}</strong><p>依店家規則折抵，不代表現金。</p><button type="button" data-do="tank-game" class="points-wallet-refresh">玩遊戲拿點數</button></div><button type="button" data-do="wallet" class="points-wallet-qr" aria-label="放大我的專屬點數 QR"><span data-home-qr>${pointIcon('scan')}</span><strong>我的專屬 QR</strong><small data-home-wallet-status>${standalone?'登入後出示':'正在準備'}</small></button></section>
    <div class="points-actions">${merchant?
      (redeemOnly?'':tile('point-reward','gift','贈送點數',rewardOnly?'會員 QR 或手機贈點':'送點給會員，增加回購','coral'))+(rewardOnly?'':tile('point-redeem','scan','折抵點數','核對會員與折抵金額','blue')):
      tile('wallet','gift','我要使用點數','出示本人 QR，店家掃描','green')+tile('find','pin','哪裡可以用？','搜尋可用店家','amber')+tile('spending-history','history','我的點數紀錄','贈點・消費折抵','pink')+tile('online-orders','bag','我的網路訂單','訂單・匯款・寄送','blue')}
    </div>
    ${merchant?`<div class="points-tools">${tile('spending-history','history','本人紀錄','我的點數明細','mint')}${!rewardOnly&&!redeemOnly?tile('sales','chart','商品業績','商品 QR 折抵','lavender')+tile('online-manage','bag','網路訂單','收款與出貨','sand')+tile('manage','settings','店家設定','店面與商品','gray'):''}</div><p class="points-permission-note">${redeemOnly?'此帳號僅開放消費折抵，不能贈點或管理店家。':rewardOnly?'此帳號僅開放 QR 或手機贈點，不提供扣點或店家收款管理。':'贈點與折抵皆須核對會員並確認送出，開啟功能不會直接交易。'}</p>`:''}
    <div class="points-section-title"><h2>${pointIcon('pin')}探索好店</h2><button type="button" data-do="find">更多 ›</button></div><div class="shop-grid shop-discovery-grid points-recommended" data-home-shops><p role="status">載入店家中…</p></div>
    <button type="button" data-do="${canManage?'manage':'wallet'}" class="points-home-banner">${pointIcon(canManage?'bag':'coins')}<span><strong>${canManage?'我的店面與商品':'把點數用在喜歡的生活'}</strong><small>${canManage?'商品管理、DM 建商品與商城邀請':'出示本人 QR，依店家規則使用點數'}</small></span><span aria-hidden="true">›</span></button>
  </section>`;
}
export function renderRecommendedShops(shops,photo) {
  if(!shops.length)return '<p>目前沒有已上架店家。</p>';
  return shops.slice(0,3).map(shop=>`<article>${photo(shop.image_url)||'<div class="shop-no-photo" aria-hidden="true">⌂</div>'}<h2>${escape(shop.name)}</h2><p class="shop-meta">${escape([shop.category,shop.address].filter(Boolean).join('・'))}</p><button type="button" data-do="view" data-id="${escape(shop.id)}" class="shop-store-link">進入商城 ›</button></article>`).join('');
}
