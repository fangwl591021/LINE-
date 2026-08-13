const MAX_POSTS = 50;
const PUBLISH_COST = 10;
const PUBLISH_DAYS = 7;
const CONTACT_TAGS = Object.freeze(['合作邀約', '商品服務', '活動邀請', '人才交流', '其他']);

function text(value, maxLength = 2000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function accessMode(env) {
  const mode = text(env?.EXCHANGE_ZONE_ACCESS_MODE, 20).toLowerCase();
  return ['private', 'pilot', 'open'].includes(mode) ? mode : 'private';
}

function pilotIds(env) {
  return text(env?.EXCHANGE_ZONE_PILOT_USER_IDS, 8000)
    .split(',')
    .map((value) => text(value, 180))
    .filter(Boolean);
}

function privateTesterIds(env) {
  return text(env?.EXCHANGE_ZONE_PRIVATE_TESTER_IDS, 8000)
    .split(',')
    .map((value) => text(value, 180))
    .filter(Boolean);
}

function accessFor(actor, env) {
  const mode = accessMode(env);
  const userId = text(actor?.userId, 180);
  const role = text(actor?.role, 30).toLowerCase();
  const isAdmin = role === 'admin';
  const isPrivateTester = isAdmin && userId && privateTesterIds(env).includes(userId);
  const allowed = mode === 'open' || isPrivateTester || (mode === 'pilot' && userId && pilotIds(env).includes(userId));
  return {
    mode,
    allowed,
    canManage: isAdmin && allowed,
    canPublish: allowed,
    publishCost: PUBLISH_COST,
    publishDays: PUBLISH_DAYS,
    contactTags: CONTACT_TAGS.slice()
  };
}

function boundedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(MAX_POSTS, Math.max(1, parsed));
}

function tags(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => text(item, 24)).filter(Boolean).slice(0, 3);
  } catch (error) {
    return [];
  }
}

function avatarUrl(value) {
  const raw = text(value, 500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch (error) {
    return '';
  }
}

function publicPost(row, detail = false) {
  const body = text(row?.body, 2000);
  const cardAvailable = Number(row?.card_available) === 1;
  const post = {
    postHandle: text(row?.post_handle, 120),
    title: text(row?.title, 80) || '未命名交流內容',
    excerpt: body.slice(0, 120),
    contactTags: tags(row?.contact_tags_json),
    publishedAt: text(row?.published_at || row?.created_at, 40),
    author: {
      name: text(row?.author_name, 80) || '會員',
      avatarUrl: avatarUrl(row?.author_avatar_url)
    },
    cardAvailable
  };

  if (detail) {
    post.body = body;
    post.card = cardAvailable ? {
      name: text(row?.card_name, 100),
      companyName: text(row?.card_company_name, 140),
      title: text(row?.card_title, 100),
      imageUrl: avatarUrl(row?.card_image_url)
    } : null;
  }
  return post;
}

function selectColumns() {
  return `
    SELECT
      p.post_handle, p.title, p.body, p.contact_tags_json,
      p.published_at, p.created_at,
      COALESCE((
        SELECT u.name FROM users u
        WHERE u.line_id = p.author_user_id OR u.row_id = p.author_user_id
        ORDER BY CASE WHEN u.line_id = p.author_user_id THEN 0 ELSE 1 END
        LIMIT 1
      ), '會員') AS author_name,
      COALESCE((
        SELECT u.picture_url FROM users u
        WHERE u.line_id = p.author_user_id OR u.row_id = p.author_user_id
        ORDER BY CASE WHEN u.line_id = p.author_user_id THEN 0 ELSE 1 END
        LIMIT 1
      ), '') AS author_avatar_url,
      CASE WHEN c.row_id IS NULL THEN 0 ELSE 1 END AS card_available,
      COALESCE(c.name, '') AS card_name,
      COALESCE(c.company_name, '') AS card_company_name,
      COALESCE(c.title, '') AS card_title,
      COALESCE(c.image_url, '') AS card_image_url
    FROM exchange_zone_posts p
    LEFT JOIN card_contacts c
      ON c.row_id = p.card_row_id
      AND LOWER(COALESCE(c.source_type, '')) = 'self_profile'
      AND LOWER(COALESCE(c.visibility, '')) = 'public'
      AND (
        c.line_id = p.author_user_id
        OR c.owner_user_id = p.author_user_id
        OR c.profile_user_id = p.author_user_id
      )
  `;
}

function denied(access) {
  return {
    success: false,
    error: '交流專區尚未對此帳號開放',
    code: 'EXCHANGE_ZONE_ACCESS_DENIED',
    access: {
      mode: access.mode,
      allowed: false,
      canManage: false,
      canPublish: false,
      publishCost: PUBLISH_COST,
      publishDays: PUBLISH_DAYS,
      contactTags: CONTACT_TAGS.slice()
    }
  };
}

function publishInput(payload) {
  const title = text(payload?.title, 80);
  const body = text(payload?.body, 2000);
  const idempotencyKey = text(payload?.idempotencyKey, 120);
  const selectedTags = Array.isArray(payload?.contactTags)
    ? [...new Set(payload.contactTags.map((item) => text(item, 24)).filter((item) => CONTACT_TAGS.includes(item)))].slice(0, 3)
    : [];
  if (title.length < 2) return { error: '標題至少需要 2 個字' };
  if (body.length < 10) return { error: '交流內容至少需要 10 個字' };
  if (!/^[A-Za-z0-9_-]{16,120}$/.test(idempotencyKey)) return { error: '刊登識別碼格式不正確' };
  return { title, body, idempotencyKey, contactTags: selectedTags, attachMyCard: payload?.attachMyCard === true };
}

function safeJson(value) {
  try {
    return JSON.stringify(value ?? {}).slice(0, 8000);
  } catch (error) {
    return '{}';
  }
}

async function markOperation(db, operationId, state, failureCode = '', response = {}) {
  await db.prepare(`
    UPDATE exchange_zone_publish_operations
    SET state = ?1, failure_code = ?2, point_response_json = ?3, updated_at = CURRENT_TIMESTAMP
    WHERE operation_id = ?4
  `).bind(state, text(failureCode, 80), safeJson(response), operationId).run();
}

async function existingPublish(db, authorUserId, idempotencyKey) {
  return db.prepare(`
    SELECT operation_id, post_handle, state
    FROM exchange_zone_publish_operations
    WHERE author_user_id = ?1 AND idempotency_key = ?2
    LIMIT 1
  `).bind(authorUserId, idempotencyKey).first();
}

function duplicateResult(row, access) {
  if (text(row?.state, 40) === 'published') {
    return {
      success: true,
      alreadyPublished: true,
      chargedPoints: 0,
      postHandle: text(row?.post_handle, 120),
      access
    };
  }
  return {
    success: false,
    error: '這次刊登正在處理或已結束，請勿重複送出',
    code: 'EXCHANGE_PUBLISH_NOT_RETRYABLE'
  };
}

export const ExchangeZoneModule = {
  accessMode,
  accessFor,

  access(payload, env, actor) {
    const access = accessFor(actor, env);
    return { success: true, access };
  },

  async list(payload, env, actor) {
    const access = accessFor(actor, env);
    if (!access.allowed) return denied(access);
    if (!env?.ACTMASTER_DB) return { success: false, error: '交流專區資料庫尚未設定' };

    const limit = boundedLimit(payload?.limit);
    const result = await env.ACTMASTER_DB.prepare(`
      ${selectColumns()}
      WHERE p.status = 'published'
        AND (p.expires_at = '' OR p.expires_at > CURRENT_TIMESTAMP)
      ORDER BY COALESCE(NULLIF(p.published_at, ''), p.created_at) DESC, p.post_id DESC
      LIMIT ?1
    `).bind(limit).all();
    const posts = (result?.results || []).map((row) => publicPost(row, false)).filter((post) => post.postHandle);
    return { success: true, access, posts, count: posts.length };
  },

  async get(payload, env, actor) {
    const access = accessFor(actor, env);
    if (!access.allowed) return denied(access);
    if (!env?.ACTMASTER_DB) return { success: false, error: '交流專區資料庫尚未設定' };

    const postHandle = text(payload?.postHandle, 120);
    if (!postHandle) return { success: false, error: '缺少交流內容識別碼' };
    const row = await env.ACTMASTER_DB.prepare(`
      ${selectColumns()}
      WHERE p.post_handle = ?1 AND p.status = 'published'
        AND (p.expires_at = '' OR p.expires_at > CURRENT_TIMESTAMP)
      LIMIT 1
    `).bind(postHandle).first();
    return row
      ? { success: true, access, post: publicPost(row, true) }
      : { success: false, error: '找不到這則交流內容' };
  },

  async publish(payload, env, actor, points) {
    const access = accessFor(actor, env);
    if (!access.allowed || !access.canPublish) return denied(access);
    if (!env?.ACTMASTER_DB) return { success: false, error: '交流專區資料庫尚未設定' };
    if (!points || typeof points.balance !== 'function' || typeof points.adjust !== 'function') {
      return { success: false, error: '交流專區點數服務尚未設定' };
    }

    const input = publishInput(payload);
    if (input.error) return { success: false, error: input.error, code: 'EXCHANGE_PUBLISH_INVALID' };
    const authorUserId = text(actor?.userId, 180);
    if (!authorUserId) return { success: false, error: '缺少登入會員識別資料' };

    const prior = await existingPublish(env.ACTMASTER_DB, authorUserId, input.idempotencyKey);
    if (prior) return duplicateResult(prior, access);

    const operationId = `exop_${crypto.randomUUID()}`;
    const postHandle = `exp_${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + PUBLISH_DAYS * 86400000).toISOString();
    let completedDebit = null;
    try {
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO exchange_zone_publish_operations
          (operation_id, idempotency_key, author_user_id, post_handle, point_cost, point_type, state)
        VALUES (?1, ?2, ?3, ?4, ?5, 'gift_money', 'reserved')
      `).bind(operationId, input.idempotencyKey, authorUserId, postHandle, PUBLISH_COST).run();
    } catch (error) {
      const raced = await existingPublish(env.ACTMASTER_DB, authorUserId, input.idempotencyKey);
      if (raced) return duplicateResult(raced, access);
      return { success: false, error: '無法建立刊登作業，請稍後重試', code: 'EXCHANGE_PUBLISH_RESERVE_FAILED' };
    }

    try {
      await env.ACTMASTER_DB.prepare(`
        INSERT INTO exchange_zone_posts
          (post_handle, author_user_id, title, body, contact_tags_json, card_row_id, status,
           expires_at, point_cost, publish_operation_id, published_at)
        VALUES (
          ?1, ?2, ?3, ?4, ?5,
          CASE WHEN ?6 = 1 THEN COALESCE((
            SELECT c.row_id FROM card_contacts c
            WHERE LOWER(COALESCE(c.source_type, '')) = 'self_profile'
              AND LOWER(COALESCE(c.visibility, '')) = 'public'
              AND (c.line_id = ?2 OR c.owner_user_id = ?2 OR c.profile_user_id = ?2)
            ORDER BY c.updated_at DESC, c.row_id DESC LIMIT 1
          ), '') ELSE '' END,
          'draft', ?7, ?8, ?9, ''
        )
      `).bind(
        postHandle,
        authorUserId,
        input.title,
        input.body,
        JSON.stringify(input.contactTags),
        input.attachMyCard ? 1 : 0,
        expiresAt,
        PUBLISH_COST,
        operationId
      ).run();

      const wallet = await points.balance(authorUserId);
      const balance = Number(wallet?.balance);
      if (!wallet?.success || !Number.isFinite(balance)) {
        await markOperation(env.ACTMASTER_DB, operationId, 'failed', 'POINT_BALANCE_UNAVAILABLE', wallet);
        return { success: false, error: '目前無法確認購物金餘額，尚未扣點', code: 'POINT_BALANCE_UNAVAILABLE' };
      }
      if (balance < PUBLISH_COST) {
        await markOperation(env.ACTMASTER_DB, operationId, 'failed', 'INSUFFICIENT_POINTS', { balance });
        return { success: false, error: `購物金不足，需要 ${PUBLISH_COST} 點`, code: 'INSUFFICIENT_POINTS', requiredPoints: PUBLISH_COST };
      }

      await markOperation(env.ACTMASTER_DB, operationId, 'charging');
      let debit;
      try {
        debit = await points.adjust(authorUserId, -PUBLISH_COST, {
          operationId,
          eventName: '交流專區刊登',
          eventContent: `交流內容刊登 ${PUBLISH_DAYS} 天`
        });
      } catch (debitError) {
        await markOperation(env.ACTMASTER_DB, operationId, 'debit_uncertain', 'POINT_DEBIT_UNCERTAIN', {
          message: text(debitError?.message, 240)
        }).catch(() => {});
        return {
          success: false,
          error: '扣點結果暫時無法確認，系統已停止重送並保留對帳紀錄',
          code: 'POINT_DEBIT_UNCERTAIN'
        };
      }
      if (!debit?.success) {
        await markOperation(env.ACTMASTER_DB, operationId, 'failed', 'POINT_DEBIT_FAILED', debit);
        return { success: false, error: '扣點失敗，交流內容未刊登', code: 'POINT_DEBIT_FAILED' };
      }
      completedDebit = debit;

      await markOperation(env.ACTMASTER_DB, operationId, 'charged', '', debit);
      await env.ACTMASTER_DB.batch([
        env.ACTMASTER_DB.prepare(`
          UPDATE exchange_zone_posts
          SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE publish_operation_id = ?1 AND status = 'draft'
        `).bind(operationId),
        env.ACTMASTER_DB.prepare(`
          UPDATE exchange_zone_publish_operations
          SET state = 'published', updated_at = CURRENT_TIMESTAMP
          WHERE operation_id = ?1 AND state = 'charged'
        `).bind(operationId)
      ]);

      return {
        success: true,
        postHandle,
        chargedPoints: PUBLISH_COST,
        expiresAt,
        access
      };
    } catch (error) {
      if (completedDebit?.success) {
        const credit = await points.adjust(authorUserId, PUBLISH_COST, {
          operationId,
          eventName: '交流專區刊登退款',
          eventContent: '交流內容未能發布，自動退回點數'
        }).catch((creditError) => ({ success: false, error: text(creditError?.message, 240) }));
        await markOperation(
          env.ACTMASTER_DB,
          operationId,
          credit?.success ? 'compensated' : 'compensation_pending',
          'PUBLISH_AFTER_DEBIT_FAILED',
          { debit: completedDebit, credit, message: text(error?.message, 240) }
        ).catch(() => {});
        return {
          success: false,
          error: credit?.success ? '刊登失敗，10 點已自動退回' : '刊登未完成，點數退款正在處理',
          code: credit?.success ? 'EXCHANGE_PUBLISH_REFUNDED' : 'EXCHANGE_PUBLISH_REFUND_PENDING'
        };
      }
      await markOperation(env.ACTMASTER_DB, operationId, 'failed', 'EXCHANGE_PUBLISH_FAILED', { message: text(error?.message, 240) }).catch(() => {});
      return { success: false, error: '刊登失敗，尚未扣點', code: 'EXCHANGE_PUBLISH_FAILED' };
    }
  }
};
