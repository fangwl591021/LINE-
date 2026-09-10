const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>Number(value).toLocaleString('zh-TW');
const DAY=86400000;
const date=time=>new Date(time).toISOString().slice(0,10);
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
        <h3>交易明細</h3>${report.records.length?report.records.map(row=>`<div class="shop-box"><h3>${esc(row.productTitle)}</h3><p class="shop-meta">${esc(new Date(row.confirmedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}))}</p><p>商品金額 NT$ ${number(row.amount)}　折抵 ${number(row.points)} 點<br>折抵後應收 NT$ ${number(row.payable)}</p><details><summary>交易編號</summary><p class="shop-meta">${esc(row.transactionId)}</p></details></div>`).join(''):'<p>此頁沒有成功商品折抵交易。</p>'}
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
