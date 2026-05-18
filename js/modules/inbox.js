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
    $("inbox-detail-type").textContent = typeLabel(item);
    $("inbox-detail-title").textContent = item.title || "未命名訊息";
    $("inbox-detail-meta").textContent = `${senderName(item)} · ${formatTime(item.createdAt)}`;
    $("inbox-detail-body").textContent = item.body || "沒有內文";

    const cardBox = $("inbox-sender-card");
    const card = item.senderCard;
    const subtitle = senderSubtitle(item);
    if (cardBox) {
      cardBox.classList.remove("hidden");
      cardBox.innerHTML = `
        <div class="flex items-start gap-3">
          ${card?.imageUrl ? `<img src="${escapeHTML(card.imageUrl)}" class="w-14 h-14 rounded-2xl object-cover border border-slate-200 bg-white">` : '<div class="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400"><span class="material-symbols-outlined">badge</span></div>'}
          <div class="min-w-0 flex-1">
            <p class="text-[15px] font-black text-slate-900 truncate">${escapeHTML(senderName(item))}</p>
            <p class="text-[13px] text-slate-500 font-bold mt-1 leading-relaxed">${escapeHTML(subtitle || "可反查寄件者資料")}</p>
            ${card?.rowId ? `<button type="button" onclick="window.openInboxSenderCard('${escapeHTML(card.rowId)}')" class="mt-3 px-4 py-2 rounded-2xl bg-slate-900 text-white text-[13px] font-black active:scale-95 transition-all">查看名片</button>` : ""}
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

  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(window.refreshInboxBadge, 1800);
  });

  window.addEventListener("focus", () => {
    if (canUseInbox()) window.refreshInboxBadge();
  });
})();
