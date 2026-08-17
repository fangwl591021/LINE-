const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Missing patch anchor: ${label}`);
  return text.replace(from, to);
}

// 1) Worker: enrich getSystemTicker with today's system-wide collected-card count.
const workerPath = path.join(root, 'worker-entry.mjs');
let worker = fs.readFileSync(workerPath, 'utf8');

if (!worker.includes('async function getTodaySystemCardCollectionCount')) {
  const anchor = `function quoteColumn(name) {\n  if (!/^[A-Za-z0-9_]+$/.test(name || '')) throw new Error('INVALID_CARD_COLUMN');\n  return \`\"\${name}\"\`;\n}\n`;
  const insert = `${anchor}\nfunction sqliteUtcText(ms) {\n  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');\n}\n\nasync function getTodaySystemCardCollectionCount(env) {\n  const schema = await cardContactSchema(env);\n  if (!schema.created) return 0;\n  const taipeiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);\n  const day = taipeiNow.toISOString().slice(0, 10);\n  const startMs = Date.parse(\`${day}T00:00:00+08:00\`);\n  const endMs = startMs + 24 * 60 * 60 * 1000;\n  const created = quoteColumn(schema.created);\n  let sourceFilter = '';\n  if (schema.source) {\n    sourceFilter = \` AND COALESCE(\${quoteColumn(schema.source)}, '') NOT IN ('self_profile','self_upload','line_generated','video_profile','referral_placeholder')\`;\n  }\n  const row = await env.ACTMASTER_DB.prepare(\n    \`SELECT COUNT(*) AS count FROM card_contacts WHERE datetime(\${created}) >= datetime(?) AND datetime(\${created}) < datetime(?)\${sourceFilter}\`\n  ).bind(sqliteUtcText(startMs), sqliteUtcText(endMs)).first();\n  return Number(row?.count || 0);\n}\n`;
  worker = replaceOnce(worker, anchor, insert, 'worker quoteColumn');
}

if (!worker.includes('async function enrichSystemTickerResponse')) {
  const anchor = `async function enrichStoreSettingsResponse(env, action, payload, response) {\n  if (!response?.ok || !['getStoreSettings', 'saveStoreSettings'].includes(action)) return response;\n  const networkId = text(payload?.networkId) || 'admin';\n  if (action === 'saveStoreSettings') {\n    await writeQuotaSettingsKv(env, networkId, payload);\n  }\n  const quota = await readQuotaSettingsKv(env, networkId);\n  const body = await response.clone().json().catch(() => null);\n  if (!body || typeof body !== 'object') return response;\n  if (body.data && typeof body.data === 'object') {\n    return json({ ...body, data: { ...body.data, ...quota } }, response.status);\n  }\n  return json({ ...body, ...quota }, response.status);\n}\n`;
  const insert = `${anchor}\nasync function enrichSystemTickerResponse(env, action, response) {\n  if (!response?.ok || action !== 'getSystemTicker') return response;\n  const body = await response.clone().json().catch(() => null);\n  if (!body || typeof body !== 'object') return response;\n  try {\n    const todayCardCollectionCount = await getTodaySystemCardCollectionCount(env);\n    const base = body.data && typeof body.data === 'object' ? body.data : body;\n    const configuredText = text(base.text);\n    const liveText = \`📇 今日全系統新增收藏名片 \${todayCardCollectionCount} 張\`;\n    const messages = [configuredText, liveText].filter(Boolean);\n    const enriched = { ...base, enabled: messages.length > 0, todayCardCollectionCount, messages };\n    if (body.data && typeof body.data === 'object') return json({ ...body, data: enriched }, response.status);\n    return json({ ...body, ...enriched }, response.status);\n  } catch (error) {\n    console.error('system ticker live count failed', text(error?.message) || 'UNKNOWN');\n    return response;\n  }\n}\n`;
  worker = replaceOnce(worker, anchor, insert, 'worker enrichStoreSettingsResponse');
}

const responseAnchor = `      response = await enrichStoreSettingsResponse(env, action, payload, response);\n      response = await enrichExchangeZoneResponse(request, env, action, payload, response);`;
const responseInsert = `      response = await enrichStoreSettingsResponse(env, action, payload, response);\n      response = await enrichSystemTickerResponse(env, action, response);\n      response = await enrichExchangeZoneResponse(request, env, action, payload, response);`;
if (!worker.includes('response = await enrichSystemTickerResponse(env, action, response);')) {
  worker = replaceOnce(worker, responseAnchor, responseInsert, 'worker response enrichment');
}
fs.writeFileSync(workerPath, worker);

// 2) Frontend: sequential ticker, center pause, one flash, then continue left.
const homePath = path.join(root, 'js/modules/home.js');
let home = fs.readFileSync(homePath, 'utf8');
const oldTicker = `    window.loadHomeSystemTicker = async function() {\n        const box = document.getElementById('home-system-ticker');\n        const text = document.getElementById('home-system-ticker-text');\n        if (!box || !text) return;\n        try {\n            const res = await window.fetchAPI('getSystemTicker', {}, true);\n            const data = res?.data || res || {};\n            const value = String(data.text || '').trim();\n            box.classList.toggle('hidden', data.enabled !== true || !value);\n            text.textContent = value;\n        } catch { box.classList.add('hidden'); }\n    };`;
const newTicker = `    function waitHomeTicker_(ms) {\n        return new Promise(resolve => setTimeout(resolve, ms));\n    }\n\n    async function animateHomeTickerMessage_(box, textEl, value, runToken) {\n        textEl.textContent = value;\n        textEl.style.animation = 'none';\n        textEl.style.opacity = '1';\n        textEl.style.willChange = 'transform, opacity';\n        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));\n        if (window.__HOME_TICKER_RUN_TOKEN__ !== runToken) return false;\n\n        const boxWidth = Math.max(1, box.clientWidth);\n        const textWidth = Math.max(1, textEl.scrollWidth);\n        const startX = boxWidth + 16;\n        const centerX = Math.round((boxWidth - textWidth) / 2);\n        const endX = -textWidth - 24;\n\n        const enter = textEl.animate([\n            { transform: \`translateX(\${startX}px)\` },\n            { transform: \`translateX(\${centerX}px)\` }\n        ], { duration: 2600, easing: 'linear', fill: 'forwards' });\n        await enter.finished.catch(() => {});\n        if (window.__HOME_TICKER_RUN_TOKEN__ !== runToken) return false;\n\n        await waitHomeTicker_(450);\n        const flash = textEl.animate([\n            { opacity: 1, filter: 'brightness(1)' },\n            { opacity: 0.18, filter: 'brightness(1.8)' },\n            { opacity: 1, filter: 'brightness(1)' }\n        ], { duration: 460, easing: 'ease-in-out', fill: 'forwards' });\n        await flash.finished.catch(() => {});\n        await waitHomeTicker_(450);\n        if (window.__HOME_TICKER_RUN_TOKEN__ !== runToken) return false;\n\n        const exit = textEl.animate([\n            { transform: \`translateX(\${centerX}px)\` },\n            { transform: \`translateX(\${endX}px)\` }\n        ], { duration: 2600, easing: 'linear', fill: 'forwards' });\n        await exit.finished.catch(() => {});\n        return window.__HOME_TICKER_RUN_TOKEN__ === runToken;\n    }\n\n    window.startHomeSystemTicker = async function(messages) {\n        const box = document.getElementById('home-system-ticker');\n        const textEl = document.getElementById('home-system-ticker-text');\n        if (!box || !textEl) return;\n        const queue = (Array.isArray(messages) ? messages : []).map(v => String(v || '').trim()).filter(Boolean);\n        const runToken = (window.__HOME_TICKER_RUN_TOKEN__ || 0) + 1;\n        window.__HOME_TICKER_RUN_TOKEN__ = runToken;\n        if (!queue.length) {\n            box.classList.add('hidden');\n            return;\n        }\n        box.classList.remove('hidden');\n        let index = 0;\n        while (window.__HOME_TICKER_RUN_TOKEN__ === runToken && queue.length) {\n            const keepGoing = await animateHomeTickerMessage_(box, textEl, queue[index % queue.length], runToken);\n            if (!keepGoing) break;\n            index += 1;\n            await waitHomeTicker_(180);\n        }\n    };\n\n    window.loadHomeSystemTicker = async function() {\n        const box = document.getElementById('home-system-ticker');\n        if (!box) return;\n        try {\n            const res = await window.fetchAPI('getSystemTicker', {}, true);\n            const data = res?.data || res || {};\n            const fallback = String(data.text || '').trim();\n            const messages = Array.isArray(data.messages) ? data.messages : (fallback ? [fallback] : []);\n            if (data.enabled !== true || !messages.length) {\n                window.__HOME_TICKER_RUN_TOKEN__ = (window.__HOME_TICKER_RUN_TOKEN__ || 0) + 1;\n                box.classList.add('hidden');\n                return;\n            }\n            window.startHomeSystemTicker(messages);\n        } catch {\n            window.__HOME_TICKER_RUN_TOKEN__ = (window.__HOME_TICKER_RUN_TOKEN__ || 0) + 1;\n            box.classList.add('hidden');\n        }\n    };`;
if (!home.includes('window.startHomeSystemTicker = async function')) {
  home = replaceOnce(home, oldTicker, newTicker, 'home ticker block');
}
fs.writeFileSync(homePath, home);

// 3) HTML: remove old continuous CSS animation and bust home.js cache.
const htmlPath = path.join(root, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace('id="home-system-ticker-text" class="inline-block whitespace-nowrap animate-[homeCheckinMarquee_14s_linear_infinite] pr-8"', 'id="home-system-ticker-text" class="inline-block whitespace-nowrap pr-8"');
html = html.replace(/js\/modules\/home\.js\?v=7\.82/g, 'js/modules/home.js?v=7.83');
fs.writeFileSync(htmlPath, html);

console.log('Applied system ticker live card count + center pause flash.');
