// Human-authorized, one-version exception, not a reusable administrator bypass.
// Consent: docs/release/work-orders/2026-10-19-massage-single-manual-release.md
import {ListingReviewError,listingPolicyVersion,readListingReviewSnapshot,normalizeListingReview} from './store-listing-review.mjs';
export const singleProductRelease=Object.freeze({
  reference:'massage-online-20261019',
  productId:'ec46afc6-dacd-487c-8ca5-c7f993ea2612',
  shopId:'1c607ea5-3ff8-4232-8cfb-8fc099435ea8',
  version:1,shopVersion:6,
  policyVersion:'2026-10-08-v1',
  contentHash:'0e76c786df74b8450aff05845f1930a7986112d359dcdd50b1ef639ed5b4406e',
  imageUrl:'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/card_1791412545297_yy59a0.jpeg',
  reason:'使用者2026-10-19明確同意僅本商品人工放行網購；保留原文案與圖片、NT$11,800及最高折抵50%。不代表型號、醫療用途、療效或安全認證。'
});
const fail=(message,status=409)=>{throw new ListingReviewError('LISTING_SINGLE_RELEASE_DENIED',message,status);};
export function manualOnlineReleaseOffer(p,s){
  const a=singleProductRelease;
  return p?.id===a.productId&&p.shop_id===a.shopId&&s?.id===a.shopId&&s.version===a.shopVersion&&s.status==='active'&&
    p.version===a.version&&p.status==='active'&&p.purchase_mode==='in_store'&&p.title==='光動能按摩機'&&p.description===''&&p.category==='購'&&
    p.image_url===a.imageUrl&&p.price_cents===1180000&&p.redeem_type==='percent'&&p.redeem_value===50&&listingPolicyVersion===a.policyVersion
    ?{reference:a.reference}:null;
}
export function manualReleaseConsent(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==2||
    !Object.hasOwn(value,'reference')||!Object.hasOwn(value,'confirmed')||value.reference!==singleProductRelease.reference||value.confirmed!==true)
    fail('單品人工放行資料不正確，必須明確確認這一次的核准編號。',400);
  return {reference:singleProductRelease.reference,confirmed:true,reason:singleProductRelease.reason,policy_version:singleProductRelease.policyVersion,content_hash:singleProductRelease.contentHash};
}
export async function verifySingleProductRelease({data,original,shop,db,fetcher,snapshotReader=readListingReviewSnapshot}){
  if(data.type!=='product'||Object.keys(data.changes).length!==1||data.changes.purchase_mode!=='online'||!manualOnlineReleaseOffer(original,shop))
    fail('此次人工同意只允許指定按摩機現有版本切換網購；不可修改其他商品或內容，請重新載入。');
  const a=singleProductRelease,{prepared,images,hash}=await snapshotReader(original,shop,fetcher);
  if(hash!==a.contentHash)fail('商品文字、店家背景或圖片內容已變更，不能套用這次單品人工同意。');
  const scope='product:'+a.shopId+':'+a.productId;
  const prior=await db.prepare('SELECT decision,review_json FROM store_listing_reviews WHERE scope=? AND content_hash=? AND policy_version=?').bind(scope,hash,a.policyVersion).first();
  if(!prior||prior.decision!=='manual')fail('找不到相同內容的待人工核對紀錄，拒絕或審核故障不得使用此例外。');
  const review=normalizeListingReview(JSON.parse(prior.review_json),prepared,images.length);
  if(review.decision!=='manual'||!review.issues.length||review.issues.some(i=>i.category!=='medical'))fail('審核含其他疑慮或已拒絕，不適用這次單品人工同意。');
  // Gate the exact prior review at write time too, not only the earlier read.
  return {scope,hash,policy:a.policyVersion,reviewJson:prior.review_json};
}
