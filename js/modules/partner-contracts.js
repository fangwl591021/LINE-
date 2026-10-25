const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active;
export async function openPartnerContracts({base,target,isCurrent=()=>true,fetcher=fetch}={}){
 if(!/^U[0-9a-f]{32}$/i.test(target||''))throw Error('請從 CRM 選擇會員');
 if(active?.busy)throw Error('資料正在送出，請稍候');active?.close();
 const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';if(!token)throw Error('請先登入 LINE');
 if(!document.querySelector('[data-reward-application-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../css/reward-applications.css?v=1',import.meta.url).href;link.dataset.rewardApplicationStyle='';document.head.append(link);}
 const dialog=document.createElement('dialog');dialog.className='reward-application-dialog';dialog.setAttribute('aria-label','共創夥伴新制登錄');
 const opener=document.activeElement;let busy=false,closed=false,timer,chosenManager='',contractKey=crypto.randomUUID(),attributionKey=crypto.randomUUID(),dealKey=crypto.randomUUID();
 const valid=()=>!closed&&dialog.isConnected&&isCurrent()&&window.liff?.isLoggedIn?.()&&window.liff.getAccessToken()===token;
 const close=(force=false)=>{if(busy&&!force)return;closed=true;clearInterval(timer);dialog.close();dialog.remove();if(active?.dialog===dialog)active=null;opener?.focus();};
 active={dialog,close,get busy(){return busy;}};document.body.append(dialog);dialog.showModal();timer=setInterval(()=>{if(!valid())close(true);},500);
 const shell=body=>{dialog.innerHTML='<button type="button" class="ra-close" data-close>關閉 ×</button><h2>共創夥伴新制登錄</h2>'+body+'<p data-status role="alert" aria-live="polite"></p>';dialog.querySelector('[data-close]').onclick=()=>close();};
 const status=message=>{const el=dialog.querySelector('[data-status]');if(el)el.textContent=message;};
 const api=async(path='',data)=>{
  if(!valid())throw Error('登入或頁面已變更，請重新開啟');
  const response=await fetcher(String(base).replace(/\/+$/,'')+'/v1/partner-contracts'+path,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+token,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(20000)});
  const result=await response.json();if(!valid())throw Error('登入或頁面已變更，請重新開啟');if(!response.ok||!result.success)throw Error(result.error||'資料暫時無法完成');return result;
 };
 async function run(fn){if(busy||!valid())return;busy=true;const controls=[...dialog.querySelectorAll('button,input,select,textarea')],disabled=controls.map(c=>c.disabled);controls.forEach(c=>c.disabled=true);status('處理中…');try{await fn();}catch(e){if(valid())status(e.name==='TimeoutError'?'連線逾時，請先重新整理核對結果，再用原內容重試。':e.message);}finally{busy=false;controls.forEach((c,i)=>c.disabled=disabled[i]);}}
 const input=(name,label,type='text',required=true)=>`<label>${label}<input name="${name}" type="${type}" ${required?'required':''} maxlength="${name.includes('Ref')?500:120}"></label>`;
 const agreement=label=>`<label><input type="checkbox" name="confirmed" required>${label}</label>`;
 const iso=value=>{const date=new Date(value);if(!Number.isFinite(date.getTime()))throw Error('請填寫有效時間');return date.toISOString();};
 function render(result){
  const records=result.contracts||[],pending=result.pendingDeals||[];
  shell(`<p class="ra-note">新制只適用於完成新簽契約登錄後的新訂單。此處由管理員核對已簽文件及成交證據，不代替當事人簽署；舊訂單維持原規則。</p><button type="button" data-refresh>重新整理</button><h3>新制摘要</h3><p>一般夥伴累計兩筆有效成交後晉升，第三筆起本人直接成交50%。前兩筆依本人是否購買完整版、直屬推薦人與進階資格分配；續約由原推薦人25%＋當下歸屬人25%。資料不足先待核。</p><h3>已登錄契約</h3>${records.length?records.map(r=>`<article class="ra-record"><strong>${esc(r.policy_version||r.policyVersion||result.policyVersion||'共創新制')}</strong><p>簽署：${esc(r.signed_at||r.signedAt)}<br>生效：${esc(r.effective_at||r.effectiveAt)}</p><small class="ra-copy">文件校驗碼：${esc(r.document_sha256||r.documentSha256)}</small></article>`).join(''):'<p>尚未登錄新版已簽契約。</p>'}<details><summary>登錄已核對的新簽契約</summary><form data-form="contract">${input('signedAt','實際簽署時間','datetime-local')}${input('effectiveAt','契約生效時間','datetime-local')}<label>選取已簽署文件，計算校驗碼<input type="file" data-file accept=".pdf,.docx"></label><p>只在本機計算校驗碼，不會上傳文件；請保管原始簽署文件。</p>${input('documentSha256','已簽文件 SHA-256 校驗碼')}${input('evidenceRef','已簽文件保管編號／憑證參照')}<label>本人完整版購買狀態<select name="purchaseStatus"><option value="unknown">待確認</option><option value="not_purchased">未購買</option><option value="purchased">已購買</option></select></label>${input('purchaseOrderId','本人完整版購買訂單編號（選已購買時必填）','text',false)}${agreement('我已核對雙方確已簽署新版契約、上述時間與證據正確，並已確認此購買狀態。')}<button class="primary" type="submit">確認登錄新簽契約</button></form></details><details><summary>登錄經同意的目前管理歸屬</summary><p>只更新管理沿革；原始推薦人紀錄會保留。</p><form data-form="attribution">${input('managerNumber','目前管理人的會員編號')}<button type="button" data-lookup>核對管理人</button><p data-manager></p>${input('effectiveAt','同意轉移生效時間','datetime-local')}${input('consentSha256','有效同意文件 SHA-256 校驗碼')}${input('evidenceRef','同意證據保管編號／參照')}${agreement('我已核對當事人有效同意與管理歸屬證據，並確認生效時間。')}<button class="primary" type="submit">確認登錄管理歸屬</button></form></details><details><summary>確認已收款並開通的新制成交</summary>${pending.length?`<p>此會員的新制待核訂單：</p><ul>${pending.map(o=>`<li class="ra-copy">${esc(o.orderId||o.order_id)} · ${esc(o.status||'待核')}</li>`).join('')}</ul>`:''}<p>先核對已收款、完成審核及服務開通，並確認沒有撤銷或退費，再提交。</p><form data-form="deal">${input('orderId','新制訂單編號')}${input('receiptRef','收款及審核開通憑證參照')}${input('serviceOpenedAt','實際服務開通時間','datetime-local')}${agreement('我已核對本筆有效成交的收款、審核與開通證據，且沒有撤銷、退費或異常。')}<button class="primary" type="submit">確認有效成交並核算新制獎金</button></form></details>`);
  dialog.querySelector('[data-refresh]').onclick=()=>run(load);
  dialog.querySelector('[data-file]').onchange=()=>run(async()=>{const file=dialog.querySelector('[data-file]').files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('文件請小於20MB');const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());if(valid())dialog.querySelector('[name=documentSha256]').value=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');status('文件校驗碼已計算，尚未登錄。');});
  const manager=dialog.querySelector('[name=managerNumber]');manager.oninput=()=>{chosenManager='';dialog.querySelector('[data-manager]').textContent='';};
  dialog.querySelector('[data-lookup]').onclick=()=>run(async()=>{const result=await api('/lookup?'+new URLSearchParams({memberNumber:manager.value.trim()})),member=result.member||result.data;if(!member?.userId)throw Error('查無可核對的管理人');chosenManager=member.userId;dialog.querySelector('[data-manager]').textContent=[member.name,member.memberNumber].filter(Boolean).join(' · ');status('已核對管理人，尚未登錄轉移。');});
 }
 async function load(){render(await api('?'+new URLSearchParams({target})));status('');}
 dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 dialog.addEventListener('submit',e=>{e.preventDefault();if(!e.target.reportValidity())return;const form=e.target,values=new FormData(form),get=k=>String(values.get(k)||'').trim();
  void run(async()=>{
   if(form.dataset.form==='contract'){
    if(!/^[0-9a-f]{64}$/i.test(get('documentSha256')))throw Error('請計算或填寫64碼文件校驗碼');
    if(get('purchaseStatus')==='purchased'&&!get('purchaseOrderId'))throw Error('已購買者請填寫本人購買訂單編號');
    await api('',{target_uid:target,signedAt:iso(get('signedAt')),effectiveAt:iso(get('effectiveAt')),documentSha256:get('documentSha256'),evidenceRef:get('evidenceRef'),purchaseStatus:get('purchaseStatus'),...(get('purchaseOrderId')?{purchaseOrderId:get('purchaseOrderId')} : {}),confirmed:values.get('confirmed')==='on',requestKey:contractKey});contractKey=crypto.randomUUID();await load();status('新簽契約已登錄；舊訂單維持原規則。');
   }else if(form.dataset.form==='attribution'){
    if(!chosenManager)throw Error('請先核對管理人的會員編號');if(!/^[0-9a-f]{64}$/i.test(get('consentSha256')))throw Error('請填寫64碼同意文件校驗碼');
    await api('/attribution',{target_uid:target,manager_uid:chosenManager,effectiveAt:iso(get('effectiveAt')),consentSha256:get('consentSha256'),evidenceRef:get('evidenceRef'),confirmed:values.get('confirmed')==='on',requestKey:attributionKey});attributionKey=crypto.randomUUID();await load();status('管理歸屬已登錄，原推薦歷史保留。');
   }else if(form.dataset.form==='deal'){
    const result=await api('/deals/confirm',{orderId:get('orderId'),receiptRef:get('receiptRef'),serviceOpenedAt:iso(get('serviceOpenedAt')),confirmed:values.get('confirmed')==='on',requestKey:dealKey});dealKey=crypto.randomUUID();await load();status(result.settlementStatus==='review_required'?'已核算，對帳與請款給付仍待核對，尚未付款。':result.reviewRequired||result.status==='review_required'?'本筆資料尚待核對，未作成可支付獎金。':'有效成交核對完成，請查看獎金紀錄與核算結果。');
   }
  });
 });
 shell('<p>讀取中…</p>');await run(load);return {close};
}
