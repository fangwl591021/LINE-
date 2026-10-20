(function(){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let active;
  window.openRewardUnitEditor=async function(targetUid){
    if(!/^U[0-9a-f]{32}$/i.test(targetUid))return;
    const role=()=>typeof adminRole!=='undefined'?adminRole:window.userRole;
    const token=window.liff?.isLoggedIn?.()?window.liff.getAccessToken():'';
    if(role()!=='admin'||!token)return window.showToast?.('請先用管理員 LINE 帳號登入',true);
    active?.remove();
    const opener=document.activeElement,dialog=document.createElement('dialog');dialog.className='reward-unit-editor';active=dialog;
    dialog.innerHTML='<button type="button" data-close aria-label="關閉贈點單位上架">關閉 ×</button><h2>贈點單位上架</h2><p role="status">讀取 CRM 資料中…</p>';
    document.body.appendChild(dialog);dialog.showModal();
    let busy=false,closed=false,unit,key,version;
    const current=()=>!closed&&active===dialog&&dialog.isConnected&&role()==='admin'&&window.liff?.isLoggedIn?.()&&window.liff.getAccessToken()===token;
    const close=()=>{if(busy)return;closed=true;dialog.close();dialog.remove();if(active===dialog)active=null;opener?.focus();};
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.onclick=event=>{if(event.target.closest('[data-close]'))close();};
    const base=String(window.Config?.WORKER_URL||(typeof WORKER_URL!=='undefined'?WORKER_URL:'')).replace(/\/+$/,'');
    const api=async(path,data)=>{
      if(!current()||!base)throw Error('登入或服務設定已變更，請重新開啟');
      const headers={Authorization:'Bearer '+token};if(data)headers['Content-Type']='application/json';
      const response=await fetch(base+'/v1/reward-units/admin'+path,{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,cache:'no-store',signal:AbortSignal.timeout(data?65000:15000)}),result=await response.json();
      if(!current())throw Error('登入已變更，請重新開啟核對結果');
      if(!response.ok||result.success!==true)throw Error(result.error||'贈點單位操作失敗');return result;
    };
    try{
      const result=await api('?target='+encodeURIComponent(targetUid));if(!current())return;
      unit=result.unit;version=unit.version;key=crypto.randomUUID();
      const field=(name,label,max,type='text')=>`<label>${label}${type==='textarea'?`<textarea name="${name}" maxlength="${max}" rows="3">${esc(unit[name])}</textarea>`:`<input name="${name}" type="${type}" maxlength="${max}" value="${esc(unit[name])}">`}</label>`;
      dialog.innerHTML=`<button type="button" data-close>取消／關閉 ×</button><h2>贈點單位上架</h2><p>CRM 贈點帳號：${esc(result.member_name)}</p><p>預填不代表公開。只填可公開的公司資料，請勿填會員私人手機、住址或帳務；不會變更 CRM、角色或點數。</p><form>
        ${field('name','單位／公司名稱 *',160)}${field('description','公司介紹 *',2000,'textarea')}${field('phone','公司電話（不自動帶入會員手機）',40,'tel')}${field('address','公司地址',300)}${field('website_url','公司網站 HTTPS',500,'url')}${field('image_url','Logo／公開形象圖 HTTPS（選填）',500,'url')}${field('reward_terms','贈點方式與條件 *（請填實際規則）',500,'textarea')}
        <label>展示狀態<select name="status"><option value="draft">草稿，不公開</option><option value="active">送審並公開</option><option value="hidden">隱藏</option></select></label>
        <label class="reward-unit-confirm"><input type="checkbox" name="confirmed_public">我已核對公司資料及贈點條件，確認可對全網公開</label>
        <p>公開前由平台 AI 審核。審核失敗不修改現有展示；可改存草稿。不設定贈點金額、不發 LINE 訊息。</p><p data-result role="status" aria-live="polite"></p><div class="reward-editor-actions"><button type="button" data-close>取消</button><button type="submit">確認儲存</button></div></form>`;
      const form=dialog.querySelector('form');form.elements.status.value=unit.status;
      form.onsubmit=async event=>{
        event.preventDefault();if(busy||!current())return;
        const values=new FormData(form),next={};for(const name of ['name','description','image_url','phone','address','website_url','reward_terms','status'])next[name]=String(values.get(name)||'').trim();
        const confirmed=values.get('confirmed_public')==='on',status=form.querySelector('[data-result]');
        if(next.status==='active'&&!confirmed){status.textContent='請先核對並勾選公開確認。';return;}
        const payload={target_uid:targetUid,version,request_key:key,unit:next,confirmed_public:confirmed};
        const serialized=JSON.stringify(payload);
        // Keep the same key for unchanged retries; a changed proposal gets a new key.
        if(form.dataset.attempt&&form.dataset.attempt!==serialized){key=crypto.randomUUID();payload.request_key=key;}
        form.dataset.attempt=JSON.stringify(payload);
        const controls=[...dialog.querySelectorAll('button,input,textarea,select')];controls.forEach(el=>el.disabled=true);busy=true;status.textContent=next.status==='active'?'AI 審核中，通過後才公開…':'儲存中…';
        try{const saved=await api('',payload);if(!current())return;version=saved.version;key=crypto.randomUUID();delete form.dataset.attempt;status.textContent=next.status==='active'?'已儲存並公開；可到點數通首頁「贈點單位」查看。':'已儲存；目前不公開。';form.elements.confirmed_public.checked=false;}
        catch(error){if(dialog.isConnected)status.textContent=error.name==='TimeoutError'?'連線逾時；請勿連續重送。可關閉後重新開啟核對儲存結果。':error.message;}
        finally{busy=false;controls.forEach(el=>el.disabled=false);}
      };
    }catch(error){if(dialog.isConnected)dialog.querySelector('[role=status]').textContent=error.message;}
  };
})();
