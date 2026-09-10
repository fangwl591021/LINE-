const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value).toLocaleString('zh-TW');
const DAY=86400000;
const date=time=>new Date(time).toISOString().slice(0,10);
function transaction(row) {
  const time=new Date(row.confirmedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
  const buyer=row.buyerName||(row.buyerStatus==='ambiguous'?'購買者待核對':'姓名未提供');
  return `<div class="shop-sale-row"><div class="shop-sale-heading"><strong>${esc(row.productTitle)}</strong><time datetime="${esc(row.confirmedAt)}">${esc(time)}</time></div>
    <p class="shop-sale-buyer">購買者：${esc(buyer)}${!row.buyerName&&row.buyerRef?` · ${esc(row.buyerRef)}`:''}</p>
    <p class="shop-sale-amounts"><span>金額 $${number(row.amount)}</span><span>折抵 ${number(row.points)} 點</span><strong>應收 $${number(row.payable)}</strong></p>
    <details><summary>交易詳情</summary><p>交易編號：${esc(row.transactionId)}<br>店內顧客辨識碼：${esc(row.buyerRef||'未提供')}<br>${esc(new Date(row.confirmedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}))}<br>購買者顯示目前會員名稱，非交易當時姓名快照。</p></details></div>`;
}
export async function mountShopSales(root,api,isCurrent) {
  let sequence=0,shown=null;
  const today=date(Date.now()+8*3600000);
  root.innerHTML=`<button type="button" data-do="manage">返回商城管理</button><h2>業績查詢</h2>
    <p class="shop-meta">成功商品折抵交易 · 台灣時間<br>應收金額不代表已收現金。</p><details><summary>統計範圍與說明</summary><p class="shop-meta">以成功確認時間計算。僅統計系統已留存的成功商品折抵交易，不含一般收銀、贈點、失敗或待核對交易；未經系統記錄的銷售不包含在內。商品名稱顯示目前名稱。</p></details>
    <div class="shop-row"><button type="button" data-period="today">今日</button><button type="button" data-period="week">近 7 天</button><button type="button" data-period="month">本月</button></div>
    <form data-sales-form class="shop-row"><label>開始日期<input type="date" name="start" required value="${today.slice(0,8)}01"></label><label>結束日期<input type="date" name="end" required value="${today}"></label><button class="primary">查詢</button></form>
    <p class="shop-sales-status" role="status" aria-live="polite"></p><div class="shop-sales-result"></div>`;
  const form=root.querySelector('[data-sales-form]'),status=root.querySelector('.shop-sales-status'),result=root.querySelector('.shop-sales-result');
  const active=()=>isCurrent()&&root.contains(form);
  async function load(start,end,page=0) {
    const version=++sequence;status.textContent='載入業績中…';result.replaceChildren();shown=null;
    try {
      const report=await api('/sales?'+new URLSearchParams({start,end,page}),null,true);
      if(!active()||version!==sequence)return;
      shown=report;status.textContent=`${report.start} ～ ${report.end}（台灣時間）`;
      const s=report.summary;
      result.innerHTML=`<div class="shop-sales-summary">${[['成功筆數',number(s.count)+' 筆'],['商品金額','NT$ '+number(s.amount)],['折抵點數',number(s.points)+' 點'],['折抵後應收','NT$ '+number(s.payable)]].map(([label,value])=>`<div class="shop-box"><span>${label}</span><strong>${value}</strong></div>`).join('')}</div>
        <h3>交易明細</h3><div class="shop-sales-list">${report.records.length?report.records.map(transaction).join(''):'<p>此頁沒有成功商品折抵交易。</p>'}</div>
        <div class="shop-row"><button type="button" data-sales-page="${page-1}" ${page===0?'disabled':''}>上一頁</button><span>第 ${page+1} 頁</span><button type="button" data-sales-page="${page+1}" ${report.hasNext?'':'disabled'}>下一頁</button></div>`;
    }catch(error){if(active()&&version===sequence)status.textContent='無法載入業績：'+(error.name==='TimeoutError'?'連線逾時，請重新查詢':error.message);}
  }
  form.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();void load(form.elements.start.value,form.elements.end.value);});
  // Attach to the new panel, not the shared root: navigation cannot accumulate listeners.
  const panelButtons=[...root.querySelectorAll('[data-period]')];
  panelButtons.forEach(button=>button.addEventListener('click',()=>{
    const start=button.dataset.period==='today'?today:button.dataset.period==='week'?date(Date.parse(today+'T00:00:00Z')-6*DAY):today.slice(0,8)+'01';
    form.elements.start.value=start;form.elements.end.value=today;void load(start,today);
  }));
  result.addEventListener('click',event=>{
    const button=event.target.closest('[data-sales-page]');
    if(button&&!button.disabled&&shown)void load(shown.start,shown.end,Number(button.dataset.salesPage));
  });
  await load(form.elements.start.value,form.elements.end.value);
}
