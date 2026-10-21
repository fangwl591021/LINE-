(function() {
  'use strict';
  const $ = id => document.getElementById(id);
  $('back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else location.replace('./');
  });
  function invalid() {
    $('compose').hidden = true;
    $('recipient').value = '';
    for (const id of ['mail-app','gmail','outlook']) $(id).removeAttribute('href');
    $('error').hidden = false;
    $('error').textContent = '無法確認收件人信箱，請返回名片重新開啟電子郵件按鈕。';
  }
  let email = '';
  function render() {
    email = '';
    if (location.hash.length > 1200) return invalid();
    const params = new URLSearchParams(location.hash.slice(1));
    if (params.getAll('to').length !== 1 || [...params.keys()].some(k => k !== 'to')) return invalid();
    const targets = window.CardLinks?.emailTargets(params.get('to'));
    if (!targets) return invalid();
    email = targets.email;
    $('recipient').value = email;
    $('error').hidden = true;
    $('compose').hidden = false;
    $('status').textContent = '';
    for (const [id,key] of [['mail-app','app'],['gmail','gmail'],['outlook','outlook']]) $(id).href = targets[key];
  }
  $('mail-app').addEventListener('click', () => {
    $('status').textContent = '已請求開啟郵件 App；若沒有反應，可改用 Gmail 或 Outlook 網頁。尚未寄出信件。';
  });
  $('copy').addEventListener('click', async () => {
    if (!email) return;
    const before = email;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(before);
      if (email === before) $('status').textContent = '已複製信箱，尚未寄出信件。';
    } catch {
      if (email !== before) return;
      $('recipient').focus(); $('recipient').select();
      $('status').textContent = '無法自動複製，已選取信箱，請長按或使用複製指令。';
    }
  });
  window.addEventListener('hashchange', render);
  render();
})();
