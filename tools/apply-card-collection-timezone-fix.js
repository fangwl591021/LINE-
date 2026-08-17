const fs = require('fs');

let cards = fs.readFileSync('js/modules/cards.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');
let cameraContract = fs.readFileSync('tools/check-android-business-card-camera-contract.js', 'utf8');

const oldBlock = `  function formatCardListTime(value) {\n    const raw = safeText(value).trim();\n    if (!raw) return \"\";\n    const date = new Date(raw.replace(\" \", \"T\"));\n    if (Number.isNaN(date.getTime())) return raw.slice(0, 10);\n    const now = new Date();\n    const sameDay = date.toDateString() === now.toDateString();\n    if (sameDay) {\n      const hours = date.getHours();\n      const minutes = String(date.getMinutes()).padStart(2, \"0\");\n      return (hours < 12 ? \"上午 \" : \"下午 \") + ((hours % 12) || 12) + \":\" + minutes;\n    }\n    const yesterday = new Date(now);\n    yesterday.setDate(now.getDate() - 1);\n    if (date.toDateString() === yesterday.toDateString()) return \"昨天\";\n    return (date.getMonth() + 1) + \"/\" + date.getDate();\n  }\n`;
const newBlock = `  function parseCardTimestamp(value) {\n    const raw = safeText(value).trim();\n    if (!raw) return null;\n    const hasExplicitZone = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(raw);\n    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');\n    const iso = hasExplicitZone ? normalized : normalized + 'Z';\n    const date = new Date(iso);\n    return Number.isNaN(date.getTime()) ? null : date;\n  }\n\n  function formatCardListTime(value) {\n    const raw = safeText(value).trim();\n    if (!raw) return \"\";\n    const date = parseCardTimestamp(raw);\n    if (!date) return raw.slice(0, 10);\n    const now = new Date();\n    const sameDay = date.toDateString() === now.toDateString();\n    if (sameDay) {\n      const hours = date.getHours();\n      const minutes = String(date.getMinutes()).padStart(2, \"0\");\n      return (hours < 12 ? \"上午 \" : \"下午 \") + ((hours % 12) || 12) + \":\" + minutes;\n    }\n    const yesterday = new Date(now);\n    yesterday.setDate(now.getDate() - 1);\n    if (date.toDateString() === yesterday.toDateString()) return \"昨天\";\n    return (date.getMonth() + 1) + \"/\" + date.getDate();\n  }\n`;
if (cards.includes(oldBlock)) cards = cards.replace(oldBlock, newBlock);
else if (!cards.includes('function parseCardTimestamp(value)')) throw new Error('formatCardListTime marker not found');

const oldSort = `      const time = Date.parse(text.replace(\" \", \"T\"));\n      if (!Number.isNaN(time)) return time;`;
const newSort = `      const parsed = parseCardTimestamp(text);\n      if (parsed) return parsed.getTime();`;
if (cards.includes(oldSort)) cards = cards.replace(oldSort, newSort);
else if (!cards.includes('const parsed = parseCardTimestamp(text);')) throw new Error('sort time marker not found');

if (html.includes('js/modules/cards.js?v=7.99')) html = html.replace('js/modules/cards.js?v=7.99', 'js/modules/cards.js?v=8.00');
else if (html.includes('js/modules/cards.js?v=7.98')) html = html.replace('js/modules/cards.js?v=7.98', 'js/modules/cards.js?v=8.00');
else if (!html.includes('js/modules/cards.js?v=8.00')) throw new Error('cards cache marker not found');

fs.writeFileSync('js/modules/cards.js', cards);
fs.writeFileSync('index.html', html);
console.log('Applied UTC-aware card collection timestamp parsing.');
