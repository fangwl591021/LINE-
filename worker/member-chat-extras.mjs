import { publicCard } from './exchange-zone.mjs';
import { restoreCollectionHistory } from './collection-match-history.mjs';
import { ExchangeZoneCouponModule } from './exchange-zone-coupon.mjs';

// Called only with authorized directory results. No AI calls or identity guessing.
export async function memberScores(db, actor, members, cardMemberJoin) {
  if (!members.length) return new Map();
  try {
    const result = await db.prepare(`SELECT c.row_id,u.row_id AS peer FROM card_contacts c JOIN users u ON ${cardMemberJoin('c', 'u')}
      WHERE u.row_id IN (SELECT value FROM json_each(?1))
      AND COALESCE(c.archived_at,'')='' AND COALESCE(c.merged_into_row_id,'')=''
      AND COALESCE(c.source_type,'')<>'referral_placeholder'
      AND (c.scanner_user_id IN (SELECT value FROM json_each(?2)) OR
        (COALESCE(c.scanner_user_id,'')='' AND (c.creator_id IN (SELECT value FROM json_each(?2)) OR c.owner_user_id IN (SELECT value FROM json_each(?2)))))
      AND (COALESCE(c.source_type,'')<>'self_profile' OR c.scanner_user_id IN (SELECT value FROM json_each(?2)))
      ORDER BY c.updated_at DESC,c.row_id DESC LIMIT 500`).bind(JSON.stringify(members.map(row => row.peer)), JSON.stringify(actor.ids)).all();
    if (result.success === false || !Array.isArray(result.results)) throw Error('score read');
    const restored = await restoreCollectionHistory(result.results.map(row => ({ rowId: row.row_id, peer: row.peer })), db, actor.uid);
    const scores = new Map();
    for (const row of restored) {
      if (scores.has(row.peer) || row.aiMatch?.status !== 'completed') continue;
      const { score, source, basis } = row.aiMatch;
      scores.set(row.peer, { score, source, basis });
    }
    return scores;
  } catch { return new Map(); } // Missing history must not hide the member directory.
}

export async function peerCard(db, room, cardMemberJoin, ownCard) {
  const row = await db.prepare(`SELECT c.* FROM card_contacts c JOIN users u ON ${cardMemberJoin('c', 'u')}
    WHERE u.row_id=? AND ${ownCard('c')} ORDER BY c.updated_at DESC,c.row_id DESC LIMIT 1`).bind(room.peer).first();
  // Check the latest own card, not an older public revision of a now-private card.
  if (!row || row.visibility !== 'public' || row.ai_review_status !== 'passed') return null;
  const projection = { card_available: 1 };
  for (const field of ['name','company_name','title','department','services','image_url','mobile','office_phone','email','website','socials','address','custom_config']) projection['card_' + field] = row[field];
  return publicCard(projection);
}

// Reused inside the message INSERT so ownership/expiry cannot change between check and send.
export const SENDABLE_COUPON = `EXISTS(SELECT 1 FROM exchange_zone_coupons c JOIN exchange_zone_posts p ON p.post_handle=c.post_handle
  WHERE c.coupon_handle=?6 AND c.owner_user_id=?7 AND p.author_user_id=?7
  AND c.status='active' AND p.status='published' AND (c.expires_at='' OR datetime(c.expires_at)>=CURRENT_TIMESTAMP))`;

export async function ownCoupons(db, actor, after) {
  const result = await db.prepare(`SELECT c.coupon_handle,c.title,c.expires_at FROM exchange_zone_coupons c JOIN exchange_zone_posts p ON p.post_handle=c.post_handle
    WHERE c.owner_user_id=?1 AND p.author_user_id=?1 AND c.status='active' AND p.status='published'
    AND (c.expires_at='' OR datetime(c.expires_at)>=CURRENT_TIMESTAMP) AND c.coupon_handle>?2 ORDER BY c.coupon_handle LIMIT 31`).bind(actor.uid, after).all();
  if (result.success === false || !Array.isArray(result.results)) throw Error('coupon read');
  const items = result.results.slice(0, 30).map(row => ({ handle: row.coupon_handle, title: row.title, expiresAt: row.expires_at }));
  return { items, next: result.results.length > 30 ? items.at(-1).handle : '' };
}

export async function chatCoupon(db, actor, room, seq, redeem = false) {
  // Only a reference on this conversation is accessible. Arbitrary coupon handles are not accepted.
  const row = await db.prepare(`SELECT c.coupon_handle,c.post_handle FROM member_chat_messages m
    JOIN exchange_zone_coupons c ON c.coupon_handle=m.coupon_handle JOIN exchange_zone_posts p ON p.post_handle=c.post_handle
    WHERE m.thread_id=? AND m.seq=? AND c.status='active' AND p.status='published' LIMIT 1`).bind(room.id, seq).first();
  if (!row) return null;
  const env = { ACTMASTER_DB: db }, viewer = { userId: actor.uid };
  if (redeem) {
    const result = await ExchangeZoneCouponModule.redeem({ couponHandle: row.coupon_handle }, env, viewer);
    // Retry after a lost response is a successful confirmation of the existing redemption.
    return result.code === 'EXCHANGE_COUPON_ALREADY_REDEEMED' ? { success: true, coupon: result.coupon, duplicate: true } : result;
  }
  const post = await ExchangeZoneCouponModule.hydratePost({ postHandle: row.post_handle }, env, viewer);
  return { success: true, coupon: post.coupon };
}
