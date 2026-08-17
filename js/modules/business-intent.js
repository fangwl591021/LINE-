(() => {
  const TAB_ID = 'business';

  function safeText(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function parseConfig(card) {
    if (!card) return {};
    const raw = card['自訂名片設定'] || card.customConfig || card.custom_config || '{}';
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function getCurrentCard() {
    return window.currentCard || window.currentUserCard || null;
  }

  function canEdit(card) {
    if (!card) return false;
    if (typeof window.canEditCardRecord === 'function') return !!window.canEditCardRecord(card);
    const currentUserId = safeText(window.currentUserProfile?.userId || window.currentUser?.userId || window.currentUser?.lineId);
    const cardUserId = safeText(card['LINE ID'] || card.lineId || card.userId || card.profileUserId);
    return !!currentUserId && !!cardUserId && currentUserId === cardUserId;
  }

  function buildIntentQuery(intent) {
    const parts = [];
    if (safeText(intent?.offer)) parts.push('我可以提供：' + safeText(intent.offer));
    if (safeText(intent?.seek)) parts.push('我正在尋找：' + safeText(intent.seek));
    if (safeText(intent?.collaboration)) parts.push('我希望合作：' + safeText(intent.collaboration));
    return parts.join('；');
  }

  function ensureUi() {
    const ecardTab = document.getElementById('tab-ecard');
    const ecardContent = document.getElementById('tab-content-ecard');
    if (!ecardTab || !ecardContent) return false;

    if (!document.getElementById('tab-business')) {
      const button = document.createElement('button');
      button.id = 'tab-business';
      button.type = 'button';
      button.className = 'flex-1 py-4 font-bold text-sm text-slate-400 border-b-2 border-transparent transition-colors';
      button.setAttribute('onclick', "window.switchTab('business')");
      button.innerHTML = '🎯 業務需求';
      ecardTab.parentNode.insertBefore(button, ecardTab);
    }

    if (!document.getElementById('tab-content-business')) {
      const panel = document.createElement('div');
      panel.id = 'tab-content-business';
      panel.className = 'hidden px-4 py-5 bg-white space-y-4';
      panel.innerHTML = `
        <div class="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <div class="flex items-center gap-2 font-black text-slate-800"><span class="material-symbols-outlined text-blue-600">hub</span>建立您的 AI 業務需求</div>
          <p class="mt-2 text-[12px] font-bold leading-relaxed text-slate-500">這三項資料會提供給 AI 搜尋與智能配對使用，讓系統知道您能提供什麼、正在找誰、希望怎麼合作。</p>
        </div>
        <div>
          <label class="block text-[13px] font-black text-slate-700 mb-2">1. 我可以提供？</label>
          <textarea id="business-intent-offer" rows="3" class="textarea-block" placeholder="例：網站建置 / AI導入 / 企業培訓"></textarea>
        </div>
        <div>
          <label class="block text-[13px] font-black text-slate-700 mb-2">2. 我正在尋找？</label>
          <textarea id="business-intent-seek" rows="3" class="textarea-block" placeholder="例：製造業企業主 / 企業客戶 / 合作通路"></textarea>
        </div>
        <div>
          <label class="block text-[13px] font-black text-slate-700 mb-2">3. 我希望合作？</label>
          <textarea id="business-intent-collaboration" rows="3" class="textarea-block" placeholder="例：客戶轉介 / 異業合作 / 通路合作 / 聯合提案"></textarea>
        </div>
        <div id="business-intent-readonly-note" class="hidden rounded-2xl bg-slate-50 px-4 py-3 text-[12px] font-bold text-slate-500">這是對方的業務需求資料，僅本人可修改。</div>
        <div id="business-intent-actions" class="grid grid-cols-2 gap-3 pt-1">
          <button type="button" onclick="window.saveBusinessIntent()" class="rounded-2xl bg-slate-900 py-3.5 text-[13px] font-black text-white active:scale-95 transition-transform">儲存業務需求</button>
          <button type="button" onclick="window.startBusinessIntentRecommendation()" class="rounded-2xl bg-blue-600 py-3.5 text-[13px] font-black text-white active:scale-95 transition-transform">AI 智能推薦</button>
        </div>`;
      ecardContent.parentNode.insertBefore(panel, ecardContent);
    }
    return true;
  }

  window.renderBusinessIntent = function(card = getCurrentCard()) {
    if (!ensureUi()) return;
    const cfg = parseConfig(card);
    const intent = cfg.businessIntent || {};
    const editable = canEdit(card);
    const fields = {
      offer: document.getElementById('business-intent-offer'),
      seek: document.getElementById('business-intent-seek'),
      collaboration: document.getElementById('business-intent-collaboration')
    };
    Object.entries(fields).forEach(([key, el]) => {
      if (!el) return;
      el.value = safeText(intent[key]);
      el.readOnly = !editable;
      el.classList.toggle('opacity-70', !editable);
    });
    document.getElementById('business-intent-actions')?.classList.toggle('hidden', !editable);
    document.getElementById('business-intent-readonly-note')?.classList.toggle('hidden', editable);
  };

  window.getCurrentBusinessIntent = function() {
    const card = getCurrentCard();
    const cfg = parseConfig(card);
    return cfg.businessIntent || {};
  };

  window.saveBusinessIntent = async function(options = {}) {
    const card = getCurrentCard();
    if (!card) return window.showToast?.('找不到名片資料', true);
    if (!canEdit(card)) return window.showToast?.('只有名片本人可以修改業務需求', true);
    const rowId = safeText(card.rowId || card.row_id || card.id);
    if (!rowId) return window.showToast?.('找不到名片 ID', true);

    const intent = {
      offer: safeText(document.getElementById('business-intent-offer')?.value),
      seek: safeText(document.getElementById('business-intent-seek')?.value),
      collaboration: safeText(document.getElementById('business-intent-collaboration')?.value),
      updatedAt: new Date().toISOString()
    };
    if (!intent.offer && !intent.seek && !intent.collaboration) {
      return window.showToast?.('請至少填寫一項業務需求', true);
    }

    const cfg = parseConfig(card);
    cfg.businessIntent = intent;
    const serialized = JSON.stringify(cfg);
    const res = await window.fetchAPI('updateCard', { rowId, data: { '自訂名片設定': serialized } }, true);
    if (!res || res.success === false || res.error) throw new Error(res?.error || '儲存失敗');
    card['自訂名片設定'] = serialized;
    if (window.currentUserCard && safeText(window.currentUserCard.rowId) === rowId) window.currentUserCard['自訂名片設定'] = serialized;
    if (window.currentCard && safeText(window.currentCard.rowId) === rowId) window.currentCard['自訂名片設定'] = serialized;
    if (!options.silent) window.showToast?.('業務需求已儲存，AI 配對會使用這些資料');
    return intent;
  };

  window.startBusinessIntentRecommendation = async function() {
    try {
      const intent = await window.saveBusinessIntent({ silent: true });
      if (!intent) return;
      const query = buildIntentQuery(intent);
      window.pendingBusinessIntentMatchQuery = query;
      window.pendingBusinessIntent = intent;
      window.matchmakePoolScope = 'public';
      window.goPage?.('matchmake');
      setTimeout(() => {
        const queryEl = document.getElementById('match-query');
        if (queryEl) queryEl.value = query;
        if (typeof window.startMatchmaking === 'function') window.startMatchmaking();
      }, 250);
    } catch (e) {
      window.showToast?.(e?.message || '智能推薦啟動失敗', true);
    }
  };

  function installSwitchTabPatch() {
    if (window.__BUSINESS_INTENT_TAB_PATCHED__) return;
    if (typeof window.switchTab !== 'function') return setTimeout(installSwitchTabPatch, 50);
    window.__BUSINESS_INTENT_TAB_PATCHED__ = true;
    const original = window.switchTab;
    window.switchTab = function(tab) {
      ensureUi();
      if (tab === TAB_ID) {
        ['personal', 'tags', 'ecard'].forEach(t => document.getElementById('tab-content-' + t)?.classList.add('hidden'));
        document.getElementById('tab-content-business')?.classList.remove('hidden');
        ['personal', 'tags', 'ecard', 'business'].forEach(t => {
          const btn = document.getElementById('tab-' + t);
          if (!btn) return;
          const active = t === 'business';
          btn.classList.toggle('text-blue-600', active);
          btn.classList.toggle('border-blue-600', active);
          btn.classList.toggle('text-slate-400', !active);
          btn.classList.toggle('border-transparent', !active);
        });
        window.renderBusinessIntent(getCurrentCard());
        return;
      }
      document.getElementById('tab-content-business')?.classList.add('hidden');
      const businessBtn = document.getElementById('tab-business');
      if (businessBtn) {
        businessBtn.classList.remove('text-blue-600', 'border-blue-600');
        businessBtn.classList.add('text-slate-400', 'border-transparent');
      }
      return original.call(this, tab);
    };
  }

  function installOpenCardPatch() {
    if (window.__BUSINESS_INTENT_CARD_PATCHED__) return;
    if (typeof window.openCardDetail !== 'function') return setTimeout(installOpenCardPatch, 80);
    window.__BUSINESS_INTENT_CARD_PATCHED__ = true;
    const original = window.openCardDetail;
    window.openCardDetail = function(card, ...args) {
      const result = original.call(this, card, ...args);
      setTimeout(() => {
        window.renderBusinessIntent(card);
        if (window.currentPage === 'card-detail') {
          window.switchTab?.('personal');
          window.openPersonalDataPanel?.('info');
        }
      }, 0);
      return result;
    };
  }

  function install() {
    ensureUi();
    installSwitchTabPatch();
    installOpenCardPatch();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
