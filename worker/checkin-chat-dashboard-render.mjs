// Pure, typed display renderer. It cannot award points, send LINE messages or record clicks.
const ID = /^[a-z][a-z0-9_-]{0,39}$/;
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export class CheckinDashboardError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = message => { throw new CheckinDashboardError('INVALID_CONFIG', message); };
const own = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
function string(value, max, label, empty = false) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(label + '格式或長度不正確');
  const result = value.trim(); if (!empty && !result) fail('請填寫' + label); return result;
}
function image(value) {
  const result = string(value, 2000, '圖片網址', true); if (!result) return '';
  let url; try { url = new URL(result); } catch { fail('圖片須使用 HTTPS 網址'); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hash || url.href.length > 2000 || /[\s\\]/.test(result)) fail('圖片須使用不含帳密且不超過 2000 字元的 HTTPS 網址');
  return url.href;
}
export function defaultCheckinDashboardConfig() {
  return { schemaVersion: 1, altText: '會員購物金・前往商城', themeColor: '#078655', pages: [
    { id: 'wallet', kind: 'wallet', title: '會員購物金', body: '把購物金用在喜歡的商品，逛逛可折抵的好店。', heroImageUrl: '', buttons: [
      { id: 'shop', label: '前往商城', target: 'mall' }, { id: 'history', label: '查看購物金明細', target: 'details' }
    ] },
    { id: 'guide', kind: 'info', title: '購物金怎麼用', body: '1. 前往商城，選擇喜歡的商品。\n2. 查看商品可折抵規則與購買方式。\n3. 確認結帳內容，依頁面指引完成購買。\n實際折抵金額以商品與結帳確認為準。', heroImageUrl: '', buttons: [
      { id: 'browse', label: '探索商城好物', target: 'mall' }, { id: 'detail', label: '查看購物金明細', target: 'details' }
    ] }
  ] };
}
export function normalizeCheckinDashboardConfig(value) {
  if (!own(value, ['schemaVersion', 'altText', 'themeColor', 'pages']) || value.schemaVersion !== 1) fail('聊天室卡片版本不正確');
  if (typeof value.themeColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.themeColor)) fail('主題色須為 #RRGGBB');
  if (!Array.isArray(value.pages) || value.pages.length < 2 || value.pages.length > 12) fail('卡片須為 2 至 12 頁');
  const seen = new Set();
  const pages = value.pages.map((page, index) => {
    if (!own(page, ['id', 'kind', 'title', 'body', 'heroImageUrl', 'buttons']) || typeof page.id !== 'string' || !ID.test(page.id) || seen.has(page.id)) fail('每頁須有不同且有效的編號');
    seen.add(page.id);
    if (page.kind !== (index === 0 ? 'wallet' : 'info')) fail('第一頁須保留購物金，其餘頁須為說明卡');
    const title = string(page.title, 60, '卡片標題'), body = string(page.body, 600, '卡片內文', true), heroImageUrl = image(page.heroImageUrl);
    if (!index && heroImageUrl) fail('購物金首頁不使用可替換圖片');
    if (!Array.isArray(page.buttons) || page.buttons.length > 3) fail('每頁最多 3 個按鈕');
    const buttonsSeen = new Set();
    const buttons = page.buttons.map(button => {
      if (!own(button, ['id', 'label', 'target']) || typeof button.id !== 'string' || !ID.test(button.id) || buttonsSeen.has(button.id) || !['mall', 'details'].includes(button.target)) fail('按鈕須使用商城或購物金明細入口及不同編號');
      buttonsSeen.add(button.id); return { id: button.id, label: string(button.label, 20, '按鈕文字'), target: button.target };
    });
    if (!index && (buttons.length !== 2 || new Set(buttons.map(button => button.target)).size !== 2)) fail('購物金首頁須保留商城與明細兩個按鈕');
    return { id: page.id, kind: page.kind, title, body, heroImageUrl, buttons };
  });
  return { schemaVersion: 1, altText: string(value.altText, 120, '通知摘要'), themeColor: value.themeColor.toUpperCase(), pages };
}
function liffLink(env, id, action) {
  const liff = String(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
  if (!/^\d+-[A-Za-z0-9]+$/.test(liff) || liff.length > 100 || !UUID.test(id || '')) throw new CheckinDashboardError('LIFF_CONFIG_INVALID', '商城入口設定不正確', 503);
  const url = new URL('https://liff.line.me/' + liff);
  url.searchParams.set('shopSection', 'list'); url.searchParams.set('checkinCard', id); url.searchParams.set('checkinAction', action); return url.href;
}
export function buildCheckinDashboardMessage(env, cardId, balance, now, value) {
  const config = normalizeCheckinDashboardConfig(value), valid = Number.isSafeInteger(balance) && balance >= 0;
  if (!Number.isSafeInteger(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) throw new CheckinDashboardError('INVALID_TIME', '查詢時間不正確');
  const text = (value, size = 'sm', color = '#61786f') => ({ type: 'text', text: value, size, color, wrap: true });
  const contents = config.pages.map((page, index) => {
    const header = [text('點數通 · 會員服務', 'sm', '#FFFFFF'), { ...text(page.title, 'xl', '#FFFFFF'), weight: 'bold' }];
    if (!index) header.push(text('打卡結果請以原文字回覆為準', 'xs', '#FFFFFF'));
    const body = [];
    if (!index) body.push({ type: 'box', layout: 'vertical', paddingAll: '17px', cornerRadius: '14px', backgroundColor: '#EEF8F1', spacing: 'sm', contents: [
      text('目前可用購物金'), { ...text(valid ? balance.toLocaleString('zh-TW') + ' 元' : '暫時無法取得', valid ? 'xxl' : 'lg', '#133f36'), weight: 'bold' },
      text('查詢時間 ' + new Date(now).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }), 'xs'),
      ...(!valid ? [text('請點明細重新查詢；不代表餘額為零', 'xs')] : [])
    ] });
    if (page.body) body.push(text(page.body));
    if (!body.length) body.push(text('請選擇下方功能，查看詳細內容。'));
    const footer = page.buttons.map((button, position) => ({ type: 'button', style: position ? 'link' : 'primary', color: config.themeColor, action: { type: 'uri', label: button.label, uri: liffLink(env, cardId, button.target) } }));
    footer.push(text(!index ? '實際折抵以商品與結帳確認為準' : `${index + 1} / ${config.pages.length} 頁`, 'xxs'));
    footer.push(text('點擊後將記錄登入身分與時間，供平台統計。', 'xxs'));
    return { type: 'bubble', size: 'mega', header: { type: 'box', layout: 'vertical', paddingAll: '22px', backgroundColor: config.themeColor, spacing: 'md', contents: header },
      ...(page.heroImageUrl ? { hero: { type: 'image', url: page.heroImageUrl, size: 'full', aspectRatio: '2:1', aspectMode: 'cover' } } : {}),
      body: { type: 'box', layout: 'vertical', paddingAll: '20px', spacing: 'lg', contents: body }, footer: { type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'sm', contents: footer } };
  });
  const message = { type: 'flex', altText: config.altText, contents: { type: 'carousel', contents } };
  if (new TextEncoder().encode(JSON.stringify(message.contents)).length > 50000) throw new CheckinDashboardError('FLEX_TOO_LARGE', '卡片內容超過 50 KB，請減少文字或圖片網址');
  return message;
}
