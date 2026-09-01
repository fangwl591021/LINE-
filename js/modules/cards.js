/* ==================== 名片庫模組 (Cards) - 完整覆蓋版 v6.8.1 ====================
 * 修正重點：
 * 1. saveCardEdit / deleteCard 不再把 { success:false } 誤判為成功
 * 2. 補 window.openCardDetailById，相容 AI 配對模組舊呼叫
 * 3. 電話、標籤、網址、Email 等欄位全部轉字串後處理，避免 number.replace / split 報錯
 * 4. rowId onclick 參數加上 escapeJS，避免特殊字元破壞 inline event
 * 5. 增加 DOM 存在檢查，避免部分頁面元素未載入時報錯
 * 6. 保留原 UI 與流程，不改變現有頁面結構
 */

(function () {
  "use strict";

  const CARD_EDITABLE_FIELDS = [
    "姓名", "英文名", "職稱", "部門", "公司名稱", "統一編號", "手機號碼", "公司電話",
    "分機", "傳真", "電子郵件", "公司網址", "社群帳號", "公司地址", "服務項目", "建檔人/備註"
  ];

  const CARD_DISPLAY_FIELDS = [
    { label: "公司名稱", icon: "business", key: "公司名稱" },
    { label: "職稱", icon: "badge", key: "職稱" },
    { label: "手機號碼", icon: "smartphone", key: "手機號碼", isPhone: true },
    { label: "公司電話", icon: "call", key: "公司電話", isPhone: true },
    { label: "電子郵件", icon: "mail", key: "電子郵件" },
    { label: "公司網址", icon: "language", key: "公司網址", isWeb: true },
    { label: "公司地址", icon: "location_on", key: "公司地址" },
    { label: "服務項目", icon: "design_services", key: "服務項目" },
    { label: "標籤", icon: "label", key: "標籤" }
  ];

  const CARD_PAGE_SIZE = 10;

  function $(id) {
    return document.getElementById(id);
  }

  function safeText(value) {
    if (value === null || value === undefined) return "";
    return String(value);
  }

  function getCardRowId(card) {
    return safeText(card && (card.rowId || card["rowId"] || card.row_id || card.id)).trim();
  }

  function replaceCardInCache(cacheName, card) {
    const rowId = getCardRowId(card);
    const cache = window[cacheName];
    if (!rowId || !Array.isArray(cache)) return;
    const index = cache.findIndex(item => getCardRowId(item) === rowId);
    if (index >= 0) cache[index] = card;
  }

  function escapeHTML(value) {
    if (typeof window.escapeHTML === "function") return window.escapeHTML(value);
    return safeText(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeJS(value) {
    if (typeof window.escapeJS === "function") return window.escapeJS(value);
    return safeText(value)
      .replace(/\\/g, "\\\\")
      .replace(/'/g, "\\'")
      .replace(/"/g, "&quot;")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "")
      .replace(/</g, "\\x3c")
      .replace(/>/g, "\\x3e");
  }

  function normalizePhone(value) {
    let s = safeText(value).replace(/\u200B/g, "").replace(/'/g, "").replace(/[\s-]/g, "");
    if (s.startsWith("+886")) s = "0" + s.substring(4);
    else if (s.startsWith("886") && s.length === 12) s = "0" + s.substring(3);
    return s.replace(/[^0-9+]/g, "");
  }

  function normalizeUrl(value) {
    let url = safeText(value).trim();
    if (!url || url === "http://" || url === "https://") return "";
    if (!url.match(/^(http|https|tel|mailto|line):/i)) url = "https://" + url;
    return url;
  }

  function parseCardConfig(card) {
    let cfg = {};
    try {
      cfg = JSON.parse(card && card["自訂名片設定"] ? card["自訂名片設定"] : "{}");
      if (!cfg || typeof cfg !== "object") cfg = {};
    } catch (e) {
      cfg = {};
    }
    return cfg;
  }

  function isApiSuccess(res) {
    return !!res && res.success !== false && !res.error;
  }

  function assertApiSuccess(res, fallbackMessage) {
    if (!isApiSuccess(res)) {
      throw new Error((res && res.error) ? res.error : fallbackMessage);
    }
    return res;
  }

  function showToast(message, isError = false) {
    if (typeof window.showToast === "function") {
      window.showToast(message, isError);
    } else {
      alert(message);
    }
  }

  function getCurrentUserId() {
    return safeText(
      (window.currentUserProfile && window.currentUserProfile.userId) ||
      (window.currentUser && (window.currentUser.userId || window.currentUser.lineId || window.currentUser.LINE_user_id)) ||
      window.currentUserId ||
      ""
    ).trim();
  }

  function isCurrentAdmin() {
    const role = safeText(
      window.userRole ||
      (window.currentUser && window.currentUser.role) ||
      (window.currentUserProfile && window.currentUserProfile.role)
    ).toLowerCase();
    if (role === "admin" || role === "總管") return true;

    if (typeof window.isHardAdminUser === "function") {
      const userId = getCurrentUserId() ||
        safeText(window.currentUser && (window.currentUser.userId || window.currentUser.lineId));
      return window.isHardAdminUser(userId, window.currentUser || window.currentUserProfile || {});
    }

    return false;
  }

  function getCreatorId(card) {
    return safeText(card && (card["建檔者ID"] || card.creatorId || card["creatorId"])).trim();
  }

  function getOwnerId(card) {
    return safeText(card && (card["擁有人ID"] || card.ownerUserId || card["ownerUserId"])).trim();
  }

  function getScannerId(card) {
    return safeText(card && (card.scannerUserId || card.scannerId || card.scanner_user_id || card["scannerUserId"])).trim();
  }

  function getCardLineId(card) {
    return safeText(card && (card["LINE ID"] || card.lineId || card["User ID"] || card.userId)).trim();
  }

  function getCardSourceType(card) {
    return safeText(card && (card.sourceType || card["名片來源"] || card["sourceType"])).trim().toLowerCase();
  }

  function isVisibleCard(card) {
    if (!card) return false;
    const role = safeText(window.userRole || "user");
    const cardLineId = getCardLineId(card);
    const creatorId = getCreatorId(card);
    const cardNetwork = safeText(card["歸屬網"]).trim();
    const userId = getCurrentUserId();
    const currentNetworkId = safeText(window.currentNetworkId || "admin").trim();

    if (role === "admin") return true;
    if (cardLineId === userId) return true;
    if (creatorId === userId) return true;
    if (role === "store") return !!cardNetwork && cardNetwork === currentNetworkId;
    return false;
  }

  function getVisibleCards(cards) {
    return (Array.isArray(cards) ? cards : []).filter(isVisibleCard);
  }

  function isHarvestCard(card) {
    if (!card) return false;
    const sourceType = getCardSourceType(card);
    if (sourceType === "self_profile" || sourceType === "referral_placeholder") return false;
    const userId = getCurrentUserId();
    if (!userId) return false;
    const scannerId = getScannerId(card);
    if (scannerId) return scannerId === userId;
    return getCreatorId(card) === userId || getOwnerId(card) === userId;
  }

  function getHarvestCards(cards) {
    return (Array.isArray(cards) ? cards : []).filter(isHarvestCard);
  }

  function canEditCard(card) {
    if (!card) return false;

    const cardLineId = getCardLineId(card);
    const creatorId = getCreatorId(card);
    const userId = getCurrentUserId();

    if (isCurrentAdmin() && !cardLineId) return true;

    // Once the invitee claims a card, the scanner keeps read access only.
    if (cardLineId) return cardLineId === userId;
    if (creatorId) return creatorId === userId;
    return false;
  }

  window.canEditCardRecord = canEditCard;
  window.getVisibleCardsForCurrentUser = getVisibleCards;
  function getCardTitle(card) {
    return safeText(card["姓名"] || card["英文名"] || "未知");
  }

  function getCardImageUrl(card) {
    const cfg = parseCardConfig(card);
    return safeText(cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlSquare || cfg.imgUrlPortrait || card["名片圖檔"] || "").trim();
  }

  function getCardSubtitle(card) {
    const parts = [
      card && (card["公司名稱"] || card.companyName),
      card && (card["職稱"] || card.title),
      card && (card["服務項目"] || card.services)
    ].map(v => safeText(v).replace(/\s+/g, " ").trim()).filter(Boolean);
    return parts.join(" / ") || "尚未補充說明";
  }


  const CARD_INDUSTRY_RULES = [
    ["健康醫療", /醫療|診所|醫院|藥局|健康|保健|復健|牙醫|護理|中醫|營養/i],
    ["美容美業", /美容|美髮|美甲|美睫|彩妝|造型|SPA|芳療|美體/i],
    ["餐飲食品", /餐飲|食品|餐廳|咖啡|飲料|烘焙|便當|料理|食材/i],
    ["零售電商", /零售|電商|購物|批發|百貨|選物|網拍|商城/i],
    ["直銷／社群電商", /直銷|社群電商|團購|微商|代理|經銷/i],
    ["金融保險", /金融|保險|理財|投資|銀行|證券|貸款/i],
    ["科技資訊", /科技|資訊|軟體|系統|AI|網路|數位|程式/i],
    ["工商專業服務", /設計|顧問|法律|會計|工程|建築|行銷|廣告|貿易|人力|清潔/i]
  ];

  function getCardIndustry(card) {
    const explicit = safeText(card && (card["業種"] || card["產業"] || card.industry || card.industryName)).trim();
    const source = [explicit, card && card["服務項目"], card && card.services, card && card["標籤"], card && card["公司名稱"]].map(safeText).join(" ");
    const matched = CARD_INDUSTRY_RULES.find(([, pattern]) => pattern.test(source));
    return matched ? matched[0] : (explicit || "其他行業");
  }

  function getCardListSource() {
    return getHarvestCards(Array.isArray(window.harvestCards) ? window.harvestCards : window.allCards);
  }

  function applyCardListFilters() {
    const input = $("search-card-input");
    const keyword = input ? input.value.toLowerCase().trim() : "";
    const industry = safeText(window.cardIndustryFilter || "全部");
    return getCardListSource().filter(card => {
      const text = [card["姓名"], card["英文名"], card["公司名稱"], card["職稱"], card["手機號碼"], card["公司電話"], card["電子郵件"], card["服務項目"], card["標籤"], getCardIndustry(card)].map(safeText).join(" ").toLowerCase();
      return (!keyword || text.includes(keyword)) && (industry === "全部" || getCardIndustry(card) === industry);
    });
  }
  function getCardUpdatedAt(card) {
    return safeText(card && (card.updatedAt || card.updated_at || card["更新時間"] || card.createdAt || card.created_at || card["建立時間"])).trim();
  }

  function parseCardTimestamp(value) {
    const raw = safeText(value).trim();
    if (!raw) return null;
    const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    const iso = hasExplicitZone ? normalized : normalized + 'Z';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatCardListTime(value) {
    const raw = safeText(value).trim();
    if (!raw) return "";
    const date = parseCardTimestamp(raw);
    if (!date) return raw.slice(0, 10);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
      const hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return (hours < 12 ? "上午 " : "下午 ") + ((hours % 12) || 12) + ":" + minutes;
    }
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "昨天";
    return (date.getMonth() + 1) + "/" + date.getDate();
  }

  function renderTags(value, small = true) {
    const raw = safeText(value).trim();
    if (!raw) return "";

    return raw
      .split(/\s+/)
      .filter(Boolean)
      .map(t => {
        const cls = small
          ? "bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold mr-1"
          : "bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-bold text-[11px] mr-1";
        return `<span class="${cls}">${escapeHTML(t)}</span>`;
      })
      .join("");
  }

  function getCardSortTime(card) {
    const candidates = [
      card && card.updated_at,
      card && card.created_at,
      card && card["更新時間"],
      card && card["建立時間"],
      card && card["updatedAt"],
      card && card["createdAt"]
    ];

    for (const value of candidates) {
      const text = safeText(value).trim();
      if (!text) continue;
      const parsed = parseCardTimestamp(text);
      if (parsed) return parsed.getTime();
    }

    const rowId = safeText(card && (card.rowId || card["rowId"]));
    const match = rowId.match(/(\d{10,})/);
    return match ? Number(match[1]) : 0;
  }

  function sortCardsNewestFirst(cards) {
    return cards
      .map((card, index) => ({ card, index, time: getCardSortTime(card) }))
      .sort((a, b) => {
        if (b.time !== a.time) return b.time - a.time;
        return a.index - b.index;
      })
      .map(item => item.card);
  }

  function updateLocalCard(rowId, payloadData) {
    if (!rowId || !payloadData) return;

    if (Array.isArray(window.allCards)) {
      const match = window.allCards.find(c => String(c.rowId) === String(rowId));
      if (match) {
        Object.keys(payloadData).forEach(k => {
          match[k] = payloadData[k];
        });
      }
    }

    if (window.currentCard && String(window.currentCard.rowId) === String(rowId)) {
      Object.keys(payloadData).forEach(k => {
        window.currentCard[k] = payloadData[k];
      });
    }

    if (window.currentUserCard && String(window.currentUserCard.rowId) === String(rowId)) {
      Object.keys(payloadData).forEach(k => {
        window.currentUserCard[k] = payloadData[k];
      });
    }
  }

  window.renderCardList = function (cards, options = {}) {
    const list = $("card-list");
    if (!list) return;
    const visibleSource = getHarvestCards(cards);

    if (!options.keepPage) {
      window.cardListPage = 1;
      window.cardListRenderSource = visibleSource;
    }

    if (!Array.isArray(visibleSource) || visibleSource.length === 0) {
      list.innerHTML = `
        <div class="bg-white p-8 rounded-3xl text-center text-slate-400 border border-slate-100 shadow-sm">
          <span class="material-symbols-outlined text-4xl mb-2 text-slate-300">contacts_product</span>
          <p class="font-bold text-[13px]">目前沒有自己的收錄名單</p>
          <p class="text-[12px] mt-1">用收藏名片掃描客戶或合作夥伴後，會出現在這裡。</p>
        </div>
      `;
      return;
    }

    const page = Math.max(1, Number(window.cardListPage || 1));
    const displayCards = sortCardsNewestFirst(visibleSource);
    const visibleCards = displayCards.slice(0, page * CARD_PAGE_SIZE);

    const html = visibleCards.map(card => {
      const rowId = safeText(card.rowId || card["rowId"]);
      const imgUrl = getCardImageUrl(card);
      const subtitle = getCardSubtitle(card);
      const timeText = formatCardListTime(getCardUpdatedAt(card));

      let imgHtml = "";
      if (imgUrl) {
        imgHtml = `<img src="${escapeHTML(imgUrl)}" class="w-14 h-14 rounded-full object-cover shrink-0 border border-slate-100 shadow-sm bg-slate-100" alt="card image">`;
      } else {
        imgHtml = `
          <div class="w-14 h-14 rounded-full bg-slate-100 text-slate-300 flex items-center justify-center shrink-0 shadow-sm">
            <span class="material-symbols-outlined">person</span>
          </div>
        `;
      }

      return `
        <div class="group bg-white px-3 py-3 active:bg-slate-50 transition-all cursor-pointer flex gap-3 items-center border-b border-slate-100 last:border-b-0"
             onclick="window.openCardDetailByRowId('${escapeJS(rowId)}')">
          ${imgHtml}
          <div class="flex-1 min-w-0">
            <div class="font-black text-slate-900 text-[15px] leading-tight truncate">${escapeHTML(getCardTitle(card))}</div>
            <div class="text-[13px] text-slate-500 font-medium truncate mt-1">${escapeHTML(subtitle)}</div>
            <span class="inline-flex mt-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">${escapeHTML(getCardIndustry(card))}</span>
          </div>
          <div class="shrink-0 self-start pt-0.5 text-right">
            <div class="text-[12px] text-slate-400 font-medium whitespace-nowrap">${escapeHTML(timeText)}</div>
            <span class="material-symbols-outlined text-blue-500 bg-blue-50 rounded-full text-[16px] p-0.5 mt-2 shadow-sm">north_east</span>
          </div>
        </div>
      `;
    }).join("");

    const hasMore = visibleCards.length < displayCards.length;
    const footerHtml = `
      <div class="text-center py-2">
        <div class="text-[12px] font-bold text-slate-400 mb-3">顯示 ${visibleCards.length} / ${displayCards.length} 位名單</div>
        ${hasMore ? `
          <button type="button"
                  onclick="window.loadMoreCards()"
                  class="w-full bg-white border border-slate-100 rounded-2xl py-3 text-[13px] font-black text-primary shadow-sm active:scale-[0.98] transition-all">
            載入更多
          </button>
        ` : ""}
      </div>
    `;

    list.innerHTML = `
      <div class="bg-white overflow-hidden border-y border-slate-100">
        <div class="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div class="font-black text-slate-900 text-[16px]">我的收錄名單</div>
            <div class="text-[12px] text-slate-400 font-bold mt-0.5">只列出自己用收藏名片掃進來的資料</div>
          </div>
          <span class="text-[12px] font-black text-slate-400">${displayCards.length} 位</span>
        </div>
        ${html}
      </div>
      ${footerHtml}
    `;
  };

  window.loadMoreCards = function () {
    window.cardListPage = Math.max(1, Number(window.cardListPage || 1)) + 1;
    window.renderCardList(Array.isArray(window.cardListRenderSource) ? window.cardListRenderSource : window.allCards, { keepPage: true });
  };

  window.filterCards = function () {
    window.renderCardList(applyCardListFilters());
  };

  window.setCardIndustryFilter = function (industry) {
    window.cardIndustryFilter = safeText(industry || "全部") || "全部";
    document.querySelectorAll("[data-card-industry]").forEach(button => {
      const active = button.dataset.cardIndustry === window.cardIndustryFilter;
      button.className = active
        ? "shrink-0 rounded-full bg-emerald-600 px-4 py-2 text-[13px] font-black text-white"
        : "shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-[13px] font-bold text-slate-600";
    });
    window.filterCards();
  };
  window.openCardDetailByRowId = async function (rowId) {
    const requestedRowId = safeText(rowId).trim();
    if (!requestedRowId) {
      showToast("找不到這張名片", true);
      return;
    }
    const sourceCards = [
      ...getHarvestCards(Array.isArray(window.harvestCards) ? window.harvestCards : []),
      ...getVisibleCards(Array.isArray(window.allCards) ? window.allCards : [])
    ];
    let card = sourceCards.find(c => getCardRowId(c) === requestedRowId);

    // Resolve the clicked row before opening its detail page. A stale list object must
    // never leak the previous card's five-tag values into the selected card.
    if (typeof window.fetchAPI === "function") {
      try {
        const result = await window.fetchAPI("getPublicCardById", { rowId: requestedRowId }, true);
        const freshCard = result && (result.card || result.data || result);
        if (freshCard && getCardRowId(freshCard) === requestedRowId) {
          card = freshCard;
          replaceCardInCache("harvestCards", freshCard);
          replaceCardInCache("allCards", freshCard);
        }
      } catch (error) {
        console.warn("[openCardDetailByRowId] exact card lookup failed:", error);
      }
    }

    if (card && getCardRowId(card) === requestedRowId) {
      window.openCardDetail(card);
    } else {
      showToast("找不到這張名片", true);
    }
  };

  window.openCardDetailById = window.openCardDetailByRowId;

  function isCardCoolPrivateImport(card) {
    return safeText(card && (card.sourceType || card["名片來源"] || card["??靘?"])).trim() === "private_import";
  }

  window.openCardCoolReviewForCard = function (rowId) {
    const id = safeText(rowId).trim();
    if (!id) {
      showToast("缺少名片 ID", true);
      return;
    }
    const params = new URLSearchParams(window.location.search || "");
    params.set("mode", "cardcool-review");
    params.set("cardId", id);
    params.delete("jobId");
    window.location.href = window.location.pathname + "?" + params.toString();
  };

  window.sendCardCoolCardToChat = async function (rowId) {
    const id = safeText(rowId).trim();
    if (!id) {
      showToast("缺少名片 ID", true);
      return;
    }
    try {
      const res = await window.fetchAPI("sendCardCoolCardToChat", { cardId: id }, true);
      assertApiSuccess(res, "發送失敗");
      showToast("已發送到 LINE 聊天室");
    } catch (e) {
      showToast(e.message || "發送失敗", true);
    }
  };

  window.openCardDetail = function (card) {
    if (!card) return;

    window.currentCard = card;
    window.currentCardRowId = getCardRowId(card);
    window.cardDetailReturnPage = window.currentPage || "card";

    const canEdit = canEditCard(card);
    const personalEditSection = $("personal-edit-section");
    const tabEcard = $("tab-ecard");
    const btnDelete = $("btn-delete-card");

    if (canEdit) {
      if (personalEditSection) personalEditSection.classList.remove("hidden");
      if (tabEcard) tabEcard.classList.remove("hidden");
      if (btnDelete) btnDelete.classList.remove("hidden");
    } else {
      if (personalEditSection) personalEditSection.classList.add("hidden");
      if (tabEcard) tabEcard.classList.add("hidden");
      if (btnDelete) btnDelete.classList.add("hidden");
      if (typeof window.switchTab === "function") window.switchTab("info");
    }

    let infoHtml = "";

    CARD_DISPLAY_FIELDS.forEach(field => {
      const rawVal = card[field.key];
      const val = safeText(rawVal).trim();
      if (!val) return;

      let displayVal = escapeHTML(val);

      if (field.key === "服務項目") {
        displayVal = displayVal.replace(/\n/g, "<br>");
      }

      if (field.key === "標籤") {
        displayVal = renderTags(val, false);
      }

      let actionHtml = "";

      if (field.isPhone) {
        const phone = normalizePhone(val);
        if (phone) {
          actionHtml = `
            <a href="tel:${escapeHTML(phone)}" class="text-[#06C755] bg-green-50 p-1.5 rounded-lg active:scale-90 transition-transform">
              <span class="material-symbols-outlined text-[18px]">call</span>
            </a>
          `;
        }
      } else if (field.key === "公司地址") {
        actionHtml = `
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(val)}" target="_blank" class="text-blue-500 bg-blue-50 p-1.5 rounded-lg active:scale-90 transition-transform">
            <span class="material-symbols-outlined text-[18px]">map</span>
          </a>
        `;
      } else if (field.key === "電子郵件") {
        actionHtml = `
          <a href="mailto:${escapeHTML(val)}" class="text-orange-500 bg-orange-50 p-1.5 rounded-lg active:scale-90 transition-transform">
            <span class="material-symbols-outlined text-[18px]">mail</span>
          </a>
        `;
      } else if (field.isWeb) {
        const url = normalizeUrl(val);
        if (url) {
          actionHtml = `
            <a href="${escapeHTML(url)}" target="_blank" class="text-blue-500 bg-blue-50 p-1.5 rounded-lg active:scale-90 transition-transform">
              <span class="material-symbols-outlined text-[18px]">open_in_new</span>
            </a>
          `;
        }
      }

      infoHtml += `
        <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex gap-3">
          <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shrink-0 shadow-sm border border-slate-100">
            <span class="material-symbols-outlined text-[16px]">${escapeHTML(field.icon)}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-[11px] font-bold text-slate-400 mb-0.5">${escapeHTML(field.label)}</p>
            <p class="text-[14px] text-slate-700 font-medium leading-relaxed">${displayVal}</p>
          </div>
          ${actionHtml}
        </div>
      `;
    });

    if (canEdit && isCardCoolPrivateImport(card)) {
      const rowId = safeText(card.rowId || card["rowId"]);
      const scanner = safeText(card.scannerName || card.scannerUserId || card.scannerId || card.ownerName || card.ownerUserId || card.creatorId || getCurrentUserId()).trim();
      infoHtml = `
        <div class="rounded-3xl border border-blue-100 bg-blue-50 p-4">
          <div class="text-[12px] font-black text-blue-700 mb-3">收藏名片匯入${scanner ? `｜掃描者：${escapeHTML(scanner)}` : ""}</div>
          <div class="grid grid-cols-2 gap-2">
            <button type="button"
                    onclick="window.openCardCoolReviewForCard('${escapeJS(rowId)}')"
                    class="rounded-2xl bg-blue-600 py-3 text-[13px] font-black text-white active:scale-[0.98]">
              編輯收藏名片
            </button>
            <button type="button"
                    onclick="window.sendCardCoolCardToChat('${escapeJS(rowId)}')"
                    class="rounded-2xl bg-slate-900 py-3 text-[13px] font-black text-white active:scale-[0.98]">
              發送聊天室
            </button>
          </div>
        </div>
      ` + infoHtml;
    }

    const detailFields = $("detail-fields");
    if (detailFields) {
      detailFields.innerHTML = infoHtml || '<div class="text-center text-slate-400 py-8 text-sm">無詳細資料</div>';
    }

    if (canEdit) {
      CARD_EDITABLE_FIELDS.forEach(fieldName => {
        const el = $("edit-" + fieldName);
        if (el) el.value = safeText(card[fieldName] || "");
      });

      if (typeof window.initECardSettings === "function") {
        window.initECardSettings(card);
      }

      const cfg = parseCardConfig(card);
      const colorInput = $("edit-desc-color");
      if (colorInput) colorInput.value = cfg.descColor || "#666666";

      if (typeof window.setDescAlign === "function") {
        window.setDescAlign(cfg.descAlign || "start");
      }

      window.currentLoadedCardId = null;
    }

    const btnClaim = $("btn-send-claim");
    if (btnClaim) {
      if (safeText(card["LINE ID"]).trim()) {
        btnClaim.classList.add("hidden");
      } else {
        btnClaim.classList.remove("hidden");
      }
    }

    if (typeof window.goPage === "function") {
      window.goPage("card-detail");
    }
  };

  window.returnFromCardDetail = function () {
    const returnPage = window.cardDetailReturnPage || "card";
    if (typeof window.goPage === "function") window.goPage(returnPage);
    if (returnPage === "admin-settings" && typeof window.focusMyECardSection === "function") {
      setTimeout(() => window.focusMyECardSection(), 120);
    }
  };

  window.getClaimUrlForCard = function (card) {
    const liffId = window.LIFF_ID || (typeof LIFF_ID !== "undefined" ? LIFF_ID : "");
    const cardId = card?.rowId || card?.["rowId"] || "";
    const params = {
      claim: cardId,
      ref: window.currentUserProfile?.userId || "",
      net: window.currentNetworkId || ""
    };

    if (window.buildPointLiffUrl) {
      return window.buildPointLiffUrl(params);
    }

    let url = "https://liff.line.me/" + encodeURIComponent(liffId) + "?claim=" + encodeURIComponent(cardId);
    if (params.ref) url += "&ref=" + encodeURIComponent(params.ref);
    if (params.net) url += "&net=" + encodeURIComponent(params.net);
    return url;
  };

  window.sendClaimInvitation = async function () {
    const card = window.currentCard;
    if (!card || !(card.rowId || card["rowId"])) {
      showToast("找不到名片資料", true);
      return;
    }
    if (safeText(card["LINE ID"]).trim()) {
      showToast("此名片已綁定，不能再次發送認領", true);
      return;
    }

    const claimUrl = window.getClaimUrlForCard(card);
    const text = "這是您的數位名片認領連結，請點擊後綁定您的 LINE 帳號：\n" + claimUrl;

    try {
      if (typeof liff !== "undefined" && liff.isLoggedIn() && liff.isApiAvailable("shareTargetPicker")) {
        const result = await liff.shareTargetPicker([{ type: "text", text }]);
        if (result) showToast("已送出認領邀約");
        return;
      }

      if (navigator.clipboard) {
        await navigator.clipboard.writeText(claimUrl);
        showToast("已複製認領連結");
        return;
      }

      await window.appPrompt("請複製認領連結", claimUrl, {
        title: "認領連結",
        placeholder: "請複製此連結"
      });
    } catch (e) {
      showToast("發送失敗：" + (e.message || "請稍後再試"), true);
    }
  };

  window.setDescAlign = function (align) {
    window.currentDescAlign = align || "start";

    ["start", "center", "end"].forEach(a => {
      const btn = $("align-" + a);
      if (!btn) return;

      if (a === window.currentDescAlign) {
        btn.classList.add("bg-white", "shadow-sm");
      } else {
        btn.classList.remove("bg-white", "shadow-sm");
      }
    });

    if (typeof window.updateECardPreview === "function") {
      window.updateECardPreview();
    }
  };

  const CARD_FATE_TAG_FIELDS = [
    { key: "personality", label: "個性", icon: "psychology", tone: "border-indigo-100 bg-indigo-50 text-indigo-700" },
    { key: "hobbies", label: "興趣", icon: "interests", tone: "border-sky-100 bg-sky-50 text-sky-700" },
    { key: "wealth", label: "財富", icon: "payments", tone: "border-amber-100 bg-amber-50 text-amber-800" },
    { key: "health", label: "健康", icon: "health_and_safety", tone: "border-emerald-100 bg-emerald-50 text-emerald-700" },
    { key: "career", label: "事業", icon: "work", tone: "border-rose-100 bg-rose-50 text-rose-700" }
  ];

  window.renderCardFateTags = function () {
    const grid = $("card-fate-tags-grid");
    const selectedRowId = safeText(window.currentCardRowId).trim();
    const card = window.currentCard;
    if (!grid || !card) return;
    if (!selectedRowId || getCardRowId(card) !== selectedRowId) {
      grid.innerHTML = '<div class="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">名片資料切換中，請重新開啟此名片。</div>';
      return;
    }

    const analysisStatus = safeText(card.fateAnalysisStatus || card.fate_analysis_status).trim().toLowerCase();
    const pendingText = analysisStatus === "failed"
      ? "AI 分析暫時失敗，系統將於離峰時段自動重試。"
      : analysisStatus === "insufficient"
        ? "資料不足，請補充姓名、電話、生日、公司或職稱。"
        : "已排入 AI 分析，將於離峰時段自動完成。";
    const tagPanels = CARD_FATE_TAG_FIELDS.map((field) => {
      const value = safeText(card[field.key] || card[field.label]).trim() || pendingText;
      return `<details class="rounded-2xl border ${field.tone}">
        <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-black">
          <span class="flex items-center gap-2"><span class="material-symbols-outlined text-[19px]">${field.icon}</span>${field.label}</span>
          <span class="material-symbols-outlined text-slate-400">expand_more</span>
        </summary>
        <p class="border-t border-current/10 px-4 py-3 text-sm font-bold leading-relaxed text-slate-700 break-words">${escapeHTML(value)}</p>
      </details>`;
    });

    const directBirthday = safeText(card.birthday || card["生日"]).trim();
    const currentUserId = getCurrentUserId();
    const isSelfProfileCard = !!currentUserId && (
      getCardLineId(card) === currentUserId ||
      getCardSourceType(card) === "self_profile"
    );
    const sessionBirthday = safeText(
      (window.currentUser && window.currentUser.birthday) ||
      (window.currentUserProfile && window.currentUserProfile.birthday) ||
      ""
    ).trim();
    const birthday = directBirthday || (isSelfProfileCard ? sessionBirthday : "");
    const fate = typeof window.getZodiacProfileForBirthday === "function" ? window.getZodiacProfileForBirthday(birthday) : null;
    const fateText = fate ? [
      fate.zodiac ? `${fate.zodiac.symbol} ${fate.zodiac.name}` : "",
      fate.chinese ? `生肖${fate.chinese.name}` : "",
      fate.life ? `生命靈數 ${fate.life.number}：${fate.life.theme}` : ""
    ].filter(Boolean).join(" · ") : "尚未填寫完整生日，無法解析星座命理。";
    tagPanels.push(`<details class="rounded-2xl border border-violet-100 bg-violet-50 text-violet-700">
      <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-black">
        <span class="flex items-center gap-2"><span class="material-symbols-outlined text-[19px]">auto_awesome</span>星座命理</span>
        <span class="material-symbols-outlined text-slate-400">expand_more</span>
      </summary>
      <p class="border-t border-violet-100 px-4 py-3 text-sm font-bold leading-relaxed text-slate-700 break-words">${escapeHTML(fateText)}</p>
    </details>`);

    grid.className = "space-y-3";
    grid.innerHTML = tagPanels.join("");
  };

  window.switchTab = function (tab) {
    if (!window.currentCard) return;

    if (tab !== "info" && tab !== "tags" && !canEditCard(window.currentCard)) {
      showToast("權限不足，無法編輯此名片", true);
      return;
    }

    ["info", "edit", "tags", "ecard"].forEach(t => {
      const content = $("tab-content-" + t);
      const btn = $("tab-" + t);

      if (content) content.classList.add("hidden");

      if (btn) {
        btn.classList.remove("text-blue-600", "border-blue-600");
        btn.classList.add("text-slate-400", "border-transparent");
      }
    });

    const activeContent = $("tab-content-" + tab);
    const activeBtn = $("tab-" + tab);

    if (activeContent) activeContent.classList.remove("hidden");

    if (activeBtn) {
      activeBtn.classList.remove("text-slate-400", "border-transparent");
      activeBtn.classList.add("text-blue-600", "border-blue-600");
    }

    if (tab === "tags") window.renderCardFateTags();
  };

  window.saveCardEdit = async function () {
    if (!window.currentCard) return;

    if (!canEditCard(window.currentCard)) {
      showToast("權限不足，無法儲存此名片", true);
      return;
    }

    const btn = $("btn-save");
    const originalHtml = btn ? btn.innerHTML : "";

    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
      btn.disabled = true;
    }

    const payloadData = {};
    CARD_EDITABLE_FIELDS.forEach(fieldName => {
      const el = $("edit-" + fieldName);
      if (el) payloadData[fieldName] = safeText(el.value).trim();
    });

    const rowId = window.currentCard.rowId || window.currentCard["rowId"];

    try {
      if (typeof window.syncECardButtonsFromFields === "function") {
        window.syncECardButtonsFromFields({ render: false });
      }
      if (typeof window.buildECardConfigFromFields === "function") {
        const cfg = window.buildECardConfigFromFields();
        payloadData["自訂名片設定"] = JSON.stringify(cfg);
        if (cfg.imgUrl) payloadData["名片圖檔"] = cfg.imgUrl;
      }

      const res = await window.fetchAPI("updateCard", { rowId, data: payloadData }, true);
      assertApiSuccess(res, "儲存失敗");

      updateLocalCard(rowId, payloadData);

      showToast("✅ 變更已儲存");

      if (typeof window.updateECardPreview === "function") {
        window.updateECardPreview();
      }

      window.openCardDetail(window.currentCard);

    } catch (e) {
      showToast("⚠️ 儲存失敗：" + (e.message || "未知錯誤"), true);
    } finally {
      if (btn) {
        btn.innerHTML = originalHtml || '<span class="material-symbols-outlined text-[18px]">save</span> 儲存變更';
        btn.disabled = false;
      }
    }
  };

  window.deleteCard = async function () {
    if (!window.currentCard) return;

    if (!canEditCard(window.currentCard)) {
      showToast("權限不足，無法刪除此名片", true);
      return;
    }

    if (!await window.appConfirm("確定要刪除這張名片嗎？此操作無法還原！", {
      type: "warning",
      title: "刪除名片",
      danger: true,
      okText: "刪除",
      cancelText: "取消"
    })) return;

    const rowId = window.currentCard.rowId || window.currentCard["rowId"];

    try {
      const res = await window.fetchAPI("deleteCard", { rowId }, true);
      assertApiSuccess(res, "刪除失敗");

      showToast("✅ 已刪除名片");

      if (Array.isArray(window.allCards)) {
        const idx = window.allCards.findIndex(c => String(c.rowId || c["rowId"]) === String(rowId));
        if (idx !== -1) {
          window.allCards.splice(idx, 1);
          window.renderCardList(window.allCards);
        }
      }

      if (window.currentUserCard && String(window.currentUserCard.rowId || window.currentUserCard["rowId"]) === String(rowId)) {
        window.currentUserCard = null;
      }

      window.currentCard = null;

      if (typeof window.goPage === "function") {
        window.goPage("card");
      }

    } catch (e) {
      showToast("⚠️ 刪除失敗：" + (e.message || "未知錯誤"), true);
    }
  };

})();
