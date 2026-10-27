// Shared cooperation-plan policy. UI hints never replace the server's fresh role checks.
export const RETAIL_ROLES = Object.freeze(['store','店長','admin','總管','redeem','扣點用戶']);
export const ADMIN_ROLES = Object.freeze(['admin','總管']);
export const FULL_ROLES = Object.freeze(['store','店長']);
const plans = Object.freeze({
  reward: Object.freeze({id:'reward',label:'贈點單位',annualFee:0,annualFeeWithTax:0,canGive:true,canRedeem:false,canManage:false,canOnline:false,canPickup:false,productLimit:0}),
  redeem: Object.freeze({id:'redeem',label:'折抵店家',annualFee:0,annualFeeWithTax:0,canGive:false,canRedeem:true,canManage:true,canOnline:true,canPickup:false,productLimit:1}),
  full: Object.freeze({id:'full',label:'雙向完整版',annualFee:6000,annualFeeWithTax:6300,canGive:true,canRedeem:true,canManage:true,canOnline:true,canPickup:true,productLimit:20}),
  admin: Object.freeze({id:'admin',label:'平台管理員',annualFee:0,annualFeeWithTax:0,canGive:true,canRedeem:true,canManage:true,canOnline:true,canPickup:true,productLimit:null}),
  member: Object.freeze({id:'member',label:'一般會員',annualFee:0,annualFeeWithTax:0,canGive:false,canRedeem:false,canManage:false,canOnline:false,canPickup:false,productLimit:0})
});
export function storePlanForRole(role) {
  const normalized=String(role||'').trim().toLowerCase();
  return plans[ADMIN_ROLES.includes(normalized)?'admin':FULL_ROLES.includes(normalized)?'full':['redeem','扣點用戶'].includes(normalized)?'redeem':['reward','贈點用戶'].includes(normalized)?'reward':'member'];
}
export const retailRoleSql = (column='u.role') => `lower(${column}) IN ('store','店長','admin','總管','redeem','扣點用戶')`;
export const pickupRoleSql = (column='u.role') => `lower(${column}) IN ('store','店長','admin','總管')`;
export const productQuotaSql = (roleColumn,countExpression) => `(lower(${roleColumn}) IN ('admin','總管') OR (${retailRoleSql(roleColumn)} AND (${countExpression})<CASE WHEN lower(${roleColumn}) IN ('store','店長') THEN 20 ELSE 1 END))`;
