import legacyWorker from './workerbackup.js';
import { CustomerTagAnalysisModule } from './worker/customer-tag-analysis.mjs';
import { CardFateTagAnalysisModule } from './worker/card-fate-tag-analysis.mjs';
import { ExchangeZoneCouponModule } from './worker/exchange-zone-coupon.mjs';
import { createCardImageJob, saveCardImageResult } from './worker/a-kaffit-card-image-processing.mjs';
import { recognizeAkaffitBusinessCard } from './worker/a-kaffit-card-recognize.mjs';

const TAG_ACTIONS = new Map([
  ['listCustomerTagProfiles', 'listProfiles'],
  ['getCustomerTagAnalysisControl', 'getControl'],
  ['saveCustomerTagAnalysisControl', 'saveControl'],
  ['saveCustomerTagModelPrice', 'savePrice'],
  ['estimateCustomerTagAnalysisBatch', 'estimateBatch'],
  ['approveCustomerTagAnalysisBatch', 'approveBatch'],
  ['pauseCustomerTagAnalysisBatch', 'pauseBatch']
]);

const text = value => String(value ?? '').trim();

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}

async function lineUserId(request, payload, env) {
  const token = text(payload.lineAccessToken || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, ''));
  if (!token) return '';
  const cacheKey = `AUTH_${token.slice(0, 30)}`;
  const cached = env.ACTMASTER_KV ? text(await env.ACTMASTER_KV.get(cacheKey).catch(() => '')) : '';
  if (cached) return cached;
  const response = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return '';
  const profile = await response.json();
  const userId = text(profile.userId);
  if (userId && env.ACTMASTER_KV) await env.ACTMASTER_KV.put(cacheKey, userId, { expirationTtl: 3600 });
  return userId;
}

async function actorScope(userId, env) {
  const row = await env.ACTMASTER_DB.prepare(`SELECT network_id,referrer_id,role FROM users WHERE line_id=? OR row_id=? LIMIT 1`).bind(userId,userId).first();
  if (!row) return { userId, networkId: 'admin', role: 'user' };
  const role = text(row.role).toLowerCase();
  const networkId = role === 'admin' ? 'admin' : role === 'store' || role === 'tenant' ? userId : text(row.network_id || row.referrer_id) || 'admin';
  return { userId, networkId, role };
}

async function authenticatedActor(request, payload, env) {
  const userId = await lineUserId(request, payload || {}, env);
  if (!userId) return null;
  return actorScope(userId, env);
}

function quotaNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function quotaSettingsKey(networkId) {
  return `CARD_QUOTA_SETTINGS_V1:${text(networkId) || 'admin'}`;
}

function normalizeQuotaSettings(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const normalize = value => {
    if (value === undefined || value === null || value === '') return '';
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? String(Math.floor(n)) : '';
  };
  return {
    cardQuotaFreeDailyLimit: normalize(raw.cardQuotaFreeDailyLimit),
    cardQuotaFreeTotalLimit: normalize(raw.cardQuotaFreeTotalLimit),
    cardQuotaPaidDailyLimit: normalize(raw.cardQuotaPaidDailyLimit),
    cardQuotaPaidTotalLimit: normalize(raw.cardQuotaPaidTotalLimit)
  };
}

async function readQuotaSettingsKv(env, networkId) {
  if (!env.ACTMASTER_KV) return {};
  const raw = await env.ACTMASTER_KV.get(quotaSettingsKey(networkId)).catch(() => '');
  if (!raw) return {};
  try { return normalizeQuotaSettings(JSON.parse(raw)); } catch { return {}; }
}

async function writeQuotaSettingsKv(env, networkId, payload) {
  const normalized = normalizeQuotaSettings(payload);
  if (env.ACTMASTER_KV) {
    await env.ACTMASTER_KV.put(quotaSettingsKey(networkId), JSON.stringify(normalized));
  }
  return normalized;
}

function isContactCardCreate(payload, actor) {
  const source = text(payload?.sourceType || payload?.source_type || payload?.['名片來源']).toLowerCase();
  if (['self_profile', 'self_upload', 'line_generated', 'video_profile'].includes(source)) return false;
  const ownerId = text(payload?.ownerUserId || payload?.owner_user_id || payload?.lineId || payload?.line_id || payload?.['LINE ID']);
  const explicitUserId = text(payload?.userId);
  if (ownerId && ownerId === actor?.userId) return false;
  if (explicitUserId && explicitUserId === actor?.userId) return false;
  return true;
}

async function readLegacyStoreSettings(request, payload, env, ctx, actor) {
  const networkId = actor?.networkId || payload?.networkId || 'admin';
  const storePayload = {
    networkId,
    userId: actor?.userId || payload?.userId || '',
    lineAccessToken: payload?.lineAccessToken || ''
  };
  const synthetic = new Request(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'getStoreSettings', payload: storePayload })
  });
  const response = await legacyWorker.fetch(synthetic, env, ctx);
  let legacy = {};
  if (response?.ok) {
    const body = await response.json().catch(() => ({}));
    legacy = body?.data && typeof body.data === 'object' ? body.data : (body && typeof body === 'object' ? body : {});
  }
  const quota = await readQuotaSettingsKv(env, networkId);
  return { ...legacy, ...quota };
}

async function cardContactSchema(env) {
  const info = await env.ACTMASTER_DB.prepare('PRAGMA table_info(card_contacts)').all();
  const rows = Array.isArray(info?.results) ? info.results : [];
  const names = new Set(rows.map(row => text(row.name)).filter(Boolean));
  const pick = candidates => candidates.find(name => names.has(name)) || '';
  return {
    scanner: pick(['scanner_user_id', 'scanner_uid', 'scanned_by', 'scanner_id']),
    creator: pick(['creator_id', 'created_by', 'creator_user_id']),
    created: pick(['created_at', 'createdAt', 'create_time', 'created_time']),
    source: pick(['source_type', 'sourceType', 'source'])
  };
}

function quoteColumn(name) {
  if (!/^[A-Za-z0-9_]+$/.test(name || '')) throw new Error('INVALID_CARD_COLUMN');
  return `"${name}"`;
}

function sqliteUtcText(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

async function getTodaySystemCardCollectionCount(env) {
  const schema = await cardContactSchema(env);
  if (!schema.created) return 0;
  const taipeiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const day = taipeiNow.toISOString().slice(0, 10);
  const startMs = Date.parse(`${day}T00:00:00+08:00`);
  const endMs = startMs + 24 * 60 * 60 * 1000;
  const created = quoteColumn(schema.created);
  let sourceFilter = '';
  if (schema.source) {
    sourceFilter = ` AND COALESCE(${quoteColumn(schema.source)}, '') NOT IN ('self_profile','self_upload','line_generated','video_profile','referral_placeholder')`;
  }
  const row = await env.ACTMASTER_DB.prepare(
    `SELECT COUNT(*) AS count FROM card_contacts WHERE datetime(${created}) >= datetime(?) AND datetime(${created}) < datetime(?)${sourceFilter}`
  ).bind(sqliteUtcText(startMs), sqliteUtcText(endMs)).first();
  return Number(row?.count || 0);
}

async function getCardQuotaUsage(env, actor) {
  const schema = await cardContactSchema(env);
  const ownerColumns = [schema.scanner, schema.creator].filter(Boolean);
  if (!ownerColumns.length) return { totalUsed: 0, dailyUsed: 0, evaluable: false, reason: 'OWNER_COLUMN_MISSING' };

  const identityWhere = ownerColumns.map(column => `${quoteColumn(column)}=?`).join(' OR ');
  const binds = ownerColumns.map(() => actor.userId);
  let extraWhere = '';
  if (schema.source) {
    extraWhere = ` AND COALESCE(${quoteColumn(schema.source)}, '') NOT IN ('self_profile','self_upload','line_generated','video_profile','referral_placeholder')`;
  }

  const totalRow = await env.ACTMASTER_DB.prepare(
    `SELECT COUNT(*) AS count FROM card_contacts WHERE (${identityWhere})${extraWhere}`
  ).bind(...binds).first();
  const totalUsed = Number(totalRow?.count || 0);

  let dailyUsed = null;
  if (schema.created) {
    const tzStart = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const day = tzStart.toISOString().slice(0, 10);
    const startUtc = new Date(`${day}T00:00:00+08:00`).toISOString();
    const endUtc = new Date(new Date(`${day}T00:00:00+08:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();
    const dailyRow = await env.ACTMASTER_DB.prepare(
      `SELECT COUNT(*) AS count FROM card_contacts WHERE (${identityWhere})${extraWhere} AND ${quoteColumn(schema.created)}>=? AND ${quoteColumn(schema.created)}<?`
    ).bind(...binds, startUtc, endUtc).first();
    dailyUsed = Number(dailyRow?.count || 0);
  }
  return { totalUsed, dailyUsed, evaluable: true, schema };
}

async function evaluateCardQuota(request, payload, env, ctx, actor) {
  const role = text(actor?.role).toLowerCase();
  if (['admin', 'tenant', 'store'].includes(role)) return { allowed: true, unlimited: true };
  const settings = await readLegacyStoreSettings(request, payload, env, ctx, actor);
  const dailyLimit = quotaNumber(settings.cardQuotaFreeDailyLimit);
  const totalLimit = quotaNumber(settings.cardQuotaFreeTotalLimit);
  if (dailyLimit === null && totalLimit === null) return { allowed: true, dailyLimit, totalLimit };

  const usage = await getCardQuotaUsage(env, actor);
  if (!usage.evaluable) {
    console.warn('card quota could not be evaluated', usage.reason || 'UNKNOWN');
    return { allowed: true, dailyLimit, totalLimit, quotaWarning: usage.reason || 'NOT_EVALUABLE' };
  }
  if (totalLimit !== null && usage.totalUsed >= totalLimit) {
    return { allowed: false, code: 'CARD_TOTAL_LIMIT_REACHED', error: '免費名片收藏總額度已使用完畢。', dailyLimit, totalLimit, ...usage };
  }
  if (dailyLimit !== null && usage.dailyUsed !== null && usage.dailyUsed >= dailyLimit) {
    return { allowed: false, code: 'CARD_DAILY_LIMIT_REACHED', error: '今日免費名片收藏額度已使用完畢，明日即可繼續使用。', dailyLimit, totalLimit, ...usage };
  }
  return { allowed: true, dailyLimit, totalLimit, ...usage };
}

async function handleTagAction(request, env, action, payload) {
  const userId = await lineUserId(request, payload, env);
  if (!userId) return json({ success: false, error: 'Access Denied: Missing or invalid LINE Token' }, 403);
  const actor = await actorScope(userId, env);
  payload.authenticatedUserId = actor.userId;
  payload.authenticatedNetworkId = actor.networkId;
  payload.authenticatedRole = actor.role;
  const approverIds = text(env.CUSTOMER_TAG_APPROVER_IDS).split(',').map(text).filter(Boolean);
  payload.customerTagApprovalAuthorized = approverIds.includes(actor.userId);
  try {
    const result = await CustomerTagAnalysisModule[TAG_ACTIONS.get(action)](payload, env);
    return json(result, result?.success === false ? 400 : 200);
  } catch (error) {
    const code = text(error?.message) || 'CUSTOMER_TAG_ACTION_FAILED';
    const denied = code === 'TONY_APPROVAL_REQUIRED' || code === 'AUTHENTICATED_USER_REQUIRED';
    return json({ success: false, error: code }, denied ? 403 : 500);
  }
}

async function handleExchangeCouponAction(request, env, payload) {
  const actor = await authenticatedActor(request, payload, env);
  if (!actor) return json({ success: false, error: 'Access Denied: Missing or invalid LINE Token' }, 403);
  try {
    const result = await ExchangeZoneCouponModule.redeem(payload || {}, env, actor);
    return json(result, 200);
  } catch (error) {
    console.error('exchange zone coupon redeem failed', text(error?.message) || 'UNKNOWN');
    return json({ success: false, error: '優惠券核銷失敗，請稍後再試' }, 500);
  }
}

async function enrichExchangeZoneResponse(request, env, action, payload, response) {
  if (!response?.ok || !['listExchangeZonePosts', 'getExchangeZonePost', 'publishExchangeZonePost', 'updateExchangeZonePost'].includes(action)) {
    return response;
  }
  const result = await response.clone().json().catch(() => null);
  if (!result || typeof result !== 'object' || result.success === false) return response;
  const actor = await authenticatedActor(request, payload || {}, env);
  if (!actor) return response;

  try {
    if (action === 'listExchangeZonePosts' && Array.isArray(result.posts)) {
      const posts = await ExchangeZoneCouponModule.hydrateList(result.posts, env, actor);
      return json({ ...result, posts }, response.status);
    }
    if (action === 'getExchangeZonePost' && result.post) {
      const post = await ExchangeZoneCouponModule.hydratePost(result.post, env, actor);
      return json({ ...result, post }, response.status);
    }
    if ((action === 'publishExchangeZonePost' || action === 'updateExchangeZonePost') && payload?.coupon !== undefined) {
      const postHandle = text(result.postHandle || result?.data?.postHandle || payload?.postHandle);
      if (!postHandle) return response;
      const sync = await ExchangeZoneCouponModule.sync(postHandle, payload.coupon, env, actor);
      if (sync?.success === false) {
        return json({
          ...result,
          couponWarning: sync.error || '優惠券設定未完成',
          couponSyncCode: sync.code || 'EXCHANGE_COUPON_SYNC_FAILED',
          coupon: sync.coupon || null
        }, response.status);
      }
      return json({
        ...result,
        couponAvailable: sync.couponAvailable === true,
        coupon: sync.coupon || null
      }, response.status);
    }
  } catch (error) {
    console.error('exchange zone coupon response enrichment failed', action, text(error?.message) || 'UNKNOWN');
    return json({ ...result, couponWarning: '優惠券資料暫時無法同步，交流貼文本身已正常處理' }, response.status);
  }
  return response;
}

async function enrichStoreSettingsResponse(env, action, payload, response) {
  if (!response?.ok || !['getStoreSettings', 'saveStoreSettings'].includes(action)) return response;
  const networkId = text(payload?.networkId) || 'admin';
  if (action === 'saveStoreSettings') {
    await writeQuotaSettingsKv(env, networkId, payload);
  }
  const quota = await readQuotaSettingsKv(env, networkId);
  const body = await response.clone().json().catch(() => null);
  if (!body || typeof body !== 'object') return response;
  if (body.data && typeof body.data === 'object') {
    return json({ ...body, data: { ...body.data, ...quota } }, response.status);
  }
  return json({ ...body, ...quota }, response.status);
}

async function enrichSystemTickerResponse(env, action, response) {
  if (!response?.ok || action !== 'getSystemTicker') return response;
  const body = await response.clone().json().catch(() => null);
  if (!body || typeof body !== 'object') return response;
  try {
    const todayCardCollectionCount = await getTodaySystemCardCollectionCount(env);
    const base = body.data && typeof body.data === 'object' ? body.data : body;
    const configuredText = text(base.text);
    const liveText = `📇 今日全系統新增收藏名片 ${todayCardCollectionCount} 張`;
    const messages = [configuredText, liveText].filter(Boolean);
    const enriched = { ...base, enabled: messages.length > 0, todayCardCollectionCount, messages };
    if (body.data && typeof body.data === 'object') return json({ ...body, data: enriched }, response.status);
    return json({ ...body, ...enriched }, response.status);
  } catch (error) {
    console.error('system ticker live count failed', text(error?.message) || 'UNKNOWN');
    return response;
  }
}

function akaffitCardImagePreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Card-File-Size, X-Card-Side, X-Card-Purpose',
      'Access-Control-Max-Age': '86400'
    }
  });
}

async function handleAkaffitCardImageRoute(request, env) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') return akaffitCardImagePreflight();
  const actor = await authenticatedActor(request, {}, env);
  if (!actor) return json({ success: false, error: 'Access Denied: Missing or invalid LINE Token' }, 403);
  try {
    if (request.method === 'POST' && url.pathname === '/v1/card-images') {
      const job = await createCardImageJob(env.ACTMASTER_DB, env.IMG_BUCKET, actor.userId, request);
      return json({ success: true, job }, 201);
    }
    const resultMatch = url.pathname.match(/^\/v1\/card-images\/([^/]+)\/result$/);
    if (request.method === 'POST' && resultMatch) {
      const form = await request.formData();
      const job = await saveCardImageResult(env.ACTMASTER_DB, env.IMG_BUCKET, actor.userId, decodeURIComponent(resultMatch[1]), form);
      return json({ success: true, job }, 200);
    }
  } catch (error) {
    console.error('A-kaffit card image route failed', text(error?.message) || 'UNKNOWN');
    return json({ success: false, error: text(error?.message) || '名片影像處理失敗' }, 400);
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/v1/card-images' || /^\/v1\/card-images\/[^/]+\/result$/.test(pathname)) {
      const cardImageResponse = await handleAkaffitCardImageRoute(request, env);
      if (cardImageResponse) return cardImageResponse;
    }
    let postBody = null;
    if (request.method === 'POST') {
      const copy = request.clone();
      postBody = await copy.json().catch(() => null);
      const action = text(postBody?.action);
      const payload = postBody?.payload || {};
      if (action === 'recognizeCardWithGPT4o') {
        const actor = await authenticatedActor(request, payload, env);
        if (!actor) return json({ success: false, error: 'Access Denied: Missing or invalid LINE Token' }, 403);
        try {
          const result = await recognizeAkaffitBusinessCard(payload, env);
          return json({ success: true, ...result, data: result }, 200);
        } catch (error) {
          console.error('A-kaffit recognize failed', text(error?.message) || 'UNKNOWN');
          return json({ success: false, error: text(error?.message) || '名片辨識失敗' }, 500);
        }
      }
      if (TAG_ACTIONS.has(action)) return await handleTagAction(request, env, action, payload);
      if (action === 'redeemExchangeZoneCoupon') return await handleExchangeCouponAction(request, env, payload);

      if (action === 'getCardUploadQuotaStatus') {
        const actor = await authenticatedActor(request, payload, env);
        if (!actor) return json({ success: false, error: 'Access Denied: Missing or invalid LINE Token' }, 403);
        try {
          const status = await evaluateCardQuota(request, payload, env, ctx, actor);
          return json({ success: true, data: status }, 200);
        } catch (error) {
          console.error('card quota status failed', text(error?.message) || 'UNKNOWN');
          return json({ success: false, error: '名片額度讀取失敗' }, 500);
        }
      }

      if (action === 'saveCard') {
        const actor = await authenticatedActor(request, payload, env);
        if (actor && isContactCardCreate(payload, actor)) {
          try {
            const quota = await evaluateCardQuota(request, payload, env, ctx, actor);
            if (!quota.allowed) return json({ success: false, error: quota.error, code: quota.code, quota }, 200);
          } catch (error) {
            console.error('card quota guard failed open', text(error?.message) || 'UNKNOWN');
          }
        }
      }
    }

    let response = await legacyWorker.fetch(request, env, ctx);
    if (request.method === 'POST') {
      const action = text(postBody?.action);
      const payload = postBody?.payload || {};
      response = await enrichStoreSettingsResponse(env, action, payload, response);
      response = await enrichSystemTickerResponse(env, action, response);
      response = await enrichExchangeZoneResponse(request, env, action, payload, response);
      if ((action === 'saveCard' || action === 'updateCard') && response.ok) {
        const result = await response.clone().json().catch(() => null);
        const rowId = text(result?.data?.rowId || result?.rowId || payload?.rowId || payload?.row_id);
        if (rowId) {
          const enqueue = CardFateTagAnalysisModule.enqueueCard(rowId, env).catch(error => {
            console.error('card fate tag enqueue failed', text(error?.message) || 'UNKNOWN');
          });
          if (ctx?.waitUntil) ctx.waitUntil(enqueue);
          else await enqueue;
        }
      }
    }
    return response;
  },

  async scheduled(controller, env, ctx) {
    if (controller?.cron === '*/15 18-20 * * *') {
      const now = new Date();
      const run = Promise.allSettled([
        CustomerTagAnalysisModule.processOffPeak(env, now),
        CardFateTagAnalysisModule.processOffPeak(env, now)
      ]).then(results => results.forEach((result, index) => {
        if (result.status === 'rejected') console.error(index === 0 ? 'customer tag analysis cron failed' : 'card fate tag analysis cron failed', text(result.reason?.message) || 'UNKNOWN');
      }));
      if (ctx?.waitUntil) ctx.waitUntil(run);
      else await run;
      return;
    }
    return await legacyWorker.scheduled(controller, env, ctx);
  }
};
