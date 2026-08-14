const text = (value, maxLength = 2000) => String(value ?? '').trim().slice(0, maxLength);

function couponInput(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const enabled = raw.enabled === true;
  if (!enabled) return { enabled: false };
  const title = text(raw.title, 80);
  const description = text(raw.description, 800);
  const terms = text(raw.terms, 800);
  const expiresAt = text(raw.expiresAt || raw.expires_at, 48);
  if (title.length < 2) return { error: '優惠券名稱至少需要 2 個字' };
  if (description.length < 2) return { error: '優惠內容至少需要 2 個字' };
  if (!expiresAt || Number.isNaN(new Date(expiresAt).getTime())) return { error: '請設定有效的優惠券使用期限' };
  if (new Date(expiresAt).getTime() <= Date.now()) return { error: '優惠券期限必須晚於現在時間' };
  return { enabled: true, title, description, terms, expiresAt };
}

function isExpired(value) {
  const raw = text(value, 48);
  if (!raw) return false;
  const stamp = new Date(raw).getTime();
  return Number.isFinite(stamp) && stamp < Date.now();
}

function couponView(row, options = {}) {
  if (!row) return null;
  const viewerRedeemed = Boolean(options.viewerRedeemed);
  const owner = Boolean(options.owner);
  const expired = isExpired(row.expires_at);
  const active = text(row.status, 20) === 'active';
  return {
    couponHandle: text(row.coupon_handle, 120),
    title: text(row.title, 80),
    description: text(row.description, 800),
    terms: text(row.terms, 800),
    expiresAt: text(row.expires_at, 48),
    status: !active ? 'inactive' : expired ? 'expired' : viewerRedeemed ? 'redeemed' : 'available',
    viewerRedeemed,
    redeemedAt: text(options.redeemedAt, 48),
    redemptionCount: owner ? Math.max(0, Number(options.redemptionCount) || 0) : undefined,
    canRedeem: active && !expired && !viewerRedeemed && !owner,
    isOwner: owner
  };
}

async function findCouponByPost(db, postHandle) {
  return db.prepare(`
    SELECT coupon_handle, post_handle, owner_user_id, title, description, terms, expires_at, status
    FROM exchange_zone_coupons
    WHERE post_handle = ?1
    LIMIT 1
  `).bind(postHandle).first();
}

async function redemptionInfo(db, couponHandle, userId) {
  if (!couponHandle || !userId) return null;
  return db.prepare(`
    SELECT redeemed_at
    FROM exchange_zone_coupon_redemptions
    WHERE coupon_handle = ?1 AND user_id = ?2
    LIMIT 1
  `).bind(couponHandle, userId).first();
}

async function redemptionCount(db, couponHandle) {
  const row = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM exchange_zone_coupon_redemptions
    WHERE coupon_handle = ?1
  `).bind(couponHandle).first();
  return Math.max(0, Number(row?.total) || 0);
}

function missingSchema(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('exchange_zone_coupons') || message.includes('exchange_zone_coupon_redemptions');
}

async function hydrateCoupon(db, row, actor) {
  if (!row || text(row.status, 20) !== 'active') return null;
  const userId = text(actor?.userId, 180);
  const owner = Boolean(userId && userId === text(row.owner_user_id, 180));
  const redeemed = userId ? await redemptionInfo(db, row.coupon_handle, userId) : null;
  const total = owner ? await redemptionCount(db, row.coupon_handle) : 0;
  return couponView(row, {
    owner,
    viewerRedeemed: Boolean(redeemed),
    redeemedAt: redeemed?.redeemed_at,
    redemptionCount: total
  });
}

export const ExchangeZoneCouponModule = {
  async sync(postHandleValue, couponPayload, env, actor) {
    if (couponPayload === undefined) return { success: true, skipped: true };
    if (!env?.ACTMASTER_DB) return { success: false, error: '交流區優惠券資料庫尚未設定' };
    const db = env.ACTMASTER_DB;
    const postHandle = text(postHandleValue, 120);
    const ownerUserId = text(actor?.userId, 180);
    if (!postHandle || !ownerUserId) return { success: false, error: '缺少優惠券歸屬資料' };

    try {
      const post = await db.prepare(`
        SELECT post_handle, author_user_id
        FROM exchange_zone_posts
        WHERE post_handle = ?1 AND author_user_id = ?2 AND status = 'published'
        LIMIT 1
      `).bind(postHandle, ownerUserId).first();
      if (!post) return { success: false, error: '找不到可設定優惠券的交流內容', code: 'EXCHANGE_COUPON_POST_NOT_OWNED' };

      const input = couponInput(couponPayload);
      if (input.error) return { success: false, error: input.error, code: 'EXCHANGE_COUPON_INVALID' };
      const existing = await findCouponByPost(db, postHandle);

      if (!input.enabled) {
        if (!existing) return { success: true, couponAvailable: false, coupon: null };
        const total = await redemptionCount(db, existing.coupon_handle);
        if (total > 0) {
          return {
            success: false,
            error: '這張優惠券已有核銷紀錄，不能移除',
            code: 'EXCHANGE_COUPON_HAS_REDEMPTIONS',
            coupon: await hydrateCoupon(db, existing, actor)
          };
        }
        await db.prepare(`
          UPDATE exchange_zone_coupons
          SET status = 'inactive', updated_at = CURRENT_TIMESTAMP
          WHERE coupon_handle = ?1 AND owner_user_id = ?2
        `).bind(existing.coupon_handle, ownerUserId).run();
        return { success: true, couponAvailable: false, coupon: null };
      }

      let row;
      if (existing) {
        await db.prepare(`
          UPDATE exchange_zone_coupons
          SET title = ?1,
              description = ?2,
              terms = ?3,
              expires_at = ?4,
              status = 'active',
              updated_at = CURRENT_TIMESTAMP
          WHERE coupon_handle = ?5 AND owner_user_id = ?6
        `).bind(input.title, input.description, input.terms, input.expiresAt, existing.coupon_handle, ownerUserId).run();
        row = await findCouponByPost(db, postHandle);
      } else {
        const couponHandle = `exc_${crypto.randomUUID()}`;
        await db.prepare(`
          INSERT INTO exchange_zone_coupons
            (coupon_handle, post_handle, owner_user_id, title, description, terms, expires_at, status)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active')
        `).bind(couponHandle, postHandle, ownerUserId, input.title, input.description, input.terms, input.expiresAt).run();
        row = await findCouponByPost(db, postHandle);
      }
      return { success: true, couponAvailable: true, coupon: await hydrateCoupon(db, row, actor) };
    } catch (error) {
      if (missingSchema(error)) {
        return { success: false, error: '交流區優惠券資料庫尚未更新，請先套用 0024 migration', code: 'EXCHANGE_COUPON_MIGRATION_REQUIRED' };
      }
      throw error;
    }
  },

  async hydrateList(posts, env, actor) {
    const safePosts = Array.isArray(posts) ? posts : [];
    if (!safePosts.length || !env?.ACTMASTER_DB) return safePosts;
    const handles = [...new Set(safePosts.map((post) => text(post?.postHandle, 120)).filter(Boolean))];
    if (!handles.length) return safePosts;
    try {
      const placeholders = handles.map((_, index) => `?${index + 1}`).join(',');
      const rows = await env.ACTMASTER_DB.prepare(`
        SELECT coupon_handle, post_handle, title, expires_at, status
        FROM exchange_zone_coupons
        WHERE post_handle IN (${placeholders}) AND status = 'active'
      `).bind(...handles).all();
      const byPost = new Map((rows?.results || []).map((row) => [text(row.post_handle, 120), row]));
      return safePosts.map((post) => {
        const row = byPost.get(text(post?.postHandle, 120));
        if (!row) return { ...post, couponAvailable: false };
        return {
          ...post,
          couponAvailable: true,
          couponTitle: text(row.title, 80),
          couponStatus: isExpired(row.expires_at) ? 'expired' : 'available'
        };
      });
    } catch (error) {
      if (missingSchema(error)) return safePosts.map((post) => ({ ...post, couponAvailable: false }));
      throw error;
    }
  },

  async hydratePost(post, env, actor) {
    if (!post || !env?.ACTMASTER_DB) return post;
    const postHandle = text(post?.postHandle, 120);
    if (!postHandle) return post;
    try {
      const row = await findCouponByPost(env.ACTMASTER_DB, postHandle);
      if (!row || text(row.status, 20) !== 'active') return { ...post, couponAvailable: false, coupon: null };
      return { ...post, couponAvailable: true, coupon: await hydrateCoupon(env.ACTMASTER_DB, row, actor) };
    } catch (error) {
      if (missingSchema(error)) return { ...post, couponAvailable: false, coupon: null };
      throw error;
    }
  },

  async redeem(payload, env, actor) {
    if (!env?.ACTMASTER_DB) return { success: false, error: '交流區優惠券資料庫尚未設定' };
    const db = env.ACTMASTER_DB;
    const couponHandle = text(payload?.couponHandle || payload?.coupon_handle, 120);
    const userId = text(actor?.userId, 180);
    const note = text(payload?.note || payload?.redeemNote, 300);
    if (!couponHandle || !userId) return { success: false, error: '缺少核銷資料' };

    try {
      const row = await db.prepare(`
        SELECT c.coupon_handle, c.post_handle, c.owner_user_id, c.title, c.description, c.terms, c.expires_at, c.status
        FROM exchange_zone_coupons c
        JOIN exchange_zone_posts p ON p.post_handle = c.post_handle
        WHERE c.coupon_handle = ?1
          AND c.status = 'active'
          AND p.status = 'published'
          AND (p.expires_at = '' OR p.expires_at > CURRENT_TIMESTAMP)
          AND (c.expires_at = '' OR datetime(c.expires_at) >= CURRENT_TIMESTAMP)
        LIMIT 1
      `).bind(couponHandle).first();
      if (!row) return { success: false, error: '優惠券不存在、已失效或已過期', code: 'EXCHANGE_COUPON_NOT_AVAILABLE' };
      if (text(row.owner_user_id, 180) === userId) {
        return { success: false, error: '發券者不能核銷自己的優惠券', code: 'EXCHANGE_COUPON_SELF_REDEEM' };
      }

      const result = await db.prepare(`
        INSERT OR IGNORE INTO exchange_zone_coupon_redemptions
          (coupon_handle, user_id, redeemed_at, redeem_note)
        VALUES (?1, ?2, CURRENT_TIMESTAMP, ?3)
      `).bind(couponHandle, userId, note).run();

      if (!result?.success || Number(result?.meta?.changes || 0) < 1) {
        const existing = await redemptionInfo(db, couponHandle, userId);
        return {
          success: false,
          error: '這張優惠券已核銷，不能重複使用',
          code: 'EXCHANGE_COUPON_ALREADY_REDEEMED',
          coupon: couponView(row, { viewerRedeemed: true, redeemedAt: existing?.redeemed_at })
        };
      }

      const redeemed = await redemptionInfo(db, couponHandle, userId);
      return {
        success: true,
        coupon: couponView(row, { viewerRedeemed: true, redeemedAt: redeemed?.redeemed_at })
      };
    } catch (error) {
      if (missingSchema(error)) {
        return { success: false, error: '交流區優惠券資料庫尚未更新，請先套用 0024 migration', code: 'EXCHANGE_COUPON_MIGRATION_REQUIRED' };
      }
      throw error;
    }
  }
};
