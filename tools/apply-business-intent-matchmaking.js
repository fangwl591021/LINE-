const fs = require('fs');

let html = fs.readFileSync('index.html', 'utf8');
let matchmake = fs.readFileSync('js/modules/matchmake.js', 'utf8');
let worker = fs.readFileSync('workerbackup.js', 'utf8');

const matchTag = '<script src="js/modules/matchmake.js?v=7.9"></script>';
const businessTag = '<script src="js/modules/business-intent.js?v=1.0"></script>';
if (!html.includes(businessTag)) {
  if (!html.includes(matchTag)) throw new Error('matchmake script marker not found');
  html = html.replace(matchTag, matchTag + '\n' + businessTag);
}

const oldQuery = `  const queryEl = document.getElementById('match-query');\n  const query = queryEl ? queryEl.value.trim() : '';\n  if (!query) return window.showToast('請輸入您的配對需求', true);`;
const newQuery = `  const queryEl = document.getElementById('match-query');\n  let query = queryEl ? queryEl.value.trim() : '';\n  const businessIntent = window.pendingBusinessIntent || window.getCurrentBusinessIntent?.() || {};\n  if (!query) {\n    query = [\n      businessIntent.offer ? '我可以提供：' + businessIntent.offer : '',\n      businessIntent.seek ? '我正在尋找：' + businessIntent.seek : '',\n      businessIntent.collaboration ? '我希望合作：' + businessIntent.collaboration : ''\n    ].filter(Boolean).join('；');\n    if (queryEl && query) queryEl.value = query;\n  }\n  if (!query) return window.showToast('請先輸入配對需求，或到「我的名片 → 業務需求」完成設定', true);`;
if (matchmake.includes(oldQuery)) matchmake = matchmake.replace(oldQuery, newQuery);
else if (!matchmake.includes("const businessIntent = window.pendingBusinessIntent")) throw new Error('match query marker not found');

const oldPayload = `      currentUser: window.currentUser,\n      query: query,\n      poolScope: poolScope,`;
const newPayload = `      currentUser: window.currentUser,\n      query: query,\n      businessIntent: businessIntent,\n      poolScope: poolScope,`;
if (matchmake.includes(oldPayload)) matchmake = matchmake.replace(oldPayload, newPayload);
else if (!matchmake.includes('businessIntent: businessIntent')) throw new Error('match payload marker not found');

const oldDestructure = `      const { currentUser, query } = payload || {};`;
const newDestructure = `      const { currentUser, query, businessIntent = {} } = payload || {};`;
if (worker.includes(oldDestructure)) worker = worker.replace(oldDestructure, newDestructure);
else if (!worker.includes('businessIntent = {}')) throw new Error('worker matchmaking destructure marker not found');

const oldBlock = `      const contactsList = safeContacts.map((c, i) => \`${'${i + 1}'}. ${'${c.Name || \'未命名\'}'} (${'${c.Company || \'無\'}'})\\\n標籤: ${'${c.Tags || \'無\'}'}\`).join('\\\n');\n      const prompt = \`使用者:${'${currentUser?.name || \'使用者\'}'}，配對池:${"${pool.scope === 'own' ? '自己的名片池' : '公開交流池'}"}，需求:${'${query}'}\\\n候選名單:\\\n${'${contactsList}'}\\\n請回傳最匹配的前5名 JSON 陣列: [{\\"index\\":0,\\"score\\":95,\\"reason\\":\\"原因，20字內\\"}]\`;`;
const newBlock = `      const readBusinessIntent = (contact) => {\n        const raw = contact?.card?.customConfig || contact?.card?.custom_config || contact?.card?.['自訂名片設定'] || '{}';\n        let cfg = {};\n        try { cfg = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {}); } catch (e) {}\n        const intent = cfg && typeof cfg === 'object' ? (cfg.businessIntent || {}) : {};\n        return [\n          intent.offer ? '可提供:' + String(intent.offer).trim() : '',\n          intent.seek ? '正在尋找:' + String(intent.seek).trim() : '',\n          intent.collaboration ? '合作方式:' + String(intent.collaboration).trim() : ''\n        ].filter(Boolean).join('；');\n      };\n      safeContacts.forEach(c => {\n        c.BusinessIntent = readBusinessIntent(c);\n        if (c.BusinessIntent) c.Tags = [c.Tags, c.BusinessIntent].filter(Boolean).join('；');\n      });\n      const effectiveQuery = String(query || '').trim() || [\n        businessIntent.offer ? '我可以提供：' + businessIntent.offer : '',\n        businessIntent.seek ? '我正在尋找：' + businessIntent.seek : '',\n        businessIntent.collaboration ? '我希望合作：' + businessIntent.collaboration : ''\n      ].filter(Boolean).join('；');\n      const currentIntentText = [\n        businessIntent.offer ? '我可以提供：' + businessIntent.offer : '',\n        businessIntent.seek ? '我正在尋找：' + businessIntent.seek : '',\n        businessIntent.collaboration ? '我希望合作：' + businessIntent.collaboration : ''\n      ].filter(Boolean).join('；') || '未設定';\n      const contactsList = safeContacts.map((c, i) => \`${'${i + 1}'}. ${'${c.Name || \'未命名\'}'} (${'${c.Company || \'無\'}'})\\\n標籤: ${'${c.Tags || \'無\'}'}\\\n業務需求: ${'${c.BusinessIntent || \'未設定\'}'}\`).join('\\\n');\n      const prompt = \`你是商務人脈配對助理。請綜合「需求、我能提供、我正在尋找、合作方式」與候選人的公司、標籤、業務需求，找出最有商業互補價值的人選。\\\n使用者:${'${currentUser?.name || \'使用者\'}'}，配對池:${"${pool.scope === 'own' ? '自己的名片池' : '公開交流池'}"}\\\n目前需求:${'${effectiveQuery}'}\\\n長期業務意圖:${'${currentIntentText}'}\\\n候選名單:\\\n${'${contactsList}'}\\\n請回傳最匹配的前5名 JSON 陣列: [{\\"index\\":0,\\"score\\":95,\\"reason\\":\\"具體說明互補點與合作價值，30字內\\"}]\`;`;
if (worker.includes(oldBlock)) worker = worker.replace(oldBlock, newBlock);
else if (!worker.includes('const readBusinessIntent = (contact) =>')) throw new Error('worker contacts prompt block not found');

worker = worker.replace(/this\.localMatchmakingFallback\(query, safeContacts\)/g, 'this.localMatchmakingFallback(effectiveQuery, safeContacts)');

fs.writeFileSync('index.html', html);
fs.writeFileSync('js/modules/matchmake.js', matchmake);
fs.writeFileSync('workerbackup.js', worker);
console.log('Applied business intent matchmaking wiring.');
