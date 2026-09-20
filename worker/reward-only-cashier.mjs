// Reward-only permission and short-lived receipt for a validated member QR or mobile lookup.
// This receipt is not proof of a physical camera scan and is not a transaction/idempotency token.
const TTL_SECONDS = 180;
const UID = /^U[0-9a-fA-F]{20,64}$/;
const TOKEN = /^rwd_[0-9a-f]{64}$/;
const validUid = value => typeof value === 'string' && UID.test(value);
const validPhone = value => typeof value === 'string' && /^09\d{8}$/.test(value);
const validToken = value => typeof value === 'string' && TOKEN.test(value);
const hasValue = value => value !== undefined && value !== null && value !== '';
const denied = '贈點用戶僅可掃描會員錢包 QR 或輸入手機贈點，不可扣點或操作商品折抵';

export function isRewardOnlyRole(role) {
  return typeof role === 'string' && role.trim().toLowerCase() === 'reward';
}

// Call only after the server has established the caller's reward-only role.
// Request status and logs still rely on their existing authenticated-actor scope.
export function checkRewardOnlyAction(action, payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return denied;
  if (action === 'getStorePointCustomer') {
    if (hasValue(payload.productId) || hasValue(payload.qrToken)) return denied;
    const wallet = validUid(payload.walletQr) && payload.customerUserId === payload.walletQr && !hasValue(payload.customerPhone);
    const phone = validPhone(payload.customerPhone) && payload.customerUserId === payload.customerPhone && !hasValue(payload.walletQr);
    return wallet || phone ? '' : '請掃描會員錢包 QR 或輸入完整 10 碼手機號碼，不提供姓名或手動帳號查詢';
  }
  if (action === 'storeAdjustCustomerPoints') {
    if (payload.mode !== 'reward' || payload.deductPoints !== 0 || payload.debitPoints !== undefined ||
        hasValue(payload.productId) || hasValue(payload.qrToken)) return denied;
    if (!validUid(payload.customerUserId) || !validToken(payload.rewardScanToken)) {
      return '請重新確認會員身分後再贈點';
    }
    return '';
  }
  return ['getStoreCashierRequest', 'listStorePointCashierLogs'].includes(action) ? '' : denied;
}

function requireBindings(env) {
  if (typeof env?.ACTMASTER_KV?.get !== 'function' || typeof env?.ACTMASTER_KV?.put !== 'function' ||
      typeof env?.ACTMASTER_DB?.prepare !== 'function') {
    throw Error('贈點驗證暫時無法使用，請稍後再試');
  }
}

async function assertCurrentRewardRole(env, actorId) {
  let actor;
  try {
    actor = await env.ACTMASTER_DB.prepare('SELECT role FROM users WHERE line_id=? OR row_id=? LIMIT 1')
      .bind(actorId, actorId).first();
  } catch {
    throw Error('贈點權限暫時無法確認，請稍後再試');
  }
  if (!isRewardOnlyRole(actor?.role)) throw Error('目前帳號未開放贈點');
}

async function tokenKey(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return 'reward_scan:v1:' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// actorId is the verified authenticated LINE ID; customerId is the resolved canonical points ID.
// The caller must validate the QR/mobile lookup and resolve its customer before issuing this receipt.
// Keep the existing scan token field names and KV keys so in-flight QR receipts remain compatible.
export async function issueRewardScanToken(env, actorId, customerId) {
  requireBindings(env);
  if (!validUid(actorId) || !validUid(customerId)) throw Error('無法辨識贈點人或會員點數帳戶');
  await assertCurrentRewardRole(env, actorId);
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const rewardScanToken = 'rwd_' + Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  const issuedAt = Date.now();
  const rewardScanExpiresAt = issuedAt + TTL_SECONDS * 1000;
  const receipt = {version: 1, actorId, customerId, issuedAt, expiresAt: rewardScanExpiresAt};
  try {
    await env.ACTMASTER_KV.put(await tokenKey(rewardScanToken), JSON.stringify(receipt), {expirationTtl: TTL_SECONDS});
  } catch {
    throw Error('贈點驗證暫時無法使用，請重新確認會員身分');
  }
  return {rewardScanToken, rewardScanExpiresAt};
}

export async function validateRewardScanToken(env, payload) {
  requireBindings(env);
  const invalidAction = checkRewardOnlyAction('storeAdjustCustomerPoints', payload);
  if (invalidAction) throw Error(invalidAction);
  const actorId = payload.authenticatedUserId;
  if (!validUid(actorId)) throw Error('請重新登入後確認會員身分');
  let receipt;
  try {
    receipt = await env.ACTMASTER_KV.get(await tokenKey(payload.rewardScanToken), 'json');
  } catch {
    throw Error('贈點驗證暫時無法使用，請重新確認會員身分');
  }
  if (!receipt || receipt.version !== 1 || receipt.actorId !== actorId ||
      receipt.customerId !== payload.customerUserId || !Number.isSafeInteger(receipt.issuedAt) ||
      !Number.isSafeInteger(receipt.expiresAt) || receipt.expiresAt - receipt.issuedAt !== TTL_SECONDS * 1000) {
    throw Error('會員身分驗證無效，請重新查詢或掃描');
  }
  // Do not trust a cached role or payload role, including after the receipt was issued.
  await assertCurrentRewardRole(env, actorId);
  const now = Date.now();
  if (receipt.issuedAt > now || receipt.expiresAt <= now) throw Error('會員身分驗證已過期，請重新查詢或掃描');
  // The original cashier requestId boundary owns at-most-once point execution. Do not consume
  // this KV receipt as a lock: KV is eventually consistent and cannot provide that guarantee.
}
