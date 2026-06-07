// js/core.js
// 核心工具模組：整合全域狀態、API 請求、UI 通知與安全機制

const Config = window.Config || {
    LIFF_ID: window.LIFF_ID || (typeof LIFF_ID !== 'undefined' ? LIFF_ID : ''),
    WORKER_URL: window.WORKER_URL || (typeof WORKER_URL !== 'undefined' ? WORKER_URL : ''),
    API_URL: (window.WORKER_URL || (typeof WORKER_URL !== 'undefined' ? WORKER_URL : '')).replace(/\/$/, '')
};
window.Config = Config;

// === 全域狀態初始化 (掛載於 window 確保全域相容) ===
window.allCards = [];
window.currentUserCard = null;
window.allActivities = [];
window.allSystemUsers = [];
window.currentUserProfile = null;
window.currentUser = null;
window.userRole = 'user';
window.currentNetworkId = 'admin';
window.currentStoreId = '';
window.hasAdminRights = false;

const Core = (function() {
    
    // === 1. 安全工具 ===
    
    // 嚴格安全跳脫：防範 XSS
    window.escapeHTML = function(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    // 安全跳脫：保護 Inline JS
    window.escapeJS = function(str) {
        return String(str || '')
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'")
            .replace(/\"/g, "&quot;")
            .replace(/\n/g, "\\n")
            .replace(/\r/g, "")
            .replace(/</g, "\\x3c")
            .replace(/>/g, "\\x3e");
    };

    // === 2. UI 工具 ===

    // Toast 通知
    window.showToast = function(msg, isError = false) {
        const container = document.getElementById('toast-container');
        if (!container) {
            console.log(`[Toast] ${isError ? 'ERR' : 'INFO'}: ${msg}`);
            return;
        }
        const toast = document.createElement('div');
        toast.className = 'px-4 py-3 rounded-full shadow-lg text-[13px] font-bold text-white transition-all duration-300 toast-enter flex items-center gap-2 max-w-[90%] text-center mb-2';
        toast.classList.add(isError ? 'bg-red-500' : 'bg-slate-800');
        
        const icon = isError ? 'error' : 'info';
        toast.innerHTML = `<span class="material-symbols-outlined icon-filled text-[18px]">${icon}</span> ${msg}`;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    // 載入動畫
    function showLoading(show) {
        const loader = document.getElementById('global-loader');
        if (!loader) return;
        if (show) {
            loader.classList.remove('hidden');
            loader.classList.add('flex');
        } else {
            loader.classList.remove('flex');
            loader.classList.add('hidden');
        }
    }

    // 時間格式化
    window.formatDisplayTime = function(val) {
        if (!val) return '';
        try {
            let d = new Date(val);
            if (isNaN(d.getTime())) {
                return String(val).replace('T', ' ').replace('.000Z', '').substring(0, 16);
            }
            const pad = (n) => n.toString().padStart(2, '0');
            return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate())
                 + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
        } catch(e) {
            return String(val);
        }
    };

    // === 3. API 與 資料處理 ===

    // 統一 API 呼叫 (整合您提供的 fetchAPI 邏輯)
    window.isActmasterAuthTokenError = function(message) {
        const text = String(message || '').toLowerCase();
        return text.includes('invalid or expired line token') ||
            text.includes('missing or invalid line token') ||
            text.includes('missing line token for sensitive action');
    };

    window.handleActmasterAuthTokenError = function(message) {
        if (!window.isActmasterAuthTokenError || !window.isActmasterAuthTokenError(message)) return false;
        if (!window.liff || typeof window.liff.logout !== 'function') return false;
        try {
            if (sessionStorage.getItem('ACTMASTER_LIFF_REAUTH_RUNNING') === '1') return true;
            sessionStorage.setItem('ACTMASTER_LIFF_REAUTH_RUNNING', '1');
        } catch (e) {}

        const loadingText = document.getElementById('loading-text');
        if (loadingText) loadingText.textContent = 'LINE 授權更新中...';

        try {
            if (typeof window.liff.isLoggedIn !== 'function' || window.liff.isLoggedIn()) {
                window.liff.logout();
            }
        } catch (e) {}

        setTimeout(function() {
            try {
                const url = new URL(window.location.href);
                [
                    'code',
                    'state',
                    'liff.state',
                    'liffClientId',
                    'liffRedirectUri',
                    'liffIsEscapedFromApp',
                    'friendship_status_changed'
                ].forEach(key => url.searchParams.delete(key));
                window.location.replace(url.toString());
            } catch (e) {
                window.location.reload();
            }
        }, 350);
        return true;
    };

    window.fetchAPI = async function(action, payload = {}, silent = false) {
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) {
                throw new Error('目前裝置沒有網路連線，請確認 Wi-Fi 或行動網路後重試');
            }

            const safePayload = { ...payload };
            safePayload.networkId = safePayload.networkId !== undefined ? safePayload.networkId : window.currentNetworkId;
            if (action === 'updateUserRole') {
                safePayload.actorRole = safePayload.actorRole !== undefined ? safePayload.actorRole : window.userRole;
            } else {
                safePayload.role = safePayload.role !== undefined ? safePayload.role : window.userRole;
            }
            safePayload.userId = safePayload.userId !== undefined ? safePayload.userId : window.currentUserProfile?.userId;

            const aiActions = ['recognizeCardWithGPT4o', 'matchmakeContacts', 'calculateFateTags', 'reviewCardSafety', 'generateCardCopy'];
            if (aiActions.includes(action)) {
                try {
                    const localOpenAIKey = String(localStorage.getItem('line_engine_local_openai_api_key') || '').trim();
                    if (/^sk-[A-Za-z0-9_\-]+/.test(localOpenAIKey)) {
                        safePayload.clientOpenAIKey = localOpenAIKey;
                    }
                } catch (e) {
                    console.warn('Local GPT API key read failed:', e);
                }
            }

            // 嘗試取得 LIFF Token
            try {
                if (typeof liff !== 'undefined' && liff.isLoggedIn()) {
                    safePayload.lineAccessToken = liff.getAccessToken();
                }
            } catch (e) {
                console.warn("LIFF token fetch failed:", e);
            }

            const controller = new AbortController();
            const timeoutMs = action === 'checkUser' ? 10000 : 18000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(Config.WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, payload: safePayload }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                throw new Error('伺服器暫時無法連線 (' + res.status + ')，請稍後重試');
            }

            const data = await res.json();
            if (!data.success) {
                const errorMessage = data.error || 'API request failed';
                if (window.handleActmasterAuthTokenError && window.handleActmasterAuthTokenError(errorMessage)) {
                    return { success: false, error: errorMessage, authRelogin: true };
                }
                throw new Error(errorMessage);
            }
            return data.data || data;
        } catch (err) {
            let message = err && err.message ? err.message : '連線失敗';
            if (window.handleActmasterAuthTokenError && window.handleActmasterAuthTokenError(message)) {
                return { success: false, error: message, authRelogin: true };
            }
            if (err && err.name === 'AbortError') {
                message = '系統連線逾時，請重新進入或稍後再試';
            }
            if (message === 'Failed to fetch' || message.includes('NetworkError')) {
                message = '無法連線到伺服器，請確認網路狀態後重試';
            }
            if (!silent) window.showToast(message, true);
            return { success: false, error: message };
        }
    };

    // 強效配對機制：將 User 與 名片庫 資料連結
    window.syncUserCardMatch = function() {
        if (!window.currentUserProfile || !window.allCards || window.allCards.length === 0) {
            console.warn('[syncUserCardMatch] 條件不足，跳過配對');
            return false;
        }

        const uid = String(window.currentUserProfile.userId).trim();
        console.log('[syncUserCardMatch] 嘗試配對 UID:', uid);

        const sourceCards = typeof window.getVisibleCardsForCurrentUser === 'function'
            ? window.getVisibleCardsForCurrentUser(window.allCards)
            : window.allCards;

        window.currentUserCard = sourceCards.find(c => {
            if (!c) return false;
            const sourceType = String(c.sourceType || c.source_type || c['??靘?'] || '').trim();
            if (sourceType === 'private_import' || sourceType === 'referral_placeholder' || sourceType === 'video_profile') return false;
            const rowId = String(c.rowId || c.row_id || c['rowId'] || c['Row ID'] || '').trim().toUpperCase();
            if (rowId.indexOf('CARD_VIDEO_') === 0) return false;
            const ownerIds = [
                c['LINE ID'],
                c['userId'],
                c['User ID'],
                c.lineId,
                c.line_id,
                c.ownerUserId,
                c.owner_user_id,
                c.profileUserId,
                c.profile_user_id
            ].map(value => String(value || '').trim()).filter(Boolean);
            if (ownerIds.some(value => value === uid)) return true;
            const creatorId = String(c.creatorId || c.creator_id || '').trim();
            return ownerIds.length === 0 && sourceType === 'self_profile' && creatorId === uid;
        });

        console.log('[syncUserCardMatch] 配對結果:', window.currentUserCard ? '找到: ' + window.currentUserCard['姓名'] : '未找到');
        return !!window.currentUserCard;
    };

    // === 4. 權限與流程 ===

    window.applyUserPermissions = function() {
        if (typeof window.isHardAdminUser === 'function') {
            const currentId = window.currentUserProfile?.userId || window.currentUser?.userId || window.currentUser?.lineId || '';
            if (window.isHardAdminUser(currentId, window.currentUser || {})) {
                window.userRole = 'admin';
                if (window.currentUser) {
                    window.currentUser.role = 'admin';
                    window.currentUser.networkId = window.currentUser.networkId || 'admin';
                }
            }
        }
        window.hasAdminRights = (window.userRole === 'admin' || window.userRole === 'store');
        const roleLabel = document.querySelector('#header-role-label');
        if (roleLabel) {
            const roleText = window.userRole === 'admin' ? '總管' : (window.userRole === 'store' ? '店長' : '用戶');
            roleLabel.textContent = '目前：' + roleText;
        }
        
        const selectors = {
            '#header-admin-badge': window.hasAdminRights,
            '#admin-switch-container': window.hasAdminRights,
            '#top-nav-switch': window.hasAdminRights,
            '#home-top-nav-switch': window.hasAdminRights,
            '#details-dealer-performance': window.hasAdminRights,
            '#details-voom-capture': window.hasAdminRights,
            '#details-store-banner': window.hasAdminRights,
            '#details-store-management': window.userRole === 'admin'
        };

        for (const [selector, show] of Object.entries(selectors)) {
            const el = document.querySelector(selector);
            if (el) el.classList.toggle('hidden', !show);
        }
    };

    // 名片資料載入 (按需載入)
    window.loadCardData = async function(options = {}) {
        const harvestMode = options.harvest === true;
        const cache = harvestMode ? window.harvestCards : window.allCards;
        if (Array.isArray(cache) && cache.length > 0 && !options.force) {
            if (options.render !== false && typeof window.renderCardList === 'function') {
                window.renderCardList(cache);
            }
            if (typeof window.updateMyCardReminder === 'function') window.updateMyCardReminder();
            return cache;
        }

        try {
            const cards = await window.fetchAPI(harvestMode ? 'getCardHarvestContacts' : 'getCardContacts', {}, true);
            let normalizedCards = [];
            if (Array.isArray(cards)) {
                normalizedCards = cards;
            } else if (cards.data && Array.isArray(cards.data)) {
                normalizedCards = cards.data;
            }

            if (harvestMode) {
                window.harvestCards = normalizedCards;
                if (!Array.isArray(window.allCards)) window.allCards = [];
                const mergedById = new Map(window.allCards.map(card => [String(card && (card.rowId || card["rowId"] || card.id || "")), card]));
                normalizedCards.forEach(card => {
                    const rowId = String(card && (card.rowId || card["rowId"] || card.id || ""));
                    if (rowId) mergedById.set(rowId, card);
                });
                window.allCards = Array.from(mergedById.values()).filter(Boolean);
            } else {
                window.allCards = normalizedCards;
            }

            window.syncUserCardMatch();
            if (typeof window.updateMyCardReminder === 'function') window.updateMyCardReminder();

            if (options.render !== false && typeof window.renderCardList === 'function') {
                window.renderCardList(harvestMode ? window.harvestCards : window.allCards);
            }
            if (options.initPanels !== false) {
                if (typeof window.initMyECard === 'function') window.initMyECard();
            }

            return harvestMode ? window.harvestCards : window.allCards;
        } catch (err) {
            console.error('[loadCardData] Error:', err);
            return [];
        }
    };

    // === 5. LIFF 分享 ===
    window.triggerFlexSharing = async function(flexMsg, altText) {
        try {
            if (typeof liff === 'undefined' || !liff) {
                window.showToast('目前不在 LINE LIFF 環境，改用連結分享', true);
                return false;
            }
            if (typeof window.initActmasterLiff === 'function') {
                try {
                    await window.initActmasterLiff(window.LIFF_ID || window.Config?.LIFF_ID, { withLoginOnExternalBrowser: true });
                } catch (initErr) {
                    console.warn('[triggerFlexSharing] LIFF init skipped:', initErr);
                }
            }
            if (!liff.isLoggedIn()) {
                if (typeof window.ensureActmasterLiffLogin === 'function') {
                    window.ensureActmasterLiffLogin({ redirectUri: window.location.href });
                } else {
                    liff.login({ redirectUri: window.location.href });
                }
                return null;
            }
            if (typeof window.actmasterShareTargetPicker === 'function') {
                const result = await window.actmasterShareTargetPicker([{
                    type: "flex",
                    altText: altText || "您收到一則訊息",
                    contents: flexMsg
                }]);
                if (!result.ok) {
                    const reasonText = result.reason === 'share_unavailable'
                        ? '您的環境不支援分享功能'
                        : (result.reason === 'cancelled_or_not_opened' ? '尚未完成分享，請重新點選分享並選擇好友' : '請先登入 LINE LIFF');
                    window.showToast(reasonText, true);
                    return false;
                }
                window.showToast('✅ 已成功發送！');
                return true;
            }
            if (!liff.isApiAvailable('shareTargetPicker')) {
                window.showToast('您的環境不支援分享功能', true);
                return false;
            }
            const message = {
                type: "flex",
                altText: altText || "您收到一則訊息",
                contents: flexMsg
            };
            const result = await liff.shareTargetPicker([message]);
            if (!result) {
                window.showToast('尚未完成分享，請重新點選分享並選擇好友', true);
                return false;
            }
            window.showToast('✅ 已成功發送！');
            return true;
        } catch (err) {
            window.showToast('發送失敗：' + (err.message || '未知錯誤'), true);
            return false;
        }
    };

    // 模組公開介面 (供模組化程式碼使用)
    return {
        showLoading,
        showToast: window.showToast,
        ajax: window.fetchAPI,
        syncMatch: window.syncUserCardMatch
    };

})();

window.Core = Core;
