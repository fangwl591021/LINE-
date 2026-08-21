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
        ['mark_email_unread', '認識邀請', '推薦結果可建立站內交流草稿，由本人確認後送出。']
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
  let publicRecommendationMatches = [];
  const publicRecommendationDecisions = new Map();

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

  function existingText(value) {
    if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean).join('、');
    return String(value || '').trim();
  }

  function reasonDate(value) {
    const text = existingText(value);
    if (!text) return '';
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  function contactReasons(contact, mode = 'followup') {
    const status = existingText(contact?.crmStatus) || '新名片';
    const type = existingText(contact?.crmType) || '待判斷';
    const nextAction = existingText(contact?.crmNextAction) || '初次聯繫';
    const suggestion = existingText(contact?.crmAiSuggestion);
    const company = existingText(contact?.company || contact?.companyName || contact?.公司名稱);
    const title = existingText(contact?.title || contact?.職稱);
    const career = existingText(contact?.career || contact?.事業 || contact?.tags);
    const nextFollowup = reasonDate(contact?.crmNextFollowupAt);
    const lastActivity = reasonDate(contact?.lastActivityTime);
    const reasons = mode === 'collaboration'
      ? [
          `既有 CRM 客戶類型為「${type}」，目前建議下一步是「${nextAction}」。`,
          company || title ? `名片資料顯示：${[company, title].filter(Boolean).join('／')}。` : '',
          career ? `現有事業／標籤資料：${career}。` : '',
          suggestion
        ]
      : [
          `目前跟進狀態為「${status}」，尚屬需要持續聯絡的階段。`,
          nextFollowup ? `預定跟進日期：${nextFollowup}。` : (lastActivity ? `最近資料更新：${lastActivity}。` : ''),
          `既有下一步：${nextAction}。`,
          suggestion
        ];
    return [...new Set(reasons.filter(Boolean))].slice(0, 4);
  }

  function renderTodayContact(contact, index, mode = 'followup') {
    const name = safeHTML(contact?.name || contact?.姓名 || '未命名');
    const company = safeHTML(contact?.company || contact?.companyName || contact?.公司名稱 || '私人收藏名片');
    const action = safeHTML(contact?.crmNextAction || '初次聯繫');
    const reasons = contactReasons(contact, mode);
    return `
      <button type="button" data-networking-contact-index="${index}" class="w-full rounded-2xl border border-violet-100 bg-white p-4 text-left shadow-sm active:scale-[0.99] transition-transform">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined mt-0.5 rounded-xl bg-violet-50 p-2 text-violet-600">person_search</span>
          <span class="min-w-0 flex-1">
            <strong class="block truncate text-[15px] font-black text-slate-800">${name}</strong>
            <small class="mt-0.5 block truncate text-[11px] font-bold text-slate-400">${company}</small>
            <span class="mt-2 block text-[12px] font-black text-violet-700">建議：${action}</span>
            <span class="mt-3 block text-[11px] font-black text-slate-600">為什麼建議</span>
            <ul class="mt-1.5 space-y-1 text-[11px] font-bold leading-relaxed text-slate-500">
              ${reasons.map(reason => `<li class="flex items-start gap-1.5"><span class="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-violet-400"></span><span>${safeHTML(reason)}</span></li>`).join('')}
            </ul>
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
      <button type="button" data-networking-generate-public class="mt-4 w-full rounded-2xl border border-blue-100 bg-blue-50 p-4 text-left active:scale-[0.99] transition-transform">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined rounded-xl bg-white p-2 text-blue-600">handshake</span>
          <span class="min-w-0 flex-1"><strong class="block text-[15px] font-black text-slate-800">今天值得新認識</strong><small class="mt-1 block text-[12px] font-bold leading-relaxed text-slate-500">前往既有公開交流池，自行輸入需求後才會執行配對。</small></span>
          <span class="material-symbols-outlined text-blue-300">arrow_forward</span>
        </span>
      </button>
      <div id="business-networking-public-results" class="mt-3 space-y-3"></div>
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
        ? collaborations.map((contact, index) => renderTodayContact(contact, followups.length + index, 'collaboration')).join('')
        : '<div class="rounded-2xl border border-slate-200 bg-white p-4 text-[12px] font-bold leading-relaxed text-slate-500">目前沒有已分類的合作候選人；可先在名片詳情確認客戶類型。</div>';
    } catch (error) {
      if (requestToken !== todayRequestToken) return;
      visibleContacts = [];
      const failed = `<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-[12px] font-bold text-red-600">私人人脈讀取失敗：${safeHTML(error?.message || error || '請稍後再試')}</div>`;
      followupList.innerHTML = failed;
      collaborationList.innerHTML = failed;
    }
  }

  function readOwnBusinessIntent() {
    const card = window.currentUserCard;
    if (!card) return {};
    const serialized = card['自訂名片設定'] || card.customConfig || card.custom_config || '{}';
    try {
      const config = typeof serialized === 'string' ? JSON.parse(serialized || '{}') : serialized;
      return config && typeof config.businessIntent === 'object' ? config.businessIntent : {};
    } catch (error) {
      return {};
    }
  }

  function publicIntentRow(label, value, icon) {
    const display = String(value || '').trim();
    return `
      <div class="rounded-2xl border border-slate-100 bg-slate-50 p-3">
        <div class="flex items-center gap-2 text-[11px] font-black text-slate-500"><span class="material-symbols-outlined text-[17px] text-blue-600">${icon}</span>${label}</div>
        <p class="mt-1.5 text-[13px] font-bold leading-relaxed ${display ? 'text-slate-800' : 'text-slate-400'}">${safeHTML(display || '尚未填寫')}</p>
      </div>`;
  }

  function publicPanelBody() {
    const card = window.currentUserCard || null;
    const intent = readOwnBusinessIntent();
    const poolEligible = card?.poolEligible === true || String(card?.poolEligible || '').toLowerCase() === 'true';
    const visibility = String(card?.visibility || '').toLowerCase();
    const statusLabel = !card
      ? '尚未建立本人名片'
      : (poolEligible ? '已可進入公開交流池' : (visibility === 'public' ? '公開條件審核中' : '尚未進入公開交流池'));
    const statusTone = poolEligible ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700';
    return `
      <section class="mt-4 rounded-3xl border border-blue-100 bg-white p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <p class="text-[11px] font-black tracking-[0.12em] text-blue-600">MY COOPERATION PROFILE</p>
            <h4 class="mt-1 truncate text-lg font-black text-slate-900">${safeHTML(card?.name || '我的合作檔案')}</h4>
          </div>
          <span class="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone}">${statusLabel}</span>
        </div>
        <p class="mt-3 text-[11px] font-bold leading-relaxed text-slate-500">只讀取本人的數位名片設定；收藏的別人名片不會出現在公開合作檔案。</p>
        <div class="mt-4 space-y-2">
          ${publicIntentRow('我可以提供', intent.offer, 'volunteer_activism')}
          ${publicIntentRow('我正在尋找', intent.seek, 'search')}
          ${publicIntentRow('希望合作方式', intent.collaboration, 'handshake')}
        </div>
        <button type="button" data-networking-own-profile class="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-3 text-[13px] font-black text-white">
          <span class="material-symbols-outlined text-[18px]">edit</span>${card ? '編輯我的合作檔案' : '建立我的數位名片'}
        </button>
      </section>
      <button type="button" data-networking-generate-public class="mt-4 w-full rounded-2xl border border-blue-100 bg-blue-50 p-4 text-left active:scale-[0.99] transition-transform">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined rounded-xl bg-white p-2 text-blue-600">recommend</span>
          <span class="min-w-0 flex-1"><strong class="block text-[15px] font-black text-slate-800">AI 推薦夥伴</strong><small class="mt-1 block text-[12px] font-bold leading-relaxed text-slate-500">前往公開交流池；由您輸入需求後才會開始配對。</small></span>
          <span class="material-symbols-outlined text-blue-300">arrow_forward</span>
        </span>
      </button>
      <div id="business-networking-public-results" class="mt-3 space-y-3"></div>
      <div class="mt-3 rounded-2xl border border-slate-200 bg-slate-100 p-4 text-left">
        <span class="flex items-start gap-3">
          <span class="material-symbols-outlined rounded-xl bg-white p-2 text-blue-500">mark_email_unread</span>
          <span class="min-w-0 flex-1"><strong class="block text-[15px] font-black text-slate-700">認識邀請</strong><small class="mt-1 block text-[12px] font-bold leading-relaxed text-slate-500">推薦結果可開啟站內交流草稿；送出前由本人確認，不會自動傳送 LINE。</small></span>
        </span>
      </div>`;
  }

  function readCardBusinessIntent(card) {
    const values = [card?.['自訂名片設定'], card?.customConfig, card?.custom_config]
      .filter(value => value !== null && value !== undefined && value !== '');
    for (const serialized of values) {
      try {
        const config = typeof serialized === 'string' ? JSON.parse(serialized || '{}') : serialized;
        if (config && typeof config.businessIntent === 'object') return config.businessIntent;
      } catch (error) {}
    }
    return {};
  }

  function publicRecommendationKey(match, index) {
    const card = match?.card || {};
    return existingText(card.rowId || card.row_id || card.id || card.profileUserId || `result-${index}`);
  }

  function publicRecommendationDecision(match, index) {
    return publicRecommendationDecisions.get(publicRecommendationKey(match, index)) || '';
  }

  function recommendationReasonDetails(match) {
    const card = match?.card || {};
    const ownIntent = readOwnBusinessIntent();
    const candidateIntent = readCardBusinessIntent(card);
    const industryAndService = [
      candidateIntent.offer,
      card.services || card['服務項目'],
      card.industry || card['主要業種'],
      card.companyName || card['公司名稱'],
      card.title || card['職稱']
    ].map(existingText).filter(Boolean);
    const traits = [
      ['個性', card.personality || card['個性']],
      ['興趣', card.hobbies || card['興趣']],
      ['財富', card.wealth || card['財富']],
      ['健康', card.health || card['健康']],
      ['事業', card.career || card['事業']]
    ].map(([label, value]) => existingText(value) ? `${label}：${existingText(value)}` : '').filter(Boolean);
    return [
      {
        label: '您的需求',
        icon: 'target',
        value: existingText(ownIntent.seek || ownIntent.collaboration || ownIntent.offer) || '尚未提供可對照的需求內容'
      },
      {
        label: '對方服務／行業',
        icon: 'business_center',
        value: [...new Set(industryAndService)].join('／') || '對方尚未公開服務或行業資料'
      },
      {
        label: '公開特質',
        icon: 'psychology',
        value: traits.join('；') || '對方尚未公開可供判斷的特質資料'
      },
      {
        label: '合作切入點',
        icon: 'handshake',
        value: existingText(match?.reason || candidateIntent.collaboration || candidateIntent.seek) || '建議先查看公開名片，再判斷適合的交流方式'
      }
    ];
  }

  function publicMatchCard(match, index) {
    const card = match?.card || {};
    const name = safeHTML(card.name || card['姓名'] || '公開交流夥伴');
    const company = safeHTML(card.companyName || card['公司名稱'] || '');
    const title = safeHTML(card.title || card['職稱'] || '');
    const score = Math.max(0, Math.min(100, Number(match?.score || 0) || 0));
    const details = recommendationReasonDetails(match);
    const decision = publicRecommendationDecision(match, index);
    const stateBadge = decision === 'interested'
      ? '<span class="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">已標記想認識</span>'
      : (decision === 'dismissed'
          ? '<span class="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">已標記不適合</span>'
          : `<span class="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">契合度 ${score}%</span>`);
    const decisionActions = decision === 'interested'
      ? `<div class="grid grid-cols-2 gap-2">
          <button type="button" data-networking-public-contact="${index}" class="rounded-xl bg-blue-600 py-2.5 text-[12px] font-black text-white active:scale-[0.98]">建立交流草稿</button>
          <button type="button" data-networking-public-dismiss="${index}" class="rounded-xl border border-slate-200 bg-white py-2.5 text-[12px] font-black text-slate-600 active:scale-[0.98]">改為不適合</button>
        </div>`
      : (decision === 'dismissed'
          ? `<button type="button" data-networking-public-restore="${index}" class="w-full rounded-xl border border-slate-200 bg-white py-2.5 text-[12px] font-black text-slate-600 active:scale-[0.98]">恢復這項推薦</button>`
          : `<div class="grid grid-cols-2 gap-2">
              <button type="button" data-networking-public-interest="${index}" class="rounded-xl bg-blue-600 py-2.5 text-[12px] font-black text-white active:scale-[0.98]">我想認識</button>
              <button type="button" data-networking-public-dismiss="${index}" class="rounded-xl border border-slate-200 bg-white py-2.5 text-[12px] font-black text-slate-600 active:scale-[0.98]">不適合</button>
            </div>`);
    return `
      <article class="rounded-2xl border ${decision === 'dismissed' ? 'border-slate-200 bg-slate-50 opacity-75' : 'border-blue-100 bg-white'} p-4 shadow-sm">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h5 class="truncate text-[15px] font-black text-slate-800">${name}</h5>
            <p class="mt-0.5 truncate text-[11px] font-bold text-slate-400">${[company, title].filter(Boolean).join('／') || '本人授權公開合作檔案'}</p>
          </div>
          ${stateBadge}
        </div>
        <div class="mt-3 text-[11px] font-black text-slate-600">詳細合作理由</div>
        <div class="mt-2 space-y-2">
          ${details.map(detail => `<div class="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"><div class="flex items-center gap-1.5 text-[10px] font-black text-blue-700"><span class="material-symbols-outlined text-[15px]">${detail.icon}</span>${detail.label}</div><p class="mt-1 text-[11px] font-bold leading-relaxed text-slate-600">${safeHTML(detail.value)}</p></div>`).join('')}
        </div>
        <div class="mt-4 space-y-2 border-t border-slate-100 pt-3">
          <button type="button" data-networking-public-view="${index}" class="w-full rounded-xl border border-blue-100 bg-blue-50 py-2.5 text-[12px] font-black text-blue-700 active:scale-[0.98]">查看公開名片</button>
          ${decisionActions}
        </div>
      </article>`;
  }

  function renderPublicRecommendationResults() {
    const results = document.getElementById('business-networking-public-results');
    if (!results) return;
    results.innerHTML = publicRecommendationMatches.length
      ? `<div class="rounded-2xl bg-blue-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-blue-800">推薦只依公開合作資料與本人需求產生；請先查看詳細理由，再自行決定是否交流。想認識／不適合只保留於本次畫面，不寫入 CRM。</div>${publicRecommendationMatches.map(publicMatchCard).join('')}`
      : '<div class="rounded-2xl border border-slate-200 bg-white p-4 text-[12px] font-bold text-slate-500">目前沒有符合條件的公開合作夥伴。</div>';
  }

  function setPublicRecommendationDecision(index, decision) {
    const match = publicRecommendation(index);
    if (!match) return window.showToast?.('這份公開合作檔案已無法操作，請重新產生推薦', true);
    const key = publicRecommendationKey(match, index);
    if (decision) publicRecommendationDecisions.set(key, decision);
    else publicRecommendationDecisions.delete(key);
    renderPublicRecommendationResults();
    if (decision === 'interested') window.showToast?.('已標記想認識，可繼續建立交流草稿');
    if (decision === 'dismissed') window.showToast?.('已標記不適合，本次畫面將保留此狀態');
    if (!decision) window.showToast?.('已恢復這項推薦');
  }

  function publicRecommendation(index) {
    const match = publicRecommendationMatches[Number(index)];
    const card = match?.card || null;
    const visibility = String(card?.visibility || '').toLowerCase();
    const sourceType = String(card?.sourceType || card?.['名片來源'] || '').toLowerCase();
    const poolEligible = card?.poolEligible === true || String(card?.poolEligible || '').toLowerCase() === 'true';
    return card && visibility === 'public' && sourceType === 'self_profile' && poolEligible ? match : null;
  }

  function openPublicRecommendationCard(index) {
    const match = publicRecommendation(index);
    if (!match) return window.showToast?.('這份公開合作檔案已無法查看，請重新產生推薦', true);
    window.closeBusinessNetworkingLab();
    if (typeof window.openCardDetail === 'function') window.openCardDetail(match.card);
    else window.goPage?.('card');
  }

  function openPublicRecommendationInbox(index) {
    const match = publicRecommendation(index);
    if (!match) return window.showToast?.('這份公開合作檔案已無法交流，請重新產生推薦', true);
    if (typeof window.openInboxSendCenter !== 'function') return window.showToast?.('站內交流功能尚未就緒', true);
    const card = match.card || {};
    const name = existingText(card.name || card['姓名'] || '公開交流夥伴');
    const company = existingText(card.companyName || card['公司名稱'] || '');
    const receiverId = existingText(card.lineId || card.userId || card['LINE ID'] || card.profileUserId || '');
    const reason = existingText(match.reason || '雙方公開合作資料具有互補性');
    window.closeBusinessNetworkingLab();
    window.openInboxSendCenter();
    setTimeout(() => {
      window.setInboxRecipientMode?.('user');
      const query = document.getElementById('inbox-recipient-query');
      const title = document.getElementById('inbox-message-title');
      const body = document.getElementById('inbox-message-body');
      const results = document.getElementById('inbox-recipient-results');
      if (receiverId && typeof window.selectInboxRecipient === 'function') {
        window.selectInboxRecipient(receiverId, name);
      } else {
        if (query) query.value = name;
        if (results) results.innerHTML = '<div class="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-700">請搜尋並確認正確收件人後再送出。</div>';
      }
      if (title) title.value = `想認識 ${name}，交流合作`;
      if (body) body.value = `您好，我在 AI 商脈的公開合作推薦中看到您${company ? `（${company}）` : ''}的合作檔案。推薦原因是「${reason}」。想先認識您，看看是否有合適的交流或合作機會。`;
      window.toggleInboxComposer?.(true);
      document.getElementById('inbox-composer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      body?.focus();
    }, 240);
  }

  async function generatePublicRecommendations(trigger) {
    const results = document.getElementById('business-networking-public-results');
    if (!results || typeof window.fetchAPI !== 'function') return;
    publicRecommendationMatches = [];
    const card = window.currentUserCard || null;
    const poolEligible = card?.poolEligible === true || String(card?.poolEligible || '').toLowerCase() === 'true';
    const visibility = String(card?.visibility || '').toLowerCase();
    const intent = readOwnBusinessIntent();
    const query = [
      intent.offer ? `我可以提供：${existingText(intent.offer)}` : '',
      intent.seek ? `我正在尋找：${existingText(intent.seek)}` : '',
      intent.collaboration ? `我希望合作：${existingText(intent.collaboration)}` : ''
    ].filter(Boolean).join('；');
    if (!card) {
      results.innerHTML = '<div class="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-[12px] font-bold text-amber-700">請先建立本人的數位名片。</div>';
      return;
    }
    if (!poolEligible || visibility !== 'public') {
      results.innerHTML = '<div class="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-[12px] font-bold leading-relaxed text-amber-700">本人的名片尚未具備公開交流資格，請先至「我的名片」完成公開與安全審核。</div>';
      return;
    }
    if (!query) {
      results.innerHTML = '<div class="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-[12px] font-bold leading-relaxed text-amber-700">請先在「我的名片 → 業務需求」填寫至少一項合作需求。</div>';
      return;
    }
    const role = window.currentUser?.role || window.userRole || 'user';
    const limit = Number(window.LIMITS?.[role]?.matchmake ?? window.LIMITS?.user?.matchmake ?? 5);
    const today = new Date().toLocaleDateString('en-CA');
    const usageKey = `matchmake_usage_${today}`;
    const currentUsage = Number.parseInt(localStorage.getItem(usageKey) || '0', 10) || 0;
    if (Number.isFinite(limit) && currentUsage >= limit) {
      results.innerHTML = `<div class="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-[12px] font-bold text-amber-700">今日公開配對額度已用完（${limit} 次），請明日再試。</div>`;
      return;
    }
    const original = trigger?.innerHTML || '';
    if (trigger) {
      trigger.disabled = true;
      trigger.innerHTML = '<span class="flex items-center justify-center gap-2"><span class="material-symbols-outlined animate-spin">refresh</span>AI 正在整理公開推薦...</span>';
    }
    results.innerHTML = '<div class="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center text-[12px] font-bold text-blue-700">只搜尋本人授權公開且通過安全審核的合作檔案...</div>';
    try {
      const response = await window.fetchAPI('matchmakeContacts', {
        currentUser: window.currentUser,
        query,
        businessIntent: intent,
        poolScope: 'public',
        currentCardRowId: card.rowId || card.row_id || card.id || ''
      }, true);
      const matches = Array.isArray(response) ? response : (Array.isArray(response?.data) ? response.data : null);
      if (!matches) throw new Error(response?.error || '無法取得公開推薦');
      publicRecommendationMatches = matches.slice(0, 5);
      localStorage.setItem(usageKey, String(currentUsage + 1));
      renderPublicRecommendationResults();
    } catch (error) {
      publicRecommendationMatches = [];
      results.innerHTML = `<div class="rounded-2xl border border-red-100 bg-red-50 p-4 text-[12px] font-bold leading-relaxed text-red-600">公開推薦失敗：${safeHTML(error?.message || error || '請稍後再試')}</div>`;
    } finally {
      if (trigger) {
        trigger.disabled = false;
        trigger.innerHTML = original;
      }
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
      if (event.target.closest('[data-networking-own-profile]')) return window.openNetworkingOwnProfile();
      const generatePublic = event.target.closest('[data-networking-generate-public]');
      if (generatePublic) return generatePublicRecommendations(generatePublic);
      const publicView = event.target.closest('[data-networking-public-view]');
      if (publicView) return openPublicRecommendationCard(publicView.dataset.networkingPublicView);
      const publicInterest = event.target.closest('[data-networking-public-interest]');
      if (publicInterest) return setPublicRecommendationDecision(publicInterest.dataset.networkingPublicInterest, 'interested');
      const publicDismiss = event.target.closest('[data-networking-public-dismiss]');
      if (publicDismiss) return setPublicRecommendationDecision(publicDismiss.dataset.networkingPublicDismiss, 'dismissed');
      const publicRestore = event.target.closest('[data-networking-public-restore]');
      if (publicRestore) return setPublicRecommendationDecision(publicRestore.dataset.networkingPublicRestore, '');
      const publicContact = event.target.closest('[data-networking-public-contact]');
      if (publicContact) return openPublicRecommendationInbox(publicContact.dataset.networkingPublicContact);
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
      ${panelKey === 'today' ? todayPanelBody() : (panelKey === 'private' ? privatePanelBody() : (panelKey === 'public' ? publicPanelBody() : `<div class="mt-4 space-y-3">${actionCards(panel.actions)}</div>`))}
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

  window.openNetworkingOwnProfile = function() {
    window.closeBusinessNetworkingLab();
    if (typeof window.openMyCardSettings === 'function') window.openMyCardSettings();
    else window.goPage?.('admin-settings');
  };

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('business-networking-lab')?.classList.contains('hidden')) {
      window.closeBusinessNetworkingLab();
    }
  });
})();
