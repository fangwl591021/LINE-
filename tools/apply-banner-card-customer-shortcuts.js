const fs = require('fs');
const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

const oldBanner = `          <button type="button" data-home-top-action="points" onclick="window.openPointsWallet()" class="home-top-shortcut flex-col gap-2 px-2">
            <span class="material-symbols-outlined">account_balance_wallet</span>
            <span class="text-center">
              <span class="home-top-shortcut-label">購物金</span>
              <span id="home-profile-points" class="home-top-shortcut-value text-[16px]">讀取中</span>
            </span>
          </button>

          <button type="button" data-home-top-action="checkin" onclick="window.claimDailyPointCheckin(this)" class="home-top-shortcut flex-col gap-2 px-2">
            <span class="material-symbols-outlined">redeem</span>
            <span class="text-center">
              <span class="home-top-shortcut-label home-quick-label">簽到贈點</span>
              <span class="home-top-shortcut-value text-[11px]">每日 10 點</span>
            </span>
          </button>`;

const newBanner = `          <button type="button" data-home-top-action="cards" onclick="window.goPage('card')" aria-label="開啟收藏名片" class="home-top-shortcut flex-col gap-2 px-2">
            <span class="material-symbols-outlined">contact_page</span>
            <span class="text-center">
              <span class="home-top-shortcut-label">收藏名片</span>
            </span>
          </button>

          <button type="button" data-home-top-action="customers" onclick="window.goPage('customers')" aria-label="開啟我的客戶" class="home-top-shortcut flex-col gap-2 px-2">
            <span class="material-symbols-outlined">groups</span>
            <span class="text-center">
              <span class="home-top-shortcut-label">我的客戶</span>
            </span>
          </button>`;

const lowerSwitch = `      <nav class="card-customer-switch mx-1 mb-4 grid grid-cols-2 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-1" aria-label="名片與客戶切換">
        <button type="button" aria-current="page" class="rounded-xl bg-white px-4 py-3 text-[14px] font-black text-emerald-700 shadow-sm active:scale-[0.98]">名片收藏</button>
        <button type="button" onclick="window.goPage('customers')" class="rounded-xl px-4 py-3 text-[14px] font-black text-slate-500 active:scale-[0.98]">我的客戶</button>
      </nav>
`;

if (html.includes(oldBanner)) html = html.replace(oldBanner, newBanner);
else if (!html.includes('data-home-top-action="cards"') || !html.includes('data-home-top-action="customers"')) throw new Error('Top banner source block not found');

if (html.includes(lowerSwitch)) html = html.replace(lowerSwitch, '');
else if (html.includes('card-customer-switch')) throw new Error('Lower card/customer switch markup changed unexpectedly');

fs.writeFileSync(path, html);
console.log('Moved card collection and customers into the shared top banner.');
