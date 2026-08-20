const fs = require('fs');
const path = require('path');
const { assertCacheBust } = require('./check-cache-bust-contract');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const mycard = fs.readFileSync(path.join(root, 'js', 'modules', 'mycard.js'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');

function fail(message) {
  console.error('My card entry contract failed:', message);
  process.exit(1);
}

if (!index.includes('id="home-my-card-button" onclick="window.openMyCardSettings ? window.openMyCardSettings()')) {
  fail('home my-card action must open the original settings section');
}
const settingsStart = index.indexOf('<details id="details-my-ecard"');
const settingsEnd = index.indexOf('</details>', settingsStart);
const settings = index.slice(settingsStart, settingsEnd);
if (!settings.includes('<summary class="font-bold')) {
  fail('my-card settings summary must remain a normal collapsible section');
}
try {
  assertCacheBust('js/modules/mycard.js');
} catch (e) {
  fail(e.message);
}
if (!/js\/auth\.js\?v=\d+\.\d+/.test(index)) {
  fail('auth.js must be loaded with a cache-bust version');
}
if (index.includes('編輯名片詳細文字資料')) {
  fail('duplicate detail-edit button must be removed');
}
if (!/async function openMyCardEntry/.test(mycard) || !/window\.openMyCardEntry = openMyCardEntry/.test(mycard)) {
  fail('openMyCardEntry must be implemented and exported');
}
if (!/function findLoadedMyCardByVersion[\s\S]*isCardVersion\(pools\[i\], target\)[\s\S]*isEditableOwnCard\(pools\[i\], target\)/.test(mycard)) {
  fail('loaded my-card version lookup must reject cards that do not belong to the current user');
}
if (!/async function handleLayoutChange[\s\S]*var card = await resolveMyCardVersion\(version, false\);[\s\S]*if \(!isEditableOwnCard\(card, version\)\) card = findLoadedMyCardByVersion\(version\);[\s\S]*if \(isEditableOwnCard\(card, version\)/.test(mycard)) {
  fail('layout switching must resolve a user-owned version before applying card data');
}
if (!/async function setMyCardWysiwygLayout[\s\S]*var card = await resolveMyCardVersion\(version, false\);[\s\S]*if \(!isEditableOwnCard\(card, version\)\) card = findLoadedMyCardByVersion\(version\);[\s\S]*if \(isEditableOwnCard\(card, version\)/.test(mycard)) {
  fail('WYSIWYG layout switching must resolve a user-owned version before applying card data');
}
const entryStart = mycard.indexOf('async function openMyCardEntry');
const entryEnd = mycard.indexOf('function getCardRowId', entryStart);
const entry = mycard.slice(entryStart, entryEnd);
if (!entry.includes('window.openMyCardSettings()') || !home.includes("openSettingsSection_('details-my-ecard')")) {
  fail('my-card entry must route to the original settings section');
}
if (entry.includes('openCardDetail') || entry.includes('openMyCardWysiwyg')) {
  fail('my-card entry must not route to a detail editor modal');
}
const createStart = mycard.indexOf('async function generateCardFromProfile');
const createEnd = mycard.indexOf('function ', createStart + 20);
const createFlow = mycard.slice(createStart, createEnd);
if (!createFlow.includes('await load();') || !createFlow.includes('focusMyECardSection();') || createFlow.includes('openMyCardDetail')) {
  fail('newly generated personal card must remain in the original settings section');
}
if (/bindOnce\(document,\s*['"]click['"],\s*['"]#btn-save-my-ecard['"]/.test(mycard)) {
  fail('personal card save button must not be bound twice');
}
if (!/dataset\.myEcardSaving/.test(mycard)) {
  fail('personal card save must guard against duplicate submissions');
}
if (!mycard.includes('copyMyCardUrlVariant') || !mycard.includes('網址取用資訊')) {
  fail('WYSIWYG editor must expose copy labels for card URLs');
}
if (!mycard.includes('三按鈕操作') || !mycard.includes('傳送操作') || !mycard.includes('分享操作') || !mycard.includes('WEB版網址')) {
  fail('WYSIWYG editor must include all four URL copy labels');
}
if (!mycard.includes('webCardId=') || !mycard.includes('appendSendMode(baseUrl)') || !mycard.includes('appendShareMode(baseUrl)')) {
  fail('copy URL variants must separate WEB display, current chat send, and LINE picker share');
}
if (!auth.includes('renderStandaloneWebCardPage') || !auth.includes("initialUrlParams.get('webCardId')") || !auth.includes('handleAutoSendCardEntry') || !auth.includes('liff.sendMessages')) {
  fail('WEB card URL must render without LIFF login');
}

console.log('My card entry contract passed.');
