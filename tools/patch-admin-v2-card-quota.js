const fs = require('fs');

const htmlPath = 'admin-v2.html';
let html = fs.readFileSync(htmlPath, 'utf8');

function replaceOnce(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error('Missing anchor: ' + label);
  return source.replace(search, replacement);
}

const navCards = `          <a href="#" onclick="switchTab('cards')" id="nav-cards" class="nav-item flex items-center px-4 py-3 rounded-xl text-sm font-bold">
            <span class="material-symbols-outlined mr-3 text-[20px]">badge</span>
            全站名片庫
          </a>`;

const navQuota = `${navCards}
          <a href="#" onclick="switchTab('quota')" id="nav-quota" class="nav-item flex items-center px-4 py-3 rounded-xl text-sm font-bold">
            <span class="material-symbols-outlined mr-3 text-[20px]">tune</span>
            名片額度設定
          </a>`;

html = replaceOnce(html, navCards, navQuota, 'cards nav');

const quotaTab = `      <!-- Tab: Card Quota -->
      <div id="tab-quota" class="tab-content hidden space-y-6">
        <section class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-6 py-5 border-b border-slate-100">
            <div class="flex items-center gap-3">
              <span class="material-symbols-outlined text-blue-600 text-[26px]">tune</span>
              <div>
                <h3 class="text-xl font-black text-slate-900">名片收藏額度設定</h3>
                <p class="text-sm font-bold text-slate-500 mt-1">控制一般免費會員的名片收藏上限。留空代表不限制，0 代表禁止使用。</p>
              </div>
            </div>
          </div>
          <div class="p-6 space-y-6">
            <div class="rounded-2xl border border-blue-100 bg-blue-50/50 p-5">
              <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div class="text-base font-black text-slate-900">免費方案</div>
                  <div class="text-xs font-bold text-slate-500 mt-1">適用一般 user；admin / tenant / store 維持無限制。</div>
                </div>
                <span class="px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-black">啟用中</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="block">
                  <span class="block text-sm font-black text-slate-700 mb-2">每日上限</span>
                  <div class="flex items-center gap-2">
                    <input id="admin-card-quota-free-daily" type="number" min="0" step="1" inputmode="numeric" placeholder="留空＝不限制" class="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-base font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <span class="text-sm font-black text-slate-400 whitespace-nowrap">張／日</span>
                  </div>
                </label>
                <label class="block">
                  <span class="block text-sm font-black text-slate-700 mb-2">個人總上限</span>
                  <div class="flex items-center gap-2">
                    <input id="admin-card-quota-free-total" type="number" min="0" step="1" inputmode="numeric" placeholder="留空＝不限制" class="w-full border border-slate-200 bg-white rounded-xl px-4 py-3 text-base font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400">
                    <span class="text-sm font-black text-slate-400 whitespace-nowrap">張</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5">
              <div class="flex items-center justify-between gap-3 mb-4">
                <div>
                  <div class="text-base font-black text-slate-500">收費方案</div>
                  <div class="text-xs font-bold text-slate-400 mt-1">欄位先預留，尚未啟用收費邏輯。</div>
                </div>
                <span class="px-3 py-1 rounded-full bg-slate-200 text-slate-500 text-xs font-black">預留・未啟用</span>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label class="block">
                  <span class="block text-sm font-black text-slate-400 mb-2">每日上限</span>
                  <input id="admin-card-quota-paid-daily" type="number" disabled placeholder="尚未設定" class="w-full border border-slate-200 bg-slate-100 rounded-xl px-4 py-3 text-base font-bold text-slate-400 cursor-not-allowed">
                </label>
                <label class="block">
                  <span class="block text-sm font-black text-slate-400 mb-2">個人總上限</span>
                  <input id="admin-card-quota-paid-total" type="number" disabled placeholder="尚未設定" class="w-full border border-slate-200 bg-slate-100 rounded-xl px-4 py-3 text-base font-bold text-slate-400 cursor-not-allowed">
                </label>
              </div>
            </div>

            <div id="admin-card-quota-status" class="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500">尚未載入設定。</div>
            <div class="flex justify-end gap-3">
              <button type="button" onclick="loadCardQuotaSettings()" class="px-5 py-3 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-black hover:bg-slate-50">重新載入</button>
              <button id="btn-save-card-quota" type="button" onclick="saveCardQuotaSettings()" class="px-6 py-3 rounded-xl bg-blue-600 text-white text-sm font-black shadow-sm hover:bg-blue-700 active:scale-95 transition-transform flex items-center gap-2">
                <span class="material-symbols-outlined text-[18px]">save</span> 儲存額度
              </button>
            </div>
          </div>
        </section>
      </div>

`;

html = replaceOnce(html, '      <!-- Tab: Finance -->', quotaTab + '      <!-- Tab: Finance -->', 'finance tab');

const quotaFunctions = `    function normalizeAdminQuotaValue(value) {
      if (value === undefined || value === null || value === '') return '';
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : '';
    }

    function setAdminQuotaStatus(message, isError = false) {
      const el = document.getElementById('admin-card-quota-status');
      if (!el) return;
      el.textContent = message || '';
      el.className = 'rounded-xl border px-4 py-3 text-sm font-bold ' + (isError
        ? 'border-red-100 bg-red-50 text-red-600'
        : 'border-slate-100 bg-slate-50 text-slate-500');
    }

    async function loadCardQuotaSettings() {
      setAdminQuotaStatus('正在載入額度設定...');
      const data = await fetchAPI('getStoreSettings', { networkId: adminNetworkId || 'admin' }, { timeoutMs: 20000 });
      if (!data) {
        setAdminQuotaStatus('額度設定讀取失敗，請稍後再試。', true);
        return;
      }
      const daily = document.getElementById('admin-card-quota-free-daily');
      const total = document.getElementById('admin-card-quota-free-total');
      const paidDaily = document.getElementById('admin-card-quota-paid-daily');
      const paidTotal = document.getElementById('admin-card-quota-paid-total');
      if (daily) daily.value = normalizeAdminQuotaValue(data.cardQuotaFreeDailyLimit);
      if (total) total.value = normalizeAdminQuotaValue(data.cardQuotaFreeTotalLimit);
      if (paidDaily) paidDaily.value = normalizeAdminQuotaValue(data.cardQuotaPaidDailyLimit);
      if (paidTotal) paidTotal.value = normalizeAdminQuotaValue(data.cardQuotaPaidTotalLimit);
      setAdminQuotaStatus('設定已載入。留空代表不限制，0 代表禁止使用。');
    }

    async function saveCardQuotaSettings() {
      const btn = document.getElementById('btn-save-card-quota');
      const oldHtml = btn ? btn.innerHTML : '';
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">refresh</span> 儲存中...';
      }
      try {
        const existing = await fetchAPI('getStoreSettings', { networkId: adminNetworkId || 'admin' }, { timeoutMs: 20000 });
        if (!existing) throw new Error('無法取得目前系統設定');
        const daily = normalizeAdminQuotaValue(document.getElementById('admin-card-quota-free-daily')?.value);
        const total = normalizeAdminQuotaValue(document.getElementById('admin-card-quota-free-total')?.value);
        const payload = {
          ...existing,
          networkId: adminNetworkId || 'admin',
          cardQuotaFreeDailyLimit: daily,
          cardQuotaFreeTotalLimit: total,
          cardQuotaPaidDailyLimit: normalizeAdminQuotaValue(existing.cardQuotaPaidDailyLimit),
          cardQuotaPaidTotalLimit: normalizeAdminQuotaValue(existing.cardQuotaPaidTotalLimit)
        };
        const saved = await fetchAPI('saveStoreSettings', payload, { timeoutMs: 20000 });
        if (!saved) throw new Error('額度設定儲存失敗');
        setAdminQuotaStatus('名片收藏額度已儲存並同步至正式 Worker。');
        showToast('名片額度設定已儲存');
        await loadCardQuotaSettings();
      } catch (err) {
        setAdminQuotaStatus(err.message || '額度設定儲存失敗', true);
        showToast(err.message || '額度設定儲存失敗', true);
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = oldHtml || '<span class="material-symbols-outlined text-[18px]">save</span> 儲存額度';
        }
      }
    }

`;

html = replaceOnce(html, '    function switchTab(tabId) {', quotaFunctions + '    function switchTab(tabId) {', 'switchTab function');
html = replaceOnce(
  html,
  "      if (tabId === 'activities' && allActivitiesData.length === 0) loadActivities();",
  "      if (tabId === 'activities' && allActivitiesData.length === 0) loadActivities();\n      if (tabId === 'quota') loadCardQuotaSettings();",
  'switchTab activities hook'
);

fs.writeFileSync(htmlPath, html);

const contract = `const fs = require('fs');\nconst assert = require('assert');\n\nconst html = fs.readFileSync('admin-v2.html', 'utf8');\n\nassert(html.includes('id=\"nav-quota\"'), 'admin v2 must expose card quota nav');\nassert(html.includes('名片額度設定'), 'admin v2 must label quota settings');\nassert(html.includes('id=\"tab-quota\"'), 'admin v2 must include quota tab');\nassert(html.includes('id=\"admin-card-quota-free-daily\"'), 'daily free quota input must exist');\nassert(html.includes('id=\"admin-card-quota-free-total\"'), 'total free quota input must exist');\nassert(html.includes('id=\"admin-card-quota-paid-daily\"') && html.includes('disabled placeholder=\"尚未設定\"'), 'paid quota remains reserved and disabled');\nassert(html.includes("if (tabId === 'quota') loadCardQuotaSettings();"), 'quota tab must load settings');\nassert(html.includes("fetchAPI('getStoreSettings'"), 'quota UI must load existing settings');\nassert(html.includes("fetchAPI('saveStoreSettings'"), 'quota UI must persist settings');\nassert(html.includes('cardQuotaFreeDailyLimit'), 'daily quota key must be wired');\nassert(html.includes('cardQuotaFreeTotalLimit'), 'total quota key must be wired');\nassert(html.includes('留空代表不限制，0 代表禁止使用'), 'quota semantics must be explicit');\n\nconsole.log('Admin v2 card quota UI contract passed.');\n`;
fs.writeFileSync('tools/check-admin-card-quota-ui-contract.js', contract);

const packagePath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts['test:admin-card-quota'] = 'node tools/check-admin-card-quota-ui-contract.js';
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');

const runnerPath = 'tools/run-smoke-contracts.js';
let runner = fs.readFileSync(runnerPath, 'utf8');
if (!runner.includes("'tools/check-admin-card-quota-ui-contract.js'")) {
  runner = runner.replaceAll(
    "  'tools/check-card-quota-contract.js',",
    "  'tools/check-card-quota-contract.js',\n  'tools/check-admin-card-quota-ui-contract.js',"
  );
}
fs.writeFileSync(runnerPath, runner);

console.log('Patched admin-v2 card quota UI and contract.');
