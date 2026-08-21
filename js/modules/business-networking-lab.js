// Business Assistant networking lab shell.
// Read-only experiment: reuses private CRM follow-up data without publishing or messaging.
(() => {
  'use strict';

  const PANEL_DEFINITIONS = {
    today: {
      label: '今日建議',
      icon: 'today',
      title: '今天值得採取的行動',
      description: '先從既有私人人脈整理今日跟進；公開交流由使用者自行前往，企業合作尚未接線。',
      actions: [
        ['person_search', '今天值得重新聯絡', '從自己的私人名片與 CRM 找出適合跟進的人。'],
        ['handshake', '今天值得新認識', '只從本人同意公開的合作檔案提供建議。'],
        ['apartment', '今天值得合作的企業', '後續接入經驗證企業的公開合作需求。']
      ]
    },
    private: {
      label: '私人人脈',
      icon: 'contacts',
      title: '我的私人人脈建議',
      description: '只供自己查看，不會將收藏的他人名片公開給任何人。',
      notice: '收藏的別人名片永遠屬於私人資料，AI 分析也只供收藏者自己參考。',
      actions: [
        ['schedule', '最近應該聯絡', '依據互動時間與跟進狀態整理。'],
        ['diversity_3', '可能成為合作夥伴', '從已有人脈中找出專業或資源互補對象。'],
        ['share', '可能幫我引薦', '找出可能接觸目標人物或企業的既有關係。']
      ]
    },
    public: {
      label: '公開交流',
      icon: 'public',
      title: '本人授權的公開交流',
      description: '只顯示本人自行建立並主動公開的合作檔案。',
      notice: '自己的可以公開；別人的不可以。對方必須親自認領、確認並選擇公開。',
      actions: [
        ['badge', '我的合作檔案', '後續填寫我能提供、正在尋找與合作方式。'],
        ['recommend', 'AI 推薦夥伴', '僅使用已授權的公開合作資料。'],
        ['mark_email_unread', '認識邀請', '下一階段才會實作雙方同意的認識流程。']
      ]
    },
    enterprise: {
      label: '企業合作',
      icon: 'domain',
      title: '友善企業合作機會',
      description: '後續只接入由經驗證企業代表公開的合作資料。',
      notice: '企業合作檔案與現有優惠／折抵店家分開，不會自動混用。',
      actions: [
        ['storefront', '友善企業', '瀏覽願意接受交流與合作的驗證企業。'],
        ['hub', '企業合作需求', '看見企業能提供什麼、正在尋找什麼。'],
        ['description', '我的合作提案', '下一階段實作結構化提案與進度。']
      ]
    }
  };

  function actionCards(actions) {
    return actions.map(([icon, title, description]) => `
      <button type="button" data-networking-lab-action="${title}" class="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm active:scale-[0.99] transition-transform">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined mt-0.5 rounded-xl bg-violet-50 p-2 text-violet-600">${icon}</span>
          <span class="min-w-0 flex-1">
            <strong class="block text-[15px] font-black text-slate-800">${title}</strong>
            <small class="mt-1 block text-[12px] font-bold leading-relaxed text-slate-500">${description}</small>
          </span>
          <span class="material-symbols-outlined text-slate-300">chevron_right</span>
        </span>
      </button>`).join('');
  }

  let visibleContacts = [];
  let todayRequestToken = 0;

  function safeHTML(value) {
    if (typeof window.escapeHTML === 'function') return window.escapeHTML(String(value || ''));
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function needsFollowup(contact) {
    const status = String(contact?.crmStatus || '').trim();
    return !status || ['新名片', '已初次聯繫', '已發送資料', '待跟進'].includes(status);
  }

  function renderTodayContact(contact, index) {
    const name = safeHTML(contact?.name || contact?.姓名 || '未命名');
    const company = safeHTML(contact?.company || contact?.companyName || contact?.公司名稱 || '私人收藏名片');
    const action = safeHTML(contact?.crmNextAction || '初次聯繫');
    const suggestion = safeHTML(contact?.crmAiSuggestion || '');
    return `
      <button type="button" data-networking-contact-index="${index}" class="w-full rounded-2xl border border-violet-100 bg-white p-4 text-left shadow-sm active:scale-[0.99] transition-transform">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined mt-0.5 rounded-xl bg-violet-50 p-2 text-violet-600">person_search</span>
          <span class="min-w-0 flex-1">
            <strong class="block truncate text-[15px] font-black text-slate-800">${name}</strong>
            <small class="mt-0.5 block truncate text-[11px] font-bold text-slate-400">${company}</small>
            <span class="mt-2 block text-[12px] font-black text-violet-700">建議：${action}</span>
            ${suggestion ? `<small class="mt-1 block line-clamp-2 text-[11px] font-bold leading-relaxed text-slate-500">${suggestion}</small>` : ''}
          </span>
          <span class="material-symbols-outlined text-slate-300">chevron_right</span>
        </span>
      </button>`;
  }

  async function loadTodaySuggestions() {
    const list = document.getElementById('business-networking-today-private');
    if (!list) return;
    if (typeof window.fetchAPI !== 'function') {
      list.innerHTML = '<div class="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-[12px] font-bold text-amber-700">目前無法讀取私人人脈，請稍後再試。</div>';
      return;
    }
    const requestToken = ++todayRequestToken;
    list.innerHTML = '<div class="rounded-2xl border border-slate-100 bg-white p-5 text-center text-[12px] font-bold text-slate-400">正在整理私人人脈...</div>';
    try {
      const response = await window.fetchAPI('getCrmContacts', { limit: 80, scope: 'self' }, true);
      if (requestToken !== todayRequestToken) return;
      const contacts = Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : []);
      visibleContacts = contacts
        .filter(needsFollowup)
        .filter(contact => String(contact?.sourceType || '') !== 'self_profile')
        .slice(0, 3);
      list.innerHTML = visibleContacts.length
        ? visibleContacts.map(renderTodayContact).join('')
        : '<div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-[12px] font-bold leading-relaxed text-emerald-700">今天沒有待跟進名片。新增或更新名片後，系統會在這裡整理下一步。</div>';
    } catch (error) {
      if (requestToken !== todayRequestToken) return;
      visibleContacts = [];
      list.innerHTML = `<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-[12px] font-bold leading-relaxed text-red-600">今日建議讀取失敗：${safeHTML(error?.message || error || '請稍後再試')}</div>`;
    }
  }

  function todayPanelBody() {
    return `
      <section class="mt-4">
        <div class="mb-2 flex items-center justify-between gap-3">
          <h4 class="text-[15px] font-black text-slate-800">今天值得重新聯絡</h4>
          <span class="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">私人資料</span>
        </div>
        <p class="mb-3 text-[11px] font-bold leading-relaxed text-slate-500">只讀取自己的收藏名片與 CRM 狀態，不會公開或傳送訊息。</p>
        <div id="business-networking-today-private" class="space-y-3"></div>
      </section>
      <button type="button" data-networking-public-match class="mt-4 w-full rounded-2xl border border-blue-100 bg-blue-50 p-4 text-left active:scale-[0.99] transition-transform">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined rounded-xl bg-white p-2 text-blue-600">handshake</span>
          <span class="min-w-0 flex-1"><strong class="block text-[15px] font-black text-slate-800">今天值得新認識</strong><small class="mt-1 block text-[12px] font-bold leading-relaxed text-slate-500">前往既有公開交流池，自行輸入需求後才會執行配對。</small></span>
          <span class="material-symbols-outlined text-blue-300">arrow_forward</span>
        </span>
      </button>
      <div class="mt-3 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-left">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined rounded-xl bg-white p-2 text-slate-400">apartment</span>
          <span class="min-w-0 flex-1"><strong class="block text-[15px] font-black text-slate-600">今天值得合作的企業</strong><small class="mt-1 block text-[12px] font-bold leading-relaxed text-slate-400">尚未接入經驗證企業合作資料，不會混用現有優惠／折抵店家。</small></span>
        </span>
      </div>`;
  }

  function privatePanelBody() {
    return `
      <section class="mt-4">
        <div class="mb-2 flex items-center justify-between gap-3">
          <h4 class="text-[15px] font-black text-slate-800">最近應該聯絡</h4>
          <span class="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">本人範圍</span>
        </div>
        <div id="business-networking-private-followup" class="space-y-3"></div>
      </section>
      <section class="mt-5">
        <h4 class="mb-1 text-[15px] font-black text-slate-800">可能成為合作夥伴</h4>
        <p class="mb-3 text-[11px] font-bold leading-relaxed text-slate-500">依既有客戶類型整理候選人，結果只供自己參考，仍需人工判斷。</p>
        <div id="business-networking-private-collaboration" class="space-y-3"></div>
      </section>
      <div class="mt-5 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-left">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined rounded-xl bg-white p-2 text-slate-400">share</span>
          <span class="min-w-0 flex-1"><strong class="block text-[15px] font-black text-slate-600">可能幫我引薦</strong><small class="mt-1 block text-[12px] font-bold leading-relaxed text-slate-400">目前沒有可信的關係與引薦證據，因此不自動推測。</small></span>
        </span>
      </div>`;
  }

  async function loadPrivateNetwork() {
    const followupList = document.getElementById('business-networking-private-followup');
    const collaborationList = document.getElementById('business-networking-private-collaboration');
    if (!followupList || !collaborationList) return;
    const loading = '<div class="rounded-2xl border border-slate-100 bg-white p-5 text-center text-[12px] font-bold text-slate-400">正在整理私人人脈...</div>';
    followupList.innerHTML = loading;
    collaborationList.innerHTML = loading;
    if (typeof window.fetchAPI !== 'function') {
      const unavailable = '<div class="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-[12px] font-bold text-amber-700">目前無法讀取私人人脈，請稍後再試。</div>';
      followupList.innerHTML = unavailable;
      collaborationList.innerHTML = unavailable;
      return;
    }
    const requestToken = ++todayRequestToken;
    try {
      const response = await window.fetchAPI('getCrmContacts', { limit: 80, scope: 'self' }, true);
      if (requestToken !== todayRequestToken) return;
      const contacts = (Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : []))
        .filter(contact => String(contact?.sourceType || '') !== 'self_profile');
      const followups = contacts.filter(needsFollowup).slice(0, 3);
      const collaborationTypes = ['合作夥伴', '通路資源', '課程合作', '供應商'];
      const collaborations = contacts.filter(contact => collaborationTypes.includes(String(contact?.crmType || '').trim())).slice(0, 3);
      visibleContacts = [...followups, ...collaborations];
      followupList.innerHTML = followups.length
        ? followups.map((contact, index) => renderTodayContact(contact, index)).join('')
        : '<div class="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-[12px] font-bold text-emerald-700">目前沒有待跟進人脈。</div>';
      collaborationList.innerHTML = collaborations.length
        ? collaborations.map((contact, index) => renderTodayContact(contact, followups.length + index)).join('')
        : '<div class="rounded-2xl border border-slate-200 bg-white p-4 text-[12px] font-bold leading-relaxed text-slate-500">目前沒有已分類的合作候選人；可先在名片詳情確認客戶類型。</div>';
    } catch (error) {
      if (requestToken !== todayRequestToken) return;
      visibleContacts = [];
      const failed = `<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-[12px] font-bold text-red-600">私人人脈讀取失敗：${safeHTML(error?.message || error || '請稍後再試')}</div>`;
      followupList.innerHTML = failed;
      collaborationList.innerHTML = failed;
    }
  }

  function ensureLab() {
    let root = document.getElementById('business-networking-lab');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'business-networking-lab';
    root.className = 'hidden fixed inset-0 z-[220] bg-slate-950/40';
    root.innerHTML = `
      <section class="mx-auto flex h-[100dvh] w-full max-w-md flex-col bg-slate-50 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="business-networking-lab-title">
        <header class="shrink-0 border-b border-slate-200 bg-white px-4 pb-4 pt-safe">
          <div class="flex items-center gap-3 pt-4">
            <button type="button" data-networking-lab-close class="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600" aria-label="關閉業務助理"><span class="material-symbols-outlined">arrow_back</span></button>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-black tracking-[0.18em] text-violet-600">BUSINESS ASSISTANT BETA</p>
              <h2 id="business-networking-lab-title" class="text-xl font-black text-slate-900">交流合作實驗區</h2>
            </div>
            <span class="rounded-full bg-amber-50 px-3 py-1.5 text-[11px] font-black text-amber-700">測試中</span>
          </div>
          <div class="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-[12px] font-bold leading-relaxed text-blue-800">
            此測試區只讀取既有私人人脈；不會公開資料、寫入資料或傳送訊息。
          </div>
          <button type="button" data-networking-lab-legacy class="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-[13px] font-black text-white">
            <span class="material-symbols-outlined text-[18px]">task_alt</span>查看原有今日跟進建議
          </button>
        </header>
        <nav class="grid shrink-0 grid-cols-4 gap-1 border-b border-slate-200 bg-white px-2 py-2" aria-label="交流合作實驗區分頁">
          ${Object.entries(PANEL_DEFINITIONS).map(([key, panel]) => `<button type="button" data-networking-lab-tab="${key}" class="rounded-xl px-1 py-2 text-[11px] font-black text-slate-500"><span class="material-symbols-outlined block text-[20px]">${panel.icon}</span>${panel.label}</button>`).join('')}
        </nav>
        <main id="business-networking-lab-content" class="min-h-0 flex-1 overflow-y-auto p-4"></main>
      </section>`;
    document.body.appendChild(root);

    root.addEventListener('click', event => {
      const tab = event.target.closest('[data-networking-lab-tab]');
      if (tab) return switchPanel(tab.dataset.networkingLabTab);
      if (event.target.closest('[data-networking-lab-close]')) return window.closeBusinessNetworkingLab();
      if (event.target.closest('[data-networking-lab-legacy]')) return window.openExistingSalesAssistant();
      const contactButton = event.target.closest('[data-networking-contact-index]');
      if (contactButton) {
        const contact = visibleContacts[Number(contactButton.dataset.networkingContactIndex)];
        const rowId = contact?.rowId || contact?.cardRowId || '';
        window.closeBusinessNetworkingLab();
        if (rowId && typeof window.openCardDetailById === 'function') window.openCardDetailById(rowId);
        else window.goPage?.('card');
        return;
      }
      if (event.target.closest('[data-networking-public-match]')) return window.openNetworkingPublicMatch();
      const action = event.target.closest('[data-networking-lab-action]');
      if (action) window.showToast?.(`${action.dataset.networkingLabAction}：下一階段開放`);
    });
    return root;
  }

  function switchPanel(panelKey) {
    const root = ensureLab();
    const panel = PANEL_DEFINITIONS[panelKey] || PANEL_DEFINITIONS.today;
    root.querySelectorAll('[data-networking-lab-tab]').forEach(button => {
      const active = button.dataset.networkingLabTab === panelKey;
      button.classList.toggle('bg-violet-50', active);
      button.classList.toggle('text-violet-700', active);
      button.classList.toggle('text-slate-500', !active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    root.querySelector('#business-networking-lab-content').innerHTML = `
      <section class="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 class="text-xl font-black text-slate-900">${panel.title}</h3>
        <p class="mt-2 text-[13px] font-bold leading-relaxed text-slate-500">${panel.description}</p>
        ${panel.notice ? `<div class="mt-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[12px] font-bold leading-relaxed text-amber-800">${panel.notice}</div>` : ''}
      </section>
      ${panelKey === 'today' ? todayPanelBody() : (panelKey === 'private' ? privatePanelBody() : `<div class="mt-4 space-y-3">${actionCards(panel.actions)}</div>`)}
      <p class="pb-safe mt-6 text-center text-[11px] font-bold text-slate-400">交流合作功能將依資料授權逐步開放。</p>`;
    if (panelKey === 'today') loadTodaySuggestions();
    if (panelKey === 'private') loadPrivateNetwork();
  }

  window.openBusinessNetworkingLab = function() {
    const root = ensureLab();
    root.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    switchPanel('today');
  };

  window.closeBusinessNetworkingLab = function() {
    document.getElementById('business-networking-lab')?.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  };

  window.openExistingSalesAssistant = function() {
    window.closeBusinessNetworkingLab();
    window.openHomeLowerPanel?.('assistant');
  };

  window.openNetworkingPublicMatch = function() {
    window.closeBusinessNetworkingLab();
    if (typeof window.setMatchmakePoolScope === 'function') window.setMatchmakePoolScope('public');
    else window.matchmakePoolScope = 'public';
    window.goPage?.('home');
    setTimeout(() => window.scrollToHomeMatchmake?.(), 160);
  };

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('business-networking-lab')?.classList.contains('hidden')) {
      window.closeBusinessNetworkingLab();
    }
  });
})();
