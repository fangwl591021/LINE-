(function () {
  let selected, selectedSession, matches = [];
  let requestId = 0, timer, pending;
  const byId = id => document.getElementById(id);
  const compact = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/gu, '');
  const input = () => byId('bonus-tenant-search');
  const results = () => byId('bonus-tenant-results');
  const note = text => { byId('bonus-tenant-search-note').textContent = text; };
  const token = () => liff.isLoggedIn() ? liff.getAccessToken() : '';
  const session = () => token() ? adminProfile?.userId + ':' + token() : '';
  const current = () => selectedSession && selectedSession === session() ? selected : null;

  function orderMatches(order) {
    const member = current();
    if (member) return member.buyerIds.includes(order.tenantId);
    const query = compact(input()?.value);
    return !query || [order.tenantName, order.tenantId, order.orderId].some(value => compact(value).includes(query)) ||
      matches.some(person => person.buyerIds.includes(order.tenantId));
  }

  function activeOrders(member, orders) {
    return orders.filter(order => member.buyerIds.includes(order.tenantId) &&
      !['cancelled', 'void', 'refunded'].includes(order.status));
  }

  function sync(orders, ready, busy) {
    const member = current();
    const existing = member && (member.hasExistingOrder || activeOrders(member, orders).length > 0);
    byId('bonus-order-create').disabled = busy || !ready || !member || !!existing || member.identityReview;
    if (member) {
      note(existing ? '已有年費訂單。請從下方查看或處理原單，續約請使用續約流程。'
        : member.identityReview ? '會員帳號關聯需先核對。'
        : ready ? '這位會員可以建立首購年費單。' : '正在確認既有訂單，建單暫停。');
    }
  }

  function message(text) {
    const box = results();
    box.replaceChildren();
    const item = document.createElement('p');
    item.className = 'px-4 py-3 text-sm text-slate-600';
    item.textContent = text;
    box.append(item);
    box.classList.remove('hidden');
  }

  function choose(member, identity) {
    if (identity !== session()) return;
    selected = member;
    selectedSession = identity;
    input().value = [member.name || '未命名', member.memberNumber].filter(Boolean).join(' / ');
    results().classList.add('hidden');
    byId('bonus-order-status-filter').value = 'all';
    refreshOrders();
  }

  function refreshOrders() {
    bonusOrderPage = 1;
    sync(bonusPanelOrders, bonusOrderListReady, creatingTenantOrder);
    if (bonusOrderListReady) renderBonusOrders();
  }

  async function lookup(query, id) {
    const identity = session();
    if (!identity || adminRole !== 'admin') {
      message('請以總管的 LINE 帳號登入後查詢。');
      return;
    }
    const controller = new AbortController();
    pending = controller;
    const url = new URL('/v1/partner-contracts/annual-order-buyers', WORKER_URL);
    url.searchParams.set('q', query);
    try {
      const response = await fetch(url, {headers:{Authorization:'Bearer '+token()},signal:controller.signal,cache:'no-store'});
      const result = await response.json();
      if (id !== requestId || identity !== session()) return;
      if (!response.ok || result.success !== true || !Array.isArray(result.members)) throw Error('Search unavailable');
      matches = result.members;
      refreshOrders();
      if (!matches.length) {
        message('沒有符合的會員，請查看下方是否有符合的既有訂單。');
        return;
      }
      const box = results();
      box.replaceChildren();
      for (const member of matches) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'block w-full text-left px-4 py-3 border-b border-slate-100 hover:bg-blue-50';
        const name = document.createElement('strong');
        name.textContent = member.name || '未命名';
        const detail = document.createElement('span');
        detail.className = 'block text-xs text-slate-600';
        detail.textContent = [member.memberNumber || '尚無會員編號', member.phoneEnd && '電話末三碼 '+member.phoneEnd,
          member.hasExistingOrder && '已有年費單'].filter(Boolean).join(' · ');
        button.append(name,detail);
        button.addEventListener('click',()=>choose(member,identity));
        box.append(button);
      }
      if (result.more) {
        const hint = document.createElement('p');
        hint.className = 'px-4 py-2 text-xs';
        hint.textContent = '另有更多結果，可輸入完整會員編號或電話。';
        box.append(hint);
      }
    } catch {
      if (id === requestId && identity === session()) message('會員查詢失敗。請重新輸入，或重新登入總管帳號。');
    }
  }

  function search() {
    const id = ++requestId;
    clearTimeout(timer);
    pending?.abort();
    selected = null;
    selectedSession = '';
    matches = [];
    results().classList.add('hidden');
    const query = input().value.trim();
    note(query ? '下方顯示符合姓名或編號的訂單。' : '');
    refreshOrders();
    if (query.length < 2) return;
    message('正在查詢會員…');
    timer = setTimeout(()=>void lookup(query,id),220);
  }

  window.AnnualOrderSearch = {search,current,orderMatches,sync,activeOrders};
})();
