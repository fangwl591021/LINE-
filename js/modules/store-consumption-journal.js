// Consumption transactions are separate from point movements. No wallet/payment mutations.
let activeDialog;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const payments = {pending:'待匯款',reported:'已回報・待核帳',paid:'已收款',cancelled:'已取消',unconfirmed:'收款未確認'};
const shipping = {unfulfilled:'未出貨',shipped:'已出貨',completed:'已完成'};
export const journalMoney = cents => typeof cents === 'number' && Number.isSafeInteger(cents) && cents >= 0 ? 'NT$ ' + (cents / 100).toLocaleString('zh-TW',{maximumFractionDigits:2}) : '未提供';
export function journalTime(value) {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d\d:\d\d)$/.test(value)) return '時間待確認';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date) : '時間待確認';
}
const pointText = n => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n.toLocaleString('zh-TW') + ' 點' : '未提供';
function statusText(row) {
  if (row.source === 'store') return '店內消費登錄・收款未確認';
  return [payments[row.paymentStatus] || '付款狀態待確認',row.paymentStatus === 'paid' ? shipping[row.fulfillmentStatus] : ''].filter(Boolean).join('・');
}
const storeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 10v11h16V10M3 10l2-7h14l2 7M8 21v-7h8v7M3 10c0 3 4 3 4 0 0 3 5 3 5 0 0 3 5 3 5 0 0 3 4 3 4 0M8 3l-1 7m9-7 1 7M12 3v7"/></svg>';
export function journalRowHtml(row) {
  return `<article class="journal-row${row.unread ? ' is-unread' : ''}" role="listitem"><span class="journal-shop-icon">${storeIcon}</span><div class="journal-row-content"><h3>${esc(row.shopName || '店家消費')}${row.unread ? '<span class="journal-unread">未讀</span>' : ''}</h3><p>${esc(row.title || (row.source === 'online' ? '網路訂單' : '消費通知'))}</p><p class="journal-amount">消費 ${esc(journalMoney(row.amountCents))}${row.source === 'store' ? `・折抵 ${esc(pointText(row.discountPoints))}` : ''}</p><p>${row.source === 'online' && row.paymentStatus === 'cancelled' ? '原訂單金額' : row.paymentStatus === 'paid' && row.source === 'online' ? '已付' : '應付'} ${esc(journalMoney(row.payableCents))}${row.earnedPoints > 0 ? `・消費贈點 ${esc(pointText(row.earnedPoints))}` : ''}</p><span class="journal-state">${esc(statusText(row))}</span><div class="journal-row-bottom"><time>${esc(journalTime(row.occurredAt))}</time><button type="button" data-journal="detail" data-id="${esc(row.id)}" aria-label="查看${esc(row.shopName || '交易')}明細">查看明細 <span aria-hidden="true">›</span></button></div></div></article>`;
}
export function createJournalClient({base,isCurrent=()=>true}) {
  const owner = window.currentUserProfile?.userId;
  const token = window.liff?.isLoggedIn?.() ? window.liff.getAccessToken?.() : '';
  if (!owner || !token) throw Error('請先登入後查看本人消費日誌');
  let closed = false;
  const controllers = new Set();
  const current = () => !closed && isCurrent() && window.currentUserProfile?.userId === owner && window.liff?.isLoggedIn?.() && window.liff.getAccessToken?.() === token;
  return {
    current,
    close() {closed = true; for (const controller of controllers) controller.abort(); controllers.clear();},
    async request(path='',data) {
      if (!current()) throw Error('登入身分或頁面已變更，請重新開啟');
      const controller = new AbortController(); controllers.add(controller);
      const timer = setTimeout(()=>controller.abort(),15000);
      try {
        const response = await fetch(String(base || '').replace(/\/+$/,'') + '/v1/store-consumption-journal' + path,{
          method:data === undefined ? 'GET' : 'POST',cache:'no-store',credentials:'omit',signal:controller.signal,
          headers:{Authorization:'Bearer ' + token,...(data === undefined ? {} : {'Content-Type':'application/json'})},
          body:data === undefined ? undefined : JSON.stringify(data)
        });
        const result = await response.json();
        if (!current()) throw Error('登入身分或頁面已變更，請重新開啟');
        if (!response.ok || result?.success !== true) throw Error(result?.error || '消費日誌暫時無法讀取，請稍後重試');
        return result;
      } catch (error) {
        if (error.name === 'AbortError') throw Error('連線已中止或逾時，請重新整理');
        throw error;
      } finally {clearTimeout(timer);controllers.delete(controller);}
    }
  };
}
export function openStoreConsumptionJournal({base,isCurrent=()=>true,onPoints}={}) {
  if (activeDialog?.open) {activeDialog.querySelector('[data-journal="close"]').focus();return activeDialog;}
  const opener = document.activeElement;
  const client = createJournalClient({base,isCurrent});
  if (!document.querySelector('link[data-store-journal-style]')) {
    const link = document.createElement('link');link.rel='stylesheet';link.href=new URL('css/store-consumption-journal.css?v=1',document.baseURI).href;link.dataset.storeJournalStyle='';document.head.append(link);
  }
  const modal = document.createElement('dialog');modal.className='store-journal-dialog';modal.setAttribute('aria-labelledby','store-journal-title');
  modal.innerHTML=`<header class="journal-header"><button type="button" data-journal="list" aria-label="返回商城">‹ 返回</button><h2 id="store-journal-title">消費日誌</h2><button type="button" data-journal="close" aria-label="關閉消費日誌">×</button></header><div class="journal-scroll"><nav class="journal-tabs" aria-label="紀錄類型"><span aria-current="page">消費日誌</span><button type="button" data-journal="points" ${typeof onPoints === 'function' ? '' : 'hidden'}>點數紀錄</button></nav><section data-journal-list-view><div class="journal-toolbar"><p data-journal-count>僅顯示本系統的消費與訂單</p><button type="button" data-journal="read-all" disabled>全部已讀</button><button type="button" data-journal="refresh">重新整理</button></div><details class="journal-filter-panel"><summary>篩選交易類型／日期</summary><form data-journal-filters><label>交易類型<select name="type"><option value="all">全部</option><option value="store">店內消費</option><option value="online">網路訂單</option></select></label><label>起始日期<input type="date" name="start"></label><label>結束日期<input type="date" name="end"></label><button type="submit">篩選</button></form></details><p class="journal-note">時間為台灣時間。簽到、邀請與純贈點請看「點數紀錄」。</p><div data-journal-rows role="list" aria-label="本人消費交易"></div><button type="button" class="journal-more" data-journal="more" hidden>載入更多</button></section><section data-journal-detail-view hidden></section><p data-journal-status role="status" aria-live="polite"></p></div>`;
  document.body.append(modal);activeDialog=modal;
  const listView=modal.querySelector('[data-journal-list-view]'),detailView=modal.querySelector('[data-journal-detail-view]'),rowsNode=modal.querySelector('[data-journal-rows]'),status=modal.querySelector('[data-journal-status]'),form=modal.querySelector('[data-journal-filters]'),more=modal.querySelector('[data-journal="more"]'),all=modal.querySelector('[data-journal="read-all"]'),count=modal.querySelector('[data-journal-count]'),back=modal.querySelector('[data-journal="list"]');
  let rows=[],snapshot='',nextCursor='',unreadCount=0,revision=0,closed=false,busy=false,detailId='',scrollTop=0,timer,loadedFilters='';
  const current=()=>!closed && modal.open && client.current();
  function cleanup() {if(closed)return;closed=true;++revision;clearInterval(timer);client.close();rows=[];modal.remove();if(activeDialog===modal)activeDialog=null;if(isCurrent()&&opener?.isConnected)opener.focus();}
  function close() {modal.close();cleanup();}
  function setBusy(value) {busy=value;listView.querySelectorAll('button,input,select').forEach(el=>el.disabled=value);all.disabled=value || !snapshot || unreadCount===0;}
  function paintRows() {rowsNode.innerHTML=rows.map(journalRowHtml).join('');more.hidden=!nextCursor;count.textContent=`已載入 ${rows.length} 筆・未讀 ${unreadCount} 筆`;all.disabled=busy||!snapshot||unreadCount===0;}
  function showList() {++revision;detailId='';detailView.hidden=true;detailView.replaceChildren();listView.hidden=false;back.setAttribute('aria-label','返回商城');status.textContent='';modal.querySelector('.journal-scroll').scrollTop=scrollTop;}
  function listParams(morePage) {
    if(morePage) {const params=new URLSearchParams(loadedFilters);params.set('cursor',nextCursor);params.set('snapshot',snapshot);return '?' + params;}
    const params=new URLSearchParams();
    for(const key of ['type','start','end']) {const value=form.elements[key].value;if(value)params.set(key,value);}
    if(params.get('start')&&params.get('end')&&params.get('start')>params.get('end'))throw Error('起始日期不可晚於結束日期');
    return '?' + params;
  }
  async function load(morePage=false) {
    if(busy||!current())return;
    const ticket=++revision;setBusy(true);status.textContent='載入消費日誌中…';
    try {
      const params=listParams(morePage);
      const result=await client.request(params);if(!current()||ticket!==revision)return;
      if(!Array.isArray(result.items)||typeof result.snapshot!=='string'||!Number.isSafeInteger(result.unreadCount)||result.unreadCount<0||result.items.some(row=>!row||typeof row.id!=='string'||!['store','online'].includes(row.source)))throw Error('消費日誌資料格式有誤，請重新整理');
      const combined=morePage?[...rows,...result.items]:result.items;rows=[...new Map(combined.map(row=>[row.id,row])).values()];snapshot=result.snapshot;nextCursor=result.nextCursor||'';unreadCount=result.unreadCount;if(!morePage)loadedFilters=params.slice(1);paintRows();
      status.textContent=rows.length ? '僅列交易紀錄；店內應付金額不代表已收款。' : '這段期間沒有消費紀錄。';
    } catch(error) {if(current()&&ticket===revision)status.textContent=(rows.length?'原紀錄保留。':'')+error.message;}
    finally {if(current()&&ticket===revision)setBusy(false);}
  }
  async function detail(id) {
    if(busy||!current())return;
    const ticket=++revision;setBusy(true);status.textContent='載入交易明細中…';
    try {
      const result=await client.request('/detail?id='+encodeURIComponent(id)+'&snapshot='+encodeURIComponent(snapshot));if(!current()||ticket!==revision)return;
      const row=result.item;if(!row||row.id!==id||!['store','online'].includes(row.source))throw Error('交易明細資料格式有誤');
      scrollTop=modal.querySelector('.journal-scroll').scrollTop;detailId=id;listView.hidden=true;detailView.hidden=false;back.setAttribute('aria-label','返回消費列表');
      detailView.innerHTML=`<h3 class="journal-detail-title">${esc(row.shopName||'交易明細')}</h3><p>${esc(row.title||'消費交易')}</p><dl class="journal-detail-fields"><dt>交易時間</dt><dd>${esc(journalTime(row.occurredAt))}（台灣）</dd><dt>交易編號</dt><dd>${esc(row.transactionId||row.sourceId||row.id)}</dd><dt>消費金額</dt><dd>${esc(journalMoney(row.amountCents))}</dd>${row.source==='store'?`<dt>折抵點數</dt><dd>${esc(pointText(row.discountPoints))}</dd><dt>消費贈點</dt><dd>${esc(pointText(row.earnedPoints))}</dd>`:''}<dt>${row.source==='online'&&row.paymentStatus==='cancelled'?'原訂單金額':row.paymentStatus==='paid'&&row.source==='online'?'已付金額':'應付金額'}</dt><dd>${esc(journalMoney(row.payableCents))}</dd>${row.source==='online'?`<dt>內含運費</dt><dd>${esc(journalMoney(row.shippingFeeCents))}</dd>`:''}<dt>交易狀態</dt><dd>${esc(statusText(row))}</dd></dl>${Array.isArray(row.items)&&row.items.length?'<h4>商品明細</h4><ul class="journal-items">'+row.items.map(item=>`<li><span>${esc(item.title)} × ${esc(typeof item.quantity==='number'&&Number.isSafeInteger(item.quantity)&&item.quantity>0?item.quantity:'數量未提供')}</span><strong>${esc(journalMoney(item.lineTotalCents))}</strong></li>`).join('')+'</ul>':'<p class="journal-note">這筆交易未提供逐項商品明細。</p>'}<p class="journal-note">${esc(row.notice||'')}</p><p class="journal-note">${row.source==='store'?'本紀錄代表店家登錄消費與點數操作，不是付款收據或發票。':'付款與寄送進度以網購訂單為準；需要回報匯款請至「我的網路訂單」。'}</p>`;
      modal.querySelector('.journal-scroll').scrollTop=0;status.textContent='';
      const read=await client.request('/read',{id,snapshot});if(!current()||ticket!==revision)return;
      rows=rows.map(item=>item.id===id?{...item,unread:false}:item);if(Number.isSafeInteger(read.unreadCount)&&read.unreadCount>=0)unreadCount=read.unreadCount;paintRows();
    } catch(error) {if(current()&&ticket===revision)status.textContent=(detailId?'明細已載入，但已讀狀態尚未儲存。':'')+error.message;}
    finally {if(current()&&ticket===revision)setBusy(false);}
  }
  async function readAll() {
    if(busy||!snapshot||!current())return;
    const ticket=++revision;setBusy(true);status.textContent='儲存已讀狀態中…';
    try {const result=await client.request('/read-all',{snapshot});if(!current()||ticket!==revision)return;rows=rows.map(row=>({...row,unread:false}));if(Number.isSafeInteger(result.unreadCount)&&result.unreadCount>=0)unreadCount=result.unreadCount;paintRows();status.textContent='本次載入範圍已標示為已讀；之後的新交易不受影響。';}
    catch(error){if(current()&&ticket===revision)status.textContent='已讀狀態尚未儲存。'+error.message;}
    finally{if(current()&&ticket===revision)setBusy(false);}
  }
  form.addEventListener('submit',event=>{event.preventDefault();void load();});
  modal.addEventListener('click',event=>{
    const button=event.target.closest('button[data-journal]');if(!button||!modal.contains(button)||button.disabled)return;
    switch(button.dataset.journal) {
      case 'close':close();break;
      case 'list':if(detailId){showList();setBusy(false);}else close();break;
      case 'refresh':void load();break;
      case 'more':void load(true);break;
      case 'detail':void detail(button.dataset.id);break;
      case 'read-all':void readAll();break;
      case 'points':close();onPoints?.();break;
    }
  });
  modal.addEventListener('cancel',event=>{event.preventDefault();close();});modal.addEventListener('close',cleanup,{once:true});
  modal.showModal();timer=setInterval(()=>{if(!current())close();},200);void load();return modal;
}
