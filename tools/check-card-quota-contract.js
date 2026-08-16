const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const settingsLoader = read('js/modules/settings.js');
const quotaUi = read('js/modules/settings-card-quota.js');
const quotaRuntime = read('js/modules/settings-card-quota-runtime.js');
const worker = read('worker-entry.mjs');

assert(settingsLoader.includes('settings-card-quota.js'), 'settings loader must include quota UI module');
assert(settingsLoader.includes('settings-card-quota-runtime.js'), 'settings loader must include server quota runtime module');

assert(quotaUi.includes('input-card-quota-free-daily'), 'free daily limit field must exist');
assert(quotaUi.includes('input-card-quota-free-total'), 'free total limit field must exist');
assert(quotaUi.includes('input-card-quota-paid-daily'), 'paid daily placeholder field must exist');
assert(quotaUi.includes('input-card-quota-paid-total'), 'paid total placeholder field must exist');
assert(quotaUi.includes('預留・未啟用'), 'paid quota fields must remain disabled/reserved');
assert(quotaUi.includes("placeholder=\"留空＝不限制\""), 'blank quota values must mean unlimited');
assert(quotaUi.includes('window.checkCardUploadQuota'), 'frontend quota preflight must exist');
assert(quotaUi.includes("typeof window.confirmCrop !== 'function'"), 'quota wrapper must guard the real card crop entry');
assert(quotaUi.indexOf('window.checkCardUploadQuota') < quotaUi.indexOf('originalConfirmCrop.apply'), 'quota check must happen before original OCR flow');

assert(quotaRuntime.includes("fetchAPI('getCardUploadQuotaStatus'"), 'frontend must prefer server quota status');
assert(quotaRuntime.includes('fallback to local count'), 'frontend must retain local fallback if server status is unavailable');

assert(worker.includes("action === 'getCardUploadQuotaStatus'"), 'worker must expose quota status action');
assert(worker.includes("action === 'saveCard'"), 'worker must guard saveCard');
assert(worker.includes('evaluateCardQuota'), 'worker must evaluate quota before save');
assert(worker.includes("['admin', 'tenant', 'store'].includes(role)"), 'admin/tenant/store roles must remain unlimited');
assert(worker.includes('CARD_TOTAL_LIMIT_REACHED'), 'worker must enforce total quota');
assert(worker.includes('CARD_DAILY_LIMIT_REACHED'), 'worker must enforce daily quota');
assert(worker.includes("['self_profile', 'self_upload', 'line_generated', 'video_profile']"), 'personal card sources must be excluded from contact quota');
assert(worker.includes('CARD_QUOTA_SETTINGS_V1:'), 'quota settings must persist in KV');
assert(worker.includes("['getStoreSettings', 'saveStoreSettings']"), 'quota fields must be merged into existing store settings read/write flow');
assert(worker.includes("PRAGMA table_info(card_contacts)"), 'quota usage must adapt to the actual D1 card schema');
assert(worker.includes("Asia/Taipei") || worker.includes("+08:00"), 'daily quota must use Taiwan day boundary');

console.log('Card quota fields, persistence, OCR preflight, and backend guard contract passed.');
