import legacyWorker from './workerbackup.js';
import { CustomerTagAnalysisModule } from './worker/customer-tag-analysis.mjs';

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

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'POST') {
      const copy = request.clone();
      const body = await copy.json().catch(() => null);
      const action = text(body?.action);
      if (TAG_ACTIONS.has(action)) return await handleTagAction(request, env, action, body?.payload || {});
    }
    return await legacyWorker.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (controller?.cron === '*/15 18-20 * * *') {
      const run = CustomerTagAnalysisModule.processOffPeak(env, new Date()).catch(error => {
        console.error('customer tag analysis cron failed', text(error?.message) || 'UNKNOWN');
      });
      if (ctx?.waitUntil) ctx.waitUntil(run);
      else await run;
      return;
    }
    return await legacyWorker.scheduled(controller, env, ctx);
  }
};
