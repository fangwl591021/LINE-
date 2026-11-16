(() => {
  'use strict';
  const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!=null)el.textContent=String(text);if(cls)el.className=cls;return el;};
  const money=value=>'NT$ '+(Number(value)||0).toLocaleString('zh-TW');
  const time=value=>{const raw=String(value||'');const date=new Date(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(raw)?raw.replace(' ','T')+'Z':raw);return Number.isFinite(date.getTime())?date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'時間待核對';};
  const statusNames={review_required:'待核對',frozen:'凍結中',payable:'可給付',paid:'系統標記已付款',reversed:'已沖銷',service_ineligible:'服務資格待核',cancelled:'已取消'};
  const types={direct_full:'直接推薦獎金',direct_split:'直接推薦獎金',first_two_passup:'推薦承接獎金',renewal_referral:'續約推薦獎金',renewal_placement:'續約歸屬獎金',legacy_manual_direct:'歷史推薦獎金（人工補登）'};
  const status=value=>statusNames[value]||'狀態待核對';
  const needsReview=value=>!['payable','paid'].includes(value);
  function addCard(box,title,value){const card=make('div',null,'dealer-account-card');card.append(make('small',title),make('strong',value));box.append(card);}
  function addRow(box,title,lines,warning=false){const row=make('div',null,'dealer-account-row');row.append(make('strong',title));for(const line of lines)row.append(make('p',line,warning?'dealer-account-warning':''));box.append(row);}
  function section(title){const el=make('section',null,'dealer-account-section');el.append(make('h3',title));return el;}
  function pager(page,total,size,onChange){
    const area=make('div',null,'dealer-account-pager'),prev=make('button','上一頁'),next=make('button','下一頁');
    const pages=Math.max(1,Math.ceil(total/size));prev.type=next.type='button';prev.disabled=page<=1;next.disabled=page>=pages;
    prev.onclick=()=>onChange(page-1);next.onclick=()=>onChange(page+1);area.append(prev,make('span',`${page} / ${pages}`),next);return area;
  }
  function renderAccount(container,data,changePage){
    container.replaceChildren();
    if(data.identityReview)container.append(make('p','部分歷史身分尚未完成歸戶，可能有資料待核對，請聯絡管理員。','dealer-account-warning'));
    const perf=data.performance,bonus=data.bonus,summary=make('div',null,'dealer-account-cards');
    const totals=Object.fromEntries((bonus.totals||[]).map(row=>[row.status,Number(row.amount)||0]));
    addCard(summary,'已確認且目前已收款成交',`${perf.paidCount} 筆`);
    addCard(summary,'已確認成交金額（含稅）',money(perf.paidAmount));
    addCard(summary,'待確認推薦快照（依建立月）',`${perf.pendingCount} 筆`);
    addCard(summary,'歷史補登業績（待對帳）',`${perf.historicPendingCount||0} 筆`);
    addCard(summary,'獎金待核對',money(totals.review_required));
    addCard(summary,'獎金凍結中',money(totals.frozen));
    addCard(summary,'獎金可給付',money(totals.payable));
    addCard(summary,'獎金系統標記已付款',money(totals.paid));
    container.append(summary,make('p','業績以已確認推薦成交為準；待確認數僅含已建立推薦快照的訂單。歷史補登為管理者提供的舊資料，待對帳且不列入新制確認成交。獎金依流水狀態顯示，付款狀態不代表銀行匯款憑證。','dealer-account-note'));
    if(perf.historicPendingCount)container.append(make('p','歷史補登資料尚待對帳，未代表已付款。','dealer-account-warning'));
    const dealBox=section('我的推薦業績');
    if(!perf.rows.length)dealBox.append(make('p','此期間沒有已確認的推薦成交。','dealer-account-note'));
    for(const row of perf.rows){
      const paid=row.paymentStatus==='paid',title=(row.buyerName||'會員資料待核對')+'｜'+(row.dealType==='tenant_renewal_fee'?'續約成交':'推薦成交');
      addRow(dealBox,title,[`業績月份：${row.performanceMonth||'待核對'}｜${paid?'已確認、目前已收款':'收款狀態待核對'}`,`訂單金額：${money(row.grossAmount)}｜訂單：${row.orderId||'待核對'}`],!paid||!row.buyerName);
    }
    dealBox.append(pager(perf.page,perf.total,perf.pageSize,page=>changePage('dealPage',page)));container.append(dealBox);
    const bonusBox=section('我的獎金明細');
    if(!bonus.rows.length)bonusBox.append(make('p','此期間沒有已建立的獎金流水；待確認的業績不代表已產生獎金。','dealer-account-note'));
    for(const row of bonus.rows){
      const title=(types[row.bonusType]||'獎金流水')+'｜'+money(row.amount);
      addRow(bonusBox,title,[`${status(row.status)}｜業績月份：${row.performanceMonth||'待核對'}`,`訂單：${row.orderId||'未提供'}｜流水時間：${time(row.createdAt)}（台灣時間）`],needsReview(row.status));
    }
    bonusBox.append(pager(bonus.page,bonus.total,bonus.pageSize,page=>changePage('bonusPage',page)));container.append(bonusBox);
  }
  window.openDealerAccount=function(){
    if(document.querySelector('dialog.dealer-account-dialog'))return;
    const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken?.():'';
    const profile=window.currentUserProfile?.userId||'',context=window.liff?.getContext?.()?.userId||'';
    if(!token||!profile||(context&&context!==profile)){window.showToast?.('請先以本人 LINE 帳號登入',true);return;}
    const dialog=make('dialog',null,'dealer-account-dialog');dialog.setAttribute('aria-label','經銷商帳務專區');
    const shell=make('div',null,'dealer-account-shell'),head=make('header',null,'dealer-account-head'),close=make('button','關閉');close.type='button';close.onclick=()=>dialog.close();head.append(make('h2','經銷商帳務專區'),close);
    const tabs=make('nav',null,'dealer-account-tabs'),accountTab=make('button','業績與獎金'),orgTab=make('button','我的組織圖');accountTab.type=orgTab.type='button';tabs.append(accountTab,orgTab);
    const body=make('div',null,'dealer-account-body'),accountPane=make('section'),orgPane=make('section',null,'dealer-account-org');orgPane.hidden=true;
    const filter=make('div',null,'dealer-account-filter dealer-account-actions'),monthLabel=make('label','業績歸屬月份'),month=make('input');month.type='month';monthLabel.append(month);
    const search=make('button','查詢'),reset=make('button','全部月份');search.type=reset.type='button';filter.append(monthLabel,search,reset);
    const result=make('div'),message=make('p','讀取帳務資料中…','dealer-account-note');message.setAttribute('role','status');
    accountPane.append(make('p','僅顯示本人資料。未完成確認的成交與獎金，請依狀態與管理員核對。','dealer-account-note'),filter,message,result);
    const orgTools=make('div',null,'org-toolbar'),depthLabel=make('label','顯示代數 '),depth=make('select');
    for(const n of [2,3,5,10]){const option=make('option',`${n} 代`);option.value=String(n);option.selected=n===3;depth.append(option);}depthLabel.append(depth);orgTools.append(depthLabel);
    const orgBox=make('div');orgPane.append(orgTools,orgBox);body.append(accountPane,orgPane);shell.append(head,tabs,body);dialog.append(shell);document.body.append(dialog);
    let bonusPage=1,dealPage=1,sequence=0,controller=null;const page=window.currentPage;
    const current=()=>dialog.open&&page===window.currentPage&&profile===window.currentUserProfile?.userId&&token===window.liff?.getAccessToken?.()&&(!context||context===window.liff?.getContext?.()?.userId);
    async function load(){
      const ticket=++sequence;controller?.abort();const requestController=new AbortController();controller=requestController;const timeout=setTimeout(()=>requestController.abort(),20000);
      message.textContent='讀取帳務資料中…';message.className='dealer-account-note';result.replaceChildren();
      try{
        const base=window.Config?.WORKER_URL||(typeof WORKER_URL==='undefined'?'':WORKER_URL);if(!base)throw Error('帳務服務尚未載入');
        const url=new URL('/v1/dealer-account',base);if(month.value)url.searchParams.set('month',month.value);url.searchParams.set('bonusPage',String(bonusPage));url.searchParams.set('dealPage',String(dealPage));
        const response=await fetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:requestController.signal});const data=await response.json();
        if(!current()||ticket!==sequence)return;if(!response.ok||!data.success)throw Error(data.error||'帳務資料暫時無法讀取');
        message.textContent=month.value?`${month.value} 的帳務資料`:'全部月份的帳務資料';
        renderAccount(result,data,(key,value)=>{if(key==='bonusPage')bonusPage=value;else dealPage=value;void load();});
      }catch(error){if(!current()||ticket!==sequence)return;message.className='dealer-account-warning';message.textContent=error.name==='AbortError'?'查詢逾時，請重新查詢。':error.message;}
      finally{clearTimeout(timeout);}
    }
    const selectTab=org=>{accountPane.hidden=org;orgPane.hidden=!org;accountTab.setAttribute('aria-selected',String(!org));orgTab.setAttribute('aria-selected',String(org));if(org){if(window.ContractOrganization?.render)void window.ContractOrganization.render(orgBox,{depth:Number(depth.value)});else orgBox.replaceChildren(make('p','組織圖服務尚未載入，請重新進入。','dealer-account-warning'));}};
    accountTab.onclick=()=>selectTab(false);orgTab.onclick=()=>selectTab(true);depth.onchange=()=>{if(!orgPane.hidden)selectTab(true)};
    search.onclick=()=>{bonusPage=dealPage=1;void load()};reset.onclick=()=>{month.value='';bonusPage=dealPage=1;void load()};
    const timer=setInterval(()=>{if(!current())dialog.close()},500);
    dialog.addEventListener('close',()=>{sequence++;controller?.abort();clearInterval(timer);window.ContractOrganization?.cancel?.(orgBox);dialog.remove()},{once:true});
    dialog.showModal();selectTab(false);void load();
  };
})();
