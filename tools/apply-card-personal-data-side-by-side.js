const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');
let nav = fs.readFileSync('js/navigation.js', 'utf8');

const oldContainer = '<div id="tab-content-personal" class="p-4 space-y-3 bg-white">';
const newContainer = '<div id="tab-content-personal" class="p-4 grid grid-cols-2 gap-3 items-start bg-white">';
if (html.includes(oldContainer)) html = html.replace(oldContainer, newContainer);
else if (!html.includes(newContainer)) throw new Error('personal container marker not found');

const oldContact = '<details id="personal-contact-section" class="group rounded-2xl border border-slate-200 bg-white overflow-hidden" open>';
const newContact = '<details id="personal-contact-section" class="group rounded-2xl border border-slate-200 bg-white overflow-hidden">';
if (html.includes(oldContact)) html = html.replace(oldContact, newContact);
else if (!html.includes(newContact)) throw new Error('contact details marker not found');

const oldAutoOpen = `  if (activeTab === 'personal') {\n    const contact = document.getElementById('personal-contact-section');\n    const edit = document.getElementById('personal-edit-section');\n    if (requestedTab === 'info' && contact) contact.open = true;\n    if (requestedTab === 'edit' && edit && !edit.classList.contains('hidden')) edit.open = true;\n  }\n`;
const newAutoOpen = `  if (activeTab === 'personal') {\n    const contact = document.getElementById('personal-contact-section');\n    const edit = document.getElementById('personal-edit-section');\n    if (contact) contact.open = false;\n    if (edit) edit.open = false;\n  }\n`;
if (nav.includes(oldAutoOpen)) nav = nav.replace(oldAutoOpen, newAutoOpen);
else if (!nav.includes(newAutoOpen)) throw new Error('personal accordion compatibility marker not found');

if (html.includes('js/navigation.js?v=7.97')) html = html.replace('js/navigation.js?v=7.97', 'js/navigation.js?v=7.98');
else if (!html.includes('js/navigation.js?v=7.98')) throw new Error('navigation cache marker not found');

fs.writeFileSync('index.html', html);
fs.writeFileSync('js/navigation.js', nav);
console.log('Applied side-by-side, default-closed personal data accordions.');
