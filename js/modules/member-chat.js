// Loaded only after an explicit click in Exchange Zone. No startup requests/storage.
let active;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stamp = value => {
  const date = new Date(String(value || '').replace(' ', 'T') + (String(value || '').endsWith('Z') ? '' : 'Z'));
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date) : '';
};
export function createChatClient({ base, isCurrent = () => true, fetcher = fetch } = {}) {
  const owner = window.currentUserProfile?.userId;
  const token = window.liff?.isLoggedIn?.() ? window.liff.getAccessToken?.() : '';
  if (!owner || !token) throw Error('請重新進入 LINE 並登入');
  let closed = false;
  const controllers = new Set();
  const current = () => !closed && isCurrent() && window.currentUserProfile?.userId === owner && window.liff?.isLoggedIn?.() && window.liff.getAccessToken?.() === token;
  return {
    current,
    close() { closed = true; for (const controller of controllers) controller.abort(); controllers.clear(); },
    async request(path, data) {
      if (!current()) throw Error('登入身分已變更，請重新開啟私訊');
      const controller = new AbortController(); controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 18000);
      try {
        const response = await fetcher(String(base || '').replace(/\/+$/, '') + '/v1/member-chat' + path, {
          method: data === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}`, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) },
          body: data === undefined ? undefined : JSON.stringify(data)
        });
        const result = await response.json();
        if (!current()) throw Error('登入身分已變更，請重新開啟私訊');
        if (!response.ok || result?.success !== true) throw Error(result?.error || '私訊暫時無法使用，請稍後重試');
        return result;
      } catch (error) {
        if (error.name === 'AbortError') throw Error('連線逾時；可重試，同一訊息不會重複送出');
        throw error;
      } finally { clearTimeout(timeout); controllers.delete(controller); }
    }
  };
}
export function chatMessageHtml(row) {
  return `<article class="mc-message ${row.mine ? 'mc-mine' : ''}" data-seq="${row.seq}"><p>${esc(row.body)}</p><small>${esc(stamp(row.createdAt))}${row.mine ? ` · <span data-read>${row.read ? '已讀' : '已送出'}</span>` : ''}</small>${row.mine ? '' : `<button type="button" data-action="report" data-seq="${row.seq}" aria-label="檢舉此訊息">檢舉</button>`}</article>`;
}
export function openMemberChat({ base, tab = 'threads', threadId = '' } = {}) {
  if (active) { active.focus(); return active; }
  const opener = document.activeElement;
  const modal = document.createElement('dialog'); modal.className = 'member-chat';
  const client = createChatClient({ base, isCurrent: () => active === modal });
  if (!document.querySelector('link[data-member-chat]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('../../css/member-chat.css?v=1', import.meta.url).href; style.dataset.memberChat = ''; document.head.append(style);
  }
  modal.setAttribute('aria-labelledby', 'mc-title');
  modal.innerHTML = `<header><button type="button" data-action="back">‹ 返回</button><h2 id="mc-title">會員私訊</h2><button type="button" data-action="close" aria-label="關閉會員私訊">×</button></header>
    <nav aria-label="私訊分類"><button type="button" data-action="threads">我的聊天</button><button type="button" data-action="members">找會員</button></nav>
    <section class="mc-settings"><label><input type="checkbox" data-accepting checked disabled>接受新聯絡</label><label><input type="checkbox" data-notifications disabled>LINE 私訊通知（離開頁面也提醒）</label><small>私訊免費，僅對話雙方可見；不是 LINE 原生聊天。開啟通知前請先加入點數通官方帳號好友，並允許手機的 LINE 通知。</small></section>
    <form class="mc-search" hidden><label class="mc-sr" for="mc-query">搜尋會員姓名、英文名、公司或職稱</label><input id="mc-query" maxlength="60" placeholder="搜尋姓名、英文名、公司或職稱"><button type="submit">搜尋</button></form>
    <section class="mc-peer" hidden><strong></strong><button type="button" data-action="block">封鎖</button></section>
    <div class="mc-scroll" tabindex="0"><button type="button" data-action="older" hidden>載入較早訊息</button><div class="mc-rows"></div><button type="button" data-action="more" hidden>載入更多</button></div>
    <p class="mc-status" role="status" aria-live="polite"></p><button type="button" class="mc-retry" data-action="refresh">重新整理</button>
    <form class="mc-compose" hidden><label class="mc-sr" for="mc-body">輸入訊息</label><textarea id="mc-body" maxlength="2000" rows="2" placeholder="輸入訊息（最多 2000 字）"></textarea><button type="submit">傳送</button></form>
    <p class="mc-hint">開啟 LINE 私訊通知後，未讀訊息約 30–90 秒提醒；同一對話每 5 分鐘時段合併通知，不顯示聊天內容。</p>`;
  document.body.append(modal); active = modal; modal.showModal();
  const $ = selector => modal.querySelector(selector);
  const list = $('.mc-rows'), scroll = $('.mc-scroll'), status = $('.mc-status'), search = $('.mc-search'), compose = $('.mc-compose');
  let view = tab === 'members' ? 'members' : 'threads', room = '', generation = 0, timer, busy = false, sending = false;
  let next = '', oldest = 0, newest = 0, readThrough = 0, pending = null, ready = false, initializing = false, blocked = false, blockedByMe = false;
  const seen = new Set();
  const valid = ticket => client.current() && ticket === generation && modal.open;
  function note(message = '') { status.textContent = message; }
  function stop() { clearTimeout(timer); }
  function close() {
    if (active !== modal) return;
    stop(); generation++; client.close(); active = null;
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', close);
    modal.close(); modal.remove(); list.replaceChildren(); pending = null;
    opener?.focus?.();
  }
  function alive() {
    if (client.current()) return true;
    close(); window.showToast?.('登入身分已變更，請重新開啟私訊', true); return false;
  }
  function schedule() {
    stop();
    if (!ready || !modal.open || document.hidden || view === 'members') return;
    timer = setTimeout(async () => {
      if (!alive()) return;
      if (!busy && !sending) await refresh(true);
      schedule();
    }, view === 'chat' ? 8000 : 15000);
  }
  function visibility() {
    stop();
    if (!document.hidden && alive()) { void refresh(true).then(schedule); }
  }
  function renderRows(items, append = false) {
    const html = items.map(row => {
      const member = view === 'members', id = member ? row.handle : row.id;
      return `<button type="button" class="mc-contact" data-action="open" data-handle="${esc(member ? id : '')}" data-room="${esc(member ? '' : id)}"><span class="mc-avatar" aria-hidden="true">${esc(row.name?.slice(0, 1) || '會')}</span><span class="mc-contact-text"><strong>${esc(row.name || '會員')}</strong><span>${esc(member ? [row.company, row.title].filter(Boolean).join(' · ') : row.preview)}</span></span><span class="mc-contact-meta">${member ? '聊天 ›' : `${esc(stamp(row.createdAt))}${row.unread ? `<b>${Math.min(99, row.unread)}</b>` : ''}`}</span></button>`;
    }).join('');
    if (append) list.insertAdjacentHTML('beforeend', html);
    else list.innerHTML = html || `<p class="mc-empty">${view === 'members' ? '沒有符合的會員。已建立本人名片並接受新聯絡者即可被找到；不含自己或已封鎖的會員。' : '還沒有聊天，點「找會員」開始交流。'}</p>`;
  }
  async function markRead(ticket) {
    if (document.hidden || !valid(ticket) || !newest || newest <= readThrough) return;
    const through = newest;
    await client.request(`/threads/${room}/read`, { through });
    if (valid(ticket)) readThrough = Math.max(readThrough, through);
  }
  function addMessages(items, prepend = false) {
    const fresh = items.filter(item => !seen.has(item.seq));
    for (const item of fresh) { seen.add(item.seq); oldest = oldest ? Math.min(oldest, item.seq) : item.seq; }
    const previousHeight = scroll.scrollHeight, nearBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 100;
    if (fresh.length) list.querySelector('.mc-empty')?.remove();
    for (const item of fresh) {
      const template = document.createElement('template'); template.innerHTML = chatMessageHtml(item);
      const later = [...list.querySelectorAll('.mc-message')].find(node => Number(node.dataset.seq) > item.seq);
      list.insertBefore(template.content.firstElementChild, later || null);
    }
    if (prepend) scroll.scrollTop += scroll.scrollHeight - previousHeight;
    else if (nearBottom || fresh.some(item => item.mine)) scroll.scrollTop = scroll.scrollHeight;
  }
  async function refresh(quiet = false, paging = false) {
    if (!alive() || busy || !ready) return;
    const ticket = generation, capturedRoom = room; busy = true;
    if (!quiet) note('讀取中…');
    try {
      if (view === 'chat') {
        const query = paging ? `?before=${oldest}` : newest ? `?after=${newest}` : '';
        const result = await client.request(`/threads/${capturedRoom}/messages${query}`);
        if (!valid(ticket)) return;
        blocked = result.blocked; blockedByMe = result.blockedByMe;
        $('.mc-peer strong').textContent = result.peer.name;
        $('[data-action="block"]').textContent = blockedByMe ? '解除封鎖' : '封鎖';
        compose.querySelector('button').disabled = blocked || sending;
        addMessages(result.items, paging);
        // Only fetched pages advance the receive cursor. A local send may jump over unseen replies.
        if (!paging && result.items.length) newest = Math.max(newest, ...result.items.map(item => item.seq));
        for (const row of list.querySelectorAll('.mc-mine')) if (Number(row.dataset.seq) <= result.lastRead) row.querySelector('[data-read]').textContent = '已讀';
        if (!query || paging) $('[data-action="older"]').hidden = !result.more;
        if (!seen.size) list.innerHTML = '<p class="mc-empty">向對方打聲招呼吧！</p>';
        await markRead(ticket);
        if (!valid(ticket)) return;
        // Catch up one bounded page at a time; next poll fetches any remaining newer items.
        note(blocked ? '目前已封鎖聯絡，無法傳送訊息。' : pending ? '有一則尚未確認送出的訊息，請按「重試傳送」。' : '');
      } else {
        const params = new URLSearchParams();
        if (view === 'members') params.set('q', $('#mc-query').value.trim());
        if (paging && next) params.set(view === 'members' ? 'after' : 'before', next);
        const result = await client.request(`/${view}?${params}`);
        if (!valid(ticket)) return;
        renderRows(result.items, paging); next = result.next;
        $('[data-action="more"]').hidden = !next;
        note();
      }
    } catch (error) { if (valid(ticket)) note(error.message); }
    finally { if (ticket === generation) busy = false; }
  }
  function setView(nextView) {
    stop(); generation++; busy = false; view = nextView; room = ''; next = ''; pending = null; sending = false;
    oldest = newest = readThrough = 0; seen.clear(); list.replaceChildren(); compose.reset(); compose.querySelector('button').textContent = '傳送'; $('#mc-body').readOnly = false;
    search.hidden = view !== 'members'; compose.hidden = view !== 'chat'; $('.mc-peer').hidden = view !== 'chat';
    $('.mc-settings').hidden = view === 'chat'; $('[data-action="older"]').hidden = true; $('[data-action="more"]').hidden = true;
    for (const button of modal.querySelectorAll('nav button')) button.setAttribute('aria-pressed', String(button.dataset.action === view));
    note();
  }
  async function openConversation(button) {
    if (sending || pending) { note('請先確認未送出的訊息，或返回列表後重新開啟。'); return; }
    const ticket = generation;
    button.disabled = true;
    try {
      const id = button.dataset.room || (await client.request('/threads', { cardHandle: button.dataset.handle })).id;
      if (!valid(ticket)) return;
      setView('chat'); room = id; await refresh(); schedule();
    } catch (error) { if (valid(ticket)) note(error.message); }
    finally { button.disabled = false; }
  }
  compose.addEventListener('submit', async event => {
    event.preventDefault(); if (sending || blocked || !room || !alive()) return;
    const input = $('#mc-body'), body = input.value.trim(); if (!body) return;
    pending ||= { body, clientId: crypto.randomUUID() };
    const ticket = generation, target = room, attempted = pending;
    sending = true; input.readOnly = true; compose.querySelector('button').disabled = true; note('傳送中…');
    try {
      const result = await client.request(`/threads/${target}/messages`, attempted);
      if (!valid(ticket)) return;
      addMessages([result.item]); input.value = ''; pending = null; input.readOnly = false;
      compose.querySelector('button').textContent = '傳送'; note();
    } catch (error) {
      if (valid(ticket)) { note(error.message); compose.querySelector('button').textContent = '重試傳送'; }
    } finally {
      if (valid(ticket)) { sending = false; compose.querySelector('button').disabled = blocked; schedule(); }
    }
  });
  search.addEventListener('submit', event => { event.preventDefault(); generation++; busy = false; next = ''; void refresh(); });
  $('[data-accepting]').addEventListener('change', async event => {
    const input = event.target, value = input.checked, ticket = generation; input.disabled = true;
    try { await client.request('/preferences', { accepting: value }); if (valid(ticket)) note(value ? '已開啟新聯絡' : '已停止新聯絡；既有對話仍可回覆'); }
    catch (error) { if (valid(ticket)) { input.checked = !value; note(error.message); } }
    finally { if (client.current()) input.disabled = false; }
  });
  $('[data-notifications]').addEventListener('change', async event => {
    const input = event.target, enabled = input.checked; input.disabled = true;
    try {
      const result = await client.request('/notifications', { enabled });
      if (client.current()) { input.checked = result.notifications; note(result.notifications ? '已開啟 LINE 私訊通知；新收到的未讀訊息會由官方帳號提醒。' : '已關閉 LINE 私訊通知'); }
    } catch (error) { if (client.current()) { input.checked = !enabled; note(error.message); } }
    finally { if (client.current()) input.disabled = false; }
  });
  modal.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button || !modal.contains(button)) return;
    const action = button.dataset.action;
    if (action === 'close') { close(); return; }
    if (!alive()) return;
    if (action === 'back' && view !== 'chat') { close(); return; }
    if (['threads', 'members', 'back'].includes(action)) {
      if ((sending || pending) && !window.confirm('訊息可能尚未送達。離開後請查看對話確認結果；確定離開？')) return;
      setView(action === 'members' ? 'members' : 'threads'); await refresh(); schedule();
    } else if (action === 'refresh') { if (!ready) await initialize(); else await refresh(); schedule(); }
    else if (action === 'open') await openConversation(button);
    else if (action === 'more' || action === 'older') await refresh(false, true);
    else if (action === 'block') {
      const ticket = generation, id = room; button.disabled = true;
      try { await client.request(`/threads/${id}/block`, { blocked: !blockedByMe }); if (valid(ticket)) await refresh(); }
      catch (error) { if (valid(ticket)) note(error.message); }
      finally { button.disabled = false; }
    } else if (action === 'report') {
      const reason = window.prompt('請說明檢舉原因（最多 300 字）。只提交這則訊息供後續查核。'); if (!reason?.trim()) return;
      const ticket = generation; button.disabled = true;
      try { await client.request(`/threads/${room}/report`, { seq: Number(button.dataset.seq), reason: reason.trim() }); if (valid(ticket)) note('檢舉已記錄；如有急迫問題，請另聯絡客服。'); }
      catch (error) { if (valid(ticket)) note(error.message); }
      finally { button.disabled = false; }
    }
  });
  modal.addEventListener('cancel', event => { event.preventDefault(); close(); });
  modal.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', close);
  async function initialize() {
    if (initializing) return;
    initializing = true; note('正在確認會員資格…');
    try {
      const me = await client.request('/me'); if (!client.current() || !modal.open) return;
      ready = true; $('[data-accepting]').checked = me.accepting; $('[data-accepting]').disabled = false;
      $('[data-notifications]').checked = me.notifications === true; $('[data-notifications]').disabled = false;
      if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(threadId)) {
        setView('chat'); room = threadId; threadId = '';
      }
      await refresh(); schedule();
    } catch (error) { if (client.current() && modal.open) note(error.message); }
    finally { initializing = false; }
  }
  setView(view); void initialize();
  return modal;
}
