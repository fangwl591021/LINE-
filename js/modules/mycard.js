// js/modules/mycard.js
// 整合數位名片管理：支援多版型、自訂按鈕、圖片裁切、分享與 QR Code 功能

const Config = window.Config || {
    LIFF_ID: window.LIFF_ID || (typeof LIFF_ID !== 'undefined' ? LIFF_ID : ''),
    WORKER_URL: window.WORKER_URL || (typeof WORKER_URL !== 'undefined' ? WORKER_URL : ''),
    API_URL: (window.WORKER_URL || (typeof WORKER_URL !== 'undefined' ? WORKER_URL : '')).replace(/\/$/, '')
};
const Core = window.Core || {
    showLoading: function(show) {
        const loader = document.getElementById('global-loader');
        if (!loader) return;
        loader.classList.toggle('hidden', !show);
        loader.classList.toggle('flex', !!show);
    },
    showToast: function(msg, type) { window.showToast && window.showToast(msg, type === true || type === 'error'); },
    ajax: window.fetchAPI
};
const Auth = window.Auth || {
    getUserId: function() { return window.currentUserProfile?.userId || window.currentUser?.userId || ''; },
    getUserProfile: function() { return window.currentUserProfile || null; }
};

const MyCardModule = (function() {
    // === 模組變數 ===
    let currentCardData = null; // 原始名片資料 (來自資料庫)
    let myEcardButtons = [];    // 自訂按鈕列表
    let myEcardImgs = { landscape: '', portrait: '', square: '' }; // 不同版型的圖片
    let myEcardRatios = { landscape: '20:13', portrait: '2:3', square: '1:1' }; // 比例設定

    // === DOM 快取 ===
    const $container = $('#mycard-container');
    const $emptyState = $('#my-ecard-empty-state');
    const $editState = $('#my-ecard-edit-state');
    const $previewArea = $('#my-ecard-preview-area');
    const $buttonsList = $('#my-v1-buttons-list');
    const $imgUrlInput = $('#my-v1-img-url');

    function init() {
        console.log('[MyCardModule] Initializing...');
        initListeners();
    }

    function initListeners() {
        // 1. 版型切換
        $(document).on('change', 'input[name="my-ecard-layout"]', function() {
            handleLayoutChange();
        });

        // 2. 新增按鈕
        $(document).on('click', '#btn-add-v1-button', function() {
            addV1Button();
        });

        // 3. 儲存設定
        $(document).on('click', '#btn-save-my-ecard', function() {
            saveMyECardConfig();
        });

        // 4. 分享名片
        $(document).on('click', '#btn-share-my-card', function() {
            shareMyCard($(this));
        });

        // 5. 顯示 QR Code
        $(document).on('click', '#btn-show-qrcode', function() {
            showMyQRCode();
        });

        // 6. 處理圖片上傳按鈕 (觸發隱藏的 input)
        $(document).on('click', '#edit-card-image-btn', function() {
            $('#edit-card-image-input').click();
        });

        $(document).on('change', '#edit-card-image-input', function() {
            if (typeof window.openMyCardCropper === 'function') {
                window.openMyCardCropper(this);
                return;
            }
            window.showToast('圖片裁切模組尚未載入', true);
        });

        // 7. 監聽裁切完成事件 (整合至當前版型圖片)
        $(document).on('cropper-completed', function(event, croppedImageData) {
            console.log('[MyCard] Cropper completed.');
            const layoutStyle = $('input[name="my-ecard-layout"]:checked').val() || 'landscape';
            
            // 更新圖片資料
            myEcardImgs[layoutStyle] = croppedImageData;
            
            // 更新 UI
            if ($imgUrlInput.length) $imgUrlInput.val(croppedImageData);
            updatePreview();
        });
    }

    // === 核心邏輯 ===

    function load() {
        console.log('[MyCardModule] Loading data...');
        Core.showLoading(true);

        // 這裡暫時假設 currentUserCard 已在全域或透過 Core 取得
        const card = window.currentUserCard;

        if (!card) {
            $emptyState.removeClass('hidden');
            $editState.addClass('hidden');
            Core.showLoading(false);
            return;
        }

        currentCardData = card;
        $emptyState.addClass('hidden');
        $editState.removeClass('hidden');

        // 解析自訂設定
        let cfg = {};
        try { cfg = JSON.parse(card['自訂名片設定'] || '{}'); } catch(e) { cfg = {}; }

        // 初始化圖片與比例
        myEcardImgs = {
            landscape: cfg.imgUrl || card['名片圖檔'] || '',
            portrait: cfg.imgUrlPortrait || '',
            square: cfg.imgUrlSquare || ''
        };
        
        myEcardRatios = {
            landscape: cfg.imgRatioLandscape || '20:13',
            portrait: cfg.imgRatioPortrait || '2:3',
            square: cfg.imgRatioSquare || '1:1'
        };

        // 設定版型 Radio
        const layoutVal = cfg.layoutStyle || 'landscape';
        $(`input[name="my-ecard-layout"][value="${layoutVal}"]`).prop('checked', true);

        // 設定圖片 Input
        if ($imgUrlInput.length) $imgUrlInput.val(myEcardImgs[layoutVal]);

        // 初始化按鈕
        myEcardButtons = Array.isArray(cfg.buttons) ? cfg.buttons : [];
        
        renderButtons();
        updatePreview();
        Core.showLoading(false);
    }

    function handleLayoutChange() {
        const layoutStyle = $('input[name="my-ecard-layout"]:checked').val() || 'landscape';
        if ($imgUrlInput.length) {
            $imgUrlInput.val(myEcardImgs[layoutStyle] || '');
        }
        updatePreview();
    }

    function renderButtons() {
        if (!$buttonsList.length) return;

        if (myEcardButtons.length === 0) {
            $buttonsList.html('<p class="text-[12px] text-slate-400 pb-2">尚未設定任何按鈕</p>');
            return;
        }

        const html = myEcardButtons.map((b, i) => `
            <div class="flex gap-2 items-center bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-2">
                <input type="color" value="${b.c || '#06C755'}" 
                    class="w-10 h-10 p-0 cursor-pointer rounded-lg shrink-0 border border-slate-200" 
                    onchange="MyCardModule.updateButton(${i}, 'c', this.value)">
                <div class="flex-1 flex flex-col gap-1.5">
                    <input type="text" value="${escapeHTML(b.l || '')}" placeholder="按鈕顯示文字" 
                        class="w-full text-[13px] font-bold bg-white border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1.5 shadow-sm" 
                        oninput="MyCardModule.updateButton(${i}, 'l', this.value)">
                    <input type="text" value="${escapeHTML(b.u || '')}" placeholder="https://..." 
                        class="w-full text-[12px] font-mono bg-white border-none outline-none focus:ring-1 focus:ring-blue-500 rounded px-2.5 py-1.5 shadow-sm" 
                        oninput="MyCardModule.updateButton(${i}, 'u', this.value)">
                </div>
                <button onclick="MyCardModule.removeButton(${i})" class="text-red-400 bg-red-50 hover:bg-red-100 p-2.5 rounded-lg shrink-0 transition-colors">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
            </div>
        `).join('');
        $buttonsList.html(html);
    }

    function addV1Button() {
        myEcardButtons.push({ l: '新按鈕', u: '', c: '#06C755' });
        renderButtons();
        updatePreview();
    }

    function updatePreview() {
        if (!$previewArea.length) return;

        const layoutStyle = $('input[name="my-ecard-layout"]:checked').val() || 'landscape';
        const name = currentCardData?.['姓名'] || Auth.getUserProfile()?.displayName || '姓名';
        const imgUrl = myEcardImgs[layoutStyle] || 'https://images.unsplash.com/photo-1616628188550-808682f3926d?w=800&q=80';
        
        let desc = currentCardData ? (currentCardData['服務項目'] || currentCardData['職稱'] || currentCardData['公司名稱'] || '') : '';
        desc = desc.replace(/\n/g, '<br>');
        
        let cfg = {};
        try { cfg = JSON.parse(currentCardData?.['自訂名片設定'] || '{}'); } catch(e){}
        const color = cfg.descColor || '#666666';
        const align = cfg.descAlign || 'center';

        // 計算比例
        let ratio = '20/13';
        if (layoutStyle === 'portrait') ratio = myEcardRatios.portrait.replace(':', '/') || '2/3';
        else if (layoutStyle === 'square') ratio = '1/1';

        const btnsHtml = myEcardButtons.map(b => 
            `<div class="block py-3 rounded-xl text-white text-center text-[14px] font-black mb-2.5 shadow-sm" style="background:${b.c || '#06C755'}">${escapeHTML(b.l || '按鈕')}</div>`
        ).join('');

        $previewArea.html(`
            <div class="flex flex-col w-full bg-white pb-6 rounded-b-[24px] shadow-lg overflow-hidden">
                <div class="w-full bg-slate-100 bg-cover bg-center" style="aspect-ratio: ${ratio}; background-image:url('${imgUrl}');"></div>
                <div class="p-6 text-center">
                    <div class="font-black text-[22px] text-slate-800 mb-2">${escapeHTML(name)}</div>
                    <div class="text-[14px] leading-relaxed" style="color: ${color}; text-align: ${align};">${desc}</div>
                </div>
                ${btnsHtml ? `<div class="px-6">${btnsHtml}</div>` : ''}
            </div>
        `);
    }

    async function saveMyECardConfig() {
        if (!currentCardData) return;
        const $btn = $('#btn-save-my-ecard');
        const originalHtml = $btn.html();
        
        $btn.html('<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...').prop('disabled', true);

        const layoutVal = $('input[name="my-ecard-layout"]:checked').val() || 'landscape';
        let cfg = {};
        try { cfg = JSON.parse(currentCardData['自訂名片設定'] || '{}'); } catch(e){}
        
        cfg.layoutStyle = layoutVal;
        cfg.imgUrl = myEcardImgs.landscape;
        cfg.imgUrlPortrait = myEcardImgs.portrait;
        cfg.imgUrlSquare = myEcardImgs.square;
        
        cfg.imgRatioLandscape = '20:13';
        cfg.imgRatioPortrait = myEcardRatios.portrait.replace('/', ':');
        cfg.imgRatioSquare = '1:1';
        cfg.buttons = myEcardButtons;

        const payloadData = {
            '名片圖檔': cfg.imgUrl,
            '自訂名片設定': JSON.stringify(cfg)
        };

        try {
            const res = await window.fetchAPI('updateCard', { 
                rowId: currentCardData.rowId, 
                data: payloadData 
            }, true);

            if (res && !res.error) {
                window.showToast('✅ 專屬名片設定已儲存');
                // 更新本地暫存
                currentCardData['自訂名片設定'] = payloadData['自訂名片設定'];
                currentCardData['名片圖檔'] = payloadData['名片圖檔'];
                window.currentUserCard = currentCardData; // 同步回全域供其他模組使用
            } else {
                throw new Error(res?.error || '儲存失敗');
            }
        } catch(e) {
            window.showToast('⚠️ 儲存失敗: ' + e.message, true);
        } finally {
            $btn.html(originalHtml).prop('disabled', false);
        }
    }

    async function shareMyCard($btn) {
        if (!currentCardData) {
            window.showToast('尚未建立專屬名片', true);
            return;
        }
        const oriHtml = $btn.html();
        $btn.html('<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span>').prop('disabled', true);
        
        try {
            let config = JSON.parse(currentCardData['自訂名片設定'] || '{}');
            const flexMsg = await window.fetchAPI('buildFlexMessage', {
                card: currentCardData,
                config: config,
                referrerId: Auth.getUserId(),
                networkId: window.currentNetworkId,
                liffId: Config.LIFF_ID
            }, true);
            if (flexMsg && !flexMsg.error) {
                await window.triggerFlexSharing(flexMsg, currentCardData['姓名'] || '數位名片');
            } else {
                throw new Error(flexMsg?.error || '建立分享訊息失敗');
            }
        } catch(e) {
            window.showToast('發送失敗: ' + e.message, true);
        } finally {
            $btn.html(oriHtml).prop('disabled', false);
        }
    }

    function showMyQRCode() {
        if (!currentCardData) return;
        const $modal = $('#qr-modal');
        const $img = $('#qr-code-img');
        const $loading = $('#qr-loading');

        $modal.removeClass('hidden');
        $img.addClass('hidden');
        $loading.removeClass('hidden');

        const badgeUrl = `https://liff.line.me/${Config.LIFF_ID}?shareCardId=${currentCardData.rowId}&ref=${Auth.getUserId()}`;
        const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(badgeUrl)}&size=300&margin=2`;

        $img.on('load', () => {
            $loading.addClass('hidden');
            $img.removeClass('hidden');
        }).attr('src', qrUrl);
    }

    // 輔助函式
    function escapeHTML(str) {
        return String(str || '').replace(/[&<>\"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
        })[m]);
    }

    return {
        init,
        load,
        shareMyCard,
        showMyQRCode,
        // 公開給 HTML onclick 使用
        updateButton: (i, field, val) => {
            myEcardButtons[i][field] = val;
            updatePreview();
        },
        removeButton: (i) => {
            myEcardButtons.splice(i, 1);
            renderButtons();
            updatePreview();
        }
    };
})();

window.initMyECard = function() {
    MyCardModule.init();
    MyCardModule.load();
};
window.showMyQRCode = function() {
    return MyCardModule.showMyQRCode();
};
window.shareMyCard = function(btn) {
    const $btn = btn && btn.jquery ? btn : $(btn || '#btn-share-my-card');
    return MyCardModule.shareMyCard($btn);
};

// 為了讓 HTML 中的 onclick 能存取，將模組掛載到 window (或您可以使用事件委派)
window.MyCardModule = MyCardModule;
