const fs = require('fs');

const path = 'index.html';
let html = fs.readFileSync(path, 'utf8');

const sourceBlock = `        <h3 class="font-black text-lg mb-3 text-slate-800 flex items-center gap-2"><span class="material-symbols-outlined text-blue-500 icon-filled">document_scanner</span> 掃描建立名片</h3>

        <div class="mt-3 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-[13px] leading-relaxed text-blue-800">
          <div class="font-black">收藏名片請用來掃描客戶或合作夥伴。</div>
          <div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>要建立自己的名片，請走「我的專屬名片」，系統才會綁定到本人資料。</span>
            <button type="button" onclick="window.openMyCardEntry ? window.openMyCardEntry(event) : (window.openMyCardSettings ? window.openMyCardSettings(event) : window.goPage('admin-settings'))" class="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-white font-black active:scale-95 transition-transform">建立我的名片</button>
          </div>
        </div>
`;

const destinationAnchor = `        <div class="p-5 pt-0 border-t border-white/60 space-y-4">\n`;

if (!html.includes(sourceBlock)) {
  if (html.includes('id="mycard-scan-create-moved"')) {
    console.log('Scan-create block already moved.');
    process.exit(0);
  }
  throw new Error('Source scan-create block not found');
}
if (!html.includes(destinationAnchor)) throw new Error('My card destination anchor not found');

const movedBlock = `          <section id="mycard-scan-create-moved" class="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <h3 class="font-black text-lg mb-3 text-slate-800 flex items-center gap-2"><span class="material-symbols-outlined text-blue-500 icon-filled">document_scanner</span> 掃描建立名片</h3>
            <div class="text-[13px] leading-relaxed text-blue-800">
              <div class="font-black">收藏名片請用來掃描客戶或合作夥伴。</div>
              <div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>要建立自己的名片，請走「我的專屬名片」，系統才會綁定到本人資料。</span>
                <button type="button" onclick="window.openMyCardEntry ? window.openMyCardEntry(event) : (window.openMyCardSettings ? window.openMyCardSettings(event) : window.goPage('admin-settings'))" class="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-white font-black active:scale-95 transition-transform">建立我的名片</button>
              </div>
            </div>
          </section>
`;

html = html.replace(sourceBlock, '');
html = html.replace(destinationAnchor, destinationAnchor + movedBlock);
fs.writeFileSync(path, html);
console.log('Moved scan-create guidance into My Card section.');
