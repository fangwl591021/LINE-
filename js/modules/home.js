// js/modules/home.js
// 首頁資訊流模組：處理活動列表、商店設定、YouTube 嵌入與報名邏輯

const HomeModule = (function() {
    // === 1. 商店設定與快取邏輯 ===

    window.normalizeStoreSettings = function(raw) {
        if (!raw || raw.success === false) return null;
        if (raw.data && typeof raw.data === 'object') return raw.data;
        return raw;
    };

    window.getStoreSettingsCacheKey = function(networkId) {
        return 'ACTMASTER_STORE_SETTINGS_' + String(networkId || window.currentNetworkId || 'admin');
    };

    window.readCachedStoreSettings = function(networkId) {
        try {
            const raw = localStorage.getItem(window.getStoreSettingsCacheKey(networkId));
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    };

    window.writeCachedStoreSettings = function(settings, networkId) {
        const d = window.normalizeStoreSettings(settings);
        if (!d) return;
        d.networkId = networkId || d.networkId || window.currentNetworkId || 'admin';
        try {
            localStorage.setItem(window.getStoreSettingsCacheKey(d.networkId), JSON.stringify(d));
        } catch (e) {}
    };

    window.clearCachedStoreSettings = function(networkId) {
        try {
            localStorage.removeItem(window.getStoreSettingsCacheKey(networkId));
            localStorage.removeItem(window.getStoreSettingsCacheKey('admin'));
        } catch (e) {}
    };

    window.purgeLegacyStoreSettingsCache = function() {
        try {
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (!key || !key.startsWith('ACTMASTER_STORE_SETTINGS_')) continue;
                const raw = localStorage.getItem(key) || '';
                if (raw.includes('4-27')) localStorage.removeItem(key);
            }
        } catch (e) {}
    };

    window.isStoreToggleOn = function(value, fallback = true) {
        if (value === undefined || value === null || value === '') return fallback;
        return String(value).toLowerCase() !== 'false';
    };

    window.getYoutubeEmbedUrl = function(url) {
        const raw = String(url || '').trim();
        if (!raw) return '';
        let videoId = '';
        if (raw.includes('v=')) {
            videoId = raw.split('v=')[1].split('&')[0];
        } else if (raw.includes('youtu.be/')) {
            videoId = raw.split('youtu.be/')[1].split('?')[0];
        } else if (raw.includes('/embed/')) {
            videoId = raw.split('/embed/')[1].split('?')[0];
        }
        return videoId ? `https://www.youtube.com/embed/${videoId}` : '';
    };

    window.applyStoreSettingsToHome = function(settings) {
        const d = window.normalizeStoreSettings(settings);
        if (!d) return;
        const currentNetwork = String(window.currentNetworkId || 'admin');
        const settingsNetwork = String(d.networkId || currentNetwork);
        if (settingsNetwork !== currentNetwork) return;

        const headerName = document.getElementById('header-site-name');
        if (headerName && d.siteName !== undefined) {
            headerName.innerText = d.siteName || 'LINE商機引擎';
        }

        const bannerImg = document.getElementById('home-main-banner');
        if (bannerImg && bannerImg.parentElement) {
            if (!window.isStoreToggleOn(d.showBanner, true)) {
                bannerImg.parentElement.classList.add('hidden');
            } else {
                bannerImg.parentElement.classList.remove('hidden');
                const nextBannerUrl = d.bannerUrl || 'assets/entry-banner.png';
                if (bannerImg.getAttribute('src') !== nextBannerUrl) bannerImg.src = nextBannerUrl;
            }
        }

        const ytContainer = document.getElementById('home-youtube-container');
        const ytIframe = document.getElementById('home-youtube-iframe');
        if (ytContainer && ytIframe) {
            const embedUrl = window.getYoutubeEmbedUrl(d.youtubeUrl);
            if (window.isStoreToggleOn(d.showYoutube, true) && embedUrl) {
                ytContainer.classList.remove('hidden');
                if (ytIframe.src !== embedUrl) ytIframe.src = embedUrl;
            } else {
                ytContainer.classList.add('hidden');
                ytIframe.src = '';
            }
        }
    };

    window.refreshStoreSettingsInBackground = async function() {
        try {
            const settingsRes = await window.fetchAPI('getStoreSettings', { networkId: window.currentNetworkId }, true);
            const d = window.normalizeStoreSettings(settingsRes);
            if (d) {
                window.writeCachedStoreSettings(d, window.currentNetworkId);
                window.applyStoreSettingsToHome(d);
            }
        } catch (e) {
            console.error('系統設定同步失敗', e);
        }
    };

    window.syncStoreSettingsToHome = function() {
        if (typeof window.purgeLegacyStoreSettingsCache === 'function') window.purgeLegacyStoreSettingsCache();
        const networkId = window.currentNetworkId || 'admin';
        const cachedSettings = window.readCachedStoreSettings(networkId);
        if (cachedSettings) window.applyStoreSettingsToHome(cachedSettings);
        window.refreshStoreSettingsInBackground();
    };

    // === 2. 活動渲染邏輯 ===

    function getPublicActivityId_(activity) {
        return String(activity.activityId || activity.activity_id || activity.rowId || activity.id || activity['活動ID'] || '').trim();
    }

    function getPublicActivityStatus_(activity) {
        return String(activity.status || activity['狀態'] || '上架').trim();
    }

    function getPublicActivityNetwork_(activity) {
        const explicitNetwork = String(
            activity.networkId ||
            activity.network_id ||
            activity.net ||
            activity['歸屬網'] ||
            ''
        ).trim();
        if (explicitNetwork) return explicitNetwork;
        const creatorId = String(activity.creatorId || activity.creator_id || activity.userId || '').trim();
        return creatorId && creatorId !== 'admin' ? creatorId : 'admin';
    }

    function getCurrentEffectiveNetwork_() {
        const role = String(window.userRole || window.currentUser?.role || '').toLowerCase();
        const userId = String(window.currentUserProfile?.userId || window.currentUser?.userId || window.currentUser?.lineId || '').trim();
        const networkId = String(window.currentNetworkId || window.currentUser?.networkId || 'admin').trim();
        const referrerId = String(window.currentUser?.referrerId || window.currentUser?.referrer_id || '').trim();
        if (role === 'admin') return 'admin';
        if (role === 'store' || role === 'tenant') return userId || networkId || 'admin';
        if (networkId && networkId !== 'admin') return networkId;
        if (referrerId) return referrerId;
        return networkId || 'admin';
    }

    function canSeePublicActivity_(activity) {
        const role = String(window.userRole || '').toLowerCase();
        if (role === 'admin') return true;
        const currentNetwork = getCurrentEffectiveNetwork_();
        const activityNetwork = getPublicActivityNetwork_(activity);
        if (!activityNetwork || activityNetwork === 'admin') return true;
        return activityNetwork === currentNetwork;
    }

    window.homeActivityFilter = '全部';

    window.setHomeActivityFilter = function(type) {
        window.homeActivityFilter = type || '全部';
        window.renderHomeActivities();
    };

    function renderHomeActivityFilters_(types) {
        const list = document.getElementById('user-activities-list');
        if (!list || !list.parentElement) return;

        let filterBar = document.getElementById('home-activity-filters');
        if (!filterBar) {
            filterBar = document.createElement('div');
            filterBar.id = 'home-activity-filters';
            list.parentElement.insertBefore(filterBar, list);
        }

        const categories = ['全部'].concat(types.filter(Boolean));
        if (categories.indexOf(window.homeActivityFilter) === -1) window.homeActivityFilter = '全部';

        filterBar.className = 'flex gap-2 overflow-x-auto hide-scrollbar pb-2 mb-3';
        filterBar.innerHTML = categories.map(type => {
            const active = type === window.homeActivityFilter;
            const safeType = window.escapeHTML(type);
            const jsType = window.escapeJS(type);
            return `<button type="button" onclick="window.setHomeActivityFilter('${jsType}')" class="shrink-0 px-4 py-2 rounded-full text-[13px] font-black transition-all active:scale-95 ${active ? 'bg-[#ff5a1f] text-white shadow-sm' : 'bg-white text-slate-500 border border-slate-100'}">${safeType}</button>`;
        }).join('');
    }

    window.renderHomeActivities = function() {
        const list = document.getElementById('user-activities-list');
        if (!list) return;

        const activities = (Array.isArray(window.allActivities) ? window.allActivities : []).filter(canSeePublicActivity_);
        const allActiveActs = activities
            .filter(a => getPublicActivityStatus_(a) === '上架')
            .slice()
            .reverse();
        
        const types = Array.from(new Set(allActiveActs.map(a => String(a.activityType || a.type || a['活動類型'] || '活動').trim()).filter(Boolean)));
        renderHomeActivityFilters_(types);

        const activeActs = window.homeActivityFilter === '全部'
            ? allActiveActs
            : allActiveActs.filter(a => String(a.activityType || a.type || a['活動類型'] || '活動').trim() === window.homeActivityFilter);

        list.className = 'grid grid-cols-2 gap-3';

        if (activeActs.length === 0) {
            list.className = 'space-y-4';
            list.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">目前暫無開放中的活動</p>';
            return;
        }

        list.innerHTML = activeActs.map(a => {
            const actId = window.escapeJS(getPublicActivityId_(a));
            const rawTitle = a.activityName || a.name || a.title || a['活動名稱'] || '未命名活動';
            const shareTitle = window.escapeJS(rawTitle);
            const title = window.escapeHTML(rawTitle);
            const type = window.escapeHTML(a.activityType || a.type || a['活動類型'] || '活動');
            const time = window.escapeHTML(window.formatDisplayTime(a.startTime || a.start_time || a['開始時間']));
            const desc = window.escapeHTML(a.description || a['活動說明'] || '');
            const img = window.escapeHTML(a.imageUrl || a.image_url || a['宣傳圖'] || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&q=80');

            return `
                <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col min-h-[250px]">
                    <div class="w-full aspect-[4/3] bg-slate-100 overflow-hidden relative">
                        <img src="${img}" class="w-full h-full object-cover" loading="lazy">
                        <span class="absolute top-2 left-2 bg-[#ff5a1f] text-white text-[11px] px-2.5 py-1 rounded-lg font-black shadow-sm">${type}</span>
                    </div>
                    <div class="p-3 flex flex-col flex-1">
                        <div class="flex justify-end mb-2">
                            <span class="text-slate-400 text-[10px] font-mono shrink-0">${time}</span>
                        </div>
                        <h4 class="font-black text-slate-800 text-[14px] leading-snug line-clamp-2 mb-1">${title}</h4>
                        <p class="text-slate-500 text-[12px] line-clamp-2 leading-relaxed mb-3">${desc}</p>
                        <div class="grid grid-cols-3 gap-2 mt-auto">
                            <button type="button" onclick="event.stopPropagation(); window.openActivityDetail('${actId}')" class="py-2 bg-slate-100 text-slate-600 rounded-xl text-[12px] font-bold active:scale-95 transition-transform">詳細</button>
                            <button type="button" onclick="event.stopPropagation(); window.openActivityShareModal('${actId}', '${shareTitle}')" class="py-2 bg-blue-50 text-blue-600 rounded-xl text-[12px] font-bold active:scale-95 transition-transform flex items-center justify-center gap-1">
                                <span class="material-symbols-outlined text-[15px]">ios_share</span> 分享
                            </button>
                            <button type="button" onclick="event.stopPropagation(); window.joinPublicActivity('${actId}', this)" class="py-2 bg-[#06C755] text-white rounded-xl text-[12px] font-bold active:scale-95 transition-transform">報名</button>
                        </div>
                    </div>
                </div>`;
        }).join('');
    };

    function normalizeActivityList_(res) {
        if (Array.isArray(res)) return res;
        if (res && Array.isArray(res.data)) return res.data;
        if (res && Array.isArray(res.activities)) return res.activities;
        if (res && Array.isArray(res.items)) return res.items;
        if (res && Array.isArray(res.registrations)) return res.registrations;
        return [];
    }

    async function fetchActivitiesByFallback_(actions, payload) {
        for (const action of actions) {
            const res = await window.fetchAPI(action, payload || {}, true);
            const list = normalizeActivityList_(res);
            if (list.length) return list;
        }
        return [];
    }

    function isTruthy_(value) {
        return value === true || String(value || '').toUpperCase() === 'TRUE' || String(value || '') === '1';
    }

    function getRegistrationId_(record) {
        return record.rowId || record.registrationId || record.id || record['報名ID'] || '';
    }

    function getRegistrationActivityId_(record) {
        return record.activityId || record['活動ID'] || record.actId || '';
    }

    function getRegistrationStatus_(record) {
        const rawCheckin = record['簽到'] ?? record.checkinStatus ?? record.checkedIn;
        const rawStatus = record.status || record['報名狀態'] || '';
        const checked = isTruthy_(rawCheckin) || String(rawStatus).includes('簽到') || String(rawStatus).toLowerCase() === 'checkedin';
        const cancelled = String(rawStatus).includes('取消') || String(rawStatus).toLowerCase() === 'cancelled';
        if (cancelled) return { label: '已取消', checked, cancelled, className: 'bg-slate-100 text-slate-500 border border-slate-200' };
        if (checked) return { label: '已核銷', checked, cancelled, className: 'bg-slate-800 text-white' };
        return { label: '待核銷', checked, cancelled, className: 'bg-blue-50 text-blue-700 border border-blue-100' };
    }

    function buildActivityVerifyUrl_(record) {
        const rowId = getRegistrationId_(record);
        const activityId = getRegistrationActivityId_(record);
        const liffId = window.DEFAULT_LIFF_ID || window.LIFF_ID || '';
        const baseUrl = liffId
            ? 'https://liff.line.me/' + encodeURIComponent(liffId)
            : window.location.origin + window.location.pathname;
        const params = new URLSearchParams();
        params.set('verifyCheckin', rowId);
        if (activityId) params.set('activityId', activityId);
        return baseUrl + '?' + params.toString();
    }

    function getInitialActivityId_() {
        try {
            const params = typeof readActmasterInitialParams === 'function'
                ? readActmasterInitialParams()
                : new URLSearchParams(window.location.search || '');
            return String(params.get('activityId') || params.get('act') || params.get('event') || '').trim();
        } catch (e) {
            return '';
        }
    }

    window.openActivityFromUrlParam = function(force = false) {
        const activityId = getInitialActivityId_();
        if (!activityId) return false;
        if (window.__openedActivityParam === activityId && !force) return true;
        const found = (window.allActivities || []).some(a => getPublicActivityId_(a) === String(activityId) && canSeePublicActivity_(a));
        if (!found) return false;
        window.__openedActivityParam = activityId;
        setTimeout(() => window.openActivityDetail(activityId), 120);
        return true;
    };

    window.loadUserActivities = async function() {
        if (typeof window.syncStoreSettingsToHome === 'function') {
            window.syncStoreSettingsToHome();
        }

        try {
            window.allActivities = await fetchActivitiesByFallback_(
                ['getPublicActivities', 'getAllActivities', 'getActivities'],
                { networkId: getCurrentEffectiveNetwork_(), role: window.userRole || 'user' }
            );
            window.renderHomeActivities();
            window.openActivityFromUrlParam();
            return window.allActivities;
        } catch (e) {
            console.error('活動載入失敗', e);
            window.allActivities = [];
            window.renderHomeActivities();
            return [];
        }
    };

    window.loadMyActivities = async function() {
        const list = document.getElementById('my-activities-list');
        if (!list) return [];
        list.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm font-bold">活動紀錄載入中...</div>';

        const payload = {
            userId: window.currentUserProfile?.userId || '',
            phone: window.currentUser?.phone || '',
            name: window.currentUser?.name || window.currentUserProfile?.displayName || ''
        };

        try {
            const records = await fetchActivitiesByFallback_(
                ['getMyActivities', 'getUserActivities', 'getMyRegistrations', 'getUserRegistrations'],
                payload
            );

            if (!records.length) {
                list.innerHTML = '<div class="text-center py-10 text-slate-400 text-sm font-bold">目前沒有活動紀錄</div>';
                return [];
            }

            window.myActivitiesData = records.slice();
            list.innerHTML = records.slice().reverse().map((r, idx) => {
                const title = window.escapeHTML(r['活動名稱'] || r.activityName || r.title || '未命名活動');
                const time = window.escapeHTML(window.formatDisplayTime(r['開始時間'] || r.startTime || r.createdAt || r['報名時間'] || ''));
                const status = getRegistrationStatus_(r);
                const fee = window.escapeHTML(r['繳費狀態'] || r.paymentStatus || '');
                const recordIndex = records.length - 1 - idx;
                return `
                    <div class="p-4 flex items-center justify-between gap-3 active:bg-slate-50 transition-colors cursor-pointer" onclick="window.openMyActivityRecordDetail(${recordIndex})">
                        <div class="min-w-0">
                            <div class="font-black text-slate-800 text-[16px] truncate">${title}</div>
                            <div class="text-[13px] text-slate-500 mt-1">${time}</div>
                            <div class="text-[12px] text-blue-600 font-bold mt-1">點開出示核銷 QR</div>
                        </div>
                        <div class="text-right shrink-0 flex flex-col items-end gap-2">
                            <div class="inline-flex px-3 py-1.5 rounded-full text-[13px] font-black ${status.className}">${status.label}</div>
                            ${fee ? `<div class="text-[11px] text-slate-400 mt-1">${fee}</div>` : ''}
                            ${(!status.checked && !status.cancelled) ? `<button type="button" onclick="event.stopPropagation(); window.cancelMyActivityRegistration(${recordIndex}, this)" class="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 border border-red-100 text-[12px] font-black active:scale-95 transition-transform">取消報名</button>` : ''}
                        </div>
                    </div>`;
            }).join('');
            return records;
        } catch (e) {
            console.error('活動紀錄載入失敗', e);
            list.innerHTML = '<div class="text-center py-10 text-red-400 text-sm font-bold">活動紀錄暫時無法讀取，請稍後再試</div>';
            return [];
        }
    };

    function getMyActivityField_(record, keys, fallback = '') {
        for (const key of keys) {
            const value = record && record[key];
            if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
        }
        return fallback;
    }

    window.openMyActivityRecordDetail = function(index) {
        const record = (window.myActivitiesData || [])[index];
        if (!record) return window.showToast('找不到這筆報名資料，請重新整理', true);

        const content = document.getElementById('my-act-detail-content');
        if (!content) return;

        const status = getRegistrationStatus_(record);
        const title = getMyActivityField_(record, ['活動名稱', 'activityName', 'title'], '活動報名');
        const startTime = getMyActivityField_(record, ['開始時間', 'startTime', 'createdAt', '報名時間']);
        const registerTime = getMyActivityField_(record, ['報名時間', 'createdAt', 'created_at', 'updatedAt']);
        const payment = getMyActivityField_(record, ['繳費狀態', '付款狀態', 'paymentStatus'], '免費');
        const name = getMyActivityField_(record, ['姓名', 'name', 'displayName'], window.currentUser?.name || window.currentUserProfile?.displayName || '');
        const phone = getMyActivityField_(record, ['電話', '手機', 'phone', 'mobile'], window.currentUser?.phone || '');
        const identity = getMyActivityField_(record, ['身份', '身分', 'identity'], '');
        const activityId = getMyActivityField_(record, ['活動ID', 'activityId', 'actId']);
        const rowId = getRegistrationId_(record);
        const detailRows = [
            ['報名人', name],
            ['手機', phone],
            ['身份', identity],
            ['活動時間', typeof window.formatDisplayTime === 'function' ? window.formatDisplayTime(startTime) : startTime],
            ['報名時間', typeof window.formatDisplayTime === 'function' ? window.formatDisplayTime(registerTime) : registerTime],
            ['繳費狀態', payment],
            ['核銷編號', rowId],
            ['活動 ID', activityId]
        ].filter(row => row[1]);

        content.innerHTML = `
            <div class="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                <div class="p-5 border-b border-slate-100">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <h3 class="text-[20px] font-black text-slate-800 leading-snug">${window.escapeHTML(title)}</h3>
                            <p class="text-[13px] text-slate-500 mt-1">報名詳細內容</p>
                        </div>
                        <span class="shrink-0 inline-flex px-3 py-1.5 rounded-full text-[13px] font-black ${status.className}">${status.label}</span>
                    </div>
                </div>
                <div class="p-5 space-y-3">
                    ${detailRows.map(([label, value]) => `
                        <div class="rounded-2xl bg-slate-50 border border-slate-100 px-4 py-3">
                            <div class="text-[12px] font-bold text-slate-400">${window.escapeHTML(label)}</div>
                            <div class="text-[15px] font-bold text-slate-800 mt-1 break-words">${window.escapeHTML(value)}</div>
                        </div>
                    `).join('')}
                    <div class="grid grid-cols-1 gap-2 pt-1">
                        <button type="button" onclick="window.showActivityCheckinQr(${index})" class="py-3.5 rounded-2xl bg-slate-800 text-white text-[15px] font-black active:scale-95 flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">qr_code_2</span> 出示核銷 QR
                        </button>
                        ${(!status.checked && !status.cancelled) ? `<button type="button" onclick="window.cancelMyActivityRegistration(${index}, this)" class="py-3.5 rounded-2xl bg-red-50 text-red-600 border border-red-100 text-[15px] font-black active:scale-95">取消報名</button>` : ''}
                    </div>
                </div>
            </div>`;
        window.goPage('my-act-detail', true);
    };

    window.showActivityCheckinQr = function(index) {
        const record = (window.myActivitiesData || [])[index];
        if (!record) return window.showToast('找不到活動紀錄，請重新整理後再試', true);

        const rowId = getRegistrationId_(record);
        if (!rowId) return window.showToast('這筆報名缺少核銷編號，請洽工作人員', true);

        const modal = document.getElementById('qr-modal');
        const img = document.getElementById('qr-code-img');
        const loading = document.getElementById('qr-loading');
        const titleEl = document.getElementById('qr-modal-title');
        const descEl = document.getElementById('qr-modal-desc');
        const shareBtn = document.getElementById('qr-modal-share-btn');
        const title = record['活動名稱'] || record.activityName || record.title || '活動核銷';
        const verifyUrl = buildActivityVerifyUrl_(record);

        if (titleEl) titleEl.textContent = '活動核銷 QR';
        if (descEl) descEl.innerHTML = window.escapeHTML(title) + '<br>請讓店家掃描此 QR 完成核銷';
        if (shareBtn) shareBtn.classList.add('hidden');
        if (modal) modal.classList.remove('hidden');
        if (img) img.classList.add('hidden');
        if (loading) loading.classList.remove('hidden');

        if (img) {
            img.onload = function() {
                if (loading) loading.classList.add('hidden');
                img.classList.remove('hidden');
            };
            img.src = 'https://quickchart.io/qr?text=' + encodeURIComponent(verifyUrl) + '&size=300&margin=2';
        }
    };

    window.cancelMyActivityRegistration = async function(index, btn) {
        const record = (window.myActivitiesData || [])[index];
        if (!record) return window.showToast('找不到活動紀錄，請重新整理後再試', true);
        const title = record['活動名稱'] || record.activityName || record.title || '此活動';
        if (!window.confirm('確定取消報名？\n\n' + title)) return;

        const oriHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[14px]">refresh</span>';
        }

        const payload = {
            rowId: record.rowId || record.registrationId || record.id || '',
            registrationId: record.registrationId || record.rowId || record.id || '',
            activityId: record.activityId || record['活動ID'] || record.actId || '',
            userId: window.currentUserProfile?.userId || '',
            phone: window.currentUser?.phone || '',
            name: window.currentUser?.name || window.currentUserProfile?.displayName || ''
        };

        try {
            const actions = ['cancelActivityRegistration', 'cancelRegistration', 'unregisterActivity', 'removeActivityRegistration'];
            let lastError = '';
            for (const action of actions) {
                const res = await window.fetchAPI(action, payload, true);
                if (res && !res.error) {
                    window.showToast('已取消報名');
                    await window.loadMyActivities();
                    if (typeof window.loadUserActivities === 'function') window.loadUserActivities();
                    return;
                }
                lastError = res?.error || lastError;
            }
            throw new Error(lastError || '後端尚未提供取消報名操作');
        } catch (e) {
            window.showToast(e.message || '取消報名失敗', true);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = oriHtml;
            }
        }
    };

    window.loadHomeData = async function() {
        const tasks = [window.loadUserActivities()];
        if (typeof window.loadCardData === 'function') tasks.push(window.loadCardData({ render: false }));
        await Promise.all(tasks);
        return true;
    };

    window.loadAllData = async function() {
        await window.loadHomeData();
        if (typeof window.initMyECard === 'function') window.initMyECard();
        return true;
    };

    // === 3. 活動互動邏輯 ===

    window.openActivityDetail = function(activityId) {
        const activity = (window.allActivities || []).find(a => getPublicActivityId_(a) === String(activityId) && canSeePublicActivity_(a));
        if (!activity) return window.showToast('找不到活動資料', true);

        const content = document.getElementById('my-act-detail-content');
        if (!content) return;

        const rawTitle = activity.activityName || activity.name || activity.title || activity['活動名稱'] || '未命名活動';
        const title = window.escapeHTML(rawTitle);
        const type = window.escapeHTML(activity.activityType || activity.type || activity['活動類型'] || '活動');
        const startTime = window.escapeHTML(window.formatDisplayTime(activity.startTime || activity.start_time || activity['開始時間']));
        const price = parseInt(activity.price || activity['金額']) || 0;
        const fee = price > 0 ? 'NT$ ' + price.toLocaleString() : '免費';
        const img = window.escapeHTML(activity.imageUrl || activity.image_url || activity['宣傳圖'] || '');
        const desc = window.escapeHTML(activity.description || activity['活動說明'] || '尚無說明');

        content.innerHTML = `
            <div class="bg-white rounded-3xl overflow-hidden">
                ${img ? `<img src="${img}" class="w-full aspect-video object-cover">` : ''}
                <div class="p-5 space-y-4">
                    <div class="flex items-center justify-between">
                        <span class="bg-orange-50 text-orange-600 text-[12px] px-2.5 py-1 rounded-full font-bold">${type}</span>
                        <span class="bg-slate-100 text-slate-600 text-[12px] px-2.5 py-1 rounded-full font-bold">${fee}</span>
                    </div>
                    <h3 class="text-[22px] font-black text-slate-800">${title}</h3>
                    <div class="text-[13px] text-slate-500 flex items-center gap-1.5">
                        <span class="material-symbols-outlined text-[17px]">schedule</span> ${startTime}
                    </div>
                    <p class="text-[14px] text-slate-600 whitespace-pre-wrap">${desc}</p>
                    <div class="grid grid-cols-2 gap-2">
                        <button onclick="window.joinPublicActivity('${window.escapeJS(activityId)}', this)" class="py-4 bg-[#06C755] text-white rounded-2xl font-black text-[16px]">我要報名</button>
                        <button onclick="window.openActivityShareModal('${window.escapeJS(activityId)}', '${window.escapeJS(rawTitle)}')" class="py-4 bg-blue-600 text-white rounded-2xl font-black text-[16px] flex justify-center items-center gap-1">
                            <span class="material-symbols-outlined text-[18px]">ios_share</span> 分享
                        </button>
                    </div>
                </div>
            </div>`;
        window.goPage('my-act-detail', true);
    };

    async function ensurePointOAFriendForActivity_() {
        try {
            const params = typeof window.readActmasterInitialParams === 'function'
                ? window.readActmasterInitialParams()
                : new URLSearchParams(window.location.search || '');
            if (params.get('point_friend') === '1') return true;

            if (typeof liff !== 'undefined' && liff.isLoggedIn() && typeof liff.getFriendship === 'function') {
                const friendship = await liff.getFriendship().catch(() => null);
                if (friendship && friendship.friendFlag) return true;
                if (typeof liff.requestFriendship === 'function') {
                    await liff.requestFriendship().catch(() => null);
                    const latest = await liff.getFriendship().catch(() => null);
                    if (latest && latest.friendFlag) return true;
                }
            }

            const oaUrl = window.POINT_OA_URL || 'https://lin.ee/sDW7u4T';
            if (typeof liff !== 'undefined' && typeof liff.openWindow === 'function') {
                liff.openWindow({ url: oaUrl, external: true });
            }
            window.showToast('已開啟點數通官方帳號，加入後可回來查看活動紀錄');
        } catch (e) {
            console.warn('[activity] point friendship check skipped:', e);
        }
        return false;
    }

    async function goActivityRecordAfterJoin_(activityId) {
        await ensurePointOAFriendForActivity_();
        if (typeof window.loadMyActivities === 'function') await window.loadMyActivities();
        window.goPage('my-activities');
    }

    window.joinPublicActivity = async function(activityId, btn) {
        const activity = (window.allActivities || []).find(a => getPublicActivityId_(a) === String(activityId) && canSeePublicActivity_(a));
        if (!activity) return window.showToast('活動已下架', true);

        const oriHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[15px]">refresh</span>';

        try {
            const res = await window.fetchAPI('joinActivity', {
                activityId: getPublicActivityId_(activity),
                activityName: activity.activityName || activity.name || activity.title || activity['活動名稱'] || '',
                userName: window.currentUser?.name || window.currentUserProfile?.displayName || '',
                userPhone: window.currentUser?.phone || '',
                defaultIdentity: activity['預設身份'] || '會員'
            }, true);

            if (res && !res.error) {
                window.showToast(res.existed ? '您已報名過此活動，正在前往活動紀錄' : '報名成功，正在前往活動紀錄');
                await goActivityRecordAfterJoin_(getPublicActivityId_(activity));
            } else {
                throw new Error(res?.error || '報名失敗');
            }
        } catch (e) {
            window.showToast(e.message, true);
        } finally {
            btn.disabled = false;
            btn.innerHTML = oriHtml;
        }
    };

    // === 模組初始化入口 ===
    function init() {
        window.syncStoreSettingsToHome();
        window.renderHomeActivities();
    }

    return { init };
})();

window.HomeModule = HomeModule;
