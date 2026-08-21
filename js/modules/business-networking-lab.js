// Business Assistant networking lab shell.
// UI-only experiment: no API calls, persistence, publishing, or messaging.
(() => {
  'use strict';

  const PANEL_DEFINITIONS = {
    today: {
      label: '今日建議',
      icon: 'today',
      title: '今天值得採取的行動',
      description: '後續會整合私人跟進、公開交流與企業合作建議。',
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
            目前只開放入口與畫面體驗，不會公開資料、寫入資料或傳送訊息。
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
      <div class="mt-4 space-y-3">${actionCards(panel.actions)}</div>
      <p class="pb-safe mt-6 text-center text-[11px] font-bold text-slate-400">此版本僅建立入口、畫面框架與按鈕。</p>`;
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

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('business-networking-lab')?.classList.contains('hidden')) {
      window.closeBusinessNetworkingLab();
    }
  });
})();
