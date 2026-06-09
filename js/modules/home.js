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

    const HOME_PROFILE_DEFAULT_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/4/41/LINE_logo.svg';

    function parseUserSocials_() {
        try {
            const raw = window.currentUser?.socials || '';
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter(Boolean);
            if (parsed && typeof parsed === 'object') return Object.keys(parsed).map(k => ({ t: k, u: parsed[k] }));
        } catch (e) {}
        return [];
    }

    function getHomeAvatarUrl_() {
        const userId = window.currentUserProfile?.userId || window.currentUser?.userId || '';
        const custom = parseUserSocials_().find(s => String(s.t || '').toUpperCase() === 'PROFILE_AVATAR');
        if (custom && custom.u) return custom.u;
        try {
            const cached = localStorage.getItem('ACTMASTER_HOME_AVATAR_' + userId);
            if (cached) return cached;
        } catch (e) {}
        return window.currentUserProfile?.pictureUrl || HOME_PROFILE_DEFAULT_AVATAR;
    }

    function normalizeHomeUserId_(value) {
        return String(value || '').trim();
    }

    window.isHomeProfileOwner = function() {
        const viewerIds = [
            window.currentUserProfile?.userId,
            window.currentUserProfile?.lineId,
            window.currentUserProfile?.sub
        ].map(normalizeHomeUserId_).filter(Boolean);
        const profileIds = [
            window.currentUser?.userId,
            window.currentUser?.lineId,
            window.currentUser?.line_id,
            window.currentUser?.rowId,
            window.currentUser?.row_id,
            window.currentUser?.pointLineId,
            window.currentUser?.point_line_id,
            window.currentUser?.legacyLineId,
            window.currentUser?.legacy_line_id
        ].map(normalizeHomeUserId_).filter(Boolean);
        if (!viewerIds.length || !profileIds.length) return false;
        return profileIds.some(id => viewerIds.includes(id));
    };

    window.updateHomeProfileOwnerControls = function() {
        const isOwner = window.isHomeProfileOwner();
        const avatarBtn = document.getElementById('home-profile-avatar-button');
        const avatarBadge = document.getElementById('home-profile-avatar-edit-badge');
        if (avatarBadge) {
            avatarBadge.classList.toggle('hidden', !isOwner);
            avatarBadge.classList.toggle('flex', isOwner);
        }
        if (avatarBtn) {
            avatarBtn.classList.toggle('active:scale-95', isOwner);
            avatarBtn.classList.toggle('cursor-default', !isOwner);
        }
    };

    window.handleHomeAvatarClick = function() {
        if (!window.isHomeProfileOwner()) return;
        document.getElementById('home-profile-avatar-file')?.click();
    };

    function parseHomeBirthday_() {
        const raw = String(
            window.currentUser?.birthday ||
            window.currentUser?.birthdate ||
            window.currentUser?.birthDate ||
            window.currentUser?.Birthday ||
            window.currentUser?.['\u751f\u65e5'] ||
            window.currentUser?.['\u51fa\u751f\u5e74\u6708\u65e5'] ||
            document.getElementById('profile-birthday')?.value ||
            ''
        ).trim();
        if (!raw) return null;
        const match = raw.match(/(?:(\d{4})\D+)?(\d{1,2})\D+(\d{1,2})/);
        if (!match) return null;
        const year = Number(match[1]) || null;
        const month = Number(match[2]);
        const day = Number(match[3]);
        if (!month || !day) return null;
        return { year, month, day, raw };
    }

    function getHomeZodiac_(birthday) {
        if (!birthday) return null;
        const md = birthday.month * 100 + birthday.day;
        const ranges = [
            { max: 119, name: '\u6469\u7faf\u5ea7', symbol: '\u2651' },
            { max: 218, name: '\u6c34\u74f6\u5ea7', symbol: '\u2652' },
            { max: 320, name: '\u96d9\u9b5a\u5ea7', symbol: '\u2653' },
            { max: 419, name: '\u7261\u7f8a\u5ea7', symbol: '\u2648' },
            { max: 520, name: '\u91d1\u725b\u5ea7', symbol: '\u2649' },
            { max: 621, name: '\u96d9\u5b50\u5ea7', symbol: '\u264a' },
            { max: 722, name: '\u5de8\u87f9\u5ea7', symbol: '\u264b' },
            { max: 822, name: '\u7345\u5b50\u5ea7', symbol: '\u264c' },
            { max: 922, name: '\u8655\u5973\u5ea7', symbol: '\u264d' },
            { max: 1023, name: '\u5929\u79e4\u5ea7', symbol: '\u264e' },
            { max: 1122, name: '\u5929\u880d\u5ea7', symbol: '\u264f' },
            { max: 1221, name: '\u5c04\u624b\u5ea7', symbol: '\u2650' },
            { max: 1231, name: '\u6469\u7faf\u5ea7', symbol: '\u2651' }
        ];
        return ranges.find(item => md <= item.max) || ranges[0];
    }

    function refreshHomeZodiacButton_() {
        const btn = document.getElementById('home-zodiac-weekly-btn');
        if (!btn) return;
        const zodiac = getHomeZodiac_(parseHomeBirthday_());
        if (!zodiac) {
            btn.classList.add('hidden');
            btn.classList.remove('flex');
            return;
        }
        const iconEl = document.getElementById('home-zodiac-weekly-icon');
        const labelEl = document.getElementById('home-zodiac-weekly-label');
        if (iconEl) iconEl.textContent = zodiac.symbol;
        if (labelEl) labelEl.textContent = '\u4eca\u65e5';
        btn.title = zodiac.name + ' \u4eca\u65e5\u904b\u52e2';
        btn.classList.remove('hidden');
        btn.classList.add('flex');
    }

    function getWeekRangeLabel_() {
        const now = new Date();
        const day = now.getDay() || 7;
        const monday = new Date(now);
        monday.setDate(now.getDate() - day + 1);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const fmt = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
        return `${fmt(monday)} - ${fmt(sunday)}`;
    }

    function getTodayLabel_() {
        const now = new Date();
        return `${now.getMonth() + 1}/${now.getDate()} \u4eca\u65e5`;
    }

    function getHomeChineseZodiac_(birthday) {
        if (!birthday || !birthday.year) return null;
        const animals = [
            ['\u7334', '\u6a5f\u667a\u8f49\u63db'],
            ['\u96de', '\u7d30\u7bc0\u638c\u63e1'],
            ['\u72d7', '\u4fe1\u4efb\u7dad\u8b77'],
            ['\u8c6c', '\u8cc7\u6e90\u6574\u5408'],
            ['\u9f20', '\u6a5f\u6703\u55c5\u89ba'],
            ['\u725b', '\u7a69\u5b9a\u63a8\u9032'],
            ['\u864e', '\u4e3b\u52d5\u958b\u5c40'],
            ['\u5154', '\u95dc\u4fc2\u67d4\u5316'],
            ['\u9f8d', '\u683c\u5c40\u653e\u5927'],
            ['\u86c7', '\u6df1\u5ea6\u5224\u65b7'],
            ['\u99ac', '\u884c\u52d5\u7bc0\u594f'],
            ['\u7f8a', '\u5354\u8abf\u5171\u5275']
        ];
        const item = animals[((Number(birthday.year) % 12) + 12) % 12];
        return { name: item[0], trait: item[1] };
    }

    function getHomeLifeNumber_(birthday) {
        if (!birthday || !birthday.year) return null;
        let digits = `${birthday.year}${String(birthday.month).padStart(2, '0')}${String(birthday.day).padStart(2, '0')}`;
        let total = digits.split('').reduce((sum, char) => sum + Number(char || 0), 0);
        while (total > 9) {
            total = String(total).split('').reduce((sum, char) => sum + Number(char || 0), 0);
        }
        const traits = {
            1: ['\u4e3b\u5c0e\u958b\u5c40', '\u5148\u628a\u8a71\u984c\u5e36\u5230\u660e\u78ba\u76ee\u6a19'],
            2: ['\u5354\u8abf\u9023\u7d50', '\u7528\u50be\u807d\u8207\u78ba\u8a8d\u964d\u4f4e\u5c0d\u65b9\u9632\u5099'],
            3: ['\u8868\u9054\u64f4\u6563', '\u628a\u670d\u52d9\u8aaa\u6210\u5bb9\u6613\u8f49\u8ff0\u7684\u77ed\u53e5'],
            4: ['\u7d50\u69cb\u843d\u5730', '\u628a\u627f\u8afe\u8b8a\u6210\u6e05\u695a\u6642\u9593\u8207\u6b65\u9a5f'],
            5: ['\u8b8a\u901a\u63a2\u8a62', '\u591a\u554f\u4e00\u500b\u4f7f\u7528\u5834\u666f\u518d\u7d66\u5efa\u8b70'],
            6: ['\u670d\u52d9\u4fe1\u4efb', '\u5148\u8b93\u5c0d\u65b9\u611f\u5230\u88ab\u7167\u9867'],
            7: ['\u5206\u6790\u6df1\u6316', '\u5c11\u4e00\u9ede\u63a8\u92b7\uff0c\u591a\u4e00\u9ede\u5224\u65b7\u8207\u8b49\u64da'],
            8: ['\u6210\u6548\u5c0e\u5411', '\u7528\u6578\u5b57\u8207\u7d50\u679c\u8aaa\u660e\u50f9\u503c'],
            9: ['\u8996\u91ce\u6574\u5408', '\u628a\u5408\u4f5c\u653e\u5728\u66f4\u5927\u7684\u4e92\u5229\u8108\u7d61\u88e1']
        };
        const item = traits[total] || traits[4];
        return { number: total, theme: item[0], tip: item[1] };
    }

    function hashHomeFortuneSeed_(text) {
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            hash = ((hash << 5) - hash) + text.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    function buildTodayFortune_(birthday, zodiac) {
        const chinese = getHomeChineseZodiac_(birthday);
        const life = getHomeLifeNumber_(birthday);
        const now = new Date();
        const seed = hashHomeFortuneSeed_([
            now.getFullYear(),
            now.getMonth() + 1,
            now.getDate(),
            zodiac?.name || '',
            chinese?.name || '',
            life?.number || ''
        ].join('-'));
        const themes = ['\u7a69\u4e2d\u4e3b\u52d5', '\u5148\u6696\u5f8c\u63a8', '\u6574\u7406\u4eba\u8108', '\u805a\u7126\u6210\u4ea4', '\u5408\u4f5c\u88dc\u4f4d', '\u6e05\u695a\u8868\u9054'];
        const openings = [
            '\u4eca\u5929\u9069\u5408\u5148\u628a\u95dc\u4fc2\u9806\u4e00\u904d\uff0c\u518d\u9032\u884c\u660e\u78ba\u9080\u7d04\u3002',
            '\u4eca\u5929\u4e0d\u5fc5\u6025\u8457\u6210\u4ea4\uff0c\u5148\u628a\u5c0d\u65b9\u9700\u6c42\u8aaa\u6e05\u695a\u6703\u66f4\u6709\u6548\u3002',
            '\u4eca\u5929\u9069\u5408\u8655\u7406\u6c92\u6709\u56de\u8986\u7684\u7dda\u7d22\uff0c\u7528\u66f4\u5177\u9ad4\u7684\u554f\u984c\u91cd\u65b0\u958b\u5c40\u3002',
            '\u4eca\u5929\u9069\u5408\u628a\u540d\u7247\u8cc7\u6599\u8f49\u6210\u4e0b\u4e00\u6b65\uff0c\u4e0d\u8981\u53ea\u6536\u85cf\u4e0d\u8ddf\u9032\u3002'
        ];
        const theme = themes[seed % themes.length];
        const opening = openings[Math.floor(seed / 3) % openings.length];
        const zodiacText = zodiac ? `${zodiac.name}\u5e36\u4f86\u7684\u91cd\u9ede\u662f\u4eba\u969b\u7bc0\u594f` : '\u661f\u5ea7\u8cc7\u6599\u5c1a\u672a\u5b8c\u6574';
        const animalText = chinese ? `\u751f\u8096${chinese.name}\u504f\u5411\u300c${chinese.trait}\u300d` : '\u751f\u8096\u9700\u8981\u5b8c\u6574\u51fa\u751f\u5e74\u624d\u80fd\u63a8\u7b97';
        const lifeText = life ? `\u751f\u547d\u9748\u6578 ${life.number}\u7684\u4e3b\u984c\u662f\u300c${life.theme}\u300d` : '\u751f\u547d\u9748\u6578\u9700\u8981\u5b8c\u6574\u751f\u65e5\u624d\u80fd\u63a8\u7b97';
        const lifeAction = life ? life.tip : '\u5148\u5230\u8a2d\u5b9a\u88dc\u9f4a\u51fa\u751f\u5e74\u6708\u65e5';
        return {
            title: theme,
            meta: [
                zodiac ? zodiac.name : '',
                chinese ? `\u751f\u8096${chinese.name}` : '',
                life ? `\u9748\u6578${life.number}` : ''
            ].filter(Boolean).join(' \u00b7 ') || '\u8cc7\u6599\u5f85\u88dc',
            summary: `${opening}${zodiacText}\uff0c${animalText}\uff0c${lifeText}\u3002\u4eca\u5929\u7684\u95dc\u9375\u662f\u628a\u300c\u6709\u8208\u8da3\u300d\u8f49\u6210\u300c\u6709\u4e0b\u4e00\u6b65\u300d\u3002`,
            action: [
                `1. \u5f9e\u540d\u7247\u9177\u6216 CRM \u6311\u51fa ${2 + (seed % 3)} \u4f4d\u4eca\u5929\u6700\u503c\u5f97\u806f\u7e6b\u7684\u5c0d\u8c61\u3002`,
                `2. ${lifeAction}\uff0c\u8b93\u5c0d\u65b9\u4e0d\u9700\u8981\u81ea\u5df1\u731c\u4f60\u7684\u50f9\u503c\u3002`,
                '3. \u7d66\u51fa\u4e00\u500b\u5f88\u5c0f\u7684\u4e0b\u4e00\u6b65\uff1a\u56de\u8986\u4e00\u500b\u554f\u984c\u3001\u7d04 10 \u5206\u9418\uff0c\u6216\u6536\u4e00\u4efd\u7c21\u77ed\u8cc7\u6599\u3002'
            ].join('\n'),
            date: getTodayLabel_()
        };
    }

    function buildWeeklyZodiacForecast_(zodiac) {
        const bank = {
            '\u7261\u7f8a\u5ea7': ['主動開局', '本周適合把停在觀望階段的客戶往前推一步。你的優勢在於行動快、決斷清楚，但要避免一開始就太急著成交。先用簡短明確的方案降低對方思考成本，再提出一個容易答應的小行動。', '1. 從 AI名片夾挑出 3 位最近有互動但尚未約談的人。\n2. 用一句話說明你能幫他解決什麼問題，再附上自己的數位名片。\n3. 對有回應的人安排一次 15 分鐘通話或碰面，不要只停在傳訊息。'],
            '\u91d1\u725b\u5ea7': ['穩定累積', '本周重點不是衝刺，而是把信任感做厚。你適合從既有客戶、老朋友、熟識店家開始，把服務流程、案例、價格或合作方式說清楚。越具體、越有憑據，對方越容易放心。', '1. 整理 3 位高信任客戶，補齊電話、職業、需求與下一步。\n2. 傳送一段清楚的服務說明，避免只傳圖片或口號。\n3. 追蹤對方是否需要報價、預約、活動資訊或轉介紹。'],
            '\u96d9\u5b50\u5ea7': ['訊息流動', '本周適合提高溝通密度，讓更多人知道你正在做什麼。你的優勢是反應快、會連結資訊，但要避免訊息太零散。把想說的內容整理成可轉傳、可理解、可回覆的一段話會更有效。', '1. 把本周主推的服務整理成 80 字內的邀約文。\n2. 從 CRM 找 5 位可能有興趣的人，用收件匣或名片分享發送。\n3. 對回覆者立刻標記意向，安排下一步，不要讓對話散掉。'],
            '\u5de8\u87f9\u5ea7': ['關係修復', '本周適合喚醒沉睡客戶與舊人脈。你不需要一開始就推銷，先用關心與近況開場，讓對方感覺你記得他。成交或合作會從關係回溫之後自然出現。', '1. 找出 3 位超過 30 天未互動但關係不錯的客戶。\n2. 先問近況或提醒一個對方可能需要的資訊。\n3. 若對方有回覆，再補上名片、優惠券或活動邀請。'],
            '\u7345\u5b50\u5ea7': ['亮點展示', '本周適合把你的成果與專業公開呈現。不要只說自己很專業，要讓客戶看到具體案例、照片、活動或客戶回饋。越有畫面，越容易讓人願意轉傳與介紹。', '1. 選一個最有代表性的案例或活動，整理成一張可分享內容。\n2. 更新自己的名片封面與服務文字，讓第一眼更有說服力。\n3. 主動發給 3 位可能幫你轉介紹的人，請他們給回饋或推薦。'],
            '\u8655\u5973\u5ea7': ['流程校準', '本周適合做資料清理與跟進節奏調整。你只要把名片資料補齊、標籤整理好、下一步排清楚，後續成交率就會提升。避免一邊新增資料、一邊讓舊資料失去管理。', '1. 檢查 AI名片夾中缺電話、缺公司或缺標籤的資料。\n2. 將重點客戶補上狀態：待聯絡、已回覆、可邀約或暫緩。\n3. 為前 5 位客戶設定下一次跟進日期。'],
            '\u5929\u79e4\u5ea7': ['合作平衡', '本周適合談合作、互惠與資源交換。不要只單方面提供幫助，要清楚說出彼此能交換什麼價值。適合找供應商、店家、講師、社群主或活動主辦方建立合作。', '1. 從 CRM 找出 3 位可能互補的合作對象。\n2. 準備一段合作提案：你提供什麼、對方得到什麼、下一步怎麼做。\n3. 約一次短談，先談小型合作，不要一開始就談太大。'],
            '\u5929\u880d\u5ea7': ['深度突破', '本周適合處理關鍵客戶的真正需求。與其廣發訊息，不如挑少數高價值對象深入了解。你要問出對方真正卡住的地方，再提供精準方案。', '1. 選出 1 到 3 位最有成交可能的客戶。\n2. 問對方目前最困擾的問題、時間點與預算範圍。\n3. 依答案整理一份個別建議，不要發罐頭訊息。'],
            '\u5c04\u624b\u5ea7': ['拓展視野', '本周適合走出去，參加活動、跨圈交流、把服務帶到新的場域。你會在新的連結中找到機會，但要記得把新認識的人立刻建檔，不然機會很容易流失。', '1. 找一場近期活動或社群聚會參與或分享。\n2. 新認識的人當天就掃名片或建立 CRM 記錄。\n3. 24 小時內發出第一則跟進訊息，延遲太久熱度會下降。'],
            '\u6469\u7faf\u5ea7': ['目標落地', '本周適合把業績目標拆成清楚步驟。你不缺耐心，缺的是把機會排序。先處理最接近成交、最有資源、最值得追的人，會比平均用力有效。', '1. 列出 3 位最可能成交或合作的對象。\n2. 為每一位設定下一步：電話、邀約、報價、寄資料或活動邀請。\n3. 每天確認一次是否完成，不要讓名單只停在收藏。'],
            '\u6c34\u74f6\u5ea7': ['創新連結', '本周適合用新工具、新內容或新活動打開對話。你可以把數位名片、收件匣、站內公告或活動連結當作開場，讓對方感覺不是一般推銷，而是有新價值可以看。', '1. 更新一段有新鮮感的名片服務說明或活動資訊。\n2. 用站內訊息或數位名片發給 5 位適合的人。\n3. 觀察誰有互動，再把對方標記成可邀約或可合作。'],
            '\u96d9\u9b5a\u5ea7': ['感受共鳴', '本周適合用故事與體驗建立信任。你不一定要把功能講滿，而是要讓對方感受到你理解他的處境。真實案例、客戶回饋、服務前後差異會比硬銷更有效。', '1. 整理一段你幫客戶解決問題的真實故事。\n2. 發給 3 位可能有類似需求的人，先問是否有遇過這種情況。\n3. 對有共鳴的人再補上方案與預約方式。']
        };
        const item = bank[zodiac.name] || ['穩定推進', '本周適合整理資料並主動跟進，讓機會不要停在名片裡。先把客戶分成可邀約、待觀察、需補資料三類，再針對最有機會的人安排下一步。', '1. 選三位最值得跟進的客戶。\n2. 補齊資料與標籤。\n3. 設定本周內要完成的下一個動作。'];
        return {
            title: item[0],
            summary: item[1],
            action: item[2],
            week: getWeekRangeLabel_()
        };
    }

    window.closeWeeklyZodiacModal = function() {
        document.getElementById('weekly-zodiac-modal')?.classList.add('hidden');
    };

    window.openTodayFortune = function() {
        const birthday = parseHomeBirthday_();
        const zodiac = getHomeZodiac_(birthday);
        if (!zodiac) return;
        const forecast = buildTodayFortune_(birthday, zodiac);
        const modal = document.getElementById('weekly-zodiac-modal');
        if (!modal) return;
        const iconEl = document.getElementById('weekly-zodiac-icon');
        const titleEl = document.getElementById('weekly-zodiac-title');
        const weekEl = document.getElementById('weekly-zodiac-week');
        const themeLabelEl = document.getElementById('weekly-zodiac-theme-label');
        const summaryLabelEl = document.getElementById('weekly-zodiac-summary-label');
        const actionLabelEl = document.getElementById('weekly-zodiac-action-label');
        const themeEl = document.getElementById('weekly-zodiac-theme');
        const summaryEl = document.getElementById('weekly-zodiac-summary');
        const actionEl = document.getElementById('weekly-zodiac-action');
        if (iconEl) iconEl.textContent = zodiac.symbol;
        if (titleEl) titleEl.textContent = '\u4eca\u65e5\u904b\u52e2';
        if (weekEl) weekEl.textContent = `${forecast.date} \u00b7 ${forecast.meta}`;
        if (themeLabelEl) themeLabelEl.textContent = '\u4eca\u65e5\u4e3b\u984c';
        if (summaryLabelEl) summaryLabelEl.textContent = '\u7d9c\u5408\u89e3\u8b80';
        if (actionLabelEl) actionLabelEl.textContent = '\u4eca\u65e5\u5efa\u8b70';
        if (themeEl) themeEl.textContent = forecast.title;
        if (summaryEl) summaryEl.textContent = forecast.summary;
        if (actionEl) actionEl.textContent = forecast.action;
        modal.classList.remove('hidden');
    };

    window.openWeeklyZodiac = function() {
        const birthday = parseHomeBirthday_();
        const zodiac = getHomeZodiac_(birthday);
        if (!zodiac) return;
        const forecast = buildWeeklyZodiacForecast_(zodiac);
        const modal = document.getElementById('weekly-zodiac-modal');
        if (!modal) return;
        const iconEl = document.getElementById('weekly-zodiac-icon');
        const titleEl = document.getElementById('weekly-zodiac-title');
        const weekEl = document.getElementById('weekly-zodiac-week');
        const themeEl = document.getElementById('weekly-zodiac-theme');
        const summaryEl = document.getElementById('weekly-zodiac-summary');
        const actionEl = document.getElementById('weekly-zodiac-action');
        if (iconEl) iconEl.textContent = zodiac.symbol;
        if (titleEl) titleEl.textContent = `${zodiac.name}本周運勢`;
        if (weekEl) weekEl.textContent = forecast.week;
        if (themeEl) themeEl.textContent = forecast.title;
        if (summaryEl) summaryEl.textContent = forecast.summary;
        if (actionEl) actionEl.textContent = forecast.action;
        modal.classList.remove('hidden');
    };

    window.buildHomeInviteUrl = function() {
        const myUserId = window.currentUserProfile?.userId || window.currentUser?.userId || '';
        const myStoreId = window.currentUser?.storeid || '';
        const tracking = (myStoreId ? myStoreId + '_' : '') + String(myUserId || '').substring(0, 10);
        if (window.buildPointLiffUrl) {
            return window.buildPointLiffUrl({
                ref: myUserId,
                net: window.currentNetworkId || 'admin',
                via: tracking,
                point_friend: '1',
                point_from: 'lineoa-referral-keyword-v2',
                from: 'business-engine'
            });
        }
        return 'https://liff.line.me/' + encodeURIComponent(window.LIFF_ID || '') +
            '?ref=' + encodeURIComponent(myUserId) +
            '&net=' + encodeURIComponent(window.currentNetworkId || 'admin') +
            '&via=' + encodeURIComponent(tracking) +
            '&point_friend=1' +
            '&point_from=lineoa-referral-keyword-v2' +
            '&from=business-engine';
    };

    window.refreshHomeProfileCard = function() {
        const card = document.getElementById('home-profile-card');
        if (!card) return;

        const name = window.currentUser?.name || window.currentUserProfile?.displayName || '會員';
        const role = String(window.userRole || window.currentUser?.role || 'user').toLowerCase();
        const roleLabel = role === 'admin' ? '總管' : (role === 'store' || role === 'tenant' ? '店長' : '用戶');
        const roleIcon = role === 'admin' ? 'workspace_premium' : (role === 'store' || role === 'tenant' ? 'storefront' : 'person');
        const balanceText = document.getElementById('point-balance-badge')?.textContent || '';
        const balance = Number(String(balanceText).replace(/[^\d.-]/g, '')) || Number(window.pointWalletData?.balance || window.currentUser?.points || 0) || 0;

        const nameEl = document.getElementById('home-profile-name');
        const roleEl = document.getElementById('home-profile-role');
        const pointsEl = document.getElementById('home-profile-points');
        const avatarEl = document.getElementById('home-profile-avatar');
        const hiddenAvatar = document.getElementById('home-profile-avatar-url');
        const qrEl = document.getElementById('home-profile-qr');

        if (nameEl) nameEl.textContent = name;
        if (roleEl) {
            roleEl.innerHTML = '<span class="material-symbols-outlined text-[14px] icon-filled">' + roleIcon + '</span>' + roleLabel;
        }
        if (pointsEl) pointsEl.textContent = balance.toLocaleString('zh-TW');
        const avatarUrl = getHomeAvatarUrl_();
        if (avatarEl && avatarEl.getAttribute('src') !== avatarUrl) avatarEl.src = avatarUrl;
        if (hiddenAvatar) hiddenAvatar.value = avatarUrl;

        const inviteUrl = window.buildHomeInviteUrl();
        if (qrEl && inviteUrl) {
            const qrUrl = 'https://quickchart.io/qr?text=' + encodeURIComponent(inviteUrl) + '&size=220&margin=1';
            if (qrEl.getAttribute('src') !== qrUrl) qrEl.src = qrUrl;
        }
        window.updateHomeProfileOwnerControls?.();
        refreshHomeZodiacButton_();
    };

    window.shareHomeProfileCard = async function(btn) {
        const originalHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[13px]">refresh</span>';
        }
        try {
            const inviteUrl = window.buildHomeInviteUrl ? window.buildHomeInviteUrl() : '';
            if (!inviteUrl) throw new Error('找不到邀約連結');
            const displayName = window.currentUser?.name || window.currentUserProfile?.displayName || 'LINE 好友';
            const text = displayName + ' 邀請你加入點數通\n' + inviteUrl;
            if (typeof liff !== 'undefined' && liff && liff.isLoggedIn && liff.isLoggedIn() && liff.isApiAvailable && liff.isApiAvailable('shareTargetPicker')) {
                await liff.shareTargetPicker([{ type: 'text', text }]);
                window.showToast?.('邀約連結已送出');
                return;
            }
            window.location.href = 'https://line.me/R/msg/text/?' + encodeURIComponent(text);
        } catch (e) {
            if (window.showToast) window.showToast('分享邀約失敗：' + (e.message || '請稍後再試'), true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    };

    window.uploadHomeProfileAvatar = function(inputEl) {
        if (!window.isHomeProfileOwner()) {
            window.showToast?.('只有本人可以編輯頭像', true);
            if (inputEl) inputEl.value = '';
            return;
        }
        if (!inputEl || !inputEl.files || !inputEl.files[0]) return;
        if (typeof window.uploadCustomImageToR2 === 'function') {
            window.uploadCustomImageToR2(inputEl, 'home-profile-avatar-url', 1);
        }
    };

    window.setHomeProfileAvatar = async function(url) {
        if (!window.isHomeProfileOwner()) {
            window.showToast?.('只有本人可以編輯頭像', true);
            return;
        }
        const cleanUrl = String(url || '').trim();
        if (!cleanUrl) return;
        const userId = window.currentUserProfile?.userId || window.currentUser?.userId || '';
        try {
            if (userId) localStorage.setItem('ACTMASTER_HOME_AVATAR_' + userId, cleanUrl);
        } catch (e) {}

        const avatarEl = document.getElementById('home-profile-avatar');
        if (avatarEl) avatarEl.src = cleanUrl;

        const socials = parseUserSocials_().filter(s => String(s.t || '').toUpperCase() !== 'PROFILE_AVATAR');
        socials.push({ t: 'PROFILE_AVATAR', u: cleanUrl, hidden: true });
        if (window.currentUser) window.currentUser.socials = JSON.stringify(socials);

        if (userId && typeof window.fetchAPI === 'function' && window.currentUser) {
            try {
                await window.fetchAPI('updateUserProfile', {
                    userId,
                    name: window.currentUser.name || window.currentUserProfile?.displayName || '',
                    phone: window.currentUser.phone || '',
                    industry: window.currentUser.industry || '',
                    birthday: window.currentUser.birthday || '',
                    socials: JSON.stringify(socials),
                    referrerId: window.currentUser.referrerId || '',
                    networkId: window.currentUser.networkId || window.currentNetworkId || 'admin'
                }, true);
                try {
                    localStorage.setItem('ACTMASTER_USER_' + userId, JSON.stringify({ info: window.currentUser, savedAt: Date.now() }));
                } catch (e) {}
            } catch (e) {
                window.showToast?.('圖片已更新，會員資料同步稍後再試', true);
            }
        }

        window.refreshHomeProfileCard();
    };

    window.applyStoreSettingsToHome = function(settings) {
        const d = window.normalizeStoreSettings(settings);
        if (!d) return;
        const currentNetwork = String(window.currentNetworkId || 'admin');
        const settingsNetwork = String(d.networkId || currentNetwork);
        if (settingsNetwork !== currentNetwork) return;

        const headerName = document.getElementById('header-site-name');
        if (headerName && d.siteName !== undefined) {
            const siteName = String(d.siteName || '').trim();
            headerName.innerText = (!siteName || siteName === 'LINE商機引擎') ? 'AI工坊' : siteName;
        }
        const homeHeaderName = document.getElementById('home-header-site-name');
        if (homeHeaderName && d.siteName !== undefined) {
            const siteName = String(d.siteName || '').trim();
            homeHeaderName.innerText = (!siteName || siteName === 'LINE商機引擎') ? 'AI工坊' : siteName;
        }

        const bannerImg = document.getElementById('home-main-banner');
        const mediaContainer = document.getElementById('home-media-container');
        let hasHomeMedia = false;
        if (bannerImg && bannerImg.parentElement) {
            if (!window.isStoreToggleOn(d.showBanner, true)) {
                bannerImg.parentElement.classList.add('hidden');
            } else {
                bannerImg.parentElement.classList.remove('hidden');
                hasHomeMedia = true;
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
                hasHomeMedia = true;
                if (ytIframe.src !== embedUrl) ytIframe.src = embedUrl;
            } else {
                ytContainer.classList.add('hidden');
                ytIframe.src = '';
            }
        }
        if (mediaContainer) mediaContainer.classList.toggle('hidden', !hasHomeMedia);
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

    window.initHomeMatchmakeEmbed = function() {
        const slot = document.getElementById('home-matchmake-slot');
        const page = document.getElementById('page-matchmake');
        if (!slot || !page || slot.dataset.ready === '1') return;

        Array.from(page.children).forEach(child => slot.appendChild(child));
        slot.dataset.ready = '1';
        page.innerHTML =
            '<div class="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 text-center mx-1">' +
                '<div class="w-14 h-14 rounded-full bg-emerald-50 text-[#06C755] flex items-center justify-center mx-auto mb-3">' +
                    '<span class="material-symbols-outlined text-[30px] icon-filled">psychology</span>' +
                '</div>' +
                '<h2 class="text-lg font-black text-slate-800">AI 配對已移到首頁</h2>' +
                '<p class="text-[13px] text-slate-500 mt-2">回首頁即可直接使用，不必再切換頁籤。</p>' +
                '<button onclick="window.goPage(&quot;home&quot;)" class="mt-4 px-5 py-3 rounded-2xl bg-[#06C755] text-white font-black active:scale-95 transition-transform">回首頁</button>' +
            '</div>';
    };

    window.scrollToHomeAnnouncements = function() {
        const section = document.getElementById('home-announcements-section');
        if (window.currentPage !== 'home' && typeof window.goPage === 'function') {
            window.goPage('home');
            setTimeout(() => window.scrollToHomeAnnouncements(), 160);
            return;
        }
        if (section && section.scrollIntoView) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (typeof window.goPage === 'function') {
            window.goPage('home');
        }
    };

    window.scrollToHomeMatchmake = function() {
        const section = document.getElementById('home-matchmake-slot');
        if (window.currentPage !== 'home' && typeof window.goPage === 'function') {
            window.goPage('home');
            setTimeout(() => window.scrollToHomeMatchmake(), 160);
            return;
        }
        if (section && section.scrollIntoView) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    function crmNeedsFollowup_(item) {
        const status = String(item.crmStatus || '').trim();
        return !status || ['新名片', '已初次聯繫', '已發送資料', '待跟進'].includes(status);
    }

    function openSettingsSection_(sectionId) {
        if (typeof window.goPage === 'function') window.goPage('admin-settings');
        setTimeout(function() {
            const section = document.getElementById(sectionId);
            if (section) {
                section.open = true;
                section.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 180);
    }

    window.openMemberProfileSettings = function() {
        openSettingsSection_('details-profile-registration');
    };

    window.openMyCardSettings = function(evt) {
        if (typeof window.openMyCardEntry === 'function') {
            return window.openMyCardEntry(evt);
        }
        openSettingsSection_('details-my-ecard');
    };

    function isOwnStaticProfileCard_(card) {
        if (!card || !window.currentUserProfile) return false;
        const uid = String(window.currentUserProfile.userId || '').trim();
        if (!uid) return false;
        const sourceType = String(card.sourceType || card.source_type || card['名片來源'] || '').trim();
        if (sourceType === 'private_import' || sourceType === 'referral_placeholder' || sourceType === 'video_profile') return false;
        const ids = [
            card['LINE ID'],
            card.userId,
            card['User ID'],
            card.lineId,
            card.line_id,
            card.ownerUserId,
            card.owner_user_id,
            card.profileUserId,
            card.profile_user_id,
            card.creatorId,
            card.creator_id
        ];
        return ids.some(value => String(value || '').trim() === uid);
    }

    window.updateMyCardReminder = function() {
        const btn = document.getElementById('home-my-card-button');
        if (!btn) return;
        const hasOwnCard = isOwnStaticProfileCard_(window.currentUserCard)
            || (Array.isArray(window.allCards) && window.allCards.some(isOwnStaticProfileCard_));
        const shouldRemind = !hasOwnCard;
        btn.classList.toggle('needs-my-card', shouldRemind);
        btn.setAttribute('aria-label', shouldRemind ? '請先建立我的名片' : '我的名片');
    };

    window.scrollToHomeSalesAssistant = function() {
        const section = document.getElementById('home-sales-assistant-section');
        if (section && section.scrollIntoView) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    function buildOnboardingSuggestions_(contacts) {
        const rows = Array.isArray(contacts) ? contacts : [];
        const current = window.currentUser || {};
        const hasMemberProfile = !!(current.name && current.phone && current.industry);
        const hasMyCard = !!window.currentUserCard || rows.some(function(item) {
            return String(item.sourceType || '') === 'self_profile' || String(item.crmStatus || '') === '個人名片';
        });
        const scannedCards = rows.filter(function(item) {
            return String(item.sourceType || '') !== 'self_profile' && String(item.crmStatus || '') !== '個人名片';
        });
        const followups = scannedCards.filter(crmNeedsFollowup_);
        const suggestions = [];

        if (!hasMemberProfile) {
            suggestions.push({
                icon: 'person_add',
                title: '先完成會員資料',
                body: '補上姓名、電話與主要業種，後續名片、邀約與點數紀錄才會對得準。',
                action: '去補資料',
                onclick: 'window.openMemberProfileSettings()',
                tone: 'blue'
            });
        }

        if (!hasMyCard) {
            suggestions.push({
                icon: 'badge',
                title: '建立自己的數位名片',
                body: '先把自己的專屬名片建好，之後才能一鍵分享、被搜尋，也方便別人回查你的資料。',
                action: '建立名片',
                onclick: 'window.openMyCardSettings()',
                tone: 'emerald'
            });
        }

        if (scannedCards.length < 5) {
            suggestions.push({
                icon: 'document_scanner',
                title: '把手上的紙本名片建檔',
                body: '先掃 5 張最有機會成交或合作的名片，系統會自動變成 CRM 跟進名單。',
                action: '去 AI名片夾',
                onclick: "window.goPage('card')",
                tone: 'amber'
            });
        }

        if (followups.length) {
            suggestions.push({
                icon: 'follow_the_signs',
                title: '今天先跟進 ' + Math.min(followups.length, 3) + ' 位名片客戶',
                body: '從剛掃進來、尚未聯繫的人開始，先傳合作說明或安排一次簡短訪談。',
                action: '看跟進',
                onclick: 'window.scrollToHomeSalesAssistant()',
                tone: 'pink'
            });
        }

        if (hasMyCard && scannedCards.length >= 5 && !followups.length) {
            suggestions.push({
                icon: 'send',
                title: '開始主動發送名片',
                body: '你的基本資料已經準備好，可以把名片分享給新認識的人，讓關係回流到系統。',
                action: '發名片',
                onclick: 'window.shareMyCard(this)',
                tone: 'emerald'
            });
        }

        return suggestions.slice(0, 3);
    }

    function renderHomeOnboardingAI_(contacts) {
        const list = document.getElementById('home-onboarding-ai-list');
        if (!list) return;
        const suggestions = buildOnboardingSuggestions_(contacts);
        if (!suggestions.length) {
            list.innerHTML = '<div class="bg-white rounded-[26px] border border-emerald-100 shadow-sm p-4 text-[13px] text-emerald-700 font-bold leading-relaxed">目前基礎設定已完成。下一步可以固定每天整理新增名片、追蹤回覆，讓 AI名片夾變成真正的業務管線。</div>';
            return;
        }
        const toneMap = {
            blue: 'bg-blue-50 text-blue-600 border-blue-100',
            emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
            amber: 'bg-amber-50 text-amber-600 border-amber-100',
            pink: 'bg-pink-50 text-pink-600 border-pink-100'
        };
        list.innerHTML = suggestions.map(function(item, index) {
            const tone = toneMap[item.tone] || toneMap.blue;
            return `
                <button type="button" onclick="${item.onclick}" class="w-full bg-white rounded-[26px] border border-pink-100 shadow-sm p-3.5 text-left active:scale-[0.99] transition-transform">
                    <div class="flex items-center gap-3">
                        <span class="material-symbols-outlined icon-filled w-14 h-14 rounded-2xl bg-pink-50 text-pink-500 border border-pink-100 flex items-center justify-center shrink-0 text-[30px]">${item.icon}</span>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center justify-between gap-3">
                                <h4 class="font-black text-slate-900 text-[15px] leading-snug">${window.escapeHTML(item.title)}</h4>
                                <span class="text-[11px] font-black text-slate-400 whitespace-nowrap">建議 ${index + 1}</span>
                            </div>
                            <p class="mt-1 text-[13px] text-slate-500 font-bold leading-relaxed line-clamp-2">${window.escapeHTML(item.body)}</p>
                            <div class="mt-2 inline-flex items-center gap-1 text-[13px] font-black text-pink-500">
                                ${window.escapeHTML(item.action)}
                                <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
                            </div>
                        </div>
                    </div>
                </button>
            `;
        }).join('');
    }

    window.loadHomeSalesAssistant = async function() {
        const list = document.getElementById('home-sales-assistant-list');
        if (!list || typeof window.fetchAPI !== 'function') return;
        list.innerHTML = '<div class="bg-white rounded-[26px] border border-slate-100 shadow-sm p-4 text-[13px] text-slate-400 font-bold text-center">正在整理今日建議...</div>';
        try {
            const res = await window.fetchAPI('getCrmContacts', { limit: 80 }, true);
            const contacts = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
            renderHomeOnboardingAI_(contacts);
            const rows = contacts
                .filter(crmNeedsFollowup_)
                .filter(item => String(item.sourceType || '') !== 'self_profile')
                .slice(0, 3);
            if (!rows.length) {
                list.innerHTML = '<div class="bg-white rounded-[26px] border border-slate-100 shadow-sm p-4 text-[13px] text-slate-400 font-bold text-center">今天沒有待跟進名片。新增名片後，系統會在這裡提醒下一步。</div>';
                return;
            }
            list.innerHTML = rows.map(item => {
                const name = window.escapeHTML(item.name || '未命名');
                const type = window.escapeHTML(item.crmType || '待判斷');
                const action = window.escapeHTML(item.crmNextAction || '初次聯繫');
                const suggestion = window.escapeHTML(item.crmAiSuggestion || '');
                const rowId = window.escapeJS(item.rowId || item.cardRowId || '');
                return `
                    <button type="button" onclick="window.openCardDetailById ? window.openCardDetailById('${rowId}') : window.goPage('card')" class="w-full bg-white rounded-[26px] border border-pink-100 shadow-sm p-3.5 text-left active:scale-[0.99] transition-transform">
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                                <div class="flex items-center gap-2 flex-wrap">
                                    <span class="font-black text-slate-900 text-[16px]">${name}</span>
                                    <span class="px-2 py-1 rounded-full bg-pink-50 text-pink-600 text-[11px] font-black">${type}</span>
                                </div>
                                <p class="mt-1 text-[13px] font-bold text-slate-600">建議：${action}</p>
                                ${suggestion ? `<p class="mt-2 text-[12px] text-slate-400 font-bold leading-relaxed line-clamp-2">${suggestion}</p>` : ''}
                            </div>
                            <span class="material-symbols-outlined text-slate-300 shrink-0">chevron_right</span>
                        </div>
                    </button>
                `;
            }).join('');
        } catch (e) {
            renderHomeOnboardingAI_([]);
            list.innerHTML = '<div class="bg-white rounded-3xl border border-red-100 shadow-sm p-5 text-[13px] text-red-400 font-bold text-center">今日建議讀取失敗：' + window.escapeHTML(e.message || e) + '</div>';
        }
    };

    window.renderHomeAnnouncements = function(items) {
        const list = document.getElementById('home-announcements-list');
        if (!list) return;
        const rows = Array.isArray(items) ? items : [];
        if (!rows.length) {
            list.innerHTML = '<div class="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-center text-slate-400 text-sm font-bold">目前沒有公告</div>';
            return;
        }
        list.innerHTML = rows.map(item => {
            const title = window.escapeHTML(item.title || '未命名公告');
            const body = window.escapeHTML(item.body || '').replace(/\n/g, '<br>');
            const image = window.escapeHTML(item.imageUrl || '');
            const actionLabel = window.escapeHTML(item.actionLabel || '');
            const actionUrl = window.escapeHTML(item.actionUrl || '');
            const time = window.escapeHTML(window.formatDisplayTime(item.updatedAt || item.createdAt || ''));
            return `
                <article class="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                    ${image ? `<img src="${image}" class="w-full h-auto block" loading="lazy" alt="">` : ''}
                    <div class="p-5">
                        <div class="flex items-start justify-between gap-3 mb-2">
                            <h4 class="text-[17px] font-black text-slate-800 leading-snug">${title}</h4>
                            ${time ? `<span class="text-[11px] text-slate-400 font-bold whitespace-nowrap">${time}</span>` : ''}
                        </div>
                        ${body ? `<div class="text-[14px] text-slate-600 leading-relaxed">${body}</div>` : ''}
                        ${actionLabel && actionUrl ? `<button onclick="window.openAnnouncementLink('${window.escapeJS(actionUrl)}')" class="mt-4 w-full py-3 rounded-2xl bg-blue-600 text-white font-black active:scale-95 transition-transform">${actionLabel}</button>` : ''}
                    </div>
                </article>
            `;
        }).join('');
    };

    window.openAnnouncementLink = function(url) {
        const href = String(url || '').trim();
        if (!href) return;
        if (typeof liff !== 'undefined' && typeof liff.openWindow === 'function') {
            liff.openWindow({ url: href, external: true });
        } else {
            window.open(href, '_blank', 'noopener');
        }
    };

    window.loadHomeAnnouncements = async function() {
        const list = document.getElementById('home-announcements-list');
        if (list) list.innerHTML = '<div class="py-6 text-center text-slate-400 text-sm font-bold">載入公告中...</div>';
        try {
            const res = await window.fetchAPI('listAnnouncements', { limit: 10 }, true);
            const rows = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : []);
            window.renderHomeAnnouncements(rows);
            return rows;
        } catch (e) {
            if (list) list.innerHTML = '<div class="bg-white rounded-3xl border border-red-100 p-6 text-center text-red-500 text-sm font-bold">公告載入失敗，請稍後再試</div>';
            return [];
        }
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
        const linkNetwork = getInitialActivityNetwork_();
        if (role === 'admin') return 'admin';
        if (linkNetwork && linkNetwork !== 'admin') return linkNetwork;
        if (role === 'store' || role === 'tenant') return userId || networkId || 'admin';
        if (networkId && networkId !== 'admin') return networkId;
        if (referrerId) return referrerId;
        return networkId || 'admin';
    }

    function canSeePublicActivity_(activity) {
        const role = String(window.userRole || '').toLowerCase();
        if (role === 'admin') return true;
        const userId = String(window.currentUserProfile?.userId || window.currentUser?.userId || window.currentUser?.lineId || '').trim();
        const creatorId = String(activity.creatorId || activity.creator_id || activity.userId || '').trim();
        if (userId && creatorId && userId === creatorId) return true;
        const currentNetwork = getCurrentEffectiveNetwork_();
        const activityNetwork = getPublicActivityNetwork_(activity);
        if (!activityNetwork || activityNetwork === 'admin') return currentNetwork === 'admin';
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

    function getInitialActivityNetwork_() {
        try {
            const params = typeof readActmasterInitialParams === 'function'
                ? readActmasterInitialParams()
                : new URLSearchParams(window.location.search || '');
            const networkId = String(params.get('net') || params.get('networkId') || '').trim();
            const referrerId = String(params.get('ref') || params.get('referrerId') || '').trim();
            if (networkId && networkId !== 'admin') return networkId;
            if (referrerId && referrerId !== 'admin') return referrerId;
            return networkId;
        } catch (e) {
            return '';
        }
    }

    function getActivityListNetwork_() {
        const linkNetwork = getInitialActivityNetwork_();
        return linkNetwork || getCurrentEffectiveNetwork_();
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
        if (typeof window.refreshHomeProfileCard === 'function') window.refreshHomeProfileCard();
        if (typeof window.loadHomeAnnouncements === 'function') window.loadHomeAnnouncements();
        if (typeof window.loadHomeSalesAssistant === 'function') window.loadHomeSalesAssistant();

        if (typeof window.syncStoreSettingsToHome === 'function') {
            window.syncStoreSettingsToHome();
        }

        try {
            window.allActivities = await fetchActivitiesByFallback_(
                ['getPublicActivities', 'getAllActivities', 'getActivities'],
                { networkId: getActivityListNetwork_(), role: window.userRole || 'user' }
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

    function ensurePersonalAgendaPanel_() {
        const page = document.getElementById('page-my-activities');
        if (!page || document.getElementById('personal-agenda-panel')) return;
        const title = page.querySelector('h2');
        if (title) title.textContent = '跟進行事曆';
        const recordsBox = document.getElementById('my-activities-list')?.parentElement;
        if (!recordsBox) return;
        recordsBox.id = recordsBox.id || 'activity-records-panel';
        recordsBox.dataset.collapsiblePanel = 'activity-records';
        recordsBox.classList.add('hidden');

        const panel = document.createElement('div');
        panel.id = 'personal-agenda-panel';
        panel.className = 'space-y-4 mb-4';
        panel.innerHTML = `
            <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div class="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
                    <button type="button" onclick="window.toggleMyActivitySection('personal-agenda-content')" class="min-w-0 text-left active:opacity-75">
                        <h3 class="text-[18px] font-black text-slate-800 flex items-center gap-2">
                            <span class="material-symbols-outlined text-[#06C755] icon-filled">event_note</span>
                            我的跟進提醒
                        </h3>
                        <p class="text-[12px] text-slate-500 mt-1 font-medium">私人可見，可一鍵加入 Google 行事曆。</p>
                    </button>
                    <div class="shrink-0 flex items-center gap-2">
                        <button type="button" onclick="window.toggleAgendaForm()" class="px-3 py-2 rounded-xl bg-blue-600 text-white text-[13px] font-black active:scale-95">新增</button>
                        <button type="button" onclick="window.toggleMyActivitySection('personal-agenda-content')" class="w-9 h-9 rounded-full bg-slate-50 flex items-center justify-center active:scale-95">
                            <span id="personal-agenda-content-icon" class="material-symbols-outlined text-slate-400 transition-transform">expand_less</span>
                        </button>
                    </div>
                </div>
                <div id="personal-agenda-content">
                    <div id="personal-agenda-form" class="hidden p-5 border-b border-slate-100 bg-slate-50/60 space-y-3">
                        <input id="agenda-title" class="custom-input !py-3" placeholder="例：回訪王小姐、提醒收款、準備活動">
                        <div class="grid grid-cols-2 gap-3">
                            <input id="agenda-start" class="custom-input !py-3 !px-3 text-[13px]" type="datetime-local">
                            <select id="agenda-type" class="custom-input !py-3 !px-3 text-[13px]">
                                <option value="followup">客戶跟進</option>
                                <option value="visit">拜訪</option>
                                <option value="payment">收款</option>
                                <option value="event">活動提醒</option>
                                <option value="todo">待辦</option>
                            </select>
                        </div>
                        <input id="agenda-related" class="custom-input !py-3" placeholder="對象 / 客戶 / 名片名稱">
                        <textarea id="agenda-notes" class="textarea-block !h-20" placeholder="備註"></textarea>
                        <div class="grid grid-cols-2 gap-3">
                            <select id="agenda-remind" class="custom-input !py-3 !px-3 text-[13px]">
                                <option value="10">10 分鐘前提醒</option>
                                <option value="30" selected>30 分鐘前提醒</option>
                                <option value="1440">1 天前提醒</option>
                            </select>
                            <button type="button" onclick="window.savePersonalAgendaTask(this)" class="bg-[#06C755] text-white rounded-2xl font-black active:scale-95">儲存</button>
                        </div>
                    </div>
                    <div id="personal-agenda-list" class="divide-y divide-slate-100">
                        <div class="py-8 text-center text-slate-400 text-sm font-bold">載入跟進提醒中...</div>
                    </div>
                </div>
            </div>
            <div class="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <button type="button" onclick="window.toggleMyActivitySection('activity-records-panel')" class="w-full p-5 flex items-center justify-between gap-3 text-left active:bg-slate-50">
                    <h3 class="text-[18px] font-black text-slate-800 flex items-center gap-2">
                        <span class="material-symbols-outlined text-orange-500 icon-filled">confirmation_number</span>
                        活動報名紀錄
                    </h3>
                    <span id="activity-records-panel-icon" class="material-symbols-outlined text-slate-400 transition-transform">expand_more</span>
                </button>
            </div>
        `;
        recordsBox.insertAdjacentElement('beforebegin', panel);
    }

    window.toggleMyActivitySection = function(sectionId, force) {
        const section = document.getElementById(sectionId);
        if (!section) return;
        const shouldOpen = force === undefined ? section.classList.contains('hidden') : !!force;
        section.classList.toggle('hidden', !shouldOpen);
        const icon = document.getElementById(`${sectionId}-icon`);
        if (icon) {
            icon.textContent = shouldOpen ? 'expand_less' : 'expand_more';
        }
    };

    window.toggleAgendaForm = function(force) {
        const form = document.getElementById('personal-agenda-form');
        if (!form) return;
        window.toggleMyActivitySection('personal-agenda-content', true);
        const shouldOpen = force === undefined ? form.classList.contains('hidden') : !!force;
        form.classList.toggle('hidden', !shouldOpen);
        if (shouldOpen) {
            const start = document.getElementById('agenda-start');
            if (start && !start.value) {
                const d = new Date(Date.now() + 60 * 60 * 1000);
                d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
                start.value = toDatetimeLocal_(d);
            }
        }
    };

    function toDatetimeLocal_(date) {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function formatAgendaTime_(value) {
        if (!value) return '未設定時間';
        if (typeof window.formatDisplayTime === 'function') return window.formatDisplayTime(value);
        return String(value).replace('T', ' ').slice(0, 16);
    }

    function buildGoogleCalendarUrl_(task) {
        const start = task.startTime ? new Date(task.startTime) : new Date();
        const end = task.endTime ? new Date(task.endTime) : new Date(start.getTime() + 30 * 60 * 1000);
        const fmt = d => {
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
        };
        const params = new URLSearchParams({
            action: 'TEMPLATE',
            text: task.title || '跟進提醒',
            dates: `${fmt(start)}/${fmt(end)}`,
            details: [task.relatedName, task.notes].filter(Boolean).join('\n'),
            ctz: 'Asia/Taipei'
        });
        return 'https://calendar.google.com/calendar/render?' + params.toString();
    }

    window.loadPersonalAgenda = async function() {
        ensurePersonalAgendaPanel_();
        const list = document.getElementById('personal-agenda-list');
        if (!list) return [];
        list.innerHTML = '<div class="py-8 text-center text-slate-400 text-sm font-bold">載入跟進提醒中...</div>';
        try {
            const tasks = await window.fetchAPI('listPersonalTasks', {}, true);
            const rows = Array.isArray(tasks) ? tasks : [];
            window.personalAgendaTasks = rows;
            if (!rows.length) {
                list.innerHTML = '<div class="py-8 text-center text-slate-400 text-sm font-bold">尚未建立跟進提醒</div>';
                return rows;
            }
            list.innerHTML = rows.slice(0, 10).map((task, index) => {
                const done = String(task.status || '') === 'done';
                return `
                    <div class="p-4 flex items-start justify-between gap-3 ${done ? 'opacity-60' : ''}">
                        <div class="min-w-0">
                            <div class="text-[15px] font-black text-slate-800 leading-snug">${window.escapeHTML(task.title || '跟進提醒')}</div>
                            <div class="text-[13px] text-slate-500 mt-1">${window.escapeHTML(formatAgendaTime_(task.startTime))}</div>
                            ${task.relatedName ? `<div class="text-[12px] text-blue-600 font-bold mt-1">${window.escapeHTML(task.relatedName)}</div>` : ''}
                            ${task.notes ? `<div class="text-[12px] text-slate-400 mt-1 line-clamp-2">${window.escapeHTML(task.notes)}</div>` : ''}
                        </div>
                        <div class="shrink-0 flex flex-col gap-2">
                            <button type="button" onclick="window.addAgendaTaskToGoogle(${index})" class="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 text-[12px] font-black active:scale-95">加入日曆</button>
                            ${done ? '' : `<button type="button" onclick="window.completePersonalAgendaTask(${index})" class="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 text-[12px] font-black active:scale-95">完成</button>`}
                            <button type="button" onclick="window.deletePersonalAgendaTask(${index})" class="px-3 py-1.5 rounded-xl bg-red-50 text-red-600 text-[12px] font-black active:scale-95">刪除</button>
                        </div>
                    </div>
                `;
            }).join('');
            return rows;
        } catch (e) {
            list.innerHTML = '<div class="py-8 text-center text-red-400 text-sm font-bold">跟進提醒載入失敗</div>';
            return [];
        }
    };

    window.savePersonalAgendaTask = async function(btn) {
        const title = String(document.getElementById('agenda-title')?.value || '').trim();
        if (!title) return window.showToast('請輸入提醒標題', true);
        const payload = {
            title,
            startTime: String(document.getElementById('agenda-start')?.value || '').trim(),
            taskType: document.getElementById('agenda-type')?.value || 'followup',
            relatedName: document.getElementById('agenda-related')?.value || '',
            notes: document.getElementById('agenda-notes')?.value || '',
            remindMinutes: document.getElementById('agenda-remind')?.value || 30
        };
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '儲存中...';
        }
        try {
            const res = await window.fetchAPI('savePersonalTask', payload, true);
            if (res && res.error) throw new Error(res.error);
            ['agenda-title', 'agenda-related', 'agenda-notes'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            window.toggleAgendaForm(false);
            window.showToast('已建立跟進提醒，可點「加入日曆」加入 Google');
            await window.loadPersonalAgenda();
        } catch (e) {
            window.showToast(e.message || '儲存失敗', true);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = oldHtml;
            }
        }
    };

    window.addAgendaTaskToGoogle = function(index) {
        const task = (window.personalAgendaTasks || [])[index];
        if (task) window.open(buildGoogleCalendarUrl_(task), '_blank');
    };

    window.completePersonalAgendaTask = async function(index) {
        const task = (window.personalAgendaTasks || [])[index];
        if (!task) return;
        const res = await window.fetchAPI('completePersonalTask', { taskId: task.taskId }, true);
        if (res && res.error) return window.showToast(res.error, true);
        await window.loadPersonalAgenda();
    };

    window.deletePersonalAgendaTask = async function(index) {
        const task = (window.personalAgendaTasks || [])[index];
        if (!task || !window.confirm('刪除這筆跟進提醒？')) return;
        const res = await window.fetchAPI('deletePersonalTask', { taskId: task.taskId }, true);
        if (res && res.error) return window.showToast(res.error, true);
        await window.loadPersonalAgenda();
    };

    window.loadMyActivities = async function() {
        const list = document.getElementById('my-activities-list');
        if (!list) return [];
        ensurePersonalAgendaPanel_();
        window.loadPersonalAgenda();
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
                        <button type="button" onclick="window.openActivityDetailFromRecord(${index}, this)" class="py-3.5 rounded-2xl bg-blue-600 text-white text-[15px] font-black active:scale-95 flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">event_note</span> 查看活動內容
                        </button>
                        <button type="button" onclick="window.showActivityCheckinQr(${index})" class="py-3.5 rounded-2xl bg-slate-800 text-white text-[15px] font-black active:scale-95 flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">qr_code_2</span> 出示核銷 QR
                        </button>
                        ${(!status.checked && !status.cancelled) ? `<button type="button" onclick="window.cancelMyActivityRegistration(${index}, this)" class="py-3.5 rounded-2xl bg-red-50 text-red-600 border border-red-100 text-[15px] font-black active:scale-95">取消報名</button>` : ''}
                    </div>
                </div>
            </div>`;
        window.goPage('my-act-detail', true);
    };

    function buildActivityFromRegistration_(record = {}) {
        return {
            rowId: getMyActivityField_(record, ['活動ID', 'activityId', 'actId']),
            activityId: getMyActivityField_(record, ['活動ID', 'activityId', 'actId']),
            activityName: getMyActivityField_(record, ['活動名稱', 'activityName', 'title'], '活動報名'),
            name: getMyActivityField_(record, ['活動名稱', 'activityName', 'title'], '活動報名'),
            activityType: getMyActivityField_(record, ['活動類型', 'activityType', 'type'], '活動'),
            price: Number(getMyActivityField_(record, ['金額', 'amount', 'price'], '0')) || 0,
            startTime: getMyActivityField_(record, ['開始時間', 'startTime']),
            endTime: getMyActivityField_(record, ['結束時間', 'endTime']),
            description: getMyActivityField_(record, ['活動說明', 'description'], '這是報名時保存的活動資訊。'),
            imageUrl: getMyActivityField_(record, ['宣傳圖', 'imageUrl']),
            status: getMyActivityField_(record, ['狀態', 'status'], '已報名')
        };
    }

    function renderRegisteredActivityDetail_(activity, recordIndex) {
        const content = document.getElementById('my-act-detail-content');
        if (!content) return;
        const activityId = getPublicActivityId_(activity);
        const rawTitle = activity.activityName || activity.name || activity.title || activity['活動名稱'] || '活動報名';
        const type = activity.activityType || activity.type || activity['活動類型'] || '活動';
        const startTime = window.formatDisplayTime(activity.startTime || activity.start_time || activity['開始時間'] || '');
        const endTime = window.formatDisplayTime(activity.endTime || activity.end_time || activity['結束時間'] || '');
        const price = Number(activity.price || activity.amount || activity['金額'] || 0) || 0;
        const fee = price > 0 ? 'NT$ ' + price.toLocaleString() : '免費';
        const img = activity.imageUrl || activity.image_url || activity['宣傳圖'] || '';
        const desc = activity.description || activity['活動說明'] || '尚無說明';

        content.innerHTML = `
            <div class="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">
                ${img ? `<img src="${window.escapeHTML(img)}" class="w-full aspect-video object-cover">` : ''}
                <div class="p-5 space-y-4">
                    <div class="flex items-center justify-between gap-2">
                        <span class="bg-orange-50 text-orange-600 text-[12px] px-2.5 py-1 rounded-full font-bold">${window.escapeHTML(type)}</span>
                        <span class="bg-slate-100 text-slate-600 text-[12px] px-2.5 py-1 rounded-full font-bold">${window.escapeHTML(fee)}</span>
                    </div>
                    <h3 class="text-[22px] font-black text-slate-800 leading-snug">${window.escapeHTML(rawTitle)}</h3>
                    <div class="space-y-1 text-[13px] text-slate-500">
                        ${startTime ? `<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">schedule</span> ${window.escapeHTML(startTime)}</div>` : ''}
                        ${endTime ? `<div class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[17px]">event_available</span> ${window.escapeHTML(endTime)}</div>` : ''}
                        ${activityId ? `<div class="font-mono text-[12px] text-slate-400 break-all">${window.escapeHTML(activityId)}</div>` : ''}
                    </div>
                    <p class="text-[14px] text-slate-600 whitespace-pre-wrap">${window.escapeHTML(desc)}</p>
                    <div class="grid grid-cols-1 gap-2 pt-1">
                        <button type="button" onclick="window.showActivityCheckinQr(${recordIndex})" class="py-3.5 rounded-2xl bg-slate-800 text-white text-[15px] font-black active:scale-95 flex items-center justify-center gap-2">
                            <span class="material-symbols-outlined text-[18px]">qr_code_2</span> 出示核銷 QR
                        </button>
                        <button type="button" onclick="window.openMyActivityRecordDetail(${recordIndex})" class="py-3.5 rounded-2xl bg-slate-50 text-slate-700 border border-slate-100 text-[15px] font-black active:scale-95">返回報名資料</button>
                    </div>
                </div>
            </div>`;
        window.goPage('my-act-detail', true);
    }

    window.openActivityDetailFromRecord = async function(index, btn) {
        const record = (window.myActivitiesData || [])[index];
        if (!record) return window.showToast('找不到活動紀錄，請重新整理後再試', true);
        const activityId = getRegistrationActivityId_(record);
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 載入中';
        }
        try {
            let activity = (window.allActivities || []).find(a => getPublicActivityId_(a) === String(activityId));
            if (!activity && activityId) {
                const res = await window.fetchAPI('getActivityById', { activityId }, true);
                activity = (res && (res.activityId || res['活動ID'])) ? res : (res && res.data ? res.data : null);
            }
            renderRegisteredActivityDetail_(activity || buildActivityFromRegistration_(record), index);
        } catch (e) {
            console.warn('openActivityDetailFromRecord failed:', e);
            renderRegisteredActivityDetail_(buildActivityFromRegistration_(record), index);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = oldHtml;
            }
        }
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
        if (typeof window.updateMyCardReminder === 'function') window.updateMyCardReminder();
        return true;
    };

    window.loadAllData = async function() {
        await window.loadHomeData();
        if (typeof window.initMyECard === 'function') window.initMyECard();
        return true;
    };

    function handleFollowDirectLink_() {
        try {
            const params = new URLSearchParams(window.location.search || '');
            const open = String(params.get('open') || params.get('page') || '').toLowerCase();
            if (!['follow', 'followup', 'followups', 'agenda', 'my-activities'].includes(open)) return;
            let tries = 0;
            const timer = setInterval(() => {
                tries++;
                if (typeof window.goPage === 'function' && window.currentUser) {
                    clearInterval(timer);
                    window.goPage('my-activities');
                } else if (tries > 30) {
                    clearInterval(timer);
                }
            }, 500);
        } catch (e) {
            console.warn('[home] follow direct link skipped:', e);
        }
    }

    document.addEventListener('DOMContentLoaded', handleFollowDirectLink_);

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
                    <button onclick="window.copyActivityId('${window.escapeJS(activityId)}')" class="w-full py-3 bg-slate-100 text-slate-700 rounded-2xl font-black text-[14px] flex justify-center items-center gap-1">
                        <span class="material-symbols-outlined text-[18px]">tag</span> 複製課程編號
                    </button>
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
