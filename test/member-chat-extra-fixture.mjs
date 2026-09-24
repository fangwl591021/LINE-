import { readFileSync } from 'node:fs';
// Shared synthetic schema only; no production data or credentials.
export function chatExtraSchema(sql) {
  for (const column of ['scanner_user_id','creator_id','department','image_url','mobile','office_phone','email','website','socials','address']) sql.exec(`ALTER TABLE card_contacts ADD COLUMN ${column} TEXT DEFAULT ''`);
  for (const file of ['0021_exchange_zone_foundation.sql','0022_exchange_zone_publish.sql','0023_exchange_zone_likes.sql','0024_exchange_zone_coupons.sql','0027_incremental_matchmaking_cache.sql','0048_member_chat_coupon.sql','0049_member_chat_line_contact.sql']) sql.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
}
export function seedChatCoupon(sql, uid, options = {}) {
  const handle = 'exc_' + crypto.randomUUID(), post = 'exp_' + crypto.randomUUID();
  sql.prepare("INSERT INTO exchange_zone_posts(post_handle,author_user_id,title,body,status,expires_at) VALUES(?,?,?,'合成優惠內容',?,?)").run(post, uid, options.title || '合成咖啡優惠券', options.postStatus || 'published', options.postExpiry ?? '2000-01-01');
  sql.prepare("INSERT INTO exchange_zone_coupons(coupon_handle,post_handle,owner_user_id,title,description,terms,expires_at,status) VALUES(?,?,?,?,'合成咖啡第二杯半價','請至現場確認後使用',?,?)").run(handle, post, uid, options.title || '合成咖啡優惠券', options.expiry ?? '2099-12-31T23:59:59+08:00', options.status || 'active');
  return handle;
}
export function seedChatScore(sql, viewer, peer, options = {}) {
  const id = options.id || 'scan-' + crypto.randomUUID();
  sql.prepare("INSERT INTO card_contacts(row_id,line_id,scanner_user_id,source_type,name,updated_at) VALUES(?,?,?,'private_import','合成收藏名片',CURRENT_TIMESTAMP)").run(id, peer, viewer);
  sql.prepare("INSERT INTO ai_match_pair_cache(requester_user_id,pool_scope,intent_hash,candidate_card_row_id,candidate_version,score,reason,result_source) VALUES(?,?,'old-intent',?,'v1',?,'既有商務合作評分',?)").run(viewer, options.scope || 'own', id, options.score ?? 82, options.source || 'ai');
  return id;
}
