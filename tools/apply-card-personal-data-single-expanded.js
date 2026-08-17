const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');
let nav = fs.readFileSync('js/navigation.js', 'utf8');
let cameraContract = fs.readFileSync('tools/check-android-business-card-camera-contract.js', 'utf8');

const start = html.indexOf('        <!-- Tab: 個人資料 -->');
const end = html.indexOf('        <!-- Tab: 五大標籤 -->', start);
if (start < 0 || end < 0) throw new Error('personal tab block not found');
const block = html.slice(start, end);

const contactStart = block.indexOf('<details id="personal-contact-section"');
const contactSummaryEnd = block.indexOf('</summary>', contactStart) + '</summary>'.length;
const infoStart = block.indexOf('<div id="tab-content-info"', contactSummaryEnd);
const infoOpenEnd = block.indexOf('>', infoStart) + 1;
const contactEnd = block.indexOf('</details>', infoOpenEnd);
if (contactStart < 0 || infoStart < 0 || contactEnd < 0) throw new Error('contact block not found');
const infoInner = block.slice(infoOpenEnd, contactEnd).replace(/\s*<\/div>\s*$/, '');

const editStart = block.indexOf('<details id="personal-edit-section"', contactEnd);
const editSummaryEnd = block.indexOf('</summary>', editStart) + '</summary>'.length;
const editContentStart = block.indexOf('<div id="tab-content-edit"', editSummaryEnd);
const editOpenEnd = block.indexOf('>', editContentStart) + 1;
const editEnd = block.indexOf('</details>', editOpenEnd);
if (editStart < 0 || editContentStart < 0 || editEnd < 0) throw new Error('edit block not found');
const editInner = block.slice(editOpenEnd, editEnd).replace(/\s*<\/div>\s*$/, '');

const replacement = `        <!-- Tab: 個人資料 -->\n        <div id="tab-content-personal" class="p-4 bg-white">\n          <div class="grid grid-cols-2 gap-3">\n            <button id="personal-contact-toggle" type="button" onclick="window.togglePersonalDataPanel('info')" class="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 flex items-center justify-center gap-2 font-black text-slate-800 active:scale-[0.98] transition-all">\n              <span class="material-symbols-outlined text-blue-600 text-[20px]">contact_page</span>聯絡資料\n              <span id="personal-contact-chevron" class="material-symbols-outlined text-slate-400 text-[20px] transition-transform">expand_more</span>\n            </button>\n            <button id="personal-edit-toggle" type="button" onclick="window.togglePersonalDataPanel('edit')" class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 flex items-center justify-center gap-2 font-black text-slate-800 active:scale-[0.98] transition-all">\n              <span class="material-symbols-outlined text-pink-500 text-[20px]">edit</span>編輯內容\n              <span id="personal-edit-chevron" class="material-symbols-outlined text-slate-400 text-[20px] transition-transform">expand_more</span>\n            </button>\n          </div>\n\n          <div id="tab-content-info" class="hidden mt-3 w-full rounded-2xl border border-slate-200 bg-white p-4">${infoInner}</div>\n          <div id="tab-content-edit" class="hidden mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">${editInner}</div>\n        </div>\n\n`;
html = html.slice(0, start) + replacement + html.slice(end);

const oldPersonalBlock = `  if (activeTab === 'personal') {\n    const contact = document.getElementById('personal-contact-section');\n    const edit = document.getElementById('personal-edit-section');\n    if (contact) contact.open = false;\n    if (edit) edit.open = false;\n  }\n`;
const newPersonalBlock = `  if (activeTab === 'personal') {\n    window.closePersonalDataPanels?.();\n  }\n`;
if (nav.includes(oldPersonalBlock)) nav = nav.replace(oldPersonalBlock, newPersonalBlock);
else if (!nav.includes(newPersonalBlock)) throw new Error('personal switchTab block not found');

if (!nav.includes('window.togglePersonalDataPanel = function')) {
  const marker = '// 建立活動的 Tab 切換';
  const helper = `window.closePersonalDataPanels = function() {\n  ['info','edit'].forEach(function(kind) {\n    const panel = document.getElementById('tab-content-' + kind);\n    const key = kind === 'info' ? 'contact' : 'edit';\n    const chevron = document.getElementById('personal-' + key + '-chevron');\n    const toggle = document.getElementById('personal-' + key + '-toggle');\n    if (panel) panel.classList.add('hidden');\n    if (chevron) chevron.style.transform = '';\n    if (toggle) toggle.classList.remove('ring-2', 'ring-blue-100', 'border-blue-300');\n  });\n};\n\nwindow.togglePersonalDataPanel = function(kind) {\n  const target = kind === 'edit' ? 'edit' : 'info';\n  const targetPanel = document.getElementById('tab-content-' + target);\n  if (!targetPanel) return;\n  const wasOpen = !targetPanel.classList.contains('hidden');\n  window.closePersonalDataPanels();\n  if (wasOpen) return;\n  targetPanel.classList.remove('hidden');\n  const key = target === 'info' ? 'contact' : 'edit';\n  const chevron = document.getElementById('personal-' + key + '-chevron');\n  const toggle = document.getElementById('personal-' + key + '-toggle');\n  if (chevron) chevron.style.transform = 'rotate(180deg)';\n  if (toggle) toggle.classList.add('ring-2', 'ring-blue-100', 'border-blue-300');\n};\n\n`;
  if (!nav.includes(marker)) throw new Error('navigation helper marker not found');
  nav = nav.replace(marker, helper + marker);
}

if (html.includes('js/navigation.js?v=7.98')) html = html.replace('js/navigation.js?v=7.98', 'js/navigation.js?v=7.99');
else if (!html.includes('js/navigation.js?v=7.99')) throw new Error('navigation cache marker not found');

if (cameraContract.includes('(?:94|95|96|97|98)')) cameraContract = cameraContract.replace('(?:94|95|96|97|98)', '(?:94|95|96|97|98|99)');
else if (!cameraContract.includes('(?:94|95|96|97|98|99)')) throw new Error('camera cache contract marker not found');

fs.writeFileSync('index.html', html);
fs.writeFileSync('js/navigation.js', nav);
fs.writeFileSync('tools/check-android-business-card-camera-contract.js', cameraContract);
console.log('Applied mutually exclusive full-width personal data panels.');
