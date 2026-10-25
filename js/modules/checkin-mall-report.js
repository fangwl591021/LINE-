// Admin-only, read-only report. No wallet, sending or member mutation controls.
window.mountCheckinMallReport = async function(root,{api,isCurrent=()=>true}={}) {
  root.replaceChildren();
  const note=document.createElement('p');note.textContent='只統計新版卡片登入驗證後的進入。不是已讀、實際按壓或購買人數；同人／同卡／同按鈕一分鐘內合併一次。LINE 接受推播不代表已送達。';
  const form=document.createElement('form');form.className='flex flex-wrap gap-3 items-end';
  const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10),week=new Date(Date.now()-6*86400000+8*3600000).toISOString().slice(0,10);
  function dateInput(title,value){const label=document.createElement('label');label.textContent=title;label.className='flex flex-col gap-1';const input=document.createElement('input');input.type='date';input.value=value;input.required=true;input.className='border rounded-lg p-2';label.append(input);form.append(label);return input;}
  const from=dateInput('起日（台灣時間）',week),to=dateInput('迄日（最多31日）',today);
  const submit=document.createElement('button');submit.type='submit';submit.textContent='查詢報告';submit.className='px-4 py-2 bg-emerald-700 text-white rounded-lg';form.append(submit);
  const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const summary=document.createElement('p'),delivery=document.createElement('p');summary.className='text-lg font-bold';
  const wrap=document.createElement('div');wrap.className='overflow-x-auto';
  const table=document.createElement('table');table.className='w-full text-sm text-left';table.setAttribute('aria-label','新版卡片已驗證進入明細');
  const head=document.createElement('thead'),tr=document.createElement('tr');for(const title of ['進入者（LINE顯示名稱）','按鈕／商品','店家','進入時間（台灣）','卡片來源']){const th=document.createElement('th');th.textContent=title;th.scope='col';th.className='p-2 border-b whitespace-nowrap';tr.append(th);}head.append(tr);
  const body=document.createElement('tbody');table.append(head,body);wrap.append(table);
  const more=document.createElement('button');more.type='button';more.textContent='載入更多';more.hidden=true;more.className='px-4 py-2 border rounded-lg';
  root.append(note,form,status,summary,delivery,wrap,more);
  let next='',pending=false,revision=0,range={from:week,to:today};
  function clear(){body.replaceChildren();summary.textContent='';delivery.textContent='';next='';more.hidden=true;}
  async function load(append=false){
    if(pending||!isCurrent())return;
    pending=true;submit.disabled=more.disabled=true;const ticket=++revision;
    if(!append){range={from:from.value,to:to.value};clear();}status.textContent='報告載入中…';
    try {
      const query=new URLSearchParams(range);if(append&&next)query.set('after',next);
      const result=await api('/report?'+query);
      if(!isCurrent()||ticket!==revision){clear();return;}
      if(!result?.success||!result.summary||!result.cards||!Array.isArray(result.rows))throw Error('報告資料不完整');
      const n=value=>Number(value||0).toLocaleString('zh-TW'),s=result.summary,c=result.cards;
      summary.textContent=`有效進入 ${n(s.entries)} 次　不重複進入者 ${n(s.people)} 人　商城 ${n(s.mall)} 次　明細 ${n(s.details)} 次　商品 ${n(s.products)} 次`;
      delivery.textContent=`期間建立卡片 ${n(c.total)} 張；LINE 已接受 ${n(c.accepted)} 張、送出結果未確認 ${n(c.unknown)} 張、準備中 ${n(c.preparing)} 張、失敗 ${n(c.failed)} 張。`;
      for(const row of result.rows){const line=document.createElement('tr');const action=row.action==='product'?'查看商品：'+String(row.product_title||'商品資訊已封存'):row.action==='mall'?'前往商城':'查看明細';for(const value of [String(row.actor_name||'未提供顯示名稱'),action,row.action==='product'?String(row.shop_name||'未提供店名'):'—',new Date(row.clicked_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}),'會員打卡 · '+String(row.card_id).slice(0,8)]){const cell=document.createElement('td');cell.textContent=value;cell.className='p-2 border-b align-top break-words';line.append(cell);}body.append(line);}
      next=result.next||'';more.hidden=!next;status.textContent=body.children.length?'已載入 '+body.children.length+' 筆。':'此期間尚無已驗證進入紀錄。';
    }catch(e){if(isCurrent()&&ticket===revision){status.textContent=e.message||'報告暫時無法取得';if(!append)clear();}}
    finally{pending=false;submit.disabled=more.disabled=false;}
  }
  form.onsubmit=event=>{event.preventDefault();void load();};more.onclick=()=>{void load(true);};
  await load();
};

window.loadAdminCheckinMallReport = async function(){
  const root=document.getElementById('checkin-mall-report-content'),tab=document.getElementById('tab-checkin-mall-report');
  if(!root||!tab)return;
  const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
  if(adminRole!=='admin'||!token){root.textContent='僅限管理員 LINE 帳號查看。';return;}
  const stamp=String(Number(root.dataset.epoch||0)+1);root.dataset.epoch=stamp;
  const current=()=>root.dataset.epoch===stamp&&!tab.classList.contains('hidden')&&adminRole==='admin'&&window.liff?.isLoggedIn?.()&&window.liff.getAccessToken()===token;
  const api=async path=>{
    if(!current())throw Error('登入或頁面已變更');
    const response=await fetch(WORKER_URL.replace(/\/+$/,'')+'/v1/checkin-mall'+path,{headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(15000)});
    const data=await response.json();if(!current())throw Error('登入或頁面已變更');
    if(!response.ok||data?.success!==true)throw Error(data.error||'無法取得報告');return data;
  };
  await window.mountCheckinMallReport(root,{api,isCurrent:current});
};
