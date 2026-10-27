// Redemption-only plan: product checkout is allowed, gifts and identity binding are not.
export function checkRedeemOnlyAction(action, payload = {}) {
  const denied = '折抵店家僅可消費折抵，不能贈點或變更顧客點數身分';
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return denied;
  if (payload.rewardPoints !== undefined || payload.autoBindPointAccount) return denied;
  if (action === 'storeAdjustCustomerPoints') return payload.mode === 'redeem' ? '' : denied;
  return ['getStorePointCustomer','prepareStorePointCashierSession','getStoreCashierRequest','listStorePointCashierLogs','getStoreShopRedemptionProduct','resolveStoreMemberProductQr'].includes(action) ? '' : denied;
}

export async function validateRedeemOperator(env, payload) {
  const error = checkRedeemOnlyAction('storeAdjustCustomerPoints', payload);
  if (error) throw Error(error);
  const id = payload.authenticatedUserId;
  if (!id) throw Error('請重新登入後操作扣點');
  const actor = await env.ACTMASTER_DB.prepare('SELECT role FROM users WHERE line_id=? OR row_id=? LIMIT 1').bind(id,id).first();
  if (!['redeem','扣點用戶'].includes(String(actor?.role || '').trim().toLowerCase())) throw Error('扣點權限已變更，請重新登入');
}
