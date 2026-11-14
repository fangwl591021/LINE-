// Administrative ordering drafts only: no payout or verified bonus calculation.
let mounted = false;
export function mount({workerUrl, session}) {
  if (mounted) return;
  const tab = document.getElementById('tab-bonus');
  const anchor = document.getElementById('bonus-order-status-filter');
  if (!tab || !anchor) return;
  mounted = true;
  const make = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
  const button = (text, fn) => { const n = make('button', text); n.type = 'button'; n.addEventListener('click', fn); return n; };
  const reasonText = {ORDERING_SCOPE_UNVERIFIED:'排序範圍完整性待核',PURCHASE_AT_DEAL_UNVERIFIED:'成交當時的購買狀況待核',UPLINE_HISTORY_UNVERIFIED:'上線歷史關係待核',SERVICE_ACTIVATION_UNVERIFIED:'服務開通狀況待核',CONTRACT_VERSION_OR_EFFECTIVE_TIME_UNVERIFIED:'合約版本或生效時間待核',SIGNED_APPLICATION_UNVERIFIED:'簽署申請資料待核',ORDER_NOT_PAID:'收款狀態待核',PERFORMANCE_DATE_MISSING:'業績日期未填',DATE_OUTSIDE_SCOPE:'業績日期不在本次範圍',EXISTING_CONFIRMATION_IMPACT:'已有成交確認或獎勵紀錄，須核對影響',AWARDS_TRUNCATED:'既存獎勵紀錄超過顯示上限'};
  Object.assign(reasonText,{PRIOR_QUALIFICATION_BASELINE_UNVERIFIED:'既有資格基準待核',ORDER_IDENTITY_UNVERIFIED:'訂單身分待核',SERVICE_ACTIVATION_AT_DEAL_UNVERIFIED:'成交時服務開通狀況待核',SIGNED_AT_DEAL_UNVERIFIED:'成交時簽署狀況待核',SCOPE_ORDER_MISSING:'範圍內訂單未列入',SCOPE_ORDER_DATE_UNVERIFIED:'範圍內訂單日期待核',SCOPE_REQUIRES_NARROWER_REVIEW:'範圍需縮小後核對',SEQUENCE_DATE_CONFLICT:'排序與業績日期不一致',QUALIFICATION_QUERY_BUDGET_EXCEEDED:'資格資料超出查核範圍',QUALIFICATION_EVIDENCE_UNVERIFIED:'資格證據待核',BATCH_DEPENDENCIES_UNVERIFIED:'批次相依資料待核',ORDER_AMOUNT_UNVERIFIED:'訂單金額、稅額或幣別待核'});
  Object.assign(reasonText,{ORDERING_SCOPE_OR_EXISTING_AWARDS_UNVERIFIED:'排序範圍或既有獎勵紀錄待核',BATCH_INPUT_UNVERIFIED:'批次輸入資料待核',ORDER_OR_EVIDENCE_UNVERIFIED:'訂單或佐證資料待核',RECRUITER_QUALIFICATION_UNVERIFIED:'推薦人資格待核',UPLINE_QUALIFICATION_UNVERIFIED:'上線資格待核',POLICY_FACTS_UNVERIFIED:'獎金制度適用資料待核',QUALIFICATION_READER_UNAVAILABLE:'資格資料暫時無法查詢',ORDER_OR_IDENTITY_UNVERIFIED:'訂單或身分資料待核',QUALIFICATION_TIME_UNVERIFIED:'資格生效時間待核',QUALIFICATION_CHANGES_IN_INTERVAL:'資格在該時段內有變動，須確認成交時間',PROJECT_AUTHORIZATION_UNVERIFIED:'專案授權資料待核',RECRUITER_CONTRACT_UNVERIFIED:'推薦人合約資料待核',UPLINE_CONTRACT_UNVERIFIED:'上線合約資料待核'});
  const explainReason=code=>typeof code==='string'&&Object.hasOwn(reasonText,code)?reasonText[code]:`其他資料待核，請聯繫管理員核對（代碼：${typeof code==='string'?code.slice(0,100):'未提供'}）`;
  const taipeiTime=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value))return '';const date=new Date(value);return Number.isFinite(date.valueOf())?new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(date):'';};
  const current = () => { try { return session() || {}; } catch { return {}; } };
  const allowed = s => s.role === 'admin' && !!s.uid && !!s.token;
  const same = (a,b) => allowed(a) && allowed(b) && a.uid === b.uid && a.token === b.token;
  const opener = button('批次排序與待核預覽', open); opener.className = 'bonus-sequence-open'; anchor.parentElement.append(opener);
  const style = make('style'); style.textContent = '.bonus-sequence-open{border:1px solid #94a3b8;border-radius:8px;padding:8px;color:#1d4ed8;font-weight:700}.bonus-sequence{width:min(96vw,1000px);max-height:92vh;overflow:auto;border:1px solid #94a3b8;border-radius:14px;padding:20px;background:white;color:#1e293b}.bonus-sequence::backdrop{background:#0f172a99}.bonus-sequence button{border:1px solid #94a3b8;border-radius:6px;padding:6px 10px;margin:3px}.bonus-sequence input,.bonus-sequence select{border:1px solid #94a3b8;border-radius:6px;padding:7px;margin:4px}.bonus-sequence label{display:block;margin-top:8px}.bonus-sequence .warn{color:#b91c1c;font-weight:700}.bonus-sequence .seq-card{border:1px solid #cbd5e1;border-radius:8px;padding:8px;margin:8px 0;overflow-wrap:anywhere}.bonus-sequence [data-status]{white-space:pre-wrap}'; document.head.append(style);
  let active = null, generation = 0;
  function close() { generation++; if (active) { active.modal.remove(); active = null; } }
  function sync() { const s=current(); opener.hidden=!allowed(s)||tab.classList.contains('hidden'); if(active&&(!same(active.session,s)||opener.hidden))close(); }
  setInterval(sync,1000); new MutationObserver(sync).observe(tab,{attributes:true,attributeFilter:['class']}); sync();
  async function open() {
    const s=current(); if (!allowed(s)||tab.classList.contains('hidden')) return; close();
    const modal=make('dialog'); modal.className='bonus-sequence'; modal.setAttribute('aria-label','批次排序草稿');
    const title=make('h2','批次排序草稿與待核預覽');
    const warning=make('p','系統無法證明歷史訂單完整。請先核對所有候選頁及其他原始資料，再依憑證排列；推薦人自 2026 年 10 月起重新計數。符合資料條件者可顯示獎金試算，缺件則待核。本次僅供預覽，未確認、未建立對帳、未核發或付款。'); warning.className='warn';
    const status=make('p','');status.dataset.status='1';status.setAttribute('role','status');
    const list=make('div'), selectedArea=make('div'), preview=make('div'), batchArea=make('div');
    const from=make('input');from.type='month';from.required=true;from.setAttribute('aria-label','起始月份');
    const to=make('input');to.type='month';to.required=true;to.setAttribute('aria-label','結束月份');
    const evidence=make('input');evidence.maxLength=500;evidence.required=true;evidence.placeholder='例如：簽約紀錄與收款憑證';evidence.setAttribute('aria-label','核對依據');
    const confirm=make('input');confirm.type='checkbox';confirm.setAttribute('aria-label','已人工核對完整性');
    const fromLabel=make('label','排序範圍（起始月份、結束月份）');fromLabel.append(from,to);
    const evidenceLabel=make('label','核對依據（必填）');evidenceLabel.append(evidence);
    const confirmLabel=make('label','我已自行核對此範圍及來源，確認欲登記的訂單完整；系統無法保證歷史資料完整。');confirmLabel.prepend(confirm);
    const storageKey=`bonus-order-sequence-pending:${s.uid}`;
    let restored=null,storageError=false;
    try { const saved=sessionStorage.getItem(storageKey); if(saved){restored=JSON.parse(saved);if(!restored||typeof restored.batchId!=='string'||typeof restored.requestKey!=='string'||!Array.isArray(restored.orderIds))throw Error('invalid pending');} } catch { storageError=true; }
    const state={modal,session:s,candidates:[],selected:[],cursor:'',hasMore:true,loading:false,batchId:null,version:0,pending:restored,mustReload:false};active=state;
    const valid=()=>active===state&&same(s,current())&&!tab.classList.contains('hidden');
    async function api(query,data) {
      const url=new URL('/v1/admin/bonus-order-sequence',workerUrl);for(const [k,v] of Object.entries(query||{}))url.searchParams.set(k,v);
      const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),20000);
      try { const r=await fetch(url,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${s.token}`,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store',credentials:'omit',signal:controller.signal});const j=await r.json();if(!r.ok||j?.success!==true){const e=new Error(j?.error||'無法讀取');e.status=r.status;e.code=j?.code;throw e;}return j; } finally{clearTimeout(timer);}
    }
    function textItem(item) { const d=item.performanceDate;return `${item.buyerName||item.buyerUid||'姓名待核'}｜${item.orderId}｜日期：${d?.value||'未填'}${d?.precision ? `（${d.precision}）`:''}｜推薦人：${item.recruiterUid||'待核'}｜${item.hasSnapshot?'已有訂單快照':'無訂單快照'}｜簽署及推薦核對：待核${item.confirmed?'｜既有成交確認':''}`; }
    function drawCandidates() { list.replaceChildren(make('h3',`候選訂單（已讀 ${state.candidates.length} 筆；${state.hasMore?'尚有下一頁':'目前候選頁已讀完'}）`));for(const item of state.candidates){const card=make('div');card.className='seq-card';const p=make('p',textItem(item));const add=button('加入排序',()=>{if(state.selected.length>=100){status.textContent='每個草稿最多 100 筆。';return;}state.selected.push(item);drawCandidates();drawSelected();});add.disabled=state.selected.some(x=>x.orderId===item.orderId)||!!state.pending;card.append(p,add);list.append(card);} }
    function drawSelected() { selectedArea.replaceChildren(make('h3',`人工排序（${state.pending?.orderIds.length ?? state.selected.length} 筆）`));if(state.pending&&!state.selected.length){state.pending.orderIds.forEach((id,i)=>selectedArea.append(make('p',`${i+1}. ${id}（等待原送出結果確認）`)));return;}state.selected.forEach((item,i)=>{const card=make('div');card.className='seq-card';card.append(make('p',`${i+1}. ${textItem(item)}`));const move=(dir)=>{const j=i+dir;if(j<0||j>=state.selected.length)return;[state.selected[i],state.selected[j]]=[state.selected[j],state.selected[i]];drawSelected();};const up=button('上移',()=>move(-1)), down=button('下移',()=>move(1)), remove=button('移除',()=>{state.selected.splice(i,1);drawSelected();drawCandidates();});up.disabled=i===0||!!state.pending;down.disabled=i===state.selected.length-1||!!state.pending;remove.disabled=!!state.pending;card.append(up,down,remove);selectedArea.append(card);}); }
    function drawPreview(result) {
      const snapshotTime=taipeiTime(result.snapshotAt);
      const canPreview=!!snapshotTime&&result.status==='preview'&&result.calculation?.status==='preview'&&result.canConfirm===false&&result.qualificationResetFrom==='2026-10';
      preview.replaceChildren(make('h3',canPreview?'獎金試算預覽（本次未確認、未建立對帳、未核發或付款）':'排序草稿預覽：資格、獎金與截止日待核'));
      const snapshot=make('p',snapshotTime?`資料快照時間：${snapshotTime}（台北時間）；此後資料若有變動，請重新讀取。`:'資料快照時間無法確認，請重新讀取。');if(!snapshotTime)snapshot.className='warn';preview.append(snapshot);
      for(const item of result.items||[]){
        const card=make('div');card.className='seq-card';card.append(make('p',`${item.position}. ${textItem(item)}`));
        const due=typeof item.proposedStatementDueAt==='string'?new Date(item.proposedStatementDueAt):null;
        const validAwards=Array.isArray(item.proposedAwards)&&item.proposedAwards.every(a=>typeof a.beneficiaryUid==='string'&&a.beneficiaryUid&&typeof a.bonusType==='string'&&a.bonusType&&Number.isFinite(a.amount)&&a.amount>=0);
        const valid=canPreview&&Array.isArray(item.reviewReasons)&&item.reviewReasons.length===0&&Number.isSafeInteger(item.ordinal)&&item.ordinal>0&&due&&Number.isFinite(due.valueOf())&&validAwards;
        if(valid){
          const dueText=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(due);
          card.append(make('p',`試算順序：第 ${item.ordinal} 筆｜預估對帳截止：${dueText}（台北時間）`));
          if(!item.proposedAwards.length)card.append(make('p','此筆試算沒有獎金項目。'));
          for(const award of item.proposedAwards)card.append(make('p',`試算：受領人 ${award.beneficiaryUid}｜類型 ${award.bonusType}｜金額 ${award.amount.toLocaleString('zh-TW')}（未核發或付款）`));
        }else {const p=make('p','受領人、獎金金額及預估截止日：待核');p.className='warn';card.append(p);}
        for(const award of item.existingAwards||[])card.append(make('p',`既存紀錄（非本次試算核發）：受領人 ${award.beneficiaryUid||'待核'}｜金額 ${Number.isFinite(award.amount)?award.amount:'待核'}｜狀態 ${award.status||'待核'}`));
        if(!valid||(item.reviewReasons||[]).length){const p=make('p',`待核依據：${(item.reviewReasons||[]).map(explainReason).join('、')||'資料不完整，請重新核對'}`);p.className='warn';card.append(p);}
        preview.append(card);
      }
      preview.prepend(make('p',`批次 ${result.batchId}｜版本 ${result.version}｜期間 ${result.periodFrom} 至 ${result.periodTo}｜依據 ${result.evidenceRef||'待核'}｜推薦人自 2026 年 10 月起重新計數`));
    }
    async function loadCandidates(){if(state.loading||!state.hasMore)return;state.loading=true;const ticket=generation;try{status.textContent='正在讀取候選…';const r=await api({candidates:'1',...(state.cursor?{after:state.cursor}:{})});if(!valid()||ticket!==generation)return;if(!Array.isArray(r.items)||typeof r.hasMore!=='boolean'||(r.hasMore&&(!r.nextCursor||r.nextCursor===state.cursor)))throw Error('回傳資料不完整');state.candidates.push(...r.items);state.cursor=r.nextCursor||'';state.hasMore=r.hasMore;drawCandidates();status.textContent='候選僅供人工核對，不能證明歷史完整。';}catch(e){if(valid())status.textContent=`候選讀取失敗：${e.message}`;}finally{state.loading=false;}}
    let batchCursor='',batchHasMore=false;
    async function batches(next=false){try{status.textContent='正在讀取草稿…';if(next&&!batchHasMore)return;const r=await api({batches:'1',...(next?{after:batchCursor}:{})});if(!valid())return;if(!Array.isArray(r.batches)||typeof r.hasMore!=='boolean'||(r.hasMore&&(!r.nextCursor||r.nextCursor===batchCursor)))throw Error('草稿列表不完整');if(!next)batchArea.replaceChildren(make('h3','既有草稿'));batchCursor=r.nextCursor||'';batchHasMore=r.hasMore;for(const b of r.batches){const entry=button(`${b.periodFrom} 至 ${b.periodTo}｜${b.batchId}｜版本 ${b.version}`,async()=>{try{const x=await api({batch_id:b.batchId});if(!valid())return;state.batchId=x.batchId;state.version=x.version;state.selected=[...x.items];from.value=x.periodFrom;to.value=x.periodTo;evidence.value=x.evidenceRef||'';confirm.checked=false;state.pending=null;state.mustReload=false;drawSelected();drawCandidates();drawPreview(x);status.textContent='已讀取草稿；重新核對後可儲存變更。';}catch(e){if(valid())status.textContent=`讀取草稿失敗：${e.message}`;}});batchArea.append(entry);}status.textContent=batchHasMore?'草稿尚有下一頁；所有草稿仍待核，尚未建立對帳。':'草稿僅供核對，尚未建立對帳。';}catch(e){if(valid())status.textContent=`讀取草稿失敗：${e.message}`;}}
    function freeze(frozen){for(const node of [from,to,evidence,confirm,more,saved,moreBatches])node.disabled=frozen;drawCandidates();drawSelected();}
    async function submit(){if(state.loading)return;if(storageError){status.textContent='無法安全保存待確認送出資訊，請勿建立重複草稿。';return;}if(state.mustReload){status.textContent='請先重新讀取草稿並核對，或關閉後建立新草稿。';return;}if(!state.pending){if(!confirm.checked||!evidence.value.trim()||!from.value||!to.value||from.value>to.value||!state.selected.length){status.textContent='請選擇排序訂單、期間、核對依據並確認人工核對。';return;}if(typeof crypto?.randomUUID!=='function'){status.textContent='瀏覽器無法安全建立送出編號。';return;}state.pending={batchId:state.batchId||crypto.randomUUID(),expectedVersion:state.version,requestKey:crypto.randomUUID(),confirmedComplete:true,evidenceRef:evidence.value.trim(),periodFrom:from.value,periodTo:to.value,orderIds:state.selected.map(x=>x.orderId)};try{sessionStorage.setItem(storageKey,JSON.stringify(state.pending));}catch{state.pending=null;storageError=true;status.textContent='無法安全保存待確認送出資訊，本次未送出。';return;}}
      state.loading=true;freeze(true);try{status.textContent='正在儲存排序草稿…';const r=await api(null,state.pending);if(!valid())return;state.batchId=r.batchId;state.version=r.version;sessionStorage.removeItem(storageKey);state.pending=null;drawPreview(r);status.textContent='排序草稿已儲存；請查看試算或待核原因，本次未確認、未建立對帳、未核發或付款。';}catch(e){if(!valid())return;if(e.code==='FEATURE_DISABLED'){status.textContent=`業績日期與排序功能暫未開放（批次 ${state.pending.batchId}）；開放後以原送出編號重試，請勿重建同一草稿。`;}else if(e.status===409){state.batchId=state.pending.batchId;sessionStorage.removeItem(storageKey);state.pending=null;state.mustReload=true;status.textContent='草稿或權限已變動，請重新讀取草稿並核對。';}else if(e.status>=400&&e.status<500){sessionStorage.removeItem(storageKey);state.pending=null;status.textContent=`無法儲存：${e.message}`;}else status.textContent=`儲存結果尚未確認（批次 ${state.pending.batchId}）；再次按儲存會以相同送出編號重試，請勿重建同一草稿。`;}finally{state.loading=false;freeze(!!state.pending);}}
    const more=button('讀取下一頁候選',loadCandidates), saved=button('讀取既有草稿',()=>batches(false)), moreBatches=button('讀取下一頁草稿',()=>batches(true)), save=button('儲存排序草稿／查看待核',submit), dismiss=button('關閉',close);
    modal.append(title,warning,status,fromLabel,evidenceLabel,confirmLabel,saved,moreBatches,batchArea,more,list,selectedArea,save,preview,dismiss);document.body.append(modal);modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.showModal();
    if(storageError){status.textContent='無法讀取待確認送出資訊，請勿建立重複草稿。';freeze(true);return;}
    if(restored){from.value=restored.periodFrom;to.value=restored.periodTo;evidence.value=restored.evidenceRef;confirm.checked=true;status.textContent=`前次送出結果尚未確認（批次 ${restored.batchId}）；按儲存將以原送出編號重試，請勿重建同一草稿。`;freeze(true);return;}
    await loadCandidates();
  }
}
