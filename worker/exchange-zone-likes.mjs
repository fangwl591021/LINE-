function text(value, maxLength = 200) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function countValue(row) {
  const value = Number(row?.like_count ?? row?.count ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export async function getExchangeZoneLikeState(db, postHandle, userId) {
  const handle = text(postHandle, 120);
  const actorUserId = text(userId, 180);
  if (!db || !handle) return { likeCount: 0, likedByMe: false };
  if (typeof db?.batch !== 'function') return { likeCount: 0, likedByMe: false };
  const [countRow, mineRow] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS like_count FROM exchange_zone_post_likes WHERE post_handle = ?1`).bind(handle).first(),
    actorUserId
      ? db.prepare(`SELECT like_id FROM exchange_zone_post_likes WHERE post_handle = ?1 AND user_id = ?2 LIMIT 1`).bind(handle, actorUserId).first()
      : Promise.resolve(null)
  ]);
  return { likeCount: countValue(countRow), likedByMe: Boolean(mineRow) };
}

export async function hydrateExchangeZoneLikes(db, rows, userId) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!sourceRows.length) return [];
  if (typeof db?.batch !== 'function') {
    return sourceRows.map((row) => ({ ...row, likeCount: Number(row?.likeCount) || 0, likedByMe: row?.likedByMe === true }));
  }
  return Promise.all(sourceRows.map(async (row) => ({ ...row, ...(await getExchangeZoneLikeState(db, row?.post_handle, userId)) })));
}

async function archiveExchangeZonePost(db, postHandle, userId) {
  const owned = await db.prepare(`
    SELECT post_handle FROM exchange_zone_posts
    WHERE post_handle = ?1 AND author_user_id = ?2 AND status = 'published'
      AND (expires_at = '' OR expires_at > CURRENT_TIMESTAMP)
    LIMIT 1
  `).bind(postHandle, userId).first();
  if (!owned) return { success: false, error: '找不到可下架的交流內容', code: 'EXCHANGE_ARCHIVE_NOT_ALLOWED' };
  const result = await db.prepare(`
    UPDATE exchange_zone_posts
    SET status = 'archived', updated_at = CURRENT_TIMESTAMP
    WHERE post_handle = ?1 AND author_user_id = ?2 AND status = 'published'
  `).bind(postHandle, userId).run();
  const changes = Number(result?.meta?.changes ?? result?.changes ?? 0);
  if (changes < 1) return { success: false, error: '交流內容下架失敗，請重新整理後再試', code: 'EXCHANGE_ARCHIVE_FAILED' };
  return { success: true, archived: true, postHandle, refundedPoints: 0 };
}

export async function toggleExchangeZoneLike(db, payload, actor) {
  if (!db) return { success: false, error: '交流專區資料庫尚未設定', code: 'EXCHANGE_LIKE_DB_MISSING' };
  const postHandle = text(payload?.postHandle, 120);
  const userId = text(actor?.userId, 180);
  if (!postHandle) return { success: false, error: '缺少交流內容識別碼', code: 'EXCHANGE_LIKE_POST_REQUIRED' };
  if (!userId) return { success: false, error: '缺少登入會員識別資料', code: 'EXCHANGE_LIKE_AUTH_REQUIRED' };
  if (payload?.archivePost === true) return archiveExchangeZonePost(db, postHandle, userId);

  const post = await db.prepare(`
    SELECT post_handle FROM exchange_zone_posts
    WHERE post_handle = ?1 AND status = 'published'
      AND (expires_at = '' OR expires_at > CURRENT_TIMESTAMP)
    LIMIT 1
  `).bind(postHandle).first();
  if (!post) return { success: false, error: '找不到可按讚的交流內容', code: 'EXCHANGE_LIKE_POST_NOT_AVAILABLE' };

  const existing = await db.prepare(`SELECT like_id FROM exchange_zone_post_likes WHERE post_handle = ?1 AND user_id = ?2 LIMIT 1`).bind(postHandle, userId).first();
  if (existing) {
    await db.prepare(`DELETE FROM exchange_zone_post_likes WHERE post_handle = ?1 AND user_id = ?2`).bind(postHandle, userId).run();
  } else {
    await db.prepare(`INSERT OR IGNORE INTO exchange_zone_post_likes (post_handle, user_id) VALUES (?1, ?2)`).bind(postHandle, userId).run();
  }
  const state = await getExchangeZoneLikeState(db, postHandle, userId);
  return { success: true, postHandle, likedByMe: state.likedByMe, likeCount: state.likeCount };
}
