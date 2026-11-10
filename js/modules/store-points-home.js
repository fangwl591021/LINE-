// Presentation only. Every operation remains in the existing authenticated module.
import {storePlanForRole} from './store-cooperation-plans.mjs?v=1';
export {readRewardUnits,renderRewardCards} from './reward-units.js?v=1';
export function merchantRole(role) {
  return ({admin:'admin','總管':'admin',store:'store','店長':'store',reward:'reward','贈點用戶':'reward',redeem:'redeem','扣點用戶':'redeem'})[String(role||'').toLowerCase()]||'';
}
const paths={coins:'M20 6c0 2-4 3-8 3S4 8 4 6s4-3 8-3 8 1 8 3Zm0 0v12c0 2-4 3-8 3s-8-1-8-3V6m0 6c0 2 4 3 8 3s8-1 8-3',gift:'M3 8h18v4H3zM5 12v9h14v-9M12 8v13m0-13H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',history:'M5 3h14v18H5zM8 8h8M8 12h8M8 16h5',scan:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10',bag:'M4 7h16l1 14H3L4 7Zm4 0V5a4 4 0 0 1 8 0v2',chart:'M5 20V13m7 7V8m7 12V3',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2',home:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',user:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3',store:'M3 9 5 3h14l2 6M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0M5 12v9h14v-9M10 21v-6h4v6',users:'M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM5 21v-3a7 7 0 0 1 14 0v3M4 11a3 3 0 0 0 0-6m16 6a3 3 0 0 1 0-6M1 20v-3a5 5 0 0 1 3-4m19 7v-3a5 5 0 0 0-3-4',tutorial:'M2 8 12 3l10 5-10 5L2 8Zm4 3v7c4 3 8 3 12 0v-7m4-3v9',crown:'M3 6l5 4 4-7 4 7 5-4-3 14H6L3 6Z',edit:'m15 5 4 4M5 19l4-1L20 7a3 3 0 0 0-4-4L5 14l-1 6 1-1Z'};
export const pointIcon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.coins}"/></svg>`;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tile=(action,icon,title,note,color)=>`<button type="button" data-do="${action}" class="points-tile points-tile-${color}">${pointIcon(icon)}<strong>${title}<span aria-hidden="true">›</span></strong><small>${note}</small></button>`;

export function formatMerchantExpiry(expiresAt){
  if(expiresAt===null||expiresAt===undefined||expiresAt===''||typeof expiresAt==='boolean')return '依合作方案';
  if(typeof expiresAt==='string'){
    const parts=/^(\d{4})-(\d{2})-(\d{2})(?:T[^\s]+)?$/.exec(expiresAt);if(!parts)return '依合作方案';
    const calendar=new Date(Date.UTC(Number(parts[1]),Number(parts[2])-1,Number(parts[3])));
    if(calendar.getUTCFullYear()!==Number(parts[1])||calendar.getUTCMonth()+1!==Number(parts[2])||calendar.getUTCDate()!==Number(parts[3]))return '依合作方案';
  }
  const date=new Date(expiresAt);if(!Number.isFinite(date.getTime()))return '依合作方案';
  return '有效至 '+new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
const merchantImage=value=>{try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}};
const merchantStat=(stats,key,label,icon,unit='')=>{
  const value=stats?.[key],known=typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
  const display=known?(value>=10000?new Intl.NumberFormat('zh-TW',{notation:'compact',maximumFractionDigits:1}).format(value):value.toLocaleString('zh-TW')):'尚無資料';
  return `<div class="mw-stat mw-stat-${key}">${pointIcon(icon)}<span>${label}</span><strong data-merchant-stat="${key}"${known?` aria-label="${label} ${value.toLocaleString('zh-TW')}${unit}" title="${value.toLocaleString('zh-TW')}${unit}"`:' class="mw-stat-empty"'}>${display}${known&&unit?`<small>${unit}</small>`:''}</strong></div>`;
};
export function renderMerchantProfile({shop=null,stats=null,loading=false}={}){
  const image=merchantImage(shop?.image_url),name=shop?.name|| (loading?'讀取店家資料中…':'店家資料尚無資料');
  return `<article class="mw-profile-card" aria-label="本人店家與經營摘要"><div class="mw-store-identity"><div class="mw-store-photo">${image?`<img src="${escape(image)}" alt="${escape(shop?.name||'店家')}封面" referrerpolicy="no-referrer">`:pointIcon('store')}</div><div class="mw-store-copy"><h3 data-merchant-name>${escape(name)}</h3><p data-merchant-location>${escape([shop?.category,shop?.address].filter(Boolean).join('｜')||(loading?'正在載入店家資訊':'分類與地址尚無資料'))}</p></div></div><div class="mw-stats" aria-label="目前可查詢的店家數據">${merchantStat(stats,'productCount','商品數','bag')}${merchantStat(stats,'monthlyRedemptionCount','本月商品折抵','chart','筆')}${merchantStat(stats,'monthlyRedemptionPoints','本月折抵點數','coins','點')}</div></article>`;
}
const merchantTile=(action,icon,title,note,color,kind='feature')=>`<button type="button" data-do="${action}" class="mw-tile mw-${kind} mw-${color}"><span class="mw-tile-icon">${pointIcon(icon)}</span><span class="mw-tile-copy"><strong>${title}</strong><small>${note}</small></span><span class="mw-arrow" aria-hidden="true">›</span></button>`;
function renderMerchantHome({rewardOnly=false,redeemOnly=false,canManage=false,role='store',canMembers=false,canTutorial=false,shop=null,stats=null,expiresAt=null,merchantLoading=true}={}){
  const plan=storePlanForRole(rewardOnly?'reward':redeemOnly?'redeem':role),manage=canManage&&plan.canManage&&!rewardOnly;
  const actions=[...(plan.canGive?[merchantTile('point-reward','gift','贈送點數','消費後贈點・經營會員','pink','primary')]:[]),...(plan.canRedeem?[merchantTile('point-redeem','scan','折抵點數','核對會員・購物金折抵','blue','primary')]:[])];
  const secondary=manage?merchantTile('manage','store','我的店家與商品專區','店家資料・商品上架・管理','mint')+merchantTile('online-manage','bag','網路訂單','訂單查詢・出貨管理','gold'):'';
  const tools=[merchantTile('spending-history','history','消費紀錄','贈點・折抵明細','purple','tool'),...(manage?[merchantTile('sales','chart','經營數據','商品業績・折抵明細','sky','tool')]:[]),...(canMembers?[merchantTile('merchant-members','users','客戶聯絡人','名片聯絡人管理','rose','tool')]:[])];
  const footer=(canTutorial?merchantTile('merchant-tutorial','tutorial','操作教學','快速上手・使用說明','mint','footer'):'')+(manage?merchantTile('manage','settings','店家設定','折抵規則・門市資訊','gray','footer'):'');
  const permission=plan.id==='reward'?'贈點單位免費，僅提供 QR 或手機贈點；不開放店家資訊、商品上架、扣點或網購收款。':plan.id==='redeem'?'折抵店家免費，可上架 1 件商品，支援網購與購物金折抵、實體店家交易及到店消費；不能贈點，到店取貨尚待確認。':plan.id==='admin'?'平台管理員可使用贈點、折抵、店家與商品管理，商品不設總數上限；交易前仍須核對並確認。':'雙向完整版可上架 20 件商品，支援網購、到店取貨及贈點與折抵。交易前仍須核對會員並確認。';
  return `<section class="merchant-workbench" aria-label="店家工作台"><header class="mw-heading"><span class="mw-heading-icon">${pointIcon('store')}</span><div class="mw-heading-copy"><h2>店家專區<span>｜${plan.id==='reward'?'贈點工作台':plan.id==='redeem'?'扣點工作台':'店家工作台'}</span></h2><p>${plan.id==='reward'?'掃描會員・核對贈點・經營聯絡':plan.id==='redeem'?'折抵・商品・訂單・一站管理':'贈點・折抵・商品・訂單・一站管理'}</p></div><div class="mw-plan-badge">${pointIcon('crown')}<strong data-merchant-plan-label>${escape(plan.label)}</strong><small data-merchant-expiry>${escape(formatMerchantExpiry(expiresAt))}</small></div></header><div data-merchant-profile>${renderMerchantProfile({shop,stats,loading:merchantLoading})}</div><div class="mw-primary-actions" style="--mw-columns:${actions.length||1}">${actions.join('')}</div>${secondary?`<div class="mw-secondary-actions">${secondary}</div>`:''}<div class="mw-tools" style="--mw-columns:${tools.length}">${tools.join('')}</div>${footer?`<div class="mw-footer-actions">${footer}</div>`:''}<details class="mw-plan-details"><summary>方案功能說明</summary><p>${permission}</p></details><div hidden data-merchant-legacy-hooks><span data-home-balance></span><span data-home-qr></span><span data-home-wallet-status></span><div data-home-shops></div><div data-home-reward-units></div></div></section>`;
}

export function renderPointsHome({merchant=false,rewardOnly=false,redeemOnly=false,standalone=false,canManage=false,role='store',canMembers=false,canTutorial=false,shop=null,stats=null,expiresAt=null,merchantLoading=true}={}) {
  if(merchant)return renderMerchantHome({rewardOnly,redeemOnly,canManage,role,canMembers,canTutorial,shop,stats,expiresAt,merchantLoading});
  canManage=canManage&&!rewardOnly;
  return `<section class="points-home" aria-label="消費者首頁">
    <section class="points-wallet" aria-label="本人點數與 QR"><div class="points-wallet-copy"><h2>我的共用點數</h2><strong data-home-balance>${standalone?'登入查看':'讀取點數中…'}</strong><p>依店家規則折抵，不代表現金。</p><button type="button" data-do="tank-game" class="points-wallet-refresh">玩遊戲拿點數</button></div><button type="button" data-do="wallet" class="points-wallet-qr" aria-label="放大我的專屬點數 QR"><span data-home-qr>${pointIcon('scan')}</span><strong>我的專屬 QR</strong><small data-home-wallet-status>${standalone?'登入後出示':'正在準備'}</small></button></section>
    <div class="points-actions">${tile('wallet','gift','我要使用點數','出示本人 QR，店家掃描','green')+tile('find','pin','哪裡可以用？','搜尋可用店家','amber')+tile('spending-history','history','我的點數紀錄','贈點・消費折抵','pink')+tile('online-orders','bag','我的網路訂單','訂單・匯款・寄送','blue')}
    </div>
    <section class="points-reward-units" aria-label="贈點單位"><div class="points-section-title"><h2>${pointIcon('gift')}贈點單位</h2><button type="button" data-do="reward-units">更多 ›</button></div><div class="reward-unit-strip" data-home-reward-units><p role="status">載入贈點單位中…</p></div><p class="shop-meta">認識提供贈點的單位，贈點方式與資格請洽各單位。</p></section>
    <div class="points-section-title"><h2>${pointIcon('pin')}探索好店</h2><button type="button" data-do="find">更多 ›</button></div><div class="shop-grid shop-discovery-grid points-recommended" data-home-shops><p role="status">載入店家中…</p></div>
    <button type="button" data-do="${canManage?'manage':'wallet'}" class="points-home-banner">${pointIcon(canManage?'bag':'coins')}<span><strong>${canManage?'我的店面與商品':'把點數用在喜歡的生活'}</strong><small>${canManage?'商品管理、DM 建商品與商城邀請':'出示本人 QR，依店家規則使用點數'}</small></span><span aria-hidden="true">›</span></button>
  </section>`;
}
export function renderRecommendedShops(shops,photo) {
  if(!shops.length)return '<p>目前沒有已上架店家。</p>';
  return shops.slice(0,3).map(shop=>`<article>${photo(shop.image_url)||'<div class="shop-no-photo" aria-hidden="true">⌂</div>'}<h2>${escape(shop.name)}</h2><p class="shop-meta">${escape([shop.category,shop.address].filter(Boolean).join('・'))}</p><button type="button" data-do="view" data-id="${escape(shop.id)}" class="shop-store-link">${shop.has_active_products===1?'進入商城':'前往店家'} ›</button></article>`).join('');
}
