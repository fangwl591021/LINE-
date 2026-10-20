// Display-only CRM publication directory; no points/QR calls or member identifiers.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const https=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}};
const image=u=>https(u.image_url)?`<img src="${esc(https(u.image_url))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:'<div class="reward-unit-placeholder" aria-hidden="true">🎁</div>';
export async function readRewardUnits(base,params={},fetcher=fetch){
  const response=await fetcher(base.replace(/\/+$/,'')+'/v1/reward-units?'+new URLSearchParams(params),{cache:'no-store',signal:AbortSignal.timeout(15000)}),result=await response.json();
  if(!response.ok||result.success!==true)throw Error(result.error||'贈點單位暫時無法讀取');
  return result;
}
export function renderRewardCards(units,{home=false}={}){
  if(!units.length)return '<p class="shop-meta">目前尚無核准公開的贈點單位。</p>';
  return (home?units.slice(0,3):units).map(u=>`<article class="reward-unit-card">${image(u)}<h2>${esc(u.name)}</h2><p class="shop-meta">${esc(u.reward_terms)}</p><button type="button" ${home?'data-do="reward-unit"':'data-unit-action="detail"'} data-id="${esc(u.id)}" class="shop-store-link">查看單位 ›</button></article>`).join('');
}
export function renderRewardDetail(u){
  const dial=String(u.phone||'').replace(/[\s().-]/g,''),site=https(u.website_url);
  return `<article class="reward-unit-detail">${image(u)}<h2>${esc(u.name)}</h2><p class="reward-unit-copy">${esc(u.description)}</p><h3>贈點方式與條件</h3><p class="reward-unit-copy">${esc(u.reward_terms)}</p><p class="shop-meta">實際資格與贈點方式請向單位確認；瀏覽本頁不會自動贈點。</p><dl><dt>公司電話</dt><dd>${esc(u.phone||'尚未提供')}</dd><dt>公司地址</dt><dd>${esc(u.address||'尚未提供')}</dd></dl><div class="shop-row">${/^\+?\d{8,15}$/.test(dial)?`<a class="shop-link" href="tel:${dial}">撥打電話</a>`:''}${u.address?`<a class="shop-link" href="https://www.google.com/maps/search/?api=1&amp;query=${esc(encodeURIComponent(u.address))}" target="_blank" rel="noopener noreferrer">開啟地圖</a>`:''}${site?`<a class="shop-link" href="${esc(site)}" target="_blank" rel="noopener noreferrer">官方網站</a>`:''}</div></article>`;
}
export async function mountRewardUnits(root,{base,isCurrent,onBack,initialId='',fetcher=fetch}){
  let generation=0,query='',after='',next='',detailId='';
  const current=n=>root.isConnected&&isCurrent()&&generation===n;
  async function show(id='',cursor=''){
    const n=++generation;detailId=id;after=cursor;
    root.innerHTML='<button type="button" data-unit-action="back">← 返回'+(id?'贈點單位':'點數通首頁')+'</button><h2>贈點單位</h2><div data-units-body role="status">載入贈點單位中…</div>';
    const body=root.querySelector('[data-units-body]');
    try{
      const result=await readRewardUnits(base,id?{id}:{q:query,after:cursor},fetcher);if(!current(n))return;
      if(id){body.innerHTML=renderRewardDetail(result.unit);return;}
      next=result.next||'';
      body.innerHTML=`<p class="shop-meta">以下為已核准公開的 CRM 贈點單位，請先確認各單位贈點條件。</p><form data-unit-search><label>搜尋單位／地區<input name="q" maxlength="80" value="${esc(query)}" placeholder="輸入單位名稱或地區"></label><button type="submit">搜尋</button></form><div class="shop-grid reward-unit-list">${renderRewardCards(result.units)}</div><div class="shop-row">${cursor?'<button type="button" data-unit-action="first">回到第一頁</button>':''}${next?'<button type="button" data-unit-action="next">下一頁</button>':''}</div>`;
    }catch(error){if(current(n))body.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" data-unit-action="retry">重新載入</button>`;}
  }
  root.onclick=event=>{
    const button=event.target.closest('[data-unit-action]');if(!button||!root.contains(button)||!isCurrent())return;
    if(button.dataset.unitAction==='back'){if(detailId)void show();else {++generation;onBack();}}
    if(button.dataset.unitAction==='detail')void show(button.dataset.id);
    if(button.dataset.unitAction==='next')void show('',next);
    if(button.dataset.unitAction==='first')void show();
    if(button.dataset.unitAction==='retry')void show(detailId,after);
  };
  root.onsubmit=event=>{if(!event.target.matches('[data-unit-search]'))return;event.preventDefault();if(!isCurrent())return;query=String(new FormData(event.target).get('q')||'').trim();void show();};
  await show(initialId);
}
