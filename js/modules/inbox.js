(function () {
  const $ = id => document.getElementById(id);

  const TYPE_LABELS = {
    message: "一般訊息",
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

  const selectedInboxRecipients = new Set();
  const selectableInboxRecipients = new Map();

  function isGroupRecipientMode(mode) {
    return mode === "owned" || mode === "broadcast";
  }

  function selectedInboxRecipientIds() {
    return Array.from(selectedInboxRecipients).filter(Boolean);
  }

  function updateSelectedRecipientNotice() {
    const notice = $("inbox-recipient-selection-notice");
    if (!notice) return;
    const count = selectedInboxRecipients.size;
    const total = selectableInboxRecipients.size;
    if (!total) {
      notice.classList.add("hidden");
      notice.textContent = "";
      return;
    }
    const cost = count ? count * inboxMessageCost($("inbox-message-type")?.value || "message") : total * inboxMessageCost($("inbox-message-type")?.value || "message");
    notice.className = "mt-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-[13px] font-black text-blue-700";
    notice.textContent = count
      ? `已勾選 ${count} 位，送出時只會發送給勾選名單，預估扣 ${cost} 點。`
      : `已列出 ${total} 位；若不勾選，送出時會發送給全部符合名單，預估扣 ${cost} 點。`;
  }

  function clearRecipientSelection() {
    selectedInboxRecipients.clear();
    selectableInboxRecipients.clear();
    updateSelectedRecipientNotice();
  }

  function renderSelectableRecipients(list, mode, query) {
    const rows = Array.isArray(list) ? list : [];
    clearRecipientSelection();
    rows.forEach(user => {
      const uid = String(user?.userId || "").trim();
      if (uid) selectableInboxRecipients.set(uid, user);
    });
    const total = selectableInboxRecipients.size;
    if (!total) return '<div class="text-[13px] text-red-400 font-bold px-1">找不到符合的收件人</div>';
    const modeLabel = mode === "broadcast" ? "跨區 Admin" : "我的已用戶";
    const safeQuery = escapeHTML(query || "全部");
    const header = `
      <div class="rounded-2xl border border-blue-100 bg-blue-50 p-3">
        <div class="flex items-center justify-between gap-2">
          <div class="min-w-0">
            <p class="text-[13px] font-black text-blue-700">${escapeHTML(modeLabel)}：${total} 位可收件</p>
            <p class="text-[11px] font-bold text-blue-500 mt-0.5 truncate">搜尋條件：${safeQuery}</p>
          </div>
          <button type="button" onclick="window.toggleAllInboxRecipients(true)" class="shrink-0 rounded-xl bg-white px-3 py-2 text-[12px] font-black text-blue-700 border border-blue-100 active:scale-95">全選</button>
        </div>
      </div>`;
    const items = rows.map(user => {
      const uid = String(user?.userId || "").trim();
      const name = user?.name || "未命名";
      const subtitle = user?.subtitle || [user?.phone, user?.industry].filter(Boolean).join(" / ") || uid;
      return `
        <label class="flex items-center gap-3 w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 active:scale-[0.99] transition-all">
          <input type="checkbox" class="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" data-inbox-recipient-id="${escapeHTML(uid)}" onchange="window.toggleInboxRecipientSelection('${escapeHTML(uid)}', this.checked)">
          <div class="min-w-0 flex-1">
            <p class="text-[15px] font-black text-slate-900 truncate">${escapeHTML(name)}</p>
            <p class="text-[12px] text-slate-500 font-bold mt-1 truncate">${escapeHTML(subtitle)}</p>
          </div>
          <span class="shrink-0 rounded-full bg-emerald-50 text-emerald-700 px-2 py-1 text-[11px] font-black">${escapeHTML(user?.badge || "可收信")}</span>
        </label>`;
    }).join("");
    setTimeout(updateSelectedRecipientNotice, 0);
    return header + items;
  }

  function typeLabel(item) {
    return TYPE_LABELS[item?.messageType] || "一般訊息";
  }

  function couponMeta(item) {
    const payload = item?.payload || {};
    const coupon = payload.coupon && typeof payload.coupon === "object" ? payload.coupon : {};
    const redeemedAt = item?.couponRedeemedAt || coupon.redeemedAt || "";
    const redeemedBy = item?.couponRedeemedBy || coupon.redeemedBy || "";
    const status = redeemedAt ? "redeemed" : (item?.couponStatus || coupon.status || "issued");
    return {
      status,
      redeemedAt,
      redeemedBy,
      note: item?.couponRedeemNote || coupon.note || ""
    };
  }

  function isCouponRedeemed(item) {
    return couponMeta(item).status === "redeemed";
  }

  function senderName(item) {
    const snap = item?.senderSnapshot || {};
    return snap.name || item?.senderUser?.name || item?.senderCard?.name || "未知寄件人";
  }

  function receiverName(item) {
    return item?.receiverUser?.name || item?.receiverCard?.name || item?.receiverUserId || "未知收件人";
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

  function receiverSubtitle(item) {
    const parts = [
      item?.receiverUser?.phone || item?.receiverCard?.mobile || "",
      item?.receiverUser?.industry || item?.receiverCard?.title || "",
      item?.receiverUser?.networkId || item?.receiverCard?.networkId || ""
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
    const cfg = parseConfig(card.customConfig || card["自訂名片設定"] || card["電子名片設定"] || card["自訂版面"] || card["名片設定"]);
    return cfg.imgUrlPortrait || cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlSquare || card.imageUrl || card["名片圖檔"] || "";
  }

  function getCardConfig(card) {
    if (!card) return {};
    return parseConfig(card.customConfig || card["自訂名片設定"] || card["電子名片設定"] || card["自訂版面"] || card["名片設定"]);
  }

  function safeCssColor(value, fallback = "#06C755") {
    const color = String(value || "").trim();
    return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color) ? color : fallback;
  }

  function safeCardUrl(value) {
    const url = String(value || "").trim();
    return /^(https?:\/\/|line:\/\/|tel:|mailto:)/i.test(url) ? url : "";
  }

  function cardText(card, keys, fallback = "") {
    for (const key of keys) {
      const value = card && card[key];
      if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
    }
    return fallback;
  }

  function getPreviewImage(card, cfg) {
    const layout = String(cfg.layoutStyle || cfg.layout || "landscape").trim();
    if (layout === "portrait") return cfg.imgUrlPortrait || cfg.imgUrl || cardText(card, ["imageUrl", "名片圖檔"]);
    if (layout === "square") return cfg.imgUrlSquare || cfg.imgUrl || cardText(card, ["imageUrl", "名片圖檔"]);
    return cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlPortrait || cfg.imgUrlSquare || cardText(card, ["imageUrl", "名片圖檔"]);
  }

  function getPreviewRatio(cfg) {
    const layout = String(cfg.layoutStyle || cfg.layout || "landscape").trim();
    if (layout === "portrait") return String(cfg.imgRatioPortrait || "2:3").replace(":", "/");
    if (layout === "square") return "1/1";
    return String(cfg.imgRatioLandscape || "20:13").replace(":", "/");
  }

  function renderInboxECardPreview(card, options = {}) {
    const cfg = getCardConfig(card);
    const img = getPreviewImage(card, cfg);
    const ratio = getPreviewRatio(cfg);
    const name = cardText(card, ["name", "姓名"], "未命名名片");
    const company = cardText(card, ["companyName", "公司名稱"]);
    const title = cardText(card, ["title", "職稱"]);
    const mobile = cardText(card, ["mobile", "手機號碼", "手機"]);
    const desc = String(cfg.desc || cardText(card, ["services", "服務項目", "notes", "備註"])).trim();
    const buttons = Array.isArray(cfg.buttons) ? cfg.buttons.slice(0, 4) : [];
    const compact = options.compact === true;
    const imageHtml = img
      ? '<div class="relative w-full overflow-hidden rounded-2xl bg-slate-100 border border-slate-100">' +
          '<img src="' + escapeHTML(img) + '" class="block w-full object-cover" style="aspect-ratio:' + escapeHTML(ratio) + ';" alt="business card cover">' +
        '</div>'
      : '<div class="w-full rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400" style="aspect-ratio:' + escapeHTML(ratio) + ';"><span class="material-symbols-outlined text-[42px]">badge</span></div>';
    const buttonHtml = buttons.map(button => {
      const label = String(button && (button.l || button.label || "") || "").trim();
      if (!label) return "";
      const color = safeCssColor(button.c || button.color || "#06C755");
      const url = safeCardUrl(button.u || button.url || button.uri || "");
      const attrs = url ? ' href="' + escapeHTML(url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()"' : "";
      const tag = url ? "a" : "div";
      return '<' + tag + attrs + ' class="block w-full rounded-2xl py-3 text-center text-[14px] font-black text-white shadow-sm active:scale-95 transition-transform" style="background:' + escapeHTML(color) + ';">' + escapeHTML(label) + '</' + tag + '>';
    }).join("");
    return (
      '<div class="overflow-hidden rounded-3xl bg-white border border-slate-100 shadow-sm">' +
        imageHtml +
        '<div class="' + (compact ? 'p-4' : 'p-5') + ' text-center">' +
          '<div class="text-[22px] font-black text-slate-900 leading-tight">' + escapeHTML(name) + '</div>' +
          ([company, title, mobile].filter(Boolean).length ? '<div class="mt-2 text-[13px] font-bold text-slate-500 leading-relaxed">' + escapeHTML([company, title, mobile].filter(Boolean).join(" / ")) + '</div>' : '') +
          (desc ? '<div class="mt-4 text-[14px] font-bold leading-relaxed text-slate-600 whitespace-pre-wrap text-left">' + escapeHTML(desc) + '</div>' : '') +
        '</div>' +
        (buttonHtml ? '<div class="px-5 pb-5 grid gap-2">' + buttonHtml + '</div>' : '') +
      '</div>'
    );
  }

  function setTabs(mode) {
    const received = $("inbox-tab-received");
    const sent = $("inbox-tab-sent");
    const active = "bg-white text-slate-900 shadow-sm";
    const idle = "text-slate-500";
    if (received) received.className = `py-3 rounded-xl text-[15px] font-black active:scale-95 transition-all ${mode === "received" ? active : idle}`;
    if (sent) sent.className = `py-3 rounded-xl text-[15px] font-black active:scale-95 transition-all ${mode === "sent" ? active : idle}`;
  }

  function updateTitleUnread(unread) {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = base;
  }

  function base64UrlToUint8Array(value) {
    const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
    const padded = text + "=".repeat((4 - text.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function setPushStatus(text, enabled = false) {
    const status = $("inbox-push-status");
    const btn = $("btn-enable-inbox-push");
    if (status) {
      status.textContent = text;
      status.className = `text-[12px] font-bold mt-1 truncate ${enabled ? "text-emerald-600" : "text-slate-500"}`;
    }
    if (btn) {
      btn.textContent = enabled ? "已開啟" : "開啟";
      btn.classList.toggle("bg-emerald-600", enabled);
      btn.classList.toggle("bg-slate-900", !enabled);
    }
  }

  function playInboxSound() {
    if (localStorage.getItem("inboxSoundEnabled") !== "1") return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = window.inboxAudioContext || new AudioContext();
      window.inboxAudioContext = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      console.warn("[inbox] sound skipped:", e.message || e);
    }
  }

  async function registerInboxServiceWorker() {
    if (!("serviceWorker" in navigator)) throw new Error("此瀏覽器不支援背景通知");
    return await navigator.serviceWorker.register("./sw.js");
  }

  async function refreshPushStatus() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushStatus("此瀏覽器不支援背景通知，可使用站內提示音", false);
      return;
    }
    if (Notification.permission === "denied") {
      setPushStatus("通知被瀏覽器封鎖，請到網站設定重新允許", false);
      return;
    }
    if (Notification.permission !== "granted") {
      setPushStatus("尚未開啟，點擊後會詢問通知權限", false);
      return;
    }
    try {
      const reg = await registerInboxServiceWorker();
      const sub = await reg.pushManager.getSubscription();
      setPushStatus(sub ? "已開啟手機通知與站內提示音" : "通知權限已允許，尚未完成訂閱", !!sub);
    } catch (e) {
      setPushStatus("通知初始化失敗：" + (e.message || e), false);
    }
  }

  window.enableInboxNotifications = async function (btn) {
    if (!canUseInbox()) return window.showToast?.("請先登入後再開啟通知", true);
    const oldText = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "設定中...";
      btn.classList.add("opacity-70");
    }
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        localStorage.setItem("inboxSoundEnabled", "1");
        playInboxSound();
        setPushStatus("此瀏覽器不支援背景通知，已開啟站內提示音", false);
        return;
      }
      const permission = await Notification.requestPermission();
      localStorage.setItem("inboxSoundEnabled", "1");
      playInboxSound();
      if (permission !== "granted") {
        setPushStatus("尚未允許通知，已開啟站內提示音", false);
        return;
      }
      const cfg = await window.fetchAPI("getWebPushConfig", {}, true);
      if (!cfg?.enabled || !cfg?.publicKey) {
        setPushStatus(cfg?.reason || "後台尚未設定 Web Push 金鑰", false);
        window.showToast?.("通知金鑰尚未設定；站內提示音已開啟", true);
        return;
      }
      const reg = await registerInboxServiceWorker();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(cfg.publicKey)
        });
      }
      await window.fetchAPI("saveWebPushSubscription", {
        subscription: sub.toJSON(),
        userAgent: navigator.userAgent
      }, true);
      setPushStatus("已開啟手機通知與站內提示音", true);
      window.showToast?.("通知已開啟");
    } catch (e) {
      setPushStatus("通知設定失敗：" + (e.message || e), false);
      window.showToast?.("通知設定失敗：" + (e.message || e), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove("opacity-70");
        if (oldText && btn.textContent === "設定中...") btn.textContent = oldText;
      }
    }
  };

  window.refreshInboxBadge = async function (options = {}) {
    const button = $("inbox-nav-button");
    const badge = $("inbox-unread-badge");
    if (!button || !badge) return;

    if (!canUseInbox()) {
      button.classList.add("hidden");
      badge.classList.add("hidden");
      window.inboxUnreadCount = 0;
      updateTitleUnread(0);
      return;
    }

    button.classList.remove("hidden");
    try {
      const data = await window.fetchAPI("getInboxCount", {}, true);
      const unread = Number(data?.unread || 0);
      const previous = Number(window.inboxUnreadCount || 0);
      const hasInitialized = window.inboxBadgeInitialized === true;
      window.inboxUnreadCount = unread;
      window.inboxBadgeInitialized = true;

      if (unread > 0) {
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.classList.remove("hidden");
        button.classList.add("has-unread-mail");
      } else {
        badge.classList.add("hidden");
        button.classList.remove("has-unread-mail");
      }
      updateTitleUnread(unread);

      if (options.notify && hasInitialized && unread > previous) {
        const diff = unread - previous;
        playInboxSound();
        window.showToast?.(`你有 ${diff} 封新訊息`);
        if (window.currentPage === "inbox" && window.inboxMode !== "sent") {
          window.loadInbox({ silent: true });
        }
      }
    } catch (e) {
      console.warn("[inbox] badge skipped:", e.message || e);
    }
  };

  function renderEmpty(mode = "received") {
    const list = $("inbox-list");
    if (!list) return;
    const sent = mode === "sent";
    list.innerHTML = `
      <div class="p-8 text-center">
        <div class="w-14 h-14 mx-auto mb-3 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
          <span class="material-symbols-outlined">${sent ? "outbox" : "mail"}</span>
        </div>
        <p class="text-[16px] font-black text-slate-700">${sent ? "尚無寄件紀錄" : "目前沒有訊息"}</p>
        <p class="text-[13px] text-slate-400 font-bold mt-1">${sent ? "你寄出的訊息會保留在這裡，方便追蹤。" : "收到會員訊息、優惠券、課程邀約或回覆時會顯示在這裡。"}</p>
      </div>
    `;
  }

  function renderList(items, mode = "received") {
    const list = $("inbox-list");
    if (!list) return;
    if (!Array.isArray(items) || items.length === 0) {
      renderEmpty(mode);
      return;
    }

    const sent = mode === "sent";
    list.innerHTML = items.map(item => {
      const unread = !sent && item.status !== "read";
      const primaryName = sent ? receiverName(item) : senderName(item);
      const meta = sent ? `寄給：${primaryName}` : `來自：${primaryName}`;
      const icon = sent ? "outbox" : (unread ? "mark_email_unread" : "drafts");
      const statusText = sent ? (item.status === "read" ? "已讀" : "未讀") : "未讀";
      return `
        <button type="button" onclick="window.openInboxItem('${escapeHTML(item.messageId)}')" class="w-full text-left p-4 flex gap-3 active:bg-slate-50 transition-colors">
          <div class="w-10 h-10 rounded-2xl ${unread ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"} flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-[22px]">${icon}</span>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-[12px] font-black ${unread ? "text-blue-600" : "text-slate-400"}">${escapeHTML(typeLabel(item))}</p>
                <h3 class="text-[16px] font-black text-slate-900 leading-snug truncate">${escapeHTML(item.title || "未命名訊息")}</h3>
              </div>
              ${unread || sent ? `<span class="shrink-0 mt-1 rounded-full ${unread ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"} px-2 py-1 text-[11px] font-black">${escapeHTML(statusText)}</span>` : ""}
            </div>
            <p class="text-[13px] text-slate-500 font-bold mt-1 truncate">${escapeHTML(meta)}</p>
            <p class="text-[12px] text-slate-400 font-bold mt-1">${escapeHTML(formatTime(item.createdAt))}</p>
          </div>
        </button>
      `;
    }).join("");
  }

  window.switchInboxBox = function (mode) {
    window.inboxMode = mode === "sent" ? "sent" : "received";
    window.closeInboxDetail();
    setTabs(window.inboxMode);
    window.loadInbox();
  };

  window.loadInbox = async function (options = {}) {
    const list = $("inbox-list");
    if (!list) return;
    const mode = window.inboxMode === "sent" ? "sent" : "received";
    setTabs(mode);
    if (!canUseInbox()) {
      renderEmpty(mode);
      return;
    }

    if (!options.silent) list.innerHTML = '<div class="p-8 text-center text-slate-400 font-bold">載入訊息中...</div>';
    try {
      const action = mode === "sent" ? "listSentInboxItems" : "listInboxItems";
      const items = await window.fetchAPI(action, {}, true);
      window.inboxItems = Array.isArray(items) ? items : [];
      renderList(window.inboxItems, mode);
      await window.refreshInboxBadge();
    } catch (e) {
      list.innerHTML = `<div class="p-8 text-center text-red-500 font-bold">訊息載入失敗：${escapeHTML(e.message || e)}</div>`;
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
    if (open) window.updateInboxPointCostHint?.();
  };

  window.setInboxRecipientMode = function (mode) {
    const canBroadcast = window.hasAdminRights === true || String(window.currentRole || "").toLowerCase() === "admin";
    if (mode === "broadcast" && !canBroadcast) mode = "user";
    const modes = {
      user: {
        button: "inbox-recipient-mode-user",
        placeholder: "輸入姓名、電話或 LINE ID",
        idle: "py-2 rounded-2xl bg-slate-50 text-slate-600 border border-slate-200 text-[13px] font-black active:scale-95"
      },
      course: {
        button: "inbox-recipient-mode-course",
        placeholder: "輸入課程編號，例如 ACT_...",
        idle: "py-2 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 text-[13px] font-black active:scale-95"
      },
      owned: {
        button: "inbox-recipient-mode-owned",
        placeholder: "搜尋自己的已使用客戶，或輸入全部",
        idle: "py-2 rounded-2xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[13px] font-black active:scale-95"
      },
      broadcast: {
        button: "inbox-recipient-mode-broadcast",
        placeholder: "輸入關鍵字篩選跨區用戶，或輸入全部",
        idle: "py-2 rounded-2xl bg-blue-50 text-blue-700 border border-blue-200 text-[13px] font-black active:scale-95"
      }
    };
    const next = modes[mode] ? mode : "user";
    const modeEl = $("inbox-recipient-mode");
    const query = $("inbox-recipient-query");
    const hidden = $("inbox-recipient-id");
    const box = $("inbox-recipient-results");
    if (modeEl) modeEl.value = next;
    if (hidden) hidden.value = "";
    if (box) box.innerHTML = "";
    clearRecipientSelection();
    if (query) {
      query.value = "";
      query.placeholder = next === "course" ? "貼上課程編號，例如 ACT_..." : "輸入姓名、電話或 LINE ID";
    }
    if (query) query.placeholder = modes[next].placeholder;
    const userBtn = $("inbox-recipient-mode-user");
    const courseBtn = $("inbox-recipient-mode-course");
    if (userBtn) userBtn.className = next === "user"
      ? "py-2 rounded-2xl bg-slate-900 text-white text-[13px] font-black active:scale-95"
      : "py-2 rounded-2xl bg-slate-50 text-slate-600 border border-slate-200 text-[13px] font-black active:scale-95";
    if (courseBtn) courseBtn.className = next === "course"
      ? "py-2 rounded-2xl bg-slate-900 text-white text-[13px] font-black active:scale-95"
      : "py-2 rounded-2xl bg-amber-50 text-amber-700 border border-amber-200 text-[13px] font-black active:scale-95";
    const activeClass = "py-2 rounded-2xl bg-slate-900 text-white text-[13px] font-black active:scale-95";
    Object.keys(modes).forEach(key => {
      const btn = $(modes[key].button);
      if (!btn) return;
      btn.className = key === next ? activeClass : modes[key].idle;
      if (key === "broadcast") btn.classList.toggle("hidden", !canBroadcast);
    });
    window.refreshInboxRecipientAudienceHint?.(next);
  };

  window.refreshInboxRecipientAudienceHint = async function (mode) {
    const hint = $("inbox-recipient-audience-hint");
    if (!hint) return;
    if (mode === "user") {
      hint.classList.add("hidden");
      hint.innerHTML = "";
      return;
    }
    if (mode === "course") {
      hint.className = "mb-2 rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-700";
      hint.innerHTML = "貼上課程編號後搜尋，系統會顯示這堂課可推播的已報名學員人數。";
      hint.classList.remove("hidden");
      return;
    }
    const label = mode === "broadcast" ? "跨區合格可推播人數" : "我的已用戶合格可推播人數";
    hint.className = "mb-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-[13px] font-bold text-blue-700";
    hint.textContent = `${label}：統計中...`;
    hint.classList.remove("hidden");
    try {
      const rows = await window.fetchAPI("searchInboxRecipients", { keyword: "全部", recipientMode: mode }, true);
      const row = Array.isArray(rows) ? rows[0] : null;
      const countText = row?.badge || "0 位";
      hint.textContent = `${label}：${countText}`;
    } catch (e) {
      hint.className = "mb-2 rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-600";
      hint.textContent = `${label}：無法取得`;
    }
  };

  window.searchInboxRecipients = async function () {
    const query = $("inbox-recipient-query")?.value?.trim() || "";
    const mode = $("inbox-recipient-mode")?.value || "user";
    const box = $("inbox-recipient-results");
    const hidden = $("inbox-recipient-id");
    if (hidden) hidden.value = "";
    if (!box) return;
    if (query.length < 2) {
      box.innerHTML = '<div class="text-[13px] text-slate-400 font-bold px-1">請至少輸入 2 個字搜尋</div>';
      return;
    }

    box.innerHTML = '<div class="text-[13px] text-slate-400 font-bold px-1">搜尋中...</div>';
    try {
      const rows = await window.fetchAPI("searchInboxRecipients", { keyword: query, recipientMode: mode, listMode: isGroupRecipientMode(mode) ? "select" : "" }, true);
      const list = Array.isArray(rows) ? rows : [];
      const hint = $("inbox-recipient-audience-hint");
      if (hint && ["course", "owned", "broadcast"].includes(mode) && list[0]?.badge) {
        const label = mode === "course" ? "本課程合格可推播人數" : (mode === "broadcast" ? "跨區合格可推播人數" : "我的已用戶合格可推播人數");
        hint.className = "mb-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-[13px] font-bold text-blue-700";
        hint.textContent = `${label}：${list[0].badge}`;
        hint.classList.remove("hidden");
      }
      if (!list.length) {
        box.innerHTML = '<div class="text-[13px] text-red-400 font-bold px-1">找不到符合的收件人</div>';
        return;
      }
      if (isGroupRecipientMode(mode)) {
        box.innerHTML = renderSelectableRecipients(list, mode, query);
        return;
      }
      box.innerHTML = list.map(user => `
        <button type="button" onclick="window.selectInboxRecipient('${escapeHTML(user.userId)}','${escapeHTML(user.name)}')" class="w-full p-3 rounded-2xl bg-slate-50 border border-slate-100 text-left active:scale-[0.99] transition-all">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[15px] font-black text-slate-900 truncate">${escapeHTML(user.name || "未命名")}</p>
              <p class="text-[12px] text-slate-500 font-bold mt-1 truncate">${escapeHTML(user.subtitle || [user.phone, user.industry].filter(Boolean).join(" / ") || user.userId)}</p>
            </div>
            <span class="shrink-0 rounded-full ${user.type === "course" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"} px-2 py-1 text-[11px] font-black">${escapeHTML(user.badge || "可收信")}</span>
          </div>
        </button>
      `).join("");
    } catch (e) {
      box.innerHTML = `<div class="text-[13px] text-red-400 font-bold px-1">搜尋失敗：${escapeHTML(e.message || e)}</div>`;
    }
  };

  window.toggleInboxRecipientSelection = function (userId, checked) {
    const uid = String(userId || "").trim();
    if (!uid) return;
    if (checked) selectedInboxRecipients.add(uid);
    else selectedInboxRecipients.delete(uid);
    updateSelectedRecipientNotice();
  };

  window.toggleAllInboxRecipients = function (checked) {
    selectableInboxRecipients.forEach((_user, uid) => {
      if (checked) selectedInboxRecipients.add(uid);
      else selectedInboxRecipients.delete(uid);
    });
    document.querySelectorAll('[data-inbox-recipient-id]').forEach(input => {
      input.checked = !!checked;
    });
    updateSelectedRecipientNotice();
  };

  window.selectInboxRecipient = function (userId, name) {
    const hidden = $("inbox-recipient-id");
    const query = $("inbox-recipient-query");
    const box = $("inbox-recipient-results");
    clearRecipientSelection();
    if (hidden) hidden.value = userId || "";
    if (query) query.value = name || userId || "";
    if (box) box.innerHTML = `<div class="rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 px-3 py-2 text-[13px] font-black">已選擇：${escapeHTML(name || userId)}</div>`;
  };

  function inboxMessageCost(messageType) {
    return 10;
  }

  window.updateInboxPointCostHint = function () {
    const type = $("inbox-message-type")?.value || "message";
    const cost = inboxMessageCost(type);
    const hint = $("inbox-point-cost-hint");
    if (hint) hint.textContent = type === "coupon"
      ? `優惠券寄出會扣除 ${cost} 點，且只能核銷一次。`
      : `本次送出會扣除 ${cost} 點。`;
    const btn = $("btn-send-inbox-message");
    if (btn) btn.textContent = type === "coupon" ? `送出優惠券（扣 ${cost} 點）` : `送出訊息（扣 ${cost} 點）`;
    updateSelectedRecipientNotice();
  };

  window.sendInboxMessage = async function (btn) {
    const receiverUserId = $("inbox-recipient-id")?.value?.trim() || "";
    const receiverQuery = $("inbox-recipient-query")?.value?.trim() || "";
    const recipientMode = $("inbox-recipient-mode")?.value || "user";
    const messageType = $("inbox-message-type")?.value || "message";
    const title = $("inbox-message-title")?.value?.trim() || "";
    const body = $("inbox-message-body")?.value?.trim() || "";
    const cost = inboxMessageCost(messageType);
    const selectedUserIds = isGroupRecipientMode(recipientMode) ? selectedInboxRecipientIds() : [];
    if (!receiverUserId && !receiverQuery) return window.showToast?.("請先選擇收件人", true);
    if (!title) return window.showToast?.("請輸入標題", true);
    if (!body) return window.showToast?.("請輸入內容", true);

    const oldText = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "送出中...";
      btn.classList.add("opacity-70");
    }
    try {
      const res = await window.fetchAPI("sendInboxMessage", { receiverUserId, receiverQuery, recipientMode, selectedUserIds, messageType, title, body }, true);
      const sentCount = Number((res && res.data && res.data.sentCount) || 1);
      const totalCost = Number((res && res.data && res.data.totalCost) || cost);
      window.showToast?.(`${messageType === "coupon" ? "優惠券" : "訊息"}已送出 ${sentCount} 位，扣除 ${totalCost} 點`);
      window.pointWalletData = null;
      window.refreshPointBalanceBadge?.();
      ["inbox-message-title", "inbox-message-body", "inbox-recipient-id", "inbox-recipient-query"].forEach(id => {
        const el = $(id);
        if (el) el.value = "";
      });
      const results = $("inbox-recipient-results");
      if (results) results.innerHTML = "";
      clearRecipientSelection();
      window.updateInboxPointCostHint?.();
      window.toggleInboxComposer(false);
      window.switchInboxBox("sent");
    } catch (e) {
      window.showToast?.("送出失敗：" + (e.message || e), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || `送出訊息（扣 ${cost} 點）`;
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
      await window.loadInbox({ silent: true });
    } catch (e) {
      window.showToast?.("訊息開啟失敗：" + (e.message || e), true);
    }
  };

  function renderDetail(item) {
    const panel = $("inbox-detail-panel");
    if (!panel) return;
    const sentView = item.viewerRole === "sender" || window.inboxMode === "sent";
    window.currentInboxItem = item;
    $("inbox-detail-type").textContent = typeLabel(item);
    $("inbox-detail-title").textContent = item.title || "未命名訊息";
    $("inbox-detail-meta").textContent = `${sentView ? "寄給：" + receiverName(item) : "來自：" + senderName(item)} · ${formatTime(item.createdAt)}`;
    $("inbox-detail-body").textContent = item.body || "沒有內文";
    renderCouponPanel(item, sentView);

    const cardBox = $("inbox-sender-card");
    if (!cardBox) return;
    cardBox.classList.remove("hidden");
    if (sentView) {
      cardBox.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400">
            <span class="material-symbols-outlined">person</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-[15px] font-black text-slate-900 truncate">${escapeHTML(receiverName(item))}</p>
            <p class="text-[13px] text-slate-500 font-bold mt-1 leading-relaxed">${escapeHTML(receiverSubtitle(item) || "收件人資料尚未完整")}</p>
            <p class="text-[12px] text-slate-400 font-bold mt-3">讀取狀態：${item.status === "read" ? "對方已讀" : "對方尚未讀取"}</p>
          </div>
        </div>
      `;
    } else {
      renderSenderCard(cardBox, item);
    }
    panel.classList.remove("hidden");
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderCouponPanel(item, sentView) {
    const panel = $("inbox-coupon-panel");
    if (!panel) return;
    if (item?.messageType !== "coupon") {
      panel.classList.add("hidden");
      panel.innerHTML = "";
      return;
    }

    const meta = couponMeta(item);
    const redeemed = meta.status === "redeemed";
    const redeemedText = meta.redeemedAt ? formatTime(meta.redeemedAt) : "";
    panel.classList.remove("hidden");
    panel.innerHTML = `
      <div class="rounded-3xl border ${redeemed ? "border-slate-200 bg-slate-50" : "border-rose-100 bg-rose-50"} p-4">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[12px] font-black ${redeemed ? "text-slate-500" : "text-rose-600"}">優惠券狀態</p>
            <h4 class="mt-1 text-[18px] font-black ${redeemed ? "text-slate-600" : "text-slate-900"}">${redeemed ? "已核銷" : "可使用"}</h4>
            <p class="mt-1 text-[13px] font-bold text-slate-500 leading-relaxed">
              ${redeemed ? `核銷時間：${escapeHTML(redeemedText || "已完成")}` : "請到店出示此畫面，由現場人員確認後核銷。"}
            </p>
          </div>
          <span class="material-symbols-outlined text-[32px] ${redeemed ? "text-slate-300" : "text-rose-500"}">${redeemed ? "verified" : "redeem"}</span>
        </div>
        ${!sentView && !redeemed ? `
          <button id="btn-redeem-inbox-coupon" type="button" onclick="window.redeemInboxCoupon(this)" class="mt-4 w-full py-3.5 rounded-2xl bg-rose-500 text-white text-[15px] font-black shadow-lg shadow-rose-500/20 active:scale-95 transition-all">
            現場核銷優惠券
          </button>
          <p class="mt-2 text-center text-[12px] font-bold text-rose-500">核銷後不能復原，也不能再次使用。</p>
        ` : ""}
        ${sentView && !redeemed ? `<p class="mt-3 rounded-2xl bg-white px-3 py-2 text-[13px] font-bold text-slate-500">對方尚未核銷。</p>` : ""}
      </div>
    `;
  }

  window.redeemInboxCoupon = async function (btn) {
    const item = window.currentInboxItem;
    if (!item?.messageId || item.messageType !== "coupon") return;
    if (isCouponRedeemed(item)) return window.showToast?.("這張優惠券已核銷", true);
    if (!confirm("確認現場核銷這張優惠券？核銷後只能使用一次，不能復原。")) return;

    const oldText = btn ? btn.textContent : "";
    if (btn) {
      btn.disabled = true;
      btn.textContent = "核銷中...";
      btn.classList.add("opacity-70");
    }
    try {
      const updated = await window.fetchAPI("redeemInboxCoupon", { messageId: item.messageId }, true);
      window.currentInboxItem = updated || { ...item, couponStatus: "redeemed", couponRedeemedAt: new Date().toISOString() };
      renderDetail(window.currentInboxItem);
      await window.loadInbox({ silent: true });
      window.showToast?.("優惠券已核銷");
    } catch (e) {
      window.showToast?.("核銷失敗：" + (e.message || e), true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = oldText || "現場核銷優惠券";
        btn.classList.remove("opacity-70");
      }
    }
  };

  function renderSenderCard(cardBox, item) {
    const card = item.senderCard;
    const subtitle = senderSubtitle(item);
    const cardImage = getCardImage(card);
    cardBox.innerHTML = `
      <div class="space-y-4">
        ${card ? `
          <div role="button" tabindex="0" onclick="window.openInboxCardPreview(window.currentInboxItem?.senderCard)" class="block w-full text-left active:scale-[0.99] transition-transform cursor-pointer">
            ${renderInboxECardPreview(card, { compact: true })}
          </div>
        ` : ""}
        <div class="flex items-start gap-3">
          ${cardImage ? `<img src="${escapeHTML(cardImage)}" class="w-14 h-14 rounded-2xl object-cover border border-slate-200 bg-white">` : '<div class="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-slate-400"><span class="material-symbols-outlined">badge</span></div>'}
          <div class="min-w-0 flex-1">
            <p class="text-[15px] font-black text-slate-900 truncate">${escapeHTML(senderName(item))}</p>
            <p class="text-[13px] text-slate-500 font-bold mt-1 leading-relaxed">${escapeHTML(subtitle || "對方資料尚未完整")}</p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button type="button" onclick="window.replyInboxMessage()" class="px-4 py-2 rounded-2xl bg-[#06C755] text-white text-[13px] font-black active:scale-95 transition-all">回覆</button>
              ${card?.rowId ? `<button type="button" onclick="window.openInboxSenderCard('${escapeHTML(card.rowId)}')" class="px-4 py-2 rounded-2xl bg-slate-900 text-white text-[13px] font-black active:scale-95 transition-all">${cardImage ? "預覽名片" : "查看名片"}</button>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.openInboxSenderCard = async function (rowId) {
    if (!rowId) return;
    try {
      const currentCard = window.currentInboxItem?.senderCard;
      if (currentCard && String(currentCard.rowId || currentCard.id || "") === String(rowId)) {
        window.openInboxCardPreview(currentCard);
        return;
      }
      if (currentCard) {
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
      window.showToast?.("打開名片失敗", true);
    }
  };

  window.openInboxCardPreview = function (card) {
    if (!card) return window.showToast?.("找不到名片資料", true);
    let modal = $("inbox-card-preview-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "inbox-card-preview-modal";
      modal.className = "hidden fixed inset-0 z-[2200] bg-slate-900/70 backdrop-blur-sm p-4 flex items-center justify-center overflow-y-auto";
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <div class="w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 my-6">
        <div class="p-4 flex items-center justify-between border-b border-slate-100">
          <div>
            <p class="text-[16px] font-black text-slate-900">${escapeHTML(card.name || card["姓名"] || "名片預覽")}</p>
            <p class="text-[12px] text-slate-400 font-bold mt-0.5">${escapeHTML([card.companyName || card["公司名稱"], card.title || card["職稱"]].filter(Boolean).join(" / "))}</p>
          </div>
          <button type="button" onclick="document.getElementById('inbox-card-preview-modal')?.classList.add('hidden')" class="w-9 h-9 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center active:scale-90">
            <span class="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div class="bg-slate-50 p-3 max-h-[70vh] overflow-y-auto">
          ${renderInboxECardPreview(card)}
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
    if (!card || typeof window.openCardDetail !== "function") return window.showToast?.("找不到名片資料", true);
    if (typeof window.goPage === "function") window.goPage("card");
    setTimeout(() => window.openCardDetail(card), 80);
  };

  window.replyInboxMessage = function () {
    const item = window.currentInboxItem;
    if (!item) return;
    const senderId = item.senderUserId || item.senderSnapshot?.lineId || item.senderCard?.lineId || item.senderCard?.userId || "";
    if (!senderId) return window.showToast?.("找不到對方帳號，無法回覆", true);
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

  function startInboxPolling() {
    if (window.inboxPollTimer) return;
    window.inboxPollTimer = setInterval(() => {
      if (canUseInbox()) window.refreshInboxBadge({ notify: true });
    }, 60000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.setInboxRecipientMode?.("user");
    setTimeout(() => window.refreshInboxBadge(), 1800);
    setTimeout(refreshPushStatus, 2200);
    startInboxPolling();
    const params = new URLSearchParams(location.search);
    if (params.get("open") === "inbox") {
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        if (typeof window.goPage === "function" && canUseInbox()) {
          clearInterval(timer);
          window.goPage("inbox");
        } else if (tries > 20) {
          clearInterval(timer);
        }
      }, 500);
    }
  });

  window.addEventListener("focus", () => {
    if (canUseInbox()) window.refreshInboxBadge({ notify: true });
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && canUseInbox()) window.refreshInboxBadge({ notify: true });
  });

  navigator.serviceWorker?.addEventListener?.("message", event => {
    if (event.data?.type === "OPEN_INBOX" && typeof window.goPage === "function") {
      window.goPage("inbox");
    }
  });
})();
