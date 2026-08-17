const fs = require('fs');

let nav = fs.readFileSync('js/navigation.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

const oldBlock = `  if (activeTab === 'personal') {\n    window.closePersonalDataPanels?.();\n  }`;
const newBlock = `  if (activeTab === 'personal') {\n    window.closePersonalDataPanels?.();\n    const defaultPanel = requestedTab === 'edit' ? 'edit' : 'info';\n    window.togglePersonalDataPanel?.(defaultPanel);\n  }`;

if (nav.includes(oldBlock)) nav = nav.replace(oldBlock, newBlock);
else if (!nav.includes("const defaultPanel = requestedTab === 'edit' ? 'edit' : 'info';")) throw new Error('personal default panel marker not found');

html = html.replace('js/navigation.js?v=7.99', 'js/navigation.js?v=8.00');
html = html.replace('js/navigation.js?v=8.00', 'js/navigation.js?v=8.00');

fs.writeFileSync('js/navigation.js', nav);
fs.writeFileSync('index.html', html);
console.log('Applied default contact panel open behavior.');
