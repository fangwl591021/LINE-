const fs = require('fs');

let ui = fs.readFileSync('js/modules/business-intent.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

const oldLine = "      setTimeout(() => window.renderBusinessIntent(card), 0);";
const newBlock = `      setTimeout(() => {\n        window.renderBusinessIntent(card);\n        if (window.currentPage === 'card-detail') {\n          window.switchTab?.('personal');\n          window.openPersonalDataPanel?.('info');\n        }\n      }, 0);`;
if (ui.includes(oldLine)) ui = ui.replace(oldLine, newBlock);
else if (!ui.includes("window.openPersonalDataPanel?.('info')")) throw new Error('openCardDetail post-render marker not found');

if (html.includes('js/modules/business-intent.js?v=1.0')) {
  html = html.replace('js/modules/business-intent.js?v=1.0', 'js/modules/business-intent.js?v=1.1');
} else if (!html.includes('js/modules/business-intent.js?v=1.1')) {
  throw new Error('business intent script version marker not found');
}

fs.writeFileSync('js/modules/business-intent.js', ui);
fs.writeFileSync('index.html', html);
console.log('Applied final post-render contact open fix.');
