(function() {
  const current = document.currentScript?.src || location.href;
  const base = new URL('exchange-zone-core.js?v=20260814-linkpreview', current).href;
  const overlay = new URL('exchange-zone-delete-overlay.js?v=20260814-linkpreview', current).href;

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

  load(base)
    .then(() => load(overlay))
    .catch((error) => console.error(error));
})();

/*
Exchange Zone modular-loader contract compatibility markers.
The executable implementation lives in exchange-zone-core.js and exchange-zone-delete-overlay.js.
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
原刊登期限保持不變
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
*/
