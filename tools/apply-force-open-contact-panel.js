const fs=require('fs');
let nav=fs.readFileSync('js/navigation.js','utf8');
let html=fs.readFileSync('index.html','utf8');
const old=`  if (activeTab === 'personal') {\n    window.closePersonalDataPanels?.();\n    const defaultPanel = requestedTab === 'edit' ? 'edit' : 'info';\n    window.togglePersonalDataPanel?.(defaultPanel);\n  }`;
const next=`  if (activeTab === 'personal') {\n    const defaultPanel = requestedTab === 'edit' ? 'edit' : 'info';\n    window.openPersonalDataPanel?.(defaultPanel);\n  }`;
if(nav.includes(old)) nav=nav.replace(old,next); else if(!nav.includes("window.openPersonalDataPanel?.(defaultPanel)")) throw new Error('personal default block not found');
const marker=`window.togglePersonalDataPanel = function(kind) {`;
if(!nav.includes('window.openPersonalDataPanel = function(kind) {')){
 const helper=`window.openPersonalDataPanel = function(kind) {\n  const target = kind === 'edit' ? 'edit' : 'info';\n  window.closePersonalDataPanels();\n  const targetPanel = document.getElementById('tab-content-' + target);\n  if (!targetPanel) return;\n  targetPanel.classList.remove('hidden');\n  const key = target === 'info' ? 'contact' : 'edit';\n  const chevron = document.getElementById('personal-' + key + '-chevron');\n  const toggle = document.getElementById('personal-' + key + '-toggle');\n  if (chevron) chevron.style.transform = 'rotate(180deg)';\n  if (toggle) toggle.classList.add('ring-2', 'ring-blue-100', 'border-blue-300');\n};\n\n`;
 if(!nav.includes(marker)) throw new Error('toggle marker not found');
 nav=nav.replace(marker,helper+marker);
}
html=html.replace(/js\/navigation\.js\?v=8\.00/g,'js/navigation.js?v=8.01');
fs.writeFileSync('js/navigation.js',nav);fs.writeFileSync('index.html',html);
console.log('Applied forced contact panel open.');