(function(root) {
  'use strict';
  async function mode(workerUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(String(workerUrl).replace(/\/$/, '') + '/api/card-links/config', {
        cache:'no-store', signal:controller.signal
      });
      if (!response.ok) throw new Error('unavailable');
      const data = await response.json();
      if (typeof data.enabled !== 'boolean') throw new Error('invalid mode');
      return data.enabled;
    } catch {
      throw new Error('無法確認名片版本，請稍後重試；尚未儲存，已輸入的內容仍保留。');
    } finally { clearTimeout(timer); }
  }
  function begin(card, enabled) {
    const config = root.CardLinks.project(card['自訂名片設定'] || card.customConfig || card.custom_config, card, enabled);
    delete config._cardLinksEditing;
    if (enabled) config._cardLinksEditing = 'v2';
    return { rowId:String(card.rowId), enabled, config };
  }
  function submit(session, patch, enabled) {
    if (!session) throw new Error('請重新開啟名片編輯器。');
    if (enabled !== session.enabled) throw new Error('名片版型已切換；草稿仍保留，請重新開啟編輯器後再儲存。');
    // Never obtain a newer revision at save time: that would silently overwrite concurrent edits.
    const config = { ...root.CardLinks.parse(session.config), ...patch };
    config.buttons = root.CardLinks.normalize(config.buttons, true);
    return config;
  }
  root.AdminCardEditor = Object.freeze({ mode, begin, submit });
})(globalThis);
