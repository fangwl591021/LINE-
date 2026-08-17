const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
  return text.replace(from, to);
}

// Worker: expose live ticker stats directly, independent of legacy getSystemTicker response shape.
const workerPath = path.join(root, 'worker-entry.mjs');
let worker = fs.readFileSync(workerPath, 'utf8');
const workerAnchor = `      const action = text(postBody?.action);\n      const payload = postBody?.payload || {};\n      if (action === 'recognizeCardWithGPT4o') {`;
const workerInsert = `      const action = text(postBody?.action);\n      const payload = postBody?.payload || {};\n      if (action === 'getSystemTickerLiveStats') {\n        try {\n          const todayCardCollectionCount = await getTodaySystemCardCollectionCount(env);\n          return json({\n            success: true,\n            data: {\n              todayCardCollectionCount,\n              message: \`📇 今日全系統新增收藏名片 \${todayCardCollectionCount} 張\`\n            }\n          }, 200);\n        } catch (error) {\n          console.error('ticker live stats failed', text(error?.message) || 'UNKNOWN');\n          return json({ success: false, error: '即時名片統計讀取失敗' }, 500);\n        }\n      }\n      if (action === 'recognizeCardWithGPT4o') {`;
if (!worker.includes("action === 'getSystemTickerLiveStats'")) {
  worker = replaceOnce(worker, workerAnchor, workerInsert, 'worker live stats action');
}
fs.writeFileSync(workerPath, worker);

// Frontend: fetch legacy ticker and live stats independently; live count is always eligible to display.
const homePath = path.join(root, 'js/modules/home.js');
let home = fs.readFileSync(homePath, 'utf8');
home = home.replaceAll("{ duration: 2600, easing: 'linear', fill: 'forwards' }", "{ duration: 4800, easing: 'linear', fill: 'forwards' }");
home = home.replace("await waitHomeTicker_(450);\n        const flash", "await waitHomeTicker_(650);\n        const flash");
home = home.replace("{ duration: 460, easing: 'ease-in-out', fill: 'forwards' }", "{ duration: 520, easing: 'ease-in-out', fill: 'forwards' }");
home = home.replace("await waitHomeTicker_(450);\n        if (window.__HOME_TICKER_RUN_TOKEN__", "await waitHomeTicker_(650);\n        if (window.__HOME_TICKER_RUN_TOKEN__");

const oldLoader = `    window.loadHomeSystemTicker = async function() {\n        const box = document.getElementById('home-system-ticker');\n        if (!box) return;\n        try {\n            const res = await window.fetchAPI('getSystemTicker', {}, true);\n            const data = res?.data || res || {};\n            const fallback = String(data.text || '').trim();\n            const messages = Array.isArray(data.messages) ? data.messages : (fallback ? [fallback] : []);\n            if (data.enabled !== true || !messages.length) {\n                window.__HOME_TICKER_RUN_TOKEN__ = (window.__HOME_TICKER_RUN_TOKEN__ || 0) + 1;\n                box.classList.add('hidden');\n                return;\n            }\n            window.startHomeSystemTicker(messages);\n        } catch {\n            window.__HOME_TICKER_RUN_TOKEN__ = (window.__HOME_TICKER_RUN_TOKEN__ || 0) + 1;\n            box.classList.add('hidden');\n        }\n    };`;
const newLoader = `    window.loadHomeSystemTicker = async function() {\n        const box = document.getElementById('home-system-ticker');\n        if (!box) return;\n        try {\n            const [tickerResult, liveResult] = await Promise.allSettled([\n                window.fetchAPI('getSystemTicker', {}, true),\n                window.fetchAPI('getSystemTickerLiveStats', {}, true)\n            ]);\n            const tickerRes = tickerResult.status === 'fulfilled' ? tickerResult.value : null;\n            const liveRes = liveResult.status === 'fulfilled' ? liveResult.value : null;\n            const data = tickerRes?.data || tickerRes || {};\n            const liveData = liveRes?.data || liveRes || {};\n            const messages = [];\n\n            const fallback = String(data.text || '').trim();\n            if (data.enabled === true) {\n                const configured = Array.isArray(data.messages) ? data.messages : (fallback ? [fallback] : []);\n                configured.map(v => String(v || '').trim()).filter(Boolean).forEach(v => messages.push(v));\n            }\n\n            const liveCount = Number(liveData.todayCardCollectionCount);\n            if (liveRes && liveRes.success !== false && Number.isFinite(liveCount)) {\n                const liveMessage = String(liveData.message || \`📇 今日全系統新增收藏名片 \${liveCount} 張\`).trim();\n                if (liveMessage && !messages.includes(liveMessage)) messages.push(liveMessage);\n            }\n\n            if (!messages.length) {\n                window.__HOME_TICKER_RUN_TOKEN__ = (window.__HOME_TICKER_RUN_TOKEN__ || 0) + 1;\n                box.classList.add('hidden');\n                return;\n            }\n            window.startHomeSystemTicker(messages);\n        } catch {\n            window.__HOME_TICKER_RUN_TOKEN__ = (window.__HOME_TICKER_RUN_TOKEN__ || 0) + 1;\n            box.classList.add('hidden');\n        }\n    };`;
if (!home.includes("window.fetchAPI('getSystemTickerLiveStats'")) {
  home = replaceOnce(home, oldLoader, newLoader, 'home ticker loader');
}
fs.writeFileSync(homePath, home);

// Cache bust frontend.
const htmlPath = path.join(root, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/js\/modules\/home\.js\?v=7\.83/g, 'js/modules/home.js?v=7.84');
fs.writeFileSync(htmlPath, html);

console.log('Applied direct live ticker stats + slower animation.');
