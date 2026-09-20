// Contact reference only. Never invokes card claiming, binding or general profile saves.
(() => {
  const el = id => document.getElementById('crm-card-link-' + id);
  let userId = '', generation = 0, selected = null, busy = false;
  const message = value => { el('status').textContent = value; };
  function clearSelection() {
    selected = null;
    el('confirm').disabled = true;
    el('results').replaceChildren();
  }
  function referenceText(reference) {
    return reference ? `上次補入來源：${reference.card_name}（${reference.phone}）；${reference.created_at}` : '';
  }
  window.resetCrmCardLink = user => {
    generation++;
    userId = user ? getUserId(user) : '';
    busy = false;
    document.getElementById('crm-card-link').classList.toggle('hidden', !userId || adminRole !== 'admin');
    el('panel').classList.add('hidden');
    el('query').value = String(user?.name || '').split(/\s+/)[0];
    el('search').disabled = false;
    document.getElementById('crm-save-profile').disabled = false;
    clearSelection();
    message('');
  };
  async function search() {
    if (!userId || busy || adminRole !== 'admin') return;
    const uid = userId, current = ++generation;
    clearSelection();
    el('search').disabled = true;
    message('正在搜尋名片…');
    const result = await fetchAPI('adminSearchCrmCards', {targetUserId:uid,query:el('query').value.trim()});
    if (current !== generation || uid !== userId) return;
    el('search').disabled = false;
    if (!result) return message('搜尋失敗，請稍後重試。');
    const existingPhone = String(result.userPhone || '').trim();
    const cards = Array.isArray(result.cards) ? result.cards : [];
    message([referenceText(result.reference), existingPhone ? `CRM 已有電話 ${existingPhone}，不會覆蓋。` : cards.length ? '請選擇正確名片；同名不代表同一人。' : '找不到可用名片，可改用姓名、公司或電話搜尋。', result.hasMore ? '只顯示前 25 筆，請縮小搜尋範圍。' : ''].filter(Boolean).join(' '));
    cards.forEach(card => {
      const label = document.createElement('label');
      label.className = 'flex items-start gap-2 border-b border-slate-100 py-3 cursor-pointer';
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'crm-card-reference'; radio.disabled = !!existingPhone;
      radio.className = 'mt-1 shrink-0';
      const info = document.createElement('span');
      info.className = 'min-w-0 break-words';
      const title = document.createElement('strong');
      title.textContent = `${card.name || '未填姓名'}｜${card.phone}`;
      const detail = document.createElement('span');
      detail.className = 'block text-slate-500 mt-1';
      detail.textContent = [card.company,card.title,card.boundToTarget ? '已綁此會員' : '未認領收藏名片',`名片 ID：${card.rowId}`].filter(Boolean).join(' · ');
      radio.addEventListener('change', () => { selected = card; el('confirm').disabled = busy || !!existingPhone; });
      info.append(title,detail); label.append(radio,info); el('results').append(label);
    });
  }
  el('open').addEventListener('click', () => { el('panel').classList.remove('hidden'); void search(); });
  el('search').addEventListener('click', () => { void search(); });
  el('query').addEventListener('input', () => { if (busy) return; generation++; el('search').disabled = false; clearSelection(); });
  el('query').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void search(); } });
  el('confirm').addEventListener('click', async () => {
    if (busy || !selected || !userId || adminRole !== 'admin') return;
    const uid = userId, card = selected, current = generation;
    const user = findAdminUser(uid);
    if (String(user?.phone || '').trim() || document.getElementById('crm-phone').value.trim()) return message('會員或表單已有電話，不會覆蓋，請先核對。');
    if (!window.confirm(`請確認是同一人：\nCRM：${user?.name || uid}\n會員 ID：${uid}\n名片：${card.name}\n公司：${card.company || '未填'}\n電話：${card.phone}\n\n只補入空白電話，不認領、不移轉名片。確定送出？`)) return;
    busy = true;
    el('confirm').disabled = true; el('search').disabled = true;
    document.getElementById('crm-save-profile').disabled = true;
    message('正在確認並補入電話…');
    try {
      const result = await fetchAPI('adminLinkCrmCard', {targetUserId:uid,cardRowId:card.rowId,fingerprint:card.fingerprint,confirmed:true});
      if (result?.phone) {
        const saved = findAdminUser(uid);
        if (saved) saved.phone = result.phone;
        renderUsersTable(allUsersData);
      }
      if (current !== generation || uid !== userId) return;
      if (!result?.phone) return message('未完成補入。若剛才連線中斷，請重新搜尋確認；既有電話不會覆蓋。');
      document.getElementById('crm-phone').value = result.phone;
      clearSelection();
      message(`電話已補入。${referenceText(result.reference)}。名片歸屬未變更。`);
    } finally {
      if (current === generation && uid === userId) {
        busy = false; el('search').disabled = false;
        document.getElementById('crm-save-profile').disabled = false;
      }
    }
  });
})();
