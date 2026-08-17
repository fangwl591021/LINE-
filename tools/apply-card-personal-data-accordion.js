const fs = require('fs');

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) {
    if (text.includes(to)) return text;
    throw new Error(`marker not found: ${label}`);
  }
  return text.replace(from, to);
}

let html = fs.readFileSync('index.html', 'utf8');

const oldTabs = `        <div class="flex border-b border-slate-100">\n          <button class="flex-1 py-4 font-bold text-sm text-blue-600 border-b-2 border-blue-600 transition-colors" id="tab-info" onclick="window.switchTab('info')">📋 聯絡資料</button>\n          <button class="flex-1 py-4 font-bold text-sm text-slate-400 border-b-2 border-transparent transition-colors" id="tab-edit" onclick="window.switchTab('edit')">✏️ 編輯內容</button>\n          <button class="flex-1 py-4 font-bold text-sm text-slate-400 border-b-2 border-transparent transition-colors" id="tab-tags" onclick="window.switchTab('tags')">✨ 五大標籤</button>\n          <button class="flex-1 py-4 font-bold text-sm text-slate-400 border-b-2 border-transparent transition-colors" id="tab-ecard" onclick="window.switchTab('ecard')">🪪 數位名片</button>\n        </div>`;

const newTabs = `        <div class="flex border-b border-slate-100">\n          <button class="flex-1 py-4 font-bold text-sm text-blue-600 border-b-2 border-blue-600 transition-colors" id="tab-personal" onclick="window.switchTab('personal')">👤 個人資料</button>\n          <button class="flex-1 py-4 font-bold text-sm text-slate-400 border-b-2 border-transparent transition-colors" id="tab-tags" onclick="window.switchTab('tags')">✨ 五大標籤</button>\n          <button class="flex-1 py-4 font-bold text-sm text-slate-400 border-b-2 border-transparent transition-colors" id="tab-ecard" onclick="window.switchTab('ecard')">🪪 數位名片</button>\n        </div>`;
html = replaceOnce(html, oldTabs, newTabs, 'detail tab header');

html = replaceOnce(
  html,
  `        <!-- Tab: 資料 -->\n        <div id="tab-content-info" class="p-5">`,
  `        <!-- Tab: 個人資料 -->\n        <div id="tab-content-personal" class="p-4 space-y-3 bg-white">\n          <details id="personal-contact-section" class="group rounded-2xl border border-slate-200 bg-white overflow-hidden" open>\n            <summary class="list-none cursor-pointer px-4 py-3.5 flex items-center justify-between gap-3 font-black text-slate-800">\n              <span class="flex items-center gap-2"><span class="material-symbols-outlined text-blue-600 text-[20px]">contact_page</span>聯絡資料</span>\n              <span class="material-symbols-outlined text-slate-400 transition-transform group-open:rotate-180">expand_more</span>\n            </summary>\n            <div id="tab-content-info" class="p-4 border-t border-slate-100">`,
  'personal contact accordion start'
);

html = replaceOnce(
  html,
  `        </div>\n\n        <!-- Tab: 編輯 -->\n        <div id="tab-content-edit" class="hidden p-5 space-y-3 bg-slate-50/50">`,
  `            </div>\n          </details>\n\n          <details id="personal-edit-section" class="group rounded-2xl border border-slate-200 bg-slate-50/50 overflow-hidden">\n            <summary class="list-none cursor-pointer px-4 py-3.5 flex items-center justify-between gap-3 font-black text-slate-800">\n              <span class="flex items-center gap-2"><span class="material-symbols-outlined text-pink-500 text-[20px]">edit</span>編輯內容</span>\n              <span class="material-symbols-outlined text-slate-400 transition-transform group-open:rotate-180">expand_more</span>\n            </summary>\n            <div id="tab-content-edit" class="p-4 space-y-3 border-t border-slate-100">`,
  'personal edit accordion start'
);

const saveEnd = `          <button id="btn-save" type="button" onclick="window.saveCardEdit()" class="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold mt-4 shadow-md active:scale-95 transition-transform flex justify-center items-center gap-1"><span class="material-symbols-outlined text-[18px]">save</span> 儲存變更</button>\n        </div>\n\n        <!-- Tab: 五大標籤 -->`;
const saveEndNew = `          <button id="btn-save" type="button" onclick="window.saveCardEdit()" class="w-full bg-blue-600 text-white py-3.5 rounded-xl font-bold mt-4 shadow-md active:scale-95 transition-transform flex justify-center items-center gap-1"><span class="material-symbols-outlined text-[18px]">save</span> 儲存變更</button>\n            </div>\n          </details>\n        </div>\n\n        <!-- Tab: 五大標籤 -->`;
html = replaceOnce(html, saveEnd, saveEndNew, 'personal accordion end');

html = html.replace('js/navigation.js?v=7.96', 'js/navigation.js?v=7.97');
html = html.replace('js/modules/cards.js?v=7.97', 'js/modules/cards.js?v=7.98');
fs.writeFileSync('index.html', html);

let nav = fs.readFileSync('js/navigation.js', 'utf8');
const oldSwitch = `window.switchTab = function(tab) {\n  ['info','edit','tags','ecard'].forEach(t => {\n    document.getElementById('tab-content-' + t).classList.toggle('hidden', t !== tab);\n    const btn = document.getElementById('tab-' + t);\n    if (t === tab) {\n      btn.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');\n      btn.classList.remove('text-slate-400', 'border-transparent');\n    } else {\n      btn.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');\n      btn.classList.add('text-slate-400', 'border-transparent');\n    }\n  });\n  if (tab === 'ecard') {\n    window.renderECardSettings();\n    window.updateECardPreview();\n  }\n  if (tab === 'tags' && typeof window.renderCardFateTags === 'function') {\n    window.renderCardFateTags();\n  }\n};`;
const newSwitch = `window.switchTab = function(tab) {\n  const requestedTab = tab;\n  const activeTab = (tab === 'info' || tab === 'edit') ? 'personal' : tab;\n  ['personal','tags','ecard'].forEach(t => {\n    const content = document.getElementById('tab-content-' + t);\n    if (content) content.classList.toggle('hidden', t !== activeTab);\n    const btn = document.getElementById('tab-' + t);\n    if (!btn) return;\n    if (t === activeTab) {\n      btn.classList.add('text-blue-600', 'border-b-2', 'border-blue-600');\n      btn.classList.remove('text-slate-400', 'border-transparent');\n    } else {\n      btn.classList.remove('text-blue-600', 'border-b-2', 'border-blue-600');\n      btn.classList.add('text-slate-400', 'border-transparent');\n    }\n  });\n  if (activeTab === 'personal') {\n    const contact = document.getElementById('personal-contact-section');\n    const edit = document.getElementById('personal-edit-section');\n    if (requestedTab === 'info' && contact) contact.open = true;\n    if (requestedTab === 'edit' && edit && !edit.classList.contains('hidden')) edit.open = true;\n  }\n  if (activeTab === 'ecard') {\n    window.renderECardSettings();\n    window.updateECardPreview();\n  }\n  if (activeTab === 'tags' && typeof window.renderCardFateTags === 'function') {\n    window.renderCardFateTags();\n  }\n};`;
nav = replaceOnce(nav, oldSwitch, newSwitch, 'switchTab');
fs.writeFileSync('js/navigation.js', nav);

let cards = fs.readFileSync('js/modules/cards.js', 'utf8');
cards = replaceOnce(cards,
  `    const tabEdit = $("tab-edit");\n    const tabEcard = $("tab-ecard");`,
  `    const personalEditSection = $("personal-edit-section");\n    const tabEcard = $("tab-ecard");`,
  'editable tab references');
cards = replaceOnce(cards,
  `      if (tabEdit) tabEdit.classList.remove("hidden");\n      if (tabEcard) tabEcard.classList.remove("hidden");`,
  `      if (personalEditSection) personalEditSection.classList.remove("hidden");\n      if (tabEcard) tabEcard.classList.remove("hidden");`,
  'editable personal section show');
cards = replaceOnce(cards,
  `      if (tabEdit) tabEdit.classList.add("hidden");\n      if (tabEcard) tabEcard.classList.add("hidden");`,
  `      if (personalEditSection) personalEditSection.classList.add("hidden");\n      if (tabEcard) tabEcard.classList.add("hidden");`,
  'editable personal section hide');
fs.writeFileSync('js/modules/cards.js', cards);

console.log('Applied personal-data accordion to card detail.');
