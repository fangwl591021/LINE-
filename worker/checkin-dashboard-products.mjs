// Public catalog projection only. Selection never publishes products or changes transaction rights.
import {retailRoleSql} from '../js/modules/store-cooperation-plans.mjs';
class CheckinDashboardError extends Error { constructor(code,message,status=400) { super(message); this.code=code; this.status=status; } }
const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PID = /^[A-Za-z0-9-]{1,80}$/;
export const DASHBOARD_PUBLIC_ELIGIBILITY = `EXISTS(SELECT 1 FROM users u WHERE u.line_id=s.owner_uid AND ${retailRoleSql()})`;
const MERCHANT = DASHBOARD_PUBLIC_ELIGIBILITY;
const UUID_SQL = "length(s.id)=36 AND substr(s.id,9,1)='-' AND substr(s.id,14,1)='-' AND substr(s.id,19,1)='-' AND substr(s.id,24,1)='-' AND length(replace(s.id,'-',''))=32 AND lower(replace(s.id,'-','')) NOT GLOB '*[^0-9a-f]*'";
const VISIBLE = `p.status='active' AND s.status='active' AND ${DASHBOARD_PUBLIC_ELIGIBILITY}`;
const COLUMNS = `p.id AS product_id,p.shop_id,p.title,p.image_url,p.price_cents,p.purchase_mode,p.redeem_type,p.redeem_value,p.version,s.name AS shop_name,s.version AS shop_version,(${MERCHANT}) AS merchant_enabled`;
const fail = message => { throw new CheckinDashboardError('INVALID_CATALOG_QUERY', message); };
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const clean = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ? value.trim() : null;
function image(value) {
  if (typeof value !== 'string' || !value || value.length > 2000 || /[\s\\]/.test(value)) return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.hash && url.href.length <= 2000 ? url.href : ''; } catch { return ''; }
}
export function productDisplay(product) {
  if (!product) return { title: '商品資訊暫時無法顯示', body: '商品可能已更新或下架，請前往商城查看目前公開的商品。', heroImageUrl: '' };
  const policy = !product.merchantEnabled ? '店面展示，未開放交易' : product.redeemType === 'fixed' ? `預設最多折抵 ${product.redeemValue.toLocaleString('zh-TW')} 點` : product.redeemType === 'percent' ? `預設最高折抵 ${product.redeemValue}%` : product.redeemType === 'full' ? '預設可全額折抵' : '不提供點數折抵';
  const mode = product.merchantEnabled ? product.purchaseMode === 'online' ? '網購商品' : '限店內購買' : '店面商品展示';
  return { title: product.title, body: `${product.shopName}\nNT$ ${(product.priceCents / 100).toLocaleString('zh-TW', { maximumFractionDigits: 2 })}\n${mode}\n${policy}\n${product.merchantEnabled?'實際購買與折抵以商品及結帳確認為準。':'詳細內容以店家公開資訊為準。'}`, heroImageUrl: product.imageUrl };
}
function canonical(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.shopId !== 'string' || !UUID.test(value.shopId) || typeof value.productId !== 'string' || !PID.test(value.productId) || !clean(value.title, 100) || !clean(value.shopName, 80) || !integer(value.priceCents, 0, 100000000) || !['online', 'in_store'].includes(value.purchaseMode) || typeof value.merchantEnabled !== 'boolean' || !['none', 'fixed', 'percent', 'full'].includes(value.redeemType) || !integer(value.redeemValue, 0, value.redeemType === 'percent' ? 100 : 1000000) || ['none', 'full'].includes(value.redeemType) && value.redeemValue !== 0 || ['fixed', 'percent'].includes(value.redeemType) && value.redeemValue < 1 || !integer(value.version, 1, 1e9) || !integer(value.shopVersion, 1, 1e9)) throw new CheckinDashboardError('INVALID_PRODUCT', '商品公開資料格式不正確');
  return { shopId: value.shopId, productId: value.productId, title: value.title.trim(), shopName: value.shopName.trim(), imageUrl: image(value.imageUrl), priceCents: value.priceCents, purchaseMode: value.purchaseMode, merchantEnabled: value.merchantEnabled, redeemType: value.redeemType, redeemValue: value.redeemValue, version: value.version, shopVersion: value.shopVersion };
}
export function normalizeDashboardProduct(value) {
  const keys = ['shopId', 'productId', 'title', 'shopName', 'imageUrl', 'priceCents', 'purchaseMode', 'merchantEnabled', 'redeemType', 'redeemValue', 'version', 'shopVersion', 'display'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new CheckinDashboardError('INVALID_PRODUCT', '商品快照格式不正確');
  const product = canonical(value); return { ...product, display: productDisplay(product) };
}
function dto(row) {
  try { return normalizeDashboardProduct({ shopId: row.shop_id, productId: row.product_id, title: row.title, shopName: row.shop_name, imageUrl: row.image_url, priceCents: row.price_cents, purchaseMode: row.purchase_mode, merchantEnabled: !!row.merchant_enabled, redeemType: row.redeem_type, redeemValue: row.redeem_value, version: row.version, shopVersion: row.shop_version }); }
  catch { return null; }
}
async function rows(db, sql, args) { const result = await db.prepare(sql).bind(...args).all(); if (result.success === false || !Array.isArray(result.results)) throw Error('Catalog unavailable'); return result.results; }
export async function readPublicDashboardProduct(db, shopId, productId) {
  if (typeof shopId !== 'string' || !UUID.test(shopId) || typeof productId !== 'string' || !PID.test(productId)) return null;
  const found = await rows(db, `SELECT ${COLUMNS} FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id WHERE ${VISIBLE} AND s.id=? AND p.id=? LIMIT 1`, [shopId, productId]);
  return found.length ? dto(found[0]) : null;
}
export async function readDashboardProductCatalog(db, params) {
  if ([...params.keys()].some(key => !['view', 'q', 'shop', 'after'].includes(key) || params.getAll(key).length !== 1)) fail('商品篩選條件不正確');
  const view = params.get('view'), q = (params.get('q') || '').trim(), shop = params.get('shop') || '', after = params.get('after') || '';
  if (!['shops', 'products'].includes(view) || q.length > 80 || shop && !UUID.test(shop) || view === 'shops' && shop || after && !(view === 'shops' ? UUID : PID).test(after)) fail('商品篩選條件不正確');
  if (view === 'shops') {
    const found = await rows(db, `SELECT s.id,s.name FROM store_shop_stores s WHERE s.status='active' AND ${UUID_SQL} AND ${DASHBOARD_PUBLIC_ELIGIBILITY} AND EXISTS(SELECT 1 FROM store_shop_products p WHERE p.shop_id=s.id AND p.status='active') AND s.id>? AND instr(lower(s.name),lower(?))>0 ORDER BY s.id LIMIT 41`, [after, q]);
    return { success: true, shops: found.slice(0, 40).map(row => ({ id: row.id, name: String(row.name || '').slice(0, 80) })), next: found.length > 40 ? found[39].id : '' };
  }
  const found = await rows(db, `SELECT ${COLUMNS} FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id WHERE ${VISIBLE} AND ${UUID_SQL} AND p.id>? AND (?='' OR s.id=?) AND (instr(lower(p.title),lower(?))>0 OR instr(lower(p.description),lower(?))>0 OR instr(lower(s.name),lower(?))>0) ORDER BY p.id LIMIT 41`, [after, shop, shop, q, q, q]);
  return { success: true, products: found.slice(0, 40).map(dto).filter(Boolean), next: found.length > 40 ? found[39].product_id : '' };
}
export async function resolveDashboardProductPages(db, config) {
  const pages = config.pages.filter(page => page.kind === 'product');
  if (!pages.length) return { products: [], unavailableProducts: [], productSnapshots: [] };
  const found = await rows(db, `SELECT ${COLUMNS} FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id WHERE ${VISIBLE} AND p.id IN (SELECT value FROM json_each(?)) LIMIT 24`, [JSON.stringify([...new Set(pages.map(page => page.productId))])]);
  const products = found.map(dto).filter(Boolean), byId = new Map(products.map(product => [product.shopId + '/' + product.productId, product]));
  const snapshots = pages.map(page => { const product = byId.get(page.shopId + '/' + page.productId) || null; return { pageId: page.id, shopId: page.shopId, productId: page.productId, available: !!product, product }; });
  return { products: [...new Map(snapshots.filter(row => row.available).map(row => [row.shopId + '/' + row.productId, row.product])).values()], unavailableProducts: [...new Map(snapshots.filter(row => !row.available).map(row => [row.shopId + '/' + row.productId, { shopId: row.shopId, productId: row.productId, reason: 'not_public' }])).values()], productSnapshots: snapshots };
}
export function dashboardProductVisibilityGate(snapshots) {
  const available = snapshots.filter(row => row.available);
  return { sql: available.map(() => `EXISTS(SELECT 1 FROM store_shop_products p JOIN store_shop_stores s ON s.id=p.shop_id WHERE ${VISIBLE} AND s.id=? AND p.id=? AND p.version=? AND s.version=? AND (${MERCHANT})=?)`).join(' AND ') || '1=1', args: available.flatMap(row => [row.shopId, row.productId, row.product.version, row.product.shopVersion,row.product.merchantEnabled?1:0]) };
}
export function dashboardProductVersionGate(products) { return dashboardProductVisibilityGate(products.map(product=>({available:true,shopId:product.shopId,productId:product.productId,product}))); }
