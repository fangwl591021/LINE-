(() => {
  const TAB_ID = 'business';

  function safeText(v) {
    return v === null || v === undefined ? '' : String(v).trim();
  }

  function parseConfigValue(raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function parseConfig(card) {
    if (!card) return {};
    const configs = [card['自訂名片設定'], card.customConfig, card.custom_config]
      .filter(value => value !== null && value !== undefined && value !== '')
      .map(parseConfigValue);
    return configs.find(config => config.businessIntent && typeof config.businessIntent === 'object')
      || configs[0]
      || {};
  }

  function getRowId(card) {
    return safeText(card?.rowId || card?.row_id || card?.id);
  }

  function resolveOwnCard(card) {
    const ownCard = window.currentUserCard || null;
    if (card && ownCard && getRowId(card) && getRowId(card) === getRowId(ownCard)) return ownCard;
    return card;
  }

  function getCurrentCard() {
    return resolveOwnCard(window.currentCard || window.currentUserCard || null);
  }

  function syncSavedConfig(rowId, serialized) {
    const normalizedRowId = safeText(rowId);
    const seen = new Set();
    const sync = card => {
      if (!card || seen.has(card) || getRowId(card) !== normalizedRowId) return;
      seen.add(card);
      card['自訂名片設定'] = serialized;
      card['電子名片設定'] = serialized;
      card.customConfig = serialized;
      card.custom_config = serialized;
    };
    sync(window.currentUserCard);
    sync(window.currentCard);
    [window.allCards, window.myCards].forEach(cards => {
      if (Array.isArray(cards)) cards.forEach(sync);
    });
  }

  function canEdit(card) {
    if (!card) return false;
    if (typeof window.canEditCardRecord === 'function') {
      if (window.canEditCardRecord(card)) return true;
      const ownCard = window.currentUserCard || null;
      if (ownCard && getRowId(card) && getRowId(card) === getRowId(ownCard)) return true;
      return false;
    }
    const currentUserId = safeText(window.currentUserProfile?.userId || window.currentUser?.userId || window.currentUser?.lineId);
    const cardUserId = safeText(card['LINE ID'] || card.lineId || card.userId || card.profileUserId);
    return !!currentUserId && !!cardUserId && currentUserId === cardUserId;
  }

  function buildBusinessIntentCardContext(card) {
    return {
      name: safeText(card?.['姓名'] || card?.name),
      company: safeText(card?.['公司名稱'] || card?.companyName || card?.company_name),
      title: safeText(card?.['職稱'] || card?.title),
      department: safeText(card?.['部門'] || card?.department),
      industry: safeText(card?.['產業'] || card?.['產業類別'] || card?.industry),
      services: safeText(card?.['服務項目'] || card?.services),
      tags: safeText(card?.['標籤'] || card?.tags),
      personality: safeText(card?.['個性'] || card?.personality),
      hobbies: safeText(card?.['興趣'] || card?.hobbies),
      wealth: safeText(card?.['財富'] || card?.wealth),
      health: safeText(card?.['健康'] || card?.health),
      career: safeText(card?.['事業'] || card?.career)
    };
  }

  function buildIntentQuery(intent) {
    const parts = [];
    if (safeText(intent?.offer)) parts.push('我可以提供：' + safeText(intent.offer));
    if (safeText(intent?.seek)) parts.push('我正在尋找：' + safeText(intent.seek));
    if (safeText(intent?.collaboration)) parts.push('我希望合作：' + safeText(intent.collaboration));
    return parts.join('；');
  }

  function ensureBusinessIntentAiStyles() {
    if (document.getElementById('business-intent-ai-writer-styles')) return;
    const style = document.createElement('style');
    style.id = 'business-intent-ai-writer-styles';
    style.textContent = `
      @keyframes businessIntentAiFloat {
        0%, 100% { transform: translateY(0) rotate(-1.5deg); }
        50% { transform: translateY(-8px) rotate(1.5deg); }
      }
      @keyframes businessIntentAiBubble {
        0%, 100% { transform: translateX(-50%) scale(1); }
        50% { transform: translateX(-50%) scale(1.045); }
      }
      #business-intent-ai-write { touch-action: manipulation; }
      #business-intent-ai-write .business-intent-ai-character {
        animation: businessIntentAiFloat 2.8s ease-in-out infinite;
        filter: drop-shadow(0 10px 10px rgba(37, 99, 235, 0.2));
        transform-origin: 50% 100%;
      }
      #business-intent-ai-write .business-intent-ai-label {
        animation: businessIntentAiBubble 2.2s ease-in-out infinite;
      }
      #business-intent-ai-write:active .business-intent-ai-character {
        animation: none;
        transform: translateY(2px) scale(0.92) rotate(-2deg);
      }
      #business-intent-ai-write:disabled .business-intent-ai-character { opacity: 0.62; }
      @media (prefers-reduced-motion: reduce) {
        #business-intent-ai-write .business-intent-ai-character,
        #business-intent-ai-write .business-intent-ai-label { animation: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureUi() {
    ensureBusinessIntentAiStyles();
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
      panel.className = 'hidden px-4 py-5 pb-36 bg-white space-y-4';
      panel.innerHTML = `
        <div class="relative min-h-[156px] overflow-visible rounded-2xl border border-blue-100 bg-blue-50/60 p-4 pr-[122px]">
          <div class="flex items-center gap-2 font-black text-slate-800"><span class="material-symbols-outlined text-blue-600">hub</span>建立您的 AI 業務需求</div>
          <p class="mt-2 text-[12px] font-bold leading-relaxed text-slate-500">這三項資料會提供給 AI 搜尋與智能配對使用，讓系統知道您能提供什麼、正在找誰、希望怎麼合作。</p>
          <p class="mt-3 text-[11px] font-bold leading-relaxed text-blue-600/80">依本人名片與五大標籤產生首次草稿，不會覆蓋已填內容或自動儲存。</p>
          <button id="business-intent-ai-write" type="button" aria-label="點我幫你寫業務需求" onclick="window.aiWriteBusinessIntent()" class="absolute -right-1 bottom-0 z-10 w-[120px] border-0 bg-transparent p-0 text-center outline-none disabled:cursor-wait">
            <span id="business-intent-ai-write-label" class="business-intent-ai-label absolute left-1/2 top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border border-blue-200 bg-white px-3 py-1.5 text-[12px] font-black text-blue-700 shadow-md">點我幫你寫</span>
            <img src="assets/ai-business-writer.png?v=1" alt="" class="business-intent-ai-character mx-auto mt-6 block h-[106px] w-[106px] object-contain" draggable="false">
          </button>
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
        <div id="business-intent-actions" class="fixed bottom-[84px] left-1/2 z-[70] grid w-[calc(100%-2rem)] max-w-[416px] -translate-x-1/2 grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur-xl">
          <button id="business-intent-save" type="button" onclick="window.saveBusinessIntent()" class="rounded-2xl bg-slate-900 py-3.5 text-[13px] font-black text-white active:scale-95 transition-transform disabled:opacity-60">儲存業務需求</button>
          <button type="button" onclick="window.startBusinessIntentRecommendation()" class="rounded-2xl bg-blue-600 py-3.5 text-[13px] font-black text-white active:scale-95 transition-transform">AI 智能推薦</button>
        </div>`;
      ecardContent.parentNode.insertBefore(panel, ecardContent);
    }
    return true;
  }

  window.renderBusinessIntent = function(card = getCurrentCard()) {
    card = resolveOwnCard(card);
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
    document.getElementById('business-intent-ai-write')?.classList.toggle('hidden', !editable);
    document.getElementById('business-intent-actions')?.classList.toggle('hidden', !editable);
    document.getElementById('business-intent-readonly-note')?.classList.toggle('hidden', editable);
  };

  window.aiWriteBusinessIntent = async function() {
    const button = document.getElementById('business-intent-ai-write');
    const label = document.getElementById('business-intent-ai-write-label');
    const originalText = label?.textContent || '點我幫你寫';
    try {
      const card = getCurrentCard();
      if (!card) throw new Error('找不到本人名片資料');
      if (!canEdit(card)) throw new Error('只有名片本人可以使用 AI 幫寫');
      if (typeof window.fetchAPI !== 'function') throw new Error('AI 服務尚未就緒');
      const fields = {
        offer: document.getElementById('business-intent-offer'),
        seek: document.getElementById('business-intent-seek'),
        collaboration: document.getElementById('business-intent-collaboration')
      };
      const existingIntent = Object.fromEntries(Object.entries(fields).map(([key, el]) => [key, safeText(el?.value)]));
      const emptyKeys = Object.keys(fields).filter(key => !existingIntent[key]);
      if (!emptyKeys.length) {
        window.showToast?.('三項已有內容；若要重寫，請先清除想讓 AI 補寫的欄位');
        return null;
      }
      if (button) button.disabled = true;
      if (label) label.textContent = 'AI 撰寫中...';
      const res = await window.fetchAPI('generateCardCopy', {
        outputType: 'business_intent',
        card: buildBusinessIntentCardContext(card),
        existingIntent
      }, true);
      if (!res || res.success === false || res.error) throw new Error(res?.error || 'AI 沒有產生草稿');
      const draft = res.data && typeof res.data === 'object' ? res.data : res;
      let filled = 0;
      emptyKeys.forEach(key => {
        const el = fields[key];
        const value = safeText(draft[key]);
        if (!el || !value) return;
        el.value = value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        filled += 1;
      });
      if (!filled) throw new Error('名片資料不足，請先補充服務項目或五大標籤');
      window.showToast?.('AI 已依名片產生草稿，請確認修改後再儲存');
      return draft;
    } catch (error) {
      window.showToast?.('AI 幫寫失敗：' + (error?.message || '請稍後再試'), true);
      return null;
    } finally {
      if (button) button.disabled = false;
      if (label) label.textContent = originalText;
    }
  };

  window.getCurrentBusinessIntent = function() {
    const card = getCurrentCard();
    const cfg = parseConfig(card);
    return cfg.businessIntent || {};
  };

  window.saveBusinessIntent = async function(options = {}) {
    const button = document.getElementById('business-intent-save');
    const originalText = button?.textContent || '儲存業務需求';
    try {
      const card = getCurrentCard();
      if (!card) throw new Error('找不到名片資料');
      if (!canEdit(card)) throw new Error('只有名片本人可以修改業務需求');
      const rowId = getRowId(card);
      if (!rowId) throw new Error('找不到名片 ID');
      if (typeof window.fetchAPI !== 'function') throw new Error('儲存服務尚未就緒');

      const intent = {
        offer: safeText(document.getElementById('business-intent-offer')?.value),
        seek: safeText(document.getElementById('business-intent-seek')?.value),
        collaboration: safeText(document.getElementById('business-intent-collaboration')?.value),
        updatedAt: new Date().toISOString()
      };
      if (!intent.offer && !intent.seek && !intent.collaboration) throw new Error('請至少填寫一項業務需求');

      if (button) {
        button.disabled = true;
        button.textContent = '儲存中...';
      }
      const cfg = parseConfig(card);
      cfg.businessIntent = intent;
      const serialized = JSON.stringify(cfg);
      const res = await window.fetchAPI('updateCard', { rowId, data: { '自訂名片設定': serialized } }, true);
      if (!res || res.success === false || res.error) throw new Error(res?.error || '儲存失敗');
      const savedCard = res.data && typeof res.data === 'object' ? res.data : res;
      const confirmedSerialized = savedCard['自訂名片設定'] || savedCard.customConfig || savedCard.custom_config || '';
      const confirmedIntent = parseConfigValue(confirmedSerialized).businessIntent;
      if (!confirmedIntent || typeof confirmedIntent !== 'object') throw new Error('伺服器未保留業務需求，請重新再試');
      syncSavedConfig(rowId, confirmedSerialized);
      if (!options.silent) window.showToast?.('業務需求已儲存，AI 配對會使用這些資料');
      return intent;
    } catch (error) {
      if (!options.silent) window.showToast?.('業務需求儲存失敗：' + (error?.message || '請稍後再試'), true);
      return null;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
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
