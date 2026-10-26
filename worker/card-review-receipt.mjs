// Only a completed server AI response can promote new/changed profile content.
import { prepareCardSafetyReview } from './card-safety-review.mjs';
const UID = /^U[0-9a-f]{32}$/i;
const TTL = 3600;
const text = value => String(value ?? '').trim();
function config(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return {}; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function reviewInput(row) {
  const cfg = config(row?.custom_config);
  // Match CardMaster.collectCard, then apply the exact shared AI input limits.
  const name = text(row?.name) || '未命名';
  return { name, company: row?.company_name ?? '',
    title: cfg.title || name || row?.title || '', phone: row?.mobile ?? '', email: row?.email ?? '', website: row?.website ?? '',
    service: cfg.desc || row?.services || '',
    imageUrl: cfg.imgUrl || cfg.imgUrlLandscape || cfg.imgUrlPortrait || cfg.imgUrlSquare || row?.image_url || '',
    buttons: Array.isArray(cfg.buttons) ? cfg.buttons : [] };
}
export function cardReviewProjection(row) { return prepareCardSafetyReview(reviewInput(row)); }
function fullSnapshot(card) {
  const clean = value => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
  const snapshot = {};
  for (const field of ['name','company','title','phone','email','website','service','imageUrl']) snapshot[field] = clean(card?.[field]);
  snapshot.buttons = (Array.isArray(card?.buttons) ? card.buttons : []).map(button => ({ label: clean(button?.label || button?.l || button?.text), url: clean(button?.url || button?.u || button?.uri) })).filter(button => button.label || button.url);
  return snapshot;
}
async function hash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
// Bind the full snapshot, including text/button tails omitted by the model's existing input limits.
export async function cardReviewFingerprint(row) { return hash(fullSnapshot(reviewInput(row))); }
const validRowId = value => typeof value === 'string' && value.length > 0 && value.length <= 180 && !/[\u0000-\u001f\u007f]/.test(value);
const receiptKey = async (actorId, rowId, fingerprint) => 'CARD_REVIEW_RECEIPT_V1:' + await hash([actorId, rowId, fingerprint]);
function reviewError(code, error) {
  return { success: false, errorCode: code, error, data: { pass: false, status: 'error', riskLevel: 'unknown', reasons: [error], suggestions: ['請確認登入身分及已儲存的名片，再重新執行 AI 體檢。'], issues: [] } };
}
export async function reviewCardWithReceipt(payload, env, actor, evaluate, now = Date.now()) {
  const actorId = text(actor?.userId), rowId = text(payload?.card?.rowId);
  if (!UID.test(actorId) || !actor?.token || actor.source === 'd1_identity_fallback') return reviewError('AI_REVIEW_AUTH_REQUIRED', '請重新登入 LINE 後執行 AI 體檢');
  if (!validRowId(rowId)) return reviewError('AI_REVIEW_CARD_REQUIRED', '請先儲存名片，再執行 AI 體檢');
  try {
    const row = await env.ACTMASTER_DB.prepare('SELECT row_id,line_id,profile_user_id,creator_id,owner_user_id,network_id FROM card_contacts WHERE row_id=? LIMIT 1').bind(rowId).first();
    const bound = text(row?.line_id), role = text(actor.role);
    const owns = row && (role === 'admin' || bound === actorId || (!bound && [text(row.profile_user_id), text(row.creator_id), text(row.owner_user_id)].includes(actorId)) || (!bound && role === 'store' && text(actor.networkId) && text(row.network_id) === text(actor.networkId)));
    if (!owns) return reviewError('AI_REVIEW_CARD_NOT_ALLOWED', '無法審核這張名片，請確認名片管理權限');
    const reviewed = prepareCardSafetyReview(payload.card);
    if (!reviewed) return reviewError('AI_REVIEW_INVALID_INPUT', '名片資料不完整，請儲存資料後重試');
    const result = await evaluate(payload, env);
    const report = result?.data;
    if (result?.success !== true || !report || !['passed', 'failed'].includes(report.status) || report.pass !== (report.status === 'passed')) return result;
    if (!env.ACTMASTER_KV?.put) return reviewError('AI_REVIEW_RECEIPT_UNAVAILABLE', 'AI 體檢結果暫時無法驗證儲存，請稍後重試');
    const fingerprint = await hash(fullSnapshot(payload.card)), key = await receiptKey(actorId, rowId, fingerprint);
    await env.ACTMASTER_KV.put(key, JSON.stringify({ version: 1, fingerprint, status: report.status, issuedAt: now, expiresAt: now + TTL * 1000,
      report: { ...report, reviewedAt: new Date(now).toISOString(), mode: 'ai' } }), { expirationTtl: TTL });
    return result;
  } catch { return reviewError('AI_REVIEW_RECEIPT_UNAVAILABLE', 'AI 體檢結果暫時無法驗證儲存，請稍後重試'); }
}

export async function applyVerifiedCardReview(env, card, existing, verifiedActorId, now = Date.now()) {
  const cfg = config(card.custom_config), fingerprint = await cardReviewFingerprint(card);
  const incomingReport = cfg.safetyReview;
  let receipt;
  if (UID.test(verifiedActorId || '') && validRowId(card.row_id) && env.ACTMASTER_KV?.get) {
    try {
      const value = await env.ACTMASTER_KV.get(await receiptKey(verifiedActorId, card.row_id, fingerprint), 'json');
      if (value?.version === 1 && value.fingerprint === fingerprint && ['passed', 'failed'].includes(value.status)
        && value.report?.status === value.status && value.report.pass === (value.status === 'passed')
        && Number.isFinite(value.issuedAt) && value.issuedAt <= now && Number.isFinite(value.expiresAt) && value.expiresAt > now && value.expiresAt - value.issuedAt === TTL * 1000) receipt = value;
    } catch { /* A missing receipt never promotes a card; an existing unchanged approval stays valid. */ }
  }
  let status = 'pending';
  if (receipt) { status = receipt.status; cfg.safetyReview = receipt.report; }
  else if (existing?.source_type === 'self_profile' && !text(existing.archived_at) && !text(existing.merged_into_row_id)
    && ['passed', 'failed'].includes(existing.ai_review_status) && await cardReviewFingerprint(existing) === fingerprint) {
    status = existing.ai_review_status;
    const previous = config(existing.custom_config);
    if (previous.safetyReview) cfg.safetyReview = previous.safetyReview;
    else delete cfg.safetyReview;
  } else delete cfg.safetyReview;
  const newPassReport = incomingReport?.pass === true && JSON.stringify(incomingReport) !== JSON.stringify(config(existing?.custom_config).safetyReview);
  const rejectApproval = !receipt && status !== 'passed' && (newPassReport || (card.ai_review_status === 'passed' && existing?.ai_review_status !== 'passed'));
  return { status, customConfig: JSON.stringify(cfg), preserved: !receipt && status !== 'pending', rejectApproval };
}
