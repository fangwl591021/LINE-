const fs = require('fs');
const assert = require('assert');

const html = fs.readFileSync('admin-v2.html', 'utf8');

assert(html.includes('id="nav-quota"'), 'admin v2 must expose card quota nav');
assert(html.includes('名片額度設定'), 'admin v2 must label quota settings');
assert(html.includes('id="tab-quota"'), 'admin v2 must include quota tab');
assert(html.includes('id="admin-card-quota-free-daily"'), 'daily free quota input must exist');
assert(html.includes('id="admin-card-quota-free-total"'), 'total free quota input must exist');
assert(html.includes('id="admin-card-quota-paid-daily"') && html.includes('disabled placeholder="尚未設定"'), 'paid quota remains reserved and disabled');
assert(html.includes("if (tabId === 'quota') loadCardQuotaSettings();"), 'quota tab must load settings');
assert(html.includes("fetchAPI('getStoreSettings'"), 'quota UI must load existing settings');
assert(html.includes("fetchAPI('saveStoreSettings'"), 'quota UI must persist settings');
assert(html.includes('cardQuotaFreeDailyLimit'), 'daily quota key must be wired');
assert(html.includes('cardQuotaFreeTotalLimit'), 'total quota key must be wired');
assert(html.includes('留空代表不限制，0 代表禁止使用'), 'quota semantics must be explicit');

console.log('Admin v2 card quota UI contract passed.');
