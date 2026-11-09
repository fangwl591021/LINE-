const DealerWorkspace = (() => {
  const el = id => document.getElementById(id);
  const form = el('dealer-form');
  const tabs = [...document.querySelectorAll('.dealer-nav button')];
  let session = null;

  function selectTab(tab) {
    for (const item of tabs) {
      el(item.getAttribute('aria-controls')).hidden = item !== tab;
      item.setAttribute('aria-pressed', String(item === tab));
    }
  }
  tabs.forEach(tab => tab.addEventListener('click', () => selectTab(tab)));

  function render(state, data) {
    const user = state.user;
    const rows = data.history;
    const latest = rows[0];
    el('dealer-next').textContent = latest ? latest.due_date + '　' + latest.next_action : user.nextFollowUpAt?.slice(0,10) || '尚未排定';
    el('dealer-owner').textContent = '負責人　' + (latest?.owner_name || user.followOwner || user.crmOwner || '尚未指定');
    el('dealer-last').textContent = latest?.outcome || user.crmNotes || user.notes || '尚無紀錄';
    el('dealer-signed').textContent = data.signed ? [data.signed.name, data.signed.number].filter(Boolean).join(' · ') || '簽署時未填寫' : '尚無簽署資料';
    const history = el('dealer-history');
    history.replaceChildren();
    for (const row of rows) {
      const item = document.createElement('li');
      const meta = document.createElement('small');
      meta.textContent = new Date(row.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}) + ' · ' + row.owner_name;
      item.append(meta, document.createTextNode(row.outcome + '\n下次跟進　' + row.due_date + '　' + row.next_action));
      history.append(item);
    }
    const legacy = user.crmNotes || user.notes;
    if (legacy) {
      const item = document.createElement('li');
      item.textContent = '既有跟進備註　' + legacy;
      history.append(item);
    }
    if (!history.children.length) history.textContent = '尚無跟進紀錄';
    state.owner = latest?.owner_name || user.followOwner || user.crmOwner || adminProfile?.displayName || adminProfile?.name || '';
  }

  function toggleForm(open) {
    form.hidden = !open;
    el('dealer-record').setAttribute('aria-expanded', String(open));
    if (open) form.elements.outcome.focus();
  }
  el('dealer-record').onclick = () => {
    if (!form.hidden) { form.elements.outcome.focus(); return; }
    form.reset();
    form.elements.owner_name.value = session.owner;
    session.key = crypto.randomUUID();
    session.body = null;
    toggleForm(true);
  };
  el('dealer-cancel').onclick = () => { toggleForm(false); el('dealer-record').focus(); };
  form.onsubmit = async event => {
    event.preventDefault();
    const state = session;
    if (!state || state.busy) return;
    const values = Object.fromEntries([...new FormData(form)].map(([k,v]) => [k,v.trim()]));
    if (Object.values(values).some(v => !v)) { el('dealer-status').textContent='請填妥聯絡結果、下一步、日期及負責人。'; return; }
    const body = JSON.stringify(values);
    if (state.body && state.body !== body) state.key = crypto.randomUUID();
    state.body = body;
    state.busy = true;
    Array.from(form.elements).forEach(field => field.disabled = true);
    el('dealer-status').textContent = '儲存中…';
    try {
      const data = await fetchAPI('adminAppendDealerFollowup', {targetUserId:state.uid,requestId:state.key,...values}, {throwOnError:true});
      if (session !== state) return;
      render(state,data);
      toggleForm(false);
      el('dealer-record').focus();
      el('dealer-status').textContent = '已儲存至跟進紀錄';
    } catch (err) {
      if (session === state) el('dealer-status').textContent = err.message || '儲存失敗，請重試';
    } finally {
      state.busy = false;
      if (session === state) Array.from(form.elements).forEach(field => field.disabled = false);
    }
  };

  async function open(user, uid) {
    const state = session = {user,uid};
    selectTab(tabs[0]);
    toggleForm(false);
    form.reset();
    Array.from(form.elements).forEach(field => field.disabled = false);
    el('dealer-tags').open = false;
    el('crm-user-id').parentElement.scrollTop = 0;
    el('dealer-record').hidden = adminRole !== 'admin';
    el('dealer-record').disabled = true;
    el('dealer-status').textContent = '';
    render(state,{history:[],signed:null});
    if (adminRole !== 'admin') {
      el('dealer-signed').textContent = '限管理員查看';
      return;
    }
    el('dealer-history').textContent = el('dealer-signed').textContent = '讀取中…';
    try {
      const data = await fetchAPI('adminListDealerFollowups',{targetUserId:uid},{throwOnError:true});
      if (session !== state) return;
      render(state,data);
      el('dealer-record').disabled = false;
    } catch (err) {
      if (session !== state) return;
      el('dealer-history').textContent = el('dealer-signed').textContent = '讀取失敗';
      el('dealer-status').textContent = (err.message || '讀取失敗') + '，請重新開啟會員。';
    }
  }
  return {open,close() { session=null; }};
})();
