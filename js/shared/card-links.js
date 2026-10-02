// Pure, shared card-contact rules. No request/user state is stored here.
(function(root) {
  'use strict';
  const fields = ['title', 'desc', 'descColor', 'descAlign', 'buttons'];
  const text = value => String(value ?? '').trim();
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
  const clone = value => JSON.parse(JSON.stringify(value));
  function parse(value) {
    try {
      const result = typeof value === 'string' ? JSON.parse(value) : value;
      return result && typeof result === 'object' && !Array.isArray(result) ? clone(result) : {};
    } catch { return {}; }
  }
  function uri(value) {
    let raw = text(value).replace(/[\u200B-\u200D\uFEFF]/g, '');
    if (!raw || raw.length > 1000 || /[<>\x00-\x1f]/.test(raw)) return '';
    if (/^(mailto:)?[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(raw) && !/^https?:/i.test(raw)) {
      return 'mailto:' + raw.replace(/^mailto:/i, '');
    }
    if (/^tel:/i.test(raw) || /^\+?[\d ()+.\-]{7,}$/.test(raw)) {
      const phone = raw.replace(/^tel:/i, '').replace(/[ ()\.\-]/g, '').replace(/^00886/, '+886');
      return /^\+?\d{7,16}$/.test(phone) ? 'tel:' + phone : '';
    }
    if (/\s/.test(raw)) return '';
    if (/^line:\/\//i.test(raw)) return raw;
    if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) raw = 'https://' + raw;
    try {
      const url = new URL(raw);
      return /^https?:$/.test(url.protocol) && url.hostname.includes('.') && !url.username && !url.password && url.href.length <= 1000 ? url.href : '';
    } catch { return ''; }
  }
  function normalize(buttons, strict = false) {
    const result = [];
    for (const [index, b] of (Array.isArray(buttons) ? buttons : []).entries()) {
      const label = text(b?.l || b?.label || b?.text || b?.title);
      const url = uri(b?.u || b?.url || b?.uri || b?.link);
      if (!label || !url || label.length > 40) {
        if (strict) throw new Error('第 ' + (index + 1) + ' 顆按鈕請填寫 1–40 字名稱與有效網址、電話或 Email。');
        continue;
      }
      // Do not silently remove an intentional duplicate during editing/saving.
      result.push({ l: label, u: url, c: /^#[0-9a-f]{6}$/i.test(b?.c || b?.color || '') ? (b.c || b.color) : '#06C755' });
    }
    return result;
  }
  function recognized(card) {
    const result = [];
    const read = keys => { for (const key of keys) if (card?.[key]) return card[key]; return ''; };
    const parts = value => (Array.isArray(value) ? value : text(value).split(/[\n,，;；]+/)).map(text).filter(Boolean);
    const add = (l, value, c = '#06C755') => { const u = uri(value); if (u) result.push({ l, u, c }); };
    parts(read(['mobile','手機號碼','手機','phone'])).forEach(v => add('行動電話', 'tel:' + v, '#3B82F6'));
    parts(read(['officePhone','office_phone','companyPhone','company_phone','公司電話','tel'])).forEach(v => add('公司電話', 'tel:' + v, '#0891B2'));
    parts(read(['email','Email','電子郵件'])).forEach(v => add('電子郵件', v.replace(/^mailto:/i, ''), '#F59E0B'));
    parts(read(['website','websiteUrl','website_url','companyUrl','公司網址','Website'])).forEach(v => add('官方網站', v, '#64748B'));
    const address = text(read(['address','companyAddress','company_address','公司地址','地址']));
    if (address) add('地圖導航', /^https?:\/\//i.test(address) ? address : 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(address), '#1E293B');
    let socials = read(['socials','socials_json','社群帳號','social']);
    if (typeof socials === 'string') { try { socials = JSON.parse(socials); } catch { socials = [{ t: 'LINE', u: socials }]; } }
    if (socials && !Array.isArray(socials) && typeof socials === 'object') socials = Object.entries(socials).map(([t,v]) => typeof v === 'object' ? { t, ...v } : { t, u:v });
    if (Array.isArray(socials)) socials.forEach(v => add(text(v?.t || v?.type || v?.platform || v?.name) || '社群連結', v?.u || v?.url || v?.uri || v?.link || v?.value));
    // Only use actual saved URLs, never manufacture a LINE invitation from an ID.
    for (const [keys,label] of [[['lineUrl','line_url'],'加LINE好友'], [['bookingUrl','booking_url'],'預約表單'], [['shopUrl','shop_url'],'線上商城'], [['qrUrl','qr_url','decodedQrUrl'],'QR 連結']]) {
      const value = read(keys); if (/^(https?:\/\/|line:\/\/)/i.test(text(value))) add(label, value);
    }
    return unique(normalize(result));
  }
  function project(config, card, enabled) {
    const cfg = parse(config);
    if (!enabled) return cfg;
    if (!cfg._cardLinksEditing && cfg.contactLinksV2) Object.assign(cfg, clone(cfg.contactLinksV2));
    if (!Array.isArray(cfg.buttons) && !Array.isArray(cfg.footerBtns)) cfg.buttons = recognized(card);
    else {
      cfg.buttons = normalize(cfg.buttons || cfg.footerBtns);
      // First upgrade completes existing contacts without rewriting the legacy snapshot.
      // Once reviewed/saved, explicit edits and deletions are authoritative.
      if (!cfg.contactLinksV2 && !cfg._cardLinksEditing && cfg.buttons.length) cfg.buttons = mergeRecognized(cfg.buttons, card);
    }
    return cfg;
  }
  function unique(buttons) { const seen = new Set(); return buttons.filter(b => !seen.has(b.u) && seen.add(b.u)); }
  function mergeRecognized(buttons, card) {
    const current = normalize(buttons), seen = new Set(current.map(b => b.u));
    return [...current, ...recognized(card).filter(b => !seen.has(b.u))];
  }
  function saveConfig(previous, submitted, enabled) {
    const before = parse(previous), next = parse(submitted);
    const isV2 = next._cardLinksEditing === 'v2';
    const protectedWrite = !!before.contactLinksV2 || isV2;
    const revision = Number(before._cardLinksRevision || 0);
    if (protectedWrite && (!Number.isSafeInteger(revision) || revision < 0 || Number(next._cardLinksRevision || 0) !== revision)) {
      throw new Error('名片已在其他頁面更新，請重新開啟再編輯；本次沒有覆蓋資料。');
    }
    if (isV2 && !enabled) throw new Error('新版名片目前已切回舊版，草稿仍保留，請重新開啟後再儲存。');
    const merged = { ...before, ...next };
    delete merged._cardLinksEditing;
    // A legacy editor may change its own fields, but never the v2 snapshot.
    if (before.contactLinksV2) merged.contactLinksV2 = before.contactLinksV2;
    else delete merged.contactLinksV2;
    if (isV2) {
      merged.contactLinksV2 = { ...(before.contactLinksV2 || {}) };
      fields.forEach(key => { if (own(next, key)) merged.contactLinksV2[key] = clone(next[key]); });
      merged.contactLinksV2.buttons = normalize(next.buttons, true);
      const snapshot = merged.contactLinksV2;
      const contentBytes = new TextEncoder().encode(JSON.stringify({title:snapshot.title,desc:snapshot.desc,rows:flexRows(snapshot.buttons)})).byteLength;
      if (contentBytes > 22000 || text(snapshot.title).length > 2000 || text(snapshot.desc).length > 2000) throw new Error('名片內容超過 LINE 訊息容量（標題及說明各最多 2000 字），請縮短文字或網址再儲存。');
      // Keep the old visual snapshot untouched for immediate rollback.
      fields.forEach(key => { if (own(before, key)) merged[key] = before[key]; else delete merged[key]; });
    }
    if (protectedWrite) merged._cardLinksRevision = revision + 1;
    return merged;
  }
  function flexRows(buttons) {
    const items = normalize(buttons).map(b => ({
      type:'button', style:'primary', color:b.c, height:'sm', flex:1,
      action: b.u.startsWith('mailto:')
        ? { type:'clipboard', label:b.l, clipboardText:b.u.slice(7) }
        : { type:'uri', label:b.l, uri:b.u }
    }));
    const rows = [];
    for (let i=0; i<items.length; i+=2) rows.push({ type:'box', layout:'horizontal', spacing:'sm', contents:items.slice(i,i+2) });
    return rows;
  }
  root.CardLinks = Object.freeze({ parse, uri, normalize, recognized, project, mergeRecognized, saveConfig, flexRows });
})(globalThis);
