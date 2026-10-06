/* VEO workflow adapted to point-system membership. No startup data fetch or local token storage. */
(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const labels = { create:'建立任務', complete:'完成回報', postpone:'延期', cancel:'取消', note:'補充紀錄', pending:'待辦', completed:'已完成', cancelled:'已取消', low:'低', normal:'一般', high:'高' };
  const stamp = value => new Intl.DateTimeFormat('zh-TW', { timeZone:'Asia/Taipei', year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit' }).format(new Date(value));
  const localDate = value => { const d = new Date(value); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
  const dayKey = value => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit' }).format(new Date(value));
  let active;
  function open() {
    if (active) { active.focus(); return; }
    const opener = document.activeElement, overflow = document.body.style.overflow;
    const modal = document.createElement('dialog'); active = modal; modal.className = 'ai-advance-dialog'; modal.setAttribute('aria-labelledby','aa-title');
    modal.innerHTML = '<header><button type="button" data-back>‹ 返回</button><h2 id="aa-title">AI商務導航</h2><button type="button" class="aa-close" data-close aria-label="關閉 AI 推進">×</button></header><div class="aa-body"></div><p class="aa-status" role="status" aria-live="polite"></p>';
    document.body.append(modal); modal.showModal(); document.body.style.overflow='hidden';
    const $ = s => modal.querySelector(s), body = $('.aa-body');
    let view='dashboard', dashboard, currentTask, filter='pending', busy=false, closed=false, draft=false, generation=0, owner='',token='';
    const controllers=new Set(), timers=new Set();
    function close() {
      if (draft && !window.confirm('尚未送出內容，確定關閉？')) return;
      closed=true; generation++; controllers.forEach(c=>c.abort());
      modal.querySelectorAll('video').forEach(video=>{ video.pause(); video.removeAttribute('src'); video.load(); });
      modal.close(); modal.remove(); active=null; document.body.style.overflow=overflow; if(opener?.isConnected)opener.focus({preventScroll:true});
    }
    $('[data-close]').onclick=close; modal.addEventListener('cancel', e=>{e.preventDefault();close();});
    function valid(ticket) { return !closed && active===modal && ticket===generation; }
    function note(value='') { if(!closed)$('.aa-status').textContent=value; }
    function frame(title,nextView) {
      generation++; draft=false; view=nextView; body.querySelectorAll('video').forEach(v=>{v.pause();v.removeAttribute('src');v.load();});
      $('#aa-title').textContent=title; body.replaceChildren(); body.scrollTop=0; note();
    }
    function login() {
      const uid=window.currentUserProfile?.userId, access=window.liff?.isLoggedIn?.() ? window.liff.getAccessToken?.() : '';
      if(!uid||!access)throw Error('請先從 LINE 進入並完成會員註冊');
      if(owner && (owner!==uid||token!==access))throw Error('登入身分已變更，請關閉後重新開啟');
      owner=uid;token=access;
    }
    async function api(path,data) {
      login(); const ticket=generation, controller=new AbortController(); controllers.add(controller);
      const timeout=setTimeout(()=>controller.abort(),18000);
      try {
        const base=String(window.Config?.API_URL||window.WORKER_URL||'https://line-engine.fangwl591021.workers.dev').replace(/\/+$/,'');
        const response=await fetch(base+'/v1/ai-advance'+path,{method:data===undefined?'GET':'POST',credentials:'omit',cache:'no-store',signal:controller.signal,headers:{Authorization:'Bearer '+token,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
        const result=await response.json(); login(); if(!valid(ticket))throw Error('操作已停止');
        if(!response.ok||result?.success!==true)throw Error(result?.error||'操作暫時無法完成');
        return result;
      } catch(error) { if(error.name==='AbortError')throw Error('連線逾時，請重試；同一筆送出不會重複建立'); throw error; }
      finally{clearTimeout(timeout);controllers.delete(controller);}
    }
    async function work(fn) {
      if(busy||closed)return;busy=true;const ticket=generation;
      const disabled=new Map();modal.querySelectorAll('button:not([data-close]),input,select,textarea').forEach(element=>{disabled.set(element,element.disabled);element.disabled=true;});note('處理中…');
      try{await fn();}catch(error){if(valid(ticket))note(error.message);}
      finally{busy=false;if(!closed)disabled.forEach((value,element)=>{if(element.isConnected)element.disabled=value;});}
    }
    async function loadDashboard() { dashboard=await api('/dashboard'); showDashboard(); }
    function showDashboard() {
      frame('AI商務導航','dashboard');
      const today=dayKey(Date.now()), tasks=dashboard.tasks, pending=tasks.filter(t=>t.status==='pending');
      const counts={pending:pending.length,overdue:pending.filter(t=>Date.parse(t.due_at)<Date.now()).length,today:pending.filter(t=>dayKey(t.due_at)===today).length,completed:tasks.filter(t=>t.status==='completed').length};
      body.innerHTML='<p class="aa-muted">提醒 → 執行 → 回報 → AI 下一步</p><div class="aa-tabs"></div><div class="aa-controls"><button type="button" class="aa-primary" data-new>＋ 建立任務</button><button type="button" data-refresh>重新整理</button></div><label><input type="checkbox" data-remind> 開啟 LINE 到期提醒</label><p class="aa-muted">預設關閉。需加入官方帳號好友、解除封鎖並允許 LINE 通知。到期後約 1–2 分鐘處理；手機顯示依 LINE／系統設定。與私訊通知分開。</p><div class="aa-rows"></div>';
      for(const [key,title]of Object.entries({pending:'待辦',overdue:'逾期',today:'今日到期',completed:'已完成'})){
        const button=document.createElement('button');button.type='button';button.setAttribute('aria-pressed',String(filter===key));button.innerHTML=`<strong>${counts[key]}</strong>${title}`;
        button.onclick=()=>{filter=key;showDashboard();};$('.aa-tabs').append(button);
      }
      const selected=tasks.filter(t=>filter==='pending'?t.status==='pending':['completed','cancelled'].includes(filter)?t.status===filter:t.status==='pending'&&(filter==='today'?dayKey(t.due_at)===today:Date.parse(t.due_at)<Date.now()));
      if(!selected.length)$('.aa-rows').innerHTML='<p class="aa-notice">目前沒有這類任務。您可以先建立一個下一步。</p>';
      selected.forEach(task=>{const button=document.createElement('button');button.type='button';button.className='aa-task'+(task.status==='pending'&&Date.parse(task.due_at)<Date.now()?' aa-overdue':'');
        const contact=dashboard.contacts.find(c=>c.row_id===task.contact_card_id);
        button.innerHTML=`<strong>${esc(task.title)}</strong><small>${esc(stamp(task.due_at))} · 優先：${labels[task.priority]}${contact?' · '+esc(contact.name||contact.company_name):''}</small>`;
        button.onclick=()=>work(()=>loadTask(task.id));$('.aa-rows').append(button);
      });
      const history=document.createElement('button');history.type='button';history.textContent=filter==='cancelled'?'返回待辦清單':'查看已取消任務';history.onclick=()=>{filter=filter==='cancelled'?'pending':'cancelled';showDashboard();};body.append(history);
      const limit=document.createElement('p');limit.className='aa-muted';limit.textContent='統計以目前清單為準：待辦優先、結束任務依最近更新，最多顯示 400 筆。';body.append(limit);
      $('[data-new]').onclick=newTask; $('[data-refresh]').onclick=()=>work(loadDashboard);
      const checkbox=$('[data-remind]');checkbox.checked=dashboard.notifications;
      checkbox.onchange=()=>{const enabled=checkbox.checked;work(async()=>{try{const r=await api('/preferences',{enabled});dashboard.notifications=r.enabled;note(r.enabled?'LINE 提醒已開啟':'LINE 提醒已關閉');}catch(e){checkbox.checked=dashboard.notifications;throw e;}});};
    }
    function newTask() {
      frame('建立推進任務','create');const key=crypto.randomUUID();
      body.innerHTML='<form data-create><label>任務名稱（必填）<input name="title" maxlength="120" required placeholder="例如：寄送合作提案"></label><label>執行說明<textarea name="description" maxlength="2000" placeholder="希望完成什麼？"></textarea></label><label>連結收藏名片（選填）<select name="contactCardId"><option value="">不連結名片</option></select></label><small>只列出您有效的收藏名片，最多顯示 200 張。</small><label>期限（必填）<input name="dueAt" type="datetime-local" required></label><label>優先順序<select name="priority"><option value="normal">一般</option><option value="high">高</option><option value="low">低</option></select></label><div class="aa-controls"><button type="submit" class="aa-primary">建立任務</button></div></form>';
      dashboard.contacts.forEach(c=>{const option=document.createElement('option');option.value=c.row_id;option.textContent=[c.name,c.company_name,c.title].filter(Boolean).join(' · ');$('[name=contactCardId]').append(option);});
      $('[name=dueAt]').value=localDate(Date.now()+86400000); $('[data-create]').oninput=()=>{draft=true;};
      $('[data-create]').onsubmit=e=>{e.preventDefault();if(!e.target.reportValidity())return;const form=new FormData(e.target);work(async()=>{const r=await api('/tasks',{requestKey:key,title:form.get('title'),description:form.get('description'),contactCardId:form.get('contactCardId'),priority:form.get('priority'),dueAt:new Date(form.get('dueAt')).toISOString()});draft=false;await loadTask(r.task.id);note('任務已建立');});};
    }
    async function loadTask(id) { const result=await api('/tasks/'+id);currentTask=result.task;showTask(result); }
    function showTask(result) {
      frame('任務與執行回報','task');const task=result.task, key=crypto.randomUUID();
      body.innerHTML=`<h3>${esc(task.title)}</h3><p class="aa-muted">${labels[task.status]} · ${esc(stamp(task.due_at))} · 優先：${labels[task.priority]}</p><p class="aa-description">${esc(task.description)}</p><ul class="aa-events"></ul><form data-report><label>回報方式<select name="action">${(task.status==='pending'?['complete','postpone','cancel','note']:['note']).map(a=>`<option value="${a}">${labels[a]}</option>`).join('')}</select></label><label data-postpone hidden>新期限<input name="dueAt" type="datetime-local"></label><label>回報內容（必填）<textarea name="note" required maxlength="2000" placeholder="例如：已寄出提案，對方請我下週聯絡"></textarea></label><div class="aa-controls"><button type="submit" class="aa-primary">儲存回報</button></div></form><div class="aa-controls"><button type="button" data-ai ${task.revision===0?'disabled':''}>AI 建議下一步</button></div><p class="aa-muted">請先儲存執行回報。AI 僅提出建議，不會自動建立任務。</p><div data-suggestion></div>`;
      if(task.contact_card_id){const linked=document.createElement('p');linked.className='aa-muted';linked.textContent=result.contact?'關聯名片：'+[result.contact.name,result.contact.company_name,result.contact.title].filter(Boolean).join(' · '):'原連結名片已封存、移除或不再屬於您的收藏。';body.querySelector('.aa-description').after(linked);}
      for(const event of result.events){const li=document.createElement('li');li.innerHTML=`<strong>${labels[event.action]||esc(event.action)}</strong>${esc(event.note)}<small>${esc(stamp(event.created_at))}</small>`;$('.aa-events').append(li);}
      $('[name=action]').onchange=()=>{$('[data-postpone]').hidden=$('[name=action]').value!=='postpone';$('[name=dueAt]').required=!$('[data-postpone]').hidden;};
      const privacy=document.createElement('p');privacy.className='aa-notice';privacy.textContent='點選 AI 建議會將任務、回報及選取名片的姓名、公司、職稱送交 AI 分析；不提供電話、電子郵件或圖片。每日最多 10 次。不自動扣點，不代替您聯絡對方。';$('[data-ai]').parentElement.before(privacy);
      $('[name=dueAt]').value=localDate(Date.now()+86400000);$('[data-report]').oninput=()=>{draft=true;};
      $('[data-report]').onsubmit=e=>{e.preventDefault();if(!e.target.reportValidity())return;const form=new FormData(e.target);work(async()=>{await api('/tasks/'+task.id+'/action',{requestKey:key,revision:task.revision,action:form.get('action'),note:form.get('note'),...(form.get('action')==='postpone'?{dueAt:new Date(form.get('dueAt')).toISOString()}:{})});draft=false;await loadTask(task.id);note('回報已儲存，現在可請 AI 建議下一步');});};
      $('[data-ai]').onclick=()=>{if(draft){note('請先儲存正在編輯的回報');return;}work(async()=>{
        await api('/tasks/'+task.id+'/suggest',{revision:task.revision}); const ticket=generation;
        for(let n=0;n<14;n++){
          if(!valid(ticket))return;const r=await api('/tasks/'+task.id+'/suggestion');
          if(r.revision!==task.revision)throw Error('任務已更新，請重新整理');
          if(r.status==='completed'){showSuggestion(r.suggestion,task);note('建議已產生，請確認後再建立');return;}
          if(r.status==='failed')throw Error(r.retryable?'AI 暫時無法產生，請重試；仍可手動建立任務':'本次回報已達重試上限，請改用手動建立任務');
          note('AI 正在分析回報…');await new Promise(resolve=>{const timer=setTimeout(()=>{timers.delete(timer);resolve();},2000);timers.add(timer);});
        }
        throw Error('AI 尚未完成，稍後可再點一次查看；完成的同一份建議會重用');
      });};
    }
    function showSuggestion(suggestion,task) {
      const section=$('[data-suggestion]');section.innerHTML=`<section class="aa-suggestion"><h3>AI 下一步建議</h3><p>${esc(suggestion.reason)}</p>${suggestion.createNextTask?`<strong>${esc(suggestion.title)}</strong><p class="aa-description">${esc(suggestion.description)}</p><label>確認下一步期限<input data-next-due type="datetime-local" required></label><div class="aa-controls"><button type="button" class="aa-primary" data-accept>確認建立下一步</button></div>`:'<p>目前不需要新增任務，可保留回報紀錄。</p>'}</section>`;
      if(!suggestion.createNextTask)return;$('[data-next-due]').value=localDate(Date.now()+suggestion.dueInDays*86400000);
      $('[data-accept]').onclick=()=>{if(draft){note('請先儲存正在編輯的回報');return;}const input=$('[data-next-due]');if(!input.reportValidity())return;work(async()=>{const r=await api('/tasks/'+task.id+'/accept',{revision:task.revision,dueAt:new Date(input.value).toISOString()});await loadTask(r.task.id);note('下一步已建立，原任務與回報仍保留');});};section.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
    $('[data-back]').onclick=()=>{if(busy)return;if(draft&&!window.confirm('尚未送出內容，確定返回？'))return;draft=false;if(view==='dashboard')close();else work(loadDashboard);};
    const hideVideo=()=>{if(document.hidden)modal.querySelectorAll('video').forEach(v=>v.pause());};
    const stopVideo=()=>modal.querySelectorAll('video').forEach(v=>v.pause());
    document.addEventListener('visibilitychange',hideVideo);window.addEventListener('pagehide',stopVideo);
    modal.addEventListener('close',()=>{document.removeEventListener('visibilitychange',hideVideo);window.removeEventListener('pagehide',stopVideo);},{once:true});
    frame('AI商務導航','dashboard');work(loadDashboard);
  }
  window.openAiAdvanceGuide=()=>window.openTutorialCenter?.('ai-advance');
  window.openAiAdvance=()=>open();
  // Notification deep links wait for the already existing LINE login; no competing auth flow.
  const query=new URLSearchParams(location.search), nested=new URLSearchParams((query.get('liff.state')||'').replace(/^\?/,''));
  const allowed=new Set(['aiAdvance','liff.state','liffClientId','liffRedirectUri','code','state','error','error_description','liff.referrer']);
  const pure=[...query.keys(),...nested.keys()].every(key=>allowed.has(key)) && query.getAll('aiAdvance').length<=1 && nested.getAll('aiAdvance').length<=1;
  if(pure&&(query.get('aiAdvance')==='1'||nested.get('aiAdvance')==='1')){
    let attempts=0;const timer=setInterval(()=>{attempts++;if(window.currentUserProfile?.userId&&window.liff?.isLoggedIn?.()){clearInterval(timer);open();}else if(attempts>=120)clearInterval(timer);},500);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  }
})();
