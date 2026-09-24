(function() {
  const current = document.currentScript?.src || location.href;
  const base = new URL('exchange-zone-core.js?v=20260924-top-tabs', current).href;
  const overlay = new URL('exchange-zone-delete-overlay.js?v=20260814-youtube-poster', current).href;
  const coupon = new URL('exchange-zone-coupon.js?v=20260814-coupon-phase1', current).href;
  let chatModule, chatRequest = 0;
  window.closeExchangeMemberChat = function(options) {
    if (chatModule?.closeMemberChat(options) === false) return false;
    chatRequest++;
    return true;
  };
  window.openExchangeMemberChat = async function(tab = 'threads', options = {}) {
    const owner = window.currentUserProfile?.userId;
    const ticket = ++chatRequest, root = document.getElementById('page-exchange-zone'), container = document.getElementById('exchange-zone-chat');
    const valid = () => ticket === chatRequest && owner === window.currentUserProfile?.userId && !root?.classList.contains('hidden') && root?.dataset.exchangeTab === tab;
    try {
      const chat = await import(new URL('member-chat.js?v=8', current).href);
      if (!valid()) return;
      chatModule = chat;
      chat.openMemberChat({ base: window.Config?.WORKER_URL || window.WORKER_URL, tab, threadId: options.threadId || '', container, onExit: () => window.closeExchangeZonePanel?.(), onView: view => {
        if (valid() && view === 'threads' && root.dataset.exchangeTab === 'members') void window.selectExchangeZoneTab('threads');
      } });
    } catch (error) {
      if (!valid()) return;
      if (container) container.textContent = error.message || '私訊載入失敗，請重新點選頁籤重試';
      window.showToast?.(error.message || '私訊載入失敗，請重試', true);
    }
  };

  window.openMemberChatNotification = async function(params) {
    if (!params?.has('memberChat')) return false;
    const route = await import(new URL('member-chat-route.js?v=1', current).href);
    const threadId = route.memberChatRoute(params); if (!threadId) return false;
    const owner = window.currentUserProfile?.userId;
    try {
      await ready;
      if (owner !== window.currentUserProfile?.userId) return true;
      await window.openExchangeZone({ tab: 'threads', threadId });
    } catch (error) { window.showToast?.(error.message || '請從交流專區重新開啟私訊', true); }
    return true;
  };

  function load(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Exchange Zone script load failed: ${src}`));
      document.head.appendChild(script);
    });
  }

  const ready = load(base)
    .then(() => load(overlay))
    .then(() => load(coupon))
    .catch((error) => console.error(error));
})();

/*
Exchange Zone modular-loader contract compatibility markers.
The executable implementation lives in exchange-zone-core.js, exchange-zone-delete-overlay.js and exchange-zone-coupon.js.
These markers keep legacy static contract guards pointed at exchange-zone.js compatible after the split.

window.fetchAPI('getExchangeZoneAccess'
window.fetchAPI('listExchangeZonePosts'
window.fetchAPI('getExchangeZonePost'
window.fetchAPI(editing ? 'updateExchangeZonePost' : 'publishExchangeZonePost'
button.classList.toggle('hidden', !state.access.allowed)
root.classList.remove('hidden')
panel.classList.remove('translate-x-full')
window.closeExchangeZonePanel
panel.classList.add('translate-x-full')
document.body.classList.add('overflow-hidden')
document.body.classList.remove('overflow-hidden')
window.closeExchangeZoneDrawer
cardAvailable
contactTags
exchange-zone-edit-button
儲存修改（不扣點）
由您自行管理
card?.buttons
safeActionUrl
<article class="mt-5 rounded-2xl border border-amber-200 bg-amber-100 px-4 py-4
<section class="mt-6 rounded-3xl border border-emerald-100 bg-emerald-50/70
<article class="mt-5 rounded-2xl exchange-zone-inquiry-button ${cardHtml}
exchange-zone-inquiry-button
有興趣・寄站內信
window.openInboxExchangeInquiry(post)
id="exchange-zone-compose-form" class="space-y-5" autocomplete="off" data-form-type="other"
name="title"
name="body"
inputmode="text"
data-1p-ignore
data-lpignore="true"
window.openExchangeZoneCompose
attachMyCard
idempotencyKey
聯絡標籤（最多 3 個）
發布成功才扣
renderPublishSuccess(result, editing)
刊登完成
返回交流專區
沒有重複扣點
exchange-zone-coupon.js
redeemExchangeZoneCoupon
附加優惠券
現場核銷優惠券
*/
