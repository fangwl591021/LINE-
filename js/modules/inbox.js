(function () {
  const $ = id => document.getElementById(id);

  const TYPE_LABELS = {
    message: "訊息",
    coupon: "優惠券",
    course: "課程邀約",
    interview: "1 對 1 訪談",
    activity: "活動邀約"
  };

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function canUseInbox() {
    return !!(window.currentUserProfile?.userId && typeof window.fetchAPI === "function");
  }

  function typeLabel(item) {
    return TYPE_LABELS[item?.messageType] || "訊息";
  }

  function senderName(item) {
    const snap = item?.senderSnapshot || {};
    return snap.name || item?.senderUser?.name || item?.senderCard?.name || "未知寄件者";
  }

  function senderSubtitle(item) {
    const snap = item?.senderSnapshot || {};
    const parts = [
      snap.companyName || item?.senderCard?.companyName || "",
      snap.title || item?.senderUser?.industry || item?.senderCard?.title || "",
      snap.phone || item?.senderUser?.phone || item?.senderCard?.mobile || ""
    ].filter(Boolean);
    return parts.join(" / ");
  }

  function parseConfig(value) {
    if (!value) return {};
    if (typeof value === "object") return value;
    try {
      const parsed = JSON.parse(String(value));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function getCardImage(card) {
    if (!card) return "";
    const cfg = parseConfig(card.customConfig || card["自訂名片設定"] || card["電子名片設定"]);
    return cfg.imgUrlPortrait || cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlSquare || card.imageUrl || card["名片圖檔"] || "";
  }

  window.refreshInboxBadge = async function () {
    const button = $("inbox-nav-button");
    const badge = $("inbox-unread-badge");
    if (!button || !badge) return;

    if (!canUseInbox()) {
      button.classList.add("hidden");
      badge.classList.add("hidden");
      return;
    }

    button.classList.remove("hidden");
    try {
      const data = await window.fetchAPI("getInboxCount", {}, true);
      const unread = Number(data?.unread || 0);
      if (unread > 0) {
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.classList.remove("hidden");
      } else {
        badge.classList.add("hidden");
      }
    } catch (e) {
      console.warn("[inbox] badge skipped:", e.message || e);
    }
  };

  function renderEmpty() {
    const list = $("inbox-list");
    if (!list) return;
    list.innerHTML = `
      <div class="p-8 text-center">
        <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <span class="material-symbols-outlined">mail</span>
        </div>
        <p class="text-[16px] font-black text-slate-700">目前沒有信件</p>
        <p class="text-[13px] text-slate-400 font-bold mt-1">訊息、優惠券、課程邀約與訪談邀請會集中在這裡。</p>
      </div>
    `;
  }

  function renderList(items) {
    const list = $("inbox-list");
    if (!list) return;
    if (!Array.isArray(items) || items.length === 0) {
      renderEmpty();
      return;
    }

    list.innerHTML = items.map(item => {
      const unread = item.status !== "read";
      return `
        <button type="button" onclick="window.openInboxItem('${escapeHTML(item.messageId)}')" class="w-full text-left p-4 flex gap-3 active:bg-slate-50 transition-colors">
          <div class="w-10 h-10 rounded-2xl ${unread ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[22px]">${unread ? "mark_email_unread" : "drafts"}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[12px] font-black ${unread ? "text-blue-600" : "text-slate-400"}">${escapeHTML(typeLabel(item))}</p>
                <h3 class="text-[16px] font-black text-slate-900 leading-snug truncate">${escapeHTML(item.title || "未命名訊息")}</h3>
              </div>
              ${unread ? '<span class="shrink-0 mt-1 rounded-full bg-red-50 text-red-600 px-2 py-1 text-[11px] font-black">未讀</span>' : ""}
            </div>
            <p class="text-[13px] text-slate-500 font-bold mt-1 truncate">${escapeHTML(senderName(item))}</p>
            <p class="text-[12px] text-slate-400 font-bold mt-1">${escapeHTML(formatTime(item.createdAt))}</p>
          </div>
        </button>
      `;
    }).join("");
  }

  window.loadInbox = async function () {
    const list = $("inbox-list");
    if (!list) return;
    if (!canUseInbox()) {
      renderEmpty();
      return;
    }

    list.innerHTML = '<div class="p-8 text-center text-slate-400 font-bold">讀取收件匣中...</div>';
    try {
      const items = await window.fetchAPI("listInboxItems", {}, true);
      window.inboxItems = Array.isArray(items) ? items : [];
      renderList(window.inboxItems);
      await window.refreshInboxBadge();
    } catch (e) {
      list.innerHTML = `<div class="p-8 text-center text-red-500 font-bold">收件匣讀取失敗：${escapeHTML(e.message || e)}</div>`;
    }
  };

  window.closeInboxDetail = function () {
    const panel = $("inbox-detail-panel");
    if (panel) panel.classList.add("hidden");
  };

  window.toggleInboxComposer = function (force) {
    const box = $("inbox-composer");
    const icon = $("inbox-composer-icon");
    if (!box) return;
    const open = typeof force === "boolean" ? force : box.classList.contains("hidden");
    box.classList.toggle("hidden", !open);
    if (icon) icon.style.transform = open ? "rotate(180deg)" : "";
  };

  window.searchInboxRecipients = async function () {
    const query = $("inbox-recipient-query")?.value?.trim() || "";
    const box = $("inbox-recipient-results");
    const hidden = $("inbox-recipient-id");
    if (hidden) hidden.value = "";
    if (!box) return;
    if (query.length < 2) {
      box.innerHTML = '<div class="text-[13px] text-slate-400 font-bold px-1">請至少輸入 2 個字。</div>';
      return;
    }

    box.innerHTML = '<div class="text-[13px] text-slate-400 font-bold px-1">搜尋中...</div>';
    try {
      const rows = await window.fetchAPI("searchInboxRecipients", { keyword: query }, true);
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length) {
        box.innerHTML = '<div class="text-[13px] text-red-400 font-bold px-1">找不到符合的收件人</div>';
        return;
      }
      box.innerHTML = list.map(user => `
        <button type="button" onclick="window.selectInboxRecipient('${escapeHTML(user.userId)}','${escapeHTML(user.name)}')" class="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 text-left active:scale-[0.99] transition-all">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[15px] font-black text-slate-900 truncate">${escapeHTML(user.name || "未命名")}</p>
              <p class="text-[12px] text-slate-500 font-bold mt-1 truncate">${escapeHTML([user.phone, user.industry].filter(Boolean).join(" / ") || user.userId)}</p>
            </div>
            <span class="shrink-0 rounded-full bg-blue-50 text-blue-600 px-2 py-1 text-[11px] font-black">${escapeHTML(user.roleLabel || "用戶")}</span>
          </div>
        </button>
      `).join("");
    } catch (e) {
      box.innerHTML = `<div class="text-[13px] text-red-400 font-bold px-1">搜尋失敗：${escapeHTML(e.message || e)}</div>`;
    }
  };

  window.selectInboxRecipient = function (userId, name) {
    const hidden = $("inbox-recipient-id");
    const query = $("inbox-recipient-query");
    const box = $("inbox-recipient-results");
    if (hidden) hidden.value = userId || "";
    if (query) query.value = name || userId || "";
    if (box) box.innerHTML = `<div class="rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-2 text-[13px] font-black">已選擇：${escapeHTML(name || userId)}</div>`;
  };

  window.sendInboxMessage = async function (btn) {
    const receiverUserId = $("inbox-recipient-id")?.value?.trim() || "";
    const receiverQuery = $("inbox-recipient-query")?.value?.trim() || "";
    const messageType = $("inbox-message-type")?.value || "message";
    const title = $("inbox-message-title")?.value?.trim() || "";
    const body = $("inbox-message-body")?.value?.trim() || "";
    if (!receiverUserId && !receiverQuery) return window.showToast?.("請先選擇收件人", true);
    if (!title) return window.showToast?.("請輸入標題", true);
    if (!body) return window.showToast?.("請輸入內容", true);

    const oldText = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "傳送中...";
      btn.classList.add("opacity-70");
    }
    try {
      await window.fetchAPI("sendInboxMessage", { receiverUserId, receiverQuery, messageType, title, body }, true);
      window.showToast?.("訊息已送出，已扣 10 點");
      window.pointWalletData = null;
      window.refreshPointBalanceBadge?.();
      ["inbox-message-title", "inbox-message-body", "inbox-recipient-id", "inbox-recipient-query"].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });
      const results = $("inbox-recipient-results");
      if (results) results.innerHTML = "";
      window.toggleInboxComposer(false);
      await window.loadInbox();
    } catch (e) {
      window.showToast?.("傳送失敗：" + (e.message || e), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || "送出訊息";
        btn.classList.remove("opacity-70");
      }
    }
  };

  window.openInboxItem = async function (messageId) {
    if (!messageId || !canUseInbox()) return;
    try {
      const item = await window.fetchAPI("getInboxItem", { messageId }, true);
      renderDetail(item);
      await window.refreshInboxBadge();
      await window.loadInbox();
    } catch (e) {
      window.showToast?.("收件匣讀取失敗：" + (e.message || e), true);
    }
  };

  function renderDetail(item) {
    const panel = $("inbox-detail-panel");
    if (!panel) return;
    window.currentInboxItem = item;
    $("inbox-detail-type").textContent = typeLabel(item);
    $("inbox-detail-title").textContent = item.title || "未命名訊息";
    $("inbox-detail-meta").textContent = `${senderName(item)} · ${formatTime(item.createdAt)}`;
    $("inbox-detail-body").textContent = item.body || "沒有內文";

    const cardBox = $("inbox-sender-card");
    const card = item.senderCard;
    const subtitle = senderSubtitle(item);
    const cardImage = getCardImage(card);
    if (cardBox) {
      cardBox.classList.remove("hidden");
      cardBox.innerHTML = `
        <div class="space-y-4">
          ${cardImage ? `
            <button type="button" onclick="window.openInboxSenderCard('${escapeHTML(card?.rowId || card?.id || "")}')" class="block w-full overflow-hidden rounded-2xl border border-slate-200 bg-white active:scale-[0.99] transition-transform">
              <img src="${escapeHTML(cardImage)}" class="w-full h-auto max-h-[320px] object-contain bg-white" alt="寄件者名片預覽">
            </button>
          ` : ""}
          <div class="flex items-start gap-3">
          ${cardImage ? `<img src="${escapeHTML(cardImage)}" class="w-14 h-14 rounded-2xl object-cover border border-slate-200 bg-white">` : '<div class="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400"><span class="material-symbols-outlined">badge</span></div>'}
          <div class="min-w-0 flex-1">
            <p class="text-[15px] font-black text-slate-900 truncate">${escapeHTML(senderName(item))}</p>
            <p class="text-[13px] text-slate-500 font-bold mt-1 leading-relaxed">${escapeHTML(subtitle || "可反查寄件者資料")}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" onclick="window.replyInboxMessage()" class="px-4 py-2 rounded-2xl bg-[#06C755] text-white text-[13px] font-black active:scale-95 transition-all">回覆</button>
              ${card?.rowId ? `<button type="button" onclick="window.openInboxSenderCard('${escapeHTML(card.rowId)}')" class="px-4 py-2 rounded-2xl bg-slate-900 text-white text-[13px] font-black active:scale-95 transition-all">${cardImage ? "預覽名片" : "查看名片"}</button>` : ""}
            </div>
          </div>
          </div>
        </div>
      `;
    }
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.openInboxSenderCard = async function (rowId) {
    if (!rowId) return;
    try {
      const currentCard = window.currentInboxItem?.senderCard;
      if (currentCard && String(currentCard.rowId || currentCard.id || "") === String(rowId)) {
        const img = getCardImage(currentCard);
        if (img) {
          window.openInboxCardPreview(currentCard);
          return;
        }
        if (typeof window.openCardDetail === "function") {
          if (typeof window.goPage === "function") window.goPage("card");
          setTimeout(() => window.openCardDetail(currentCard), 80);
          return;
        }
      }
      if (currentCard && getCardImage(currentCard)) {
        window.openInboxCardPreview(currentCard);
        return;
      }
      if (typeof window.loadCardData === "function") {
        await window.loadCardData({ render: true });
      }
      if (typeof window.goPage === "function") window.goPage("card");
      setTimeout(() => {
        if (typeof window.openCardDetailByRowId === "function") {
          window.openCardDetailByRowId(rowId);
        }
      }, 120);
    } catch (e) {
      window.showToast?.("無法開啟寄件者名片", true);
    }
  };

  window.openInboxCardPreview = function (card) {
    const img = getCardImage(card);
    if (!img) return window.showToast?.("這張名片沒有預覽圖", true);
    let modal = $("inbox-card-preview-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "inbox-card-preview-modal";
      modal.className = "hidden fixed inset-0 z-[2200] bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center";
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95">
        <div class="p-4 flex items-center justify-between border-b border-slate-100">
          <div>
            <p class="text-[16px] font-black text-slate-900">${escapeHTML(card.name || card["姓名"] || "名片預覽")}</p>
            <p class="text-[12px] text-slate-400 font-bold mt-0.5">${escapeHTML([card.companyName || card["公司名稱"], card.title || card["職稱"]].filter(Boolean).join(" / "))}</p>
          </div>
          <button type="button" onclick="document.getElementById('inbox-card-preview-modal')?.classList.add('hidden')" class="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="bg-slate-50 p-3">
          <img src="${escapeHTML(img)}" class="w-full h-auto max-h-[70vh] object-contain rounded-2xl bg-white border border-slate-100" alt="名片預覽">
        </div>
        <div class="p-4 flex gap-3">
          <button type="button" onclick="document.getElementById('inbox-card-preview-modal')?.classList.add('hidden'); window.replyInboxMessage();" class="flex-1 py-3 rounded-2xl bg-[#06C755] text-white text-[15px] font-black active:scale-95">回覆</button>
          <button type="button" onclick="document.getElementById('inbox-card-preview-modal')?.classList.add('hidden'); window.openInboxSenderCardDetail();" class="flex-1 py-3 rounded-2xl bg-slate-900 text-white text-[15px] font-black active:scale-95">詳細資料</button>
        </div>
      </div>
    `;
    modal.classList.remove("hidden");
  };

  window.openInboxSenderCardDetail = function () {
    const card = window.currentInboxItem?.senderCard;
    if (!card || typeof window.openCardDetail !== "function") return window.showToast?.("無法開啟名片資料", true);
    if (typeof window.goPage === "function") window.goPage("card");
    setTimeout(() => window.openCardDetail(card), 80);
  };

  window.replyInboxMessage = function () {
    const item = window.currentInboxItem;
    if (!item) return;
    const senderId = item.senderUserId || item.senderSnapshot?.lineId || item.senderCard?.lineId || item.senderCard?.userId || "";
    if (!senderId) return window.showToast?.("找不到寄件者，無法回覆", true);
    const name = senderName(item);
    const hidden = $("inbox-recipient-id");
    const query = $("inbox-recipient-query");
    const title = $("inbox-message-title");
    const body = $("inbox-message-body");
    const results = $("inbox-recipient-results");
    if (hidden) hidden.value = senderId;
    if (query) query.value = name;
    if (title && !title.value.trim()) title.value = "Re: " + (item.title || "訊息");
    if (body) body.focus();
    if (results) results.innerHTML = `<div class="rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-2 text-[13px] font-black">回覆給：${escapeHTML(name)}</div>`;
    window.toggleInboxComposer(true);
    $("inbox-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(window.refreshInboxBadge, 1800);
  });

  window.addEventListener("focus", () => {
    if (canUseInbox()) window.refreshInboxBadge();
  });
})();
