const fs = require('fs');

let inbox = fs.readFileSync('js/modules/inbox.js', 'utf8');
let html = fs.readFileSync('index.html', 'utf8');

const oldBlock = `      const res = await window.fetchAPI("sendInboxMessage", { exchangePostHandle, receiverUserId, receiverQuery, recipientMode, selectedUserIds, messageType, title, body }, true);\n      const sentCount = Number((res && res.data && res.data.sentCount) || 1);`;
const newBlock = `      const res = await window.fetchAPI("sendInboxMessage", { exchangePostHandle, receiverUserId, receiverQuery, recipientMode, selectedUserIds, messageType, title, body }, true);\n      if (!res || res.success === false || res.error) {\n        throw new Error((res && res.error) || '訊息送出失敗');\n      }\n      const sentCount = Number((res && res.data && res.data.sentCount) || 1);`;

if (inbox.includes(oldBlock)) {
  inbox = inbox.replace(oldBlock, newBlock);
} else if (!inbox.includes("res.success === false || res.error")) {
  throw new Error('sendInboxMessage response marker not found');
}

if (html.includes('js/modules/inbox.js?v=1.17')) {
  html = html.replace('js/modules/inbox.js?v=1.17', 'js/modules/inbox.js?v=1.18');
} else if (!html.includes('js/modules/inbox.js?v=1.18')) {
  throw new Error('inbox cache marker not found');
}

fs.writeFileSync('js/modules/inbox.js', inbox);
fs.writeFileSync('index.html', html);
console.log('Applied inbox send response guard.');
