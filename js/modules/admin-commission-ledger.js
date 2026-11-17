(() => {
 'use strict';
 const el=name=>document.getElementById('commission-ledger-'+name);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={review_required:'待核對',frozen:'凍結中',payable:'可給付',paid:'已付款（系統紀錄）',reversed:'已沖回',service_ineligible:'服務資格不符',cancelled:'已取消'};
 const states=Object.keys(labels),label=s=>labels[s]||String(s||'未標示狀態');
 const bonusType=s=>s==='legacy_manual_direct'?'歷史推薦獎金（人工補登）':s;
 const reviewLabel=s=>({accepted:'已審核',pending:'待審核',rejected:'已退件'}[s]||'未登錄');
 const money=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('zh-TW',{maximumFractionDigits:2}):'—';
 const formatTime=value=>{if(!value)return '';let s=String(value).trim();if(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(s))s=s.replace(' ','T')+'Z';const d=new Date(s);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(d)};
 const state={mode:'summary',member:'',memberName:'',page:1,pageSize:30,total:0,rows:[],seq:0,exporting:false};let timer;
 const params=page=>({mode:state.mode,page,q:el('search').value.trim(),month:el('month').value,...(state.mode==='summary'?{}:{member:state.member})});
 function message(text,error=false){const node=el('message');node.textContent=text;node.classList.toggle('text-red-700',error);node.classList.toggle('text-slate-500',!error)}
 async function request(data){
  if(!window.liff?.isLoggedIn?.())throw Error('請先登入 LINE，再重新開啟總帳。');
  const token=window.liff.getAccessToken();if(!token)throw Error('登入已失效，請重新登入。');
  const url=new URL('/v1/partner-contracts/commission-ledger',WORKER_URL);
  for(const [key,value] of Object.entries(data))if(value!==''&&value!=null)url.searchParams.set(key,String(value));
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000)});
  const body=await response.json();if(!response.ok||body?.success!==true)throw Error(body?.error||'總帳讀取失敗。');
  if(!window.liff?.isLoggedIn?.()||window.liff.getAccessToken()!==token)throw Error('登入已變更，請重新開啟總帳。');
  if(!Array.isArray(body.rows)||!Number.isSafeInteger(Number(body.total))||Number(body.total)<0||!Number.isSafeInteger(Number(body.pageSize))||Number(body.pageSize)<1)throw Error('總帳資料不完整，請重新查詢。');
  return body;
 }
 function controls(){
  for(const mode of ['summary','awards','payments']){const node=el(mode),active=state.mode===mode;node.classList.toggle('bg-slate-800',active);node.classList.toggle('text-white',active);node.setAttribute('aria-pressed',String(active));node.disabled=state.exporting;}
  el('selection').textContent=state.member?'目前會員：'+(state.memberName||'未能唯一辨識會員')+'。按「經銷商總覽」可返回。':'目前顯示全部符合條件的會員；也可選擇個別會員查看明細。';
  el('page').textContent='第 '+state.page+' 頁，共 '+state.total.toLocaleString('zh-TW')+(state.mode==='summary'?' 位會員':' 筆紀錄');
  el('prev').disabled=state.exporting||state.page<=1;el('next').disabled=state.exporting||state.page*state.pageSize>=state.total;el('export').disabled=state.exporting||!state.total;
 }
 const otherAmount=row=>Object.entries(row.statusAmounts||{}).reduce((sum,[key,value])=>states.includes(key)?sum:sum+Number(value||0),0);
 function table(){
  const summary=state.mode==='summary',awards=state.mode==='awards';
  const headings=summary?['會員','手簽收款資料','手簽狀態','流水筆數',...states.map(label),'其他狀態','已登錄銀行付款','舊月結已付標記','明細']:
   awards?['傭金領取者','購買人','業績歸屬月','獎金類型','金額','狀態','訂單編號','流水編號','建立時間','結算時間']:['會員','付款時間','來源','金額','銀行付款憑證','帳單／批次','登錄時間'];
  el('head').innerHTML='<tr>'+headings.map(x=>'<th class="px-3 py-3 whitespace-nowrap">'+esc(x)+'</th>').join('')+'</tr>';
  if(!state.rows.length){el('body').innerHTML=`<tr><td colspan="${headings.length}" class="p-8 text-center text-slate-500">目前沒有符合條件的資料。</td></tr>`;return;}
  el('body').innerHTML=state.rows.map((row,index)=>{
   let cells;
   if(summary){
    const bank=row.bank?`${esc(row.bank.name)} ${esc(row.bank.code)} ${esc(row.bank.branch)}<br>戶名：${esc(row.bank.holder)}<br>帳號：<span data-bank-value="${index}">${esc('末 '+row.bank.account.slice(-4)+' 碼')}</span> <button type="button" data-reveal="${index}" class="text-blue-700 underline">顯示完整帳號</button>`:'尚無可用收款資料';
    const bankStatus=row.bankStatus==='accepted'?'<span class="text-emerald-700">已審核</span>':`<span class="text-red-700 font-bold">${esc(row.bankWarning||'資料需核對')}</span>`;
    cells=[`<strong>${esc(row.memberName||'未能唯一辨識會員')}</strong>${!row.memberName&&row.applicationName?`<br><span class="text-xs text-red-700">申請書姓名：${esc(row.applicationName)}（身分待核）</span>`:''}<br><span class="text-xs text-slate-500">會員編號：${esc(row.memberNumber||'未登錄')}<br>${esc(row.memberId)}</span>`,bank+`<br><span class="text-xs text-slate-500">簽署：${esc(formatTime(row.bankSignedAt))}</span>`,bankStatus,esc(row.awardCount),...states.map(s=>esc(money(row.statusAmounts?.[s]??0))),esc(money(otherAmount(row))),`${esc(row.paymentCount)} 筆<br>NT$ ${esc(money(row.paymentAmount))}`,`${esc(row.legacyPaymentCount)} 批<br>NT$ ${esc(money(row.legacyPaymentAmount))}`,`<button type="button" data-awards="${index}" class="text-blue-700 underline">傭金明細</button><br><button type="button" data-payments="${index}" class="text-blue-700 underline mt-2">匯款紀錄</button>`];
   }else if(awards)cells=[esc(row.memberName||state.memberName||row.memberId||'未能辨識會員'),esc(row.buyerName||'未記錄'),esc(row.performanceMonth||'待核對'),esc(bonusType(row.bonusType)),esc(money(row.amount)),esc(label(row.status)),esc(row.orderId),esc(row.txId),esc(formatTime(row.createdAt)),esc(formatTime(row.settledAt))];
   else cells=[esc(row.memberName||state.memberName||row.memberId||'未能辨識會員'),esc(formatTime(row.paidAt)),esc(row.source==='confirmed'?'已登錄銀行付款':'舊月結已付標記（無銀行憑證）'),esc(money(row.amount)),esc(row.paymentRef||'未提供'),esc(row.statementId),esc(formatTime(row.recordedAt))];
   return '<tr>'+cells.map(c=>'<td class="px-3 py-3 align-top whitespace-nowrap">'+c+'</td>').join('')+'</tr>';
  }).join('');
 }
 async function load(){
  const seq=++state.seq;message('讀取中…');el('export').disabled=true;
  try{const data=await request(params(state.page));if(seq!==state.seq)return;state.rows=data.rows;state.total=Number(data.total);state.pageSize=Number(data.pageSize);
   if(state.page>1&&!state.rows.length&&state.total<=(state.page-1)*state.pageSize){state.page=Math.max(1,Math.ceil(state.total/state.pageSize));return load()}
   table();controls();const warnings=[];if(data.legacySource===false)warnings.push('舊月結資料來源尚未建立');
   if(data.unresolved?.awards||data.unresolved?.payments)warnings.push(`全站另有 ${Number(data.unresolved.awards||0)} 筆傭金、${Number(data.unresolved.payments||0)} 筆付款無會員身分，需核對`);
   message(warnings.length?warnings.join('；')+'。':state.total?'資料已載入；已登錄銀行付款與舊月結標記分開列示。':'目前沒有符合條件的資料。',warnings.length>0);
  }catch(error){if(seq!==state.seq)return;state.rows=[];state.total=0;table();controls();message(error.name==='TimeoutError'?'讀取逾時，請重新查詢。':error.message,true)}
 }
 function csvCell(value){let s=String(value??'');if(typeof value!=='number'&&(/^[\s\uFEFF]*[=+\-@]/u.test(s)||/^[\t\r]/.test(s)))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
 async function exportAll(){
  if(state.exporting||!state.total)return;clearTimeout(timer);state.seq++;state.exporting=true;controls();
  const data=params(1),mode=state.mode,memberName=state.memberName,disabled=[...el('filters').elements,el('summary'),el('awards'),el('payments')],prior=disabled.map(x=>x.disabled);disabled.forEach(x=>x.disabled=true);
  try{message('正在讀取所有符合條件的資料，請稍候…');const rows=[],seen=new Set();let total=null,unresolved=null;
   for(let page=1;;page++){const result=await request({...data,page});if(total===null){total=Number(result.total);unresolved=result.unresolved||null;}if(Number(result.total)!==total||(mode==='summary'&&JSON.stringify(result.unresolved||null)!==JSON.stringify(unresolved)))throw Error('匯出期間資料筆數已變動，請重新匯出。');
    for(const row of result.rows){const key=mode==='summary'?row.memberId:mode==='awards'?row.txId:row.source+'|'+row.paymentId+'|'+String(row.memberId||'');if(!key||seen.has(key))throw Error('匯出資料已變動或不完整，請重新匯出。');seen.add(key);rows.push(row)}
    if(rows.length===total)break;if(!result.rows.length||rows.length>total)throw Error('匯出資料不完整，請重新匯出。');}
   let headers,records;if(mode==='summary'){
    headers=['會員姓名','會員編號','會員識別碼','申請書姓名','申請書單位','銀行名稱','銀行代碼','分行','戶名','銀行帳號','手簽審核狀態','銀行資料提醒','簽署時間','手簽申請編號','傭金流水筆數',...states.map(label),'其他狀態','已登錄銀行付款筆數','已登錄銀行付款金額','舊月結已付批數','舊月結已付金額'];
    records=rows.map(r=>[r.memberName,r.memberNumber,r.memberId,r.applicationName,r.applicationUnit,r.bank?.name,r.bank?.code,r.bank?.branch,r.bank?.holder,r.bank?.account,reviewLabel(r.bankReview),r.bankWarning,formatTime(r.bankSignedAt),r.bankApplicationId,Number(r.awardCount),...states.map(s=>Number(r.statusAmounts?.[s]??0)),otherAmount(r),Number(r.paymentCount),Number(r.paymentAmount),Number(r.legacyPaymentCount),Number(r.legacyPaymentAmount)]);
    if(unresolved?.awards||unresolved?.payments){const warning=Array(headers.length).fill('');warning[0]='未能對應會員（請查看明細）';warning[11]=`全站另有 ${Number(unresolved.awards||0)} 筆傭金、${Number(unresolved.payments||0)} 筆付款需核對`;warning[14]=Number(unresolved.awards||0);records.push(warning);}
   }else if(mode==='awards'){
    headers=['傭金領取者','會員編號','會員識別碼','購買人','業績歸屬月份','獎金類型','金額','狀態','訂單編號','流水編號','建立時間','結算時間'];records=rows.map(r=>[r.memberName||memberName,r.memberNumber,r.memberId,r.buyerName,r.performanceMonth,bonusType(r.bonusType),Number(r.amount),label(r.status),r.orderId,r.txId,formatTime(r.createdAt),formatTime(r.settledAt)]);
   }else{
    headers=['會員','會員編號','會員識別碼','付款時間','來源','金額','銀行付款憑證','帳單／批次編號','登錄時間'];records=rows.map(r=>[r.memberName||memberName,r.memberNumber,r.memberId,formatTime(r.paidAt),r.source==='confirmed'?'已登錄銀行付款':'舊月結已付標記（無銀行憑證）',Number(r.amount),r.paymentRef,r.statementId,formatTime(r.recordedAt)]);
   }
   const csv='\uFEFF'+[headers,...records].map(r=>r.map(csvCell).join(',')).join('\r\n'),blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='傭金匯款總帳-'+({summary:'經銷商總覽',awards:'傭金明細',payments:'匯款紀錄'}[mode])+'.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);message('已匯出 '+rows.length.toLocaleString('zh-TW')+' 筆；資料若有變動，請重新匯出。');
  }catch(error){message(error.name==='TimeoutError'?'匯出逾時，請重新匯出。':error.message,true)}finally{disabled.forEach((node,i)=>node.disabled=prior[i]);state.exporting=false;controls()}
 }
 el('filters').addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);state.page=1;void load()});
 el('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{state.member='';state.mode='summary';state.page=1;void load()},300)});
 el('reset').addEventListener('click',()=>{el('filters').reset();state.member='';state.memberName='';state.mode='summary';state.page=1;void load()});
 el('summary').addEventListener('click',()=>{state.mode='summary';state.member='';state.memberName='';state.page=1;void load()});
 for(const mode of ['awards','payments'])el(mode).addEventListener('click',()=>{state.mode=mode;state.page=1;void load()});
 el('prev').addEventListener('click',()=>{if(state.page>1){state.page--;void load()}});el('next').addEventListener('click',()=>{if(state.page*state.pageSize<state.total){state.page++;void load()}});el('export').addEventListener('click',()=>void exportAll());
 el('body').addEventListener('click',event=>{const button=event.target.closest('[data-reveal],[data-awards],[data-payments]');if(!button)return;
  if(button.dataset.reveal!==undefined){const row=state.rows[Number(button.dataset.reveal)],value=el('body').querySelector(`[data-bank-value="${Number(button.dataset.reveal)}"]`);if(!row?.bank||!value)return;const show=button.dataset.shown!=='1';value.textContent=show?row.bank.account:'末 '+row.bank.account.slice(-4)+' 碼';button.dataset.shown=show?'1':'0';button.textContent=show?'隱藏帳號':'顯示完整帳號';return;}
  const mode=button.dataset.awards!==undefined?'awards':'payments',row=state.rows[Number(button.dataset[mode])];if(!row)return;state.member=row.memberId;state.memberName=row.memberName||row.memberId;state.mode=mode;state.page=1;void load();
 });
 window.loadAdminCommissionLedger=()=>{state.page=1;void load()};
})();
