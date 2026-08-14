import legacyWorker from './workerbackup.js';
import { CustomerTagAnalysisModule } from './worker/customer-tag-analysis.mjs';
import { CardFateTagAnalysisModule } from './worker/card-fate-tag-analysis.mjs';
import { ExchangeZoneCouponModule } from './worker/exchange-zone-coupon.mjs';

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
    return json(result, result?.success === false ? 400 : 200);
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

export default {
  async fetch(request, env, ctx) {
    let postBody = null;
    if (request.method === 'POST') {
      const copy = request.clone();
      postBody = await copy.json().catch(() => null);
      const action = text(postBody?.action);
      if (TAG_ACTIONS.has(action)) return await handleTagAction(request, env, action, postBody?.payload || {});
      if (action === 'redeemExchangeZoneCoupon') return await handleExchangeCouponAction(request, env, postBody?.payload || {});
    }
    let response = await legacyWorker.fetch(request, env, ctx);
    if (request.method === 'POST') {
      const action = text(postBody?.action);
      response = await enrichExchangeZoneResponse(request, env, action, postBody?.payload || {}, response);
      if ((action === 'saveCard' || action === 'updateCard') && response.ok) {
        const result = await response.clone().json().catch(() => null);
        const rowId = text(result?.data?.rowId || result?.rowId || postBody?.payload?.rowId || postBody?.payload?.row_id);
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
