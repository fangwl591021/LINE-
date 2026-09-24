// Loaded only after an explicit click in Exchange Zone. No startup requests/storage.
import { createChatPopups } from './member-chat-popups.js?v=2';
let active, closeActive;
export function closeMemberChat(options) { return closeActive ? closeActive(options) : true; }
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
        if (!response.ok || result?.success !== true) {
          const error = Error(result?.error || '私訊暫時無法使用，請稍後重試'); error.status = response.status; throw error;
        }
        return result;
      } catch (error) {
        if (error.name === 'AbortError') throw Error('連線逾時；可重試，同一訊息不會重複送出');
        throw error;
      } finally { clearTimeout(timeout); controllers.delete(controller); }
    }
  };
}
export function chatMessageHtml(row) {
  return `<article class="mc-message ${row.mine ? 'mc-mine' : ''}" data-seq="${row.seq}"><p>${esc(row.body)}</p>${row.hasCoupon ? `<button type="button" class="mc-coupon-link" data-action="coupon" data-seq="${row.seq}">🎟 查看優惠券</button>` : ''}<small>${esc(stamp(row.createdAt))}${row.mine ? ` · <span data-read>${row.read ? '已讀' : '已送出'}</span>` : ''}</small>${row.mine ? '' : `<button type="button" data-action="report" data-seq="${row.seq}" aria-label="檢舉此訊息">檢舉</button>`}</article>`;
}
export function chatMatchHtml(match) {
  if (!match || typeof match.score !== 'number' || !Number.isFinite(match.score) || match.score < 0 || match.score > 100) return '<span class="mc-match-empty">尚無配對</span>';
  return `<span class="mc-match" title="${match.source === 'ai' ? 'AI' : '規則'}既有配對分數，非成交機率">${esc(match.score)}%</span><small>${match.source === 'ai' ? 'AI 配對' : '規則配對'}</small>`;
}
export function openMemberChat({ base, tab = 'threads', threadId = '', container = null, onExit, onView } = {}) {
  if (active) { active.focus(); return active; }
  const opener = document.activeElement;
  const modal = document.createElement('dialog'); modal.className = 'member-chat';
  if (container) modal.classList.add('mc-embedded');
  const client = createChatClient({ base, isCurrent: () => active === modal });
  if (!document.querySelector('link[data-member-chat]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('../../css/member-chat.css?v=6', import.meta.url).href; style.dataset.memberChat = ''; document.head.append(style);
  }
  modal.setAttribute('aria-labelledby', 'mc-title');
  modal.innerHTML = `<header><button type="button" data-action="back">‹ 返回</button><h2 id="mc-title">會員私訊</h2><button type="button" data-action="close" aria-label="關閉會員私訊">×</button></header>
    <nav aria-label="私訊分類"><button type="button" data-action="threads">我的聊天</button><button type="button" data-action="members">找會員</button></nav>
    <details class="mc-preferences" hidden><summary aria-label="聊天設定"><strong>聊天</strong><span>⚙ 設定</span></summary>
    <section class="mc-settings"><label><input type="checkbox" data-accepting checked disabled>接受新聯絡</label><div class="mc-line-settings"><label><input type="checkbox" data-notifications disabled>LINE通知</label><button type="button" data-action="edit-line-contact" disabled aria-label="新增或修改供對方加好友的 LINE">（點我新增）</button></div><small>勾選「LINE通知」：有人傳私訊給您時，即使離開頁面，也由點數通官方帳號提醒。請先加入官方帳號好友、解除封鎖，並允許手機的 LINE 通知。</small><small>「點我新增」：填寫供聊天對方加好友的 LINE，與通知開關分開。站內私訊免費，僅對話雙方可見；不是 LINE 原生聊天。</small></section>
    <p class="mc-hint">開啟 LINE通知後，未讀訊息約 30–90 秒提醒；同一對話每 5 分鐘時段合併通知，不顯示聊天內容。手機是否跳出橫幅，依 LINE、手機通知及勿擾設定。</p></details>
    <form class="mc-search" hidden><div class="mc-search-text"><label class="mc-sr" for="mc-query">搜尋會員姓名、英文名、公司或職稱</label><input id="mc-query" maxlength="60" placeholder="搜尋姓名、英文名、公司或職稱"><button type="submit">搜尋</button></div><label class="mc-industry" for="mc-industry">業種搜尋<select id="mc-industry" disabled><option value="">全部業種</option></select></label></form>
    <section class="mc-peer" hidden><strong></strong><button type="button" data-action="line-contact">加 LINE 好友</button><button type="button" data-action="card">查看名片</button><button type="button" data-action="block">封鎖</button></section>
    <div class="mc-scroll" tabindex="0"><button type="button" data-action="older" hidden>載入較早訊息</button><div class="mc-rows"></div><button type="button" data-action="more" hidden>載入更多</button></div>
    <p class="mc-status" role="status" aria-live="polite"></p><button type="button" class="mc-retry" data-action="refresh">重新整理</button>
    <section class="mc-attachment" hidden><button type="button" data-action="attach">＋ 附加內容</button><span data-selected-coupon></span><button type="button" data-action="remove-coupon" hidden>移除</button></section>
    <form class="mc-compose" hidden><label class="mc-sr" for="mc-body">輸入訊息</label><textarea id="mc-body" maxlength="2000" rows="2" placeholder="輸入訊息（最多 2000 字）"></textarea><button type="submit">傳送</button></form>`;
  if (container) { container.replaceChildren(modal); modal.querySelector('nav').hidden = true; modal.querySelector('header').hidden = !threadId; }
  else document.body.append(modal);
  active = modal; if (container) modal.show(); else modal.showModal();
  const $ = selector => modal.querySelector(selector);
  const list = $('.mc-rows'), scroll = $('.mc-scroll'), status = $('.mc-status'), search = $('.mc-search'), compose = $('.mc-compose'), industry = $('#mc-industry');
  let memberQuery = '', memberIndustry = '';
  let view = tab === 'members' ? 'members' : 'threads', room = '', generation = 0, timer, busy = false, sending = false;
  let next = '', oldest = 0, newest = 0, readThrough = 0, pending = null, ready = false, initializing = false, blocked = false, blockedByMe = false;
  const seen = new Set();
  const valid = ticket => client.current() && ticket === generation && modal.open;
  let selectedCoupon = null;
  const popups = createChatPopups({ client, getGuard: () => { const ticket = generation; return () => valid(ticket); } });
  function attachmentControls() {
    $('[data-selected-coupon]').textContent = selectedCoupon ? '🎟 ' + selectedCoupon.title : '';
    $('[data-action="remove-coupon"]').hidden = !selectedCoupon;
    for (const button of modal.querySelectorAll('.mc-attachment button')) button.disabled = blocked || sending || !!pending;
  }
  function note(message = '') { status.textContent = message; }
  function stop() { clearTimeout(timer); }
  function close() {
    if (active !== modal) return;
    stop(); generation++; popups.close(); client.close(); active = null; closeActive = null;
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', close);
    modal.close(); modal.remove(); list.replaceChildren(); pending = null;
    opener?.focus?.();
  }
  closeActive = (options = {}) => {
    if (options.confirm && (sending || pending) && !window.confirm('訊息可能尚未送達。離開後請查看對話確認結果；確定離開？')) return false;
    close(); return true;
  };
  function leave() { close(); if (container) onExit?.(); }
  function alive() {
    if (client.current()) return true;
    leave(); window.showToast?.('登入身分已變更，請重新開啟私訊', true); return false;
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
      return `<button type="button" class="mc-contact" data-action="open" data-handle="${esc(member ? id : '')}" data-room="${esc(member ? '' : id)}"><span class="mc-avatar" aria-hidden="true">${esc(row.name?.slice(0, 1) || '會')}</span><span class="mc-contact-text"><strong>${esc(row.name || '會員')}</strong><span>${esc(member ? [row.company, row.title].filter(Boolean).join(' · ') : row.preview)}</span></span><span class="mc-contact-meta">${member ? chatMatchHtml(row.match) + '<span>聊天 ›</span>' : `${esc(stamp(row.createdAt))}${row.unread ? `<b>${Math.min(99, row.unread)}</b>` : ''}`}</span></button>`;
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
        attachmentControls(); $('[data-action="card"]').disabled = blocked;
        $('[data-action="line-contact"]').disabled = blocked;
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
        if (view === 'members') { params.set('q', memberQuery); if (memberIndustry) params.set('industry', memberIndustry); }
        if (paging && next) params.set(view === 'members' ? 'after' : 'before', next);
        const result = await client.request(`/${view}?${params}`);
        if (!valid(ticket)) return;
        if (view === 'members' && industry.disabled && Array.isArray(result.industries)) {
          industry.innerHTML = '<option value="">全部業種</option>' + result.industries.map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
          industry.disabled = false;
        }
        renderRows(result.items, paging); next = result.next;
        $('[data-action="more"]').hidden = !next;
        note();
      }
    } catch (error) { if (valid(ticket)) note(error.message); }
    finally { if (ticket === generation) busy = false; }
  }
  function setView(nextView) {
    stop(); generation++; popups.close(); busy = false; view = nextView; room = ''; next = ''; pending = null; sending = false; blocked = false; selectedCoupon = null; attachmentControls();
    oldest = newest = readThrough = 0; seen.clear(); list.replaceChildren(); compose.reset(); compose.querySelector('button').textContent = '傳送'; $('#mc-body').readOnly = false;
    search.hidden = view !== 'members'; compose.hidden = view !== 'chat'; $('.mc-peer').hidden = view !== 'chat';
    $('.mc-attachment').hidden = view !== 'chat';
    $('.mc-settings').hidden = view !== 'threads'; $('.mc-hint').hidden = view === 'members';
    $('.mc-preferences').hidden = view !== 'threads'; $('.mc-preferences').open = false;
    modal.classList.toggle('mc-thread-list', view === 'threads');
    $('[data-action="older"]').hidden = true; $('[data-action="more"]').hidden = true;
    for (const button of modal.querySelectorAll('nav button')) button.setAttribute('aria-pressed', String(button.dataset.action === view));
    if (container) { modal.querySelector('header').hidden = view !== 'chat'; modal.classList.toggle('mc-conversation', view === 'chat'); }
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
    const input = $('#mc-body'), body = input.value.trim() || (selectedCoupon ? '優惠券：' + selectedCoupon.title : ''); if (!body) return;
    pending ||= { body, clientId: crypto.randomUUID(), ...(selectedCoupon ? { couponHandle: selectedCoupon.handle } : {}) };
    const ticket = generation, target = room, attempted = pending;
    sending = true; input.readOnly = true; compose.querySelector('button').disabled = true; note('傳送中…');
    attachmentControls();
    try {
      const result = await client.request(`/threads/${target}/messages`, attempted);
      if (!valid(ticket)) return;
      addMessages([result.item]); input.value = ''; pending = null; input.readOnly = false; selectedCoupon = null;
      compose.querySelector('button').textContent = '傳送'; note();
    } catch (error) {
      if (valid(ticket)) {
        note(error.message);
        // A definitive rejection permits removing an expired attachment; an uncertain network result keeps the original id/payload.
        if ([400, 403, 404, 409, 429].includes(error.status)) { pending = null; input.readOnly = false; compose.querySelector('button').textContent = '傳送'; }
        else compose.querySelector('button').textContent = '重試傳送';
      }
    } finally {
      if (valid(ticket)) { sending = false; compose.querySelector('button').disabled = blocked; attachmentControls(); schedule(); }
    }
  });
  function searchMembers() {
    if (view !== 'members') return;
    memberQuery = $('#mc-query').value.trim(); memberIndustry = industry.value;
    generation++; busy = false; next = ''; list.replaceChildren(); scroll.scrollTop = 0;
    $('[data-action="more"]').hidden = true; void refresh();
  }
  search.addEventListener('submit', event => { event.preventDefault(); searchMembers(); });
  industry.addEventListener('change', searchMembers);
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
      if (client.current()) { input.checked = result.notifications; note(result.notifications ? '已開啟 LINE通知；離開頁面後，新收到的未讀訊息也會由官方帳號提醒。' : '已關閉 LINE通知'); }
    } catch (error) { if (client.current()) { input.checked = !enabled; note(error.message); } }
    finally { if (client.current()) input.disabled = false; }
  });
  modal.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]'); if (!button || !modal.contains(button)) return;
    const action = button.dataset.action;
    if (action === 'close') { leave(); return; }
    if (!alive()) return;
    if (action === 'back' && view !== 'chat') { leave(); return; }
    if (['threads', 'members', 'back'].includes(action)) {
      if ((sending || pending) && !window.confirm('訊息可能尚未送達。離開後請查看對話確認結果；確定離開？')) return;
      setView(action === 'members' ? 'members' : 'threads'); await refresh(); schedule();
      if (container) onView?.(view);
    } else if (action === 'refresh') { if (!ready) await initialize(); else await refresh(); schedule(); }
    else if (action === 'open') await openConversation(button);
    else if (action === 'card' && room) await popups.card(room);
    else if (action === 'line-contact' && room && !blocked) await popups.lineContact(room);
    else if (action === 'edit-line-contact' && ready) await popups.editLineContact(link => note(link ? '已儲存 LINE 加好友資料，聊天對方可點「加 LINE 好友」。通知設定未變更。' : '已移除 LINE 加好友資料。通知設定未變更。'));
    else if (action === 'coupon' && room) await popups.coupon(room, button.dataset.seq);
    else if (action === 'attach' && room && !blocked && !sending && !pending) await popups.chooseCoupon(row => { selectedCoupon = row; attachmentControls(); });
    else if (action === 'remove-coupon' && !sending && !pending) { selectedCoupon = null; attachmentControls(); }
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
  modal.addEventListener('cancel', event => { event.preventDefault(); leave(); });
  modal.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    if (container) { event.preventDefault(); leave(); }
  });
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', close);
  async function initialize() {
    if (initializing) return;
    initializing = true; note('正在確認會員資格…');
    try {
      const me = await client.request('/me'); if (!client.current() || !modal.open) return;
      ready = true; $('[data-accepting]').checked = me.accepting; $('[data-accepting]').disabled = false;
      $('[data-notifications]').checked = me.notifications === true; $('[data-notifications]').disabled = false;
      $('[data-action="edit-line-contact"]').disabled = false;
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
