// Already-shared HTTPS email links redirect directly to Gmail, without a chooser.
(function() {
  'use strict';
  const $ = id => document.getElementById(id);
  $('back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.replace('./');
  });
  function invalid() {
    $('compose').hidden = true;
    $('gmail').removeAttribute('href');
    $('error').hidden = false;
    $('error').textContent = '無法確認收件人信箱，請返回名片重新開啟電子郵件按鈕。';
  }
  function render() {
    if (location.hash.length > 1200) return invalid();
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.getAll('to').length !== 1 || [...params.keys()].some(k => k !== 'to')) return invalid();
    const target = window.CardLinks?.emailComposeUrl(params.get('to'));
    if (!target) return invalid();
    $('error').hidden = true;
    $('compose').hidden = false;
    $('gmail').href = target;
    $('status').textContent = '正在開啟 Gmail 網頁，尚未寄出信件。';
    try { location.replace(target); }
    catch { $('status').textContent = '瀏覽器未允許自動跳轉，請點「直接開啟 Gmail」。'; }
  }
  window.addEventListener('hashchange', render);
  render();
})();
