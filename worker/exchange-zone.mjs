import { getExchangeZoneLikeState, hydrateExchangeZoneLikes, toggleExchangeZoneLike } from './exchange-zone-likes.mjs';

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

function cardConfig(value) {
  if (value && typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function color(value, fallback = '#06C755') {
  const raw = text(value, 16);
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : fallback;
}

function actionUrl(value) {
  const raw = text(value, 500);
  if (!raw) return '';
  if (/^tel:\+?[0-9#*(),. -]{5,40}$/i.test(raw)) return raw;
  if (/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch (error) {
    return '';
  }
}

function telephoneUrl(value) {
  const normalized = text(value, 50).replace(/[^0-9+#*]/g, '');
  return normalized.length >= 5 ? `tel:${normalized}` : '';
}

function emailUrl(value) {
  const normalized = text(value, 180);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? `mailto:${normalized}` : '';
}

function firstHttpsIn(value) {
  const raw = text(value, 1000);
  const match = raw.match(/https:\/\/[^\s"',}\]]+/i);
  return actionUrl(match?.[0] || raw);
}

function publicCard(row) {
  if (Number(row?.card_available) !== 1) return null;
  const config = cardConfig(row?.card_custom_config);
  const configuredButtons = Array.isArray(config.buttons)
    ? config.buttons
    : (Array.isArray(config.footerBtns) ? config.footerBtns : []);
  const customButtons = configuredButtons.map((button) => ({
    label: text(button?.l || button?.label, 40) || '聯絡',
    url: actionUrl(button?.u || button?.url),
    color: color(button?.c || button?.color)
  })).filter((button) => button.url);
  const automaticButtons = [
    { label: '行動電話', url: telephoneUrl(row?.card_mobile || row?.card_office_phone), color: '#3b82f6' },
    { label: '電子信箱', url: emailUrl(row?.card_email), color: '#0f766e' },
    { label: '官方網站', url: firstHttpsIn(row?.card_website || row?.card_socials), color: '#7c3aed' },
    { label: '查看地圖', url: text(row?.card_address, 300) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text(row.card_address, 300))}` : '', color: '#1e293b' }
  ].filter((button) => button.url);
  const buttons = [...customButtons];
  automaticButtons.forEach((button) => {
    if (!buttons.some((existing) => existing.url === button.url)) buttons.push(button);
  });
  const layout = ['landscape', 'portrait', 'square'].includes(text(config.layoutStyle || config.layout, 20))
    ? text(config.layoutStyle || config.layout, 20)
    : 'landscape';
  const configuredImage = layout === 'portrait'
    ? config.imgUrlPortrait
    : (layout === 'square' ? config.imgUrlSquare : (config.imgUrl || config.imgUrlLandscape));
  return {
    name: text(row?.card_name, 100),
    companyName: text(row?.card_company_name, 140),
    title: text(row?.card_title, 100),
    department: text(row?.card_department, 100),
    services: text(row?.card_services, 500),
    imageUrl: avatarUrl(configuredImage || row?.card_image_url),
    layout,
    description: text(config.desc || row?.card_services, 500),
    descriptionColor: color(config.descColor, '#475569'),
    descriptionAlign: ['left', 'center', 'right'].includes(text(config.descAlign, 10)) ? text(config.descAlign, 10) : 'center',
    buttons: buttons.slice(0, 6)
  };
}

function publicPost(row, detail = false, actor = null) {
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
    cardAvailable,
    canEdit: Boolean(text(actor?.userId, 180) && text(row?.author_user_id, 180) === text(actor?.userId, 180)),
    likeCount: Math.max(0, Number(row?.likeCount) || 0),
    likedByMe: row?.likedByMe === true
  };

  if (detail) {
    post.body = body;
    post.card = publicCard(row);
  }
  return post;
}

function selectColumns() {
  return `
    SELECT
      p.post_handle, p.title, p.body, p.contact_tags_json,
      p.author_user_id, p.card_row_id, p.published_at, p.created_at
    FROM exchange_zone_posts p
  `;
}

async function withAuthor(db, row) {
  const fallback = { ...row, author_name: '會員' };
  const authorUserId = text(row?.author_user_id, 180);
  if (!authorUserId) return fallback;
  try {
    const author = await db.prepare(`
      SELECT u.name
      FROM users u
      WHERE u.line_id = ?1 OR u.row_id = ?1
      ORDER BY CASE WHEN u.line_id = ?1 THEN 0 ELSE 1 END
      LIMIT 1
    `).bind(authorUserId).first();
    return { ...row, author_name: text(author?.name, 80) || '會員' };
  } catch (error) {
    console.warn('Exchange zone author hydration skipped:', String(error?.message || error).slice(0, 240));
    return fallback;
  }
}

function withoutCard(row) {
  return {
    ...row,
    author_avatar_url: '',
    card_available: 0,
    card_name: '',
    card_company_name: '',
    card_title: '',
    card_image_url: '',
    card_department: '',
    card_services: '',
    card_mobile: '',
    card_office_phone: '',
    card_email: '',
    card_website: '',
    card_socials: '',
    card_address: '',
    card_custom_config: ''
  };
}

async function withPublicCard(db, row) {
  const fallback = withoutCard(row);
  const cardRowId = text(row?.card_row_id, 180);
  const authorUserId = text(row?.author_user_id, 180);
  if (!cardRowId || !authorUserId) return fallback;
  try {
    const card = await db.prepare(`
      SELECT c.row_id, c.name, c.company_name, c.title, c.department, c.services,
             c.mobile, c.office_phone, c.email, c.website, c.socials, c.address,
             c.image_url, c.custom_config
      FROM card_contacts c
      WHERE c.row_id = ?1
        AND LOWER(COALESCE(c.source_type, '')) = 'self_profile'
        AND LOWER(COALESCE(c.visibility, '')) = 'public'
        AND (
          c.line_id = ?2
          OR c.owner_user_id = ?2
          OR c.profile_user_id = ?2
        )
      LIMIT 1
    `).bind(cardRowId, authorUserId).first();
    if (!card) return fallback;
    return {
      ...row,
      author_avatar_url: card.image_url || '',
      card_available: 1,
      card_name: card.name || '',
      card_company_name: card.company_name || '',
      card_title: card.title || '',
      card_image_url: card.image_url || '',
      card_department: card.department || '',
      card_services: card.services || '',
      card_mobile: card.mobile || '',
      card_office_phone: card.office_phone || '',
      card_email: card.email || '',
      card_website: card.website || '',
      card_socials: card.socials || '',
      card_address: card.address || '',
      card_custom_config: card.custom_config || ''
    };
  } catch (error) {
    console.warn('Exchange zone public card hydration skipped:', String(error?.message || error).slice(0, 240));
    return fallback;
  }
}

async function hydratedPost(db, row) {
  return withPublicCard(db, await withAuthor(db, row));
}

function isPublishSchemaError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('exchange_zone_publish_operations')
    || message.includes('no such column: p.expires_at')
    || message.includes('no such column: expires_at')
    || message.includes('no such column: point_cost')
    || message.includes('no such column: publish_operation_id');
}

function migrationRequired() {
  return {
    success: false,
    error: '交流專區資料庫更新尚未完成，請先套用 0022 migration',
    code: 'EXCHANGE_ZONE_MIGRATION_REQUIRED'
  };
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

function postInput(payload, requireIdempotency = true) {
  const title = text(payload?.title, 80);
  const body = text(payload?.body, 2000);
  const idempotencyKey = text(payload?.idempotencyKey, 120);
  const selectedTags = Array.isArray(payload?.contactTags)
    ? [...new Set(payload.contactTags.map((item) => text(item, 24)).filter((item) => CONTACT_TAGS.includes(item)))].slice(0, 3)
    : [];
  if (title.length < 2) return { error: '標題至少需要 2 個字' };
  if (body.length < 10) return { error: '交流內容至少需要 10 個字' };
  if (requireIdempotency && !/^[A-Za-z0-9_-]{16,120}$/.test(idempotencyKey)) return { error: '刊登識別碼格式不正確' };
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
    let result;
    try {
      result = await env.ACTMASTER_DB.prepare(`
        ${selectColumns()}
        WHERE p.status = 'published'
          AND (p.expires_at = '' OR p.expires_at > CURRENT_TIMESTAMP)
        ORDER BY COALESCE(NULLIF(p.published_at, ''), p.created_at) DESC, p.post_id DESC
        LIMIT ?1
      `).bind(limit).all();
    } catch (error) {
      if (!isPublishSchemaError(error)) throw error;
      result = await env.ACTMASTER_DB.prepare(`
        ${selectColumns()}
        WHERE p.status = 'published'
        ORDER BY COALESCE(NULLIF(p.published_at, ''), p.created_at) DESC, p.post_id DESC
        LIMIT ?1
      `).bind(limit).all();
    }
    const hydrated = await Promise.all((result?.results || []).map((row) => hydratedPost(env.ACTMASTER_DB, row)));
    let likeHydrated = hydrated;
    try {
      likeHydrated = await hydrateExchangeZoneLikes(env.ACTMASTER_DB, hydrated, actor?.userId);
    } catch (error) {
      console.warn('Exchange zone like hydration skipped:', String(error?.message || error).slice(0, 240));
    }
    const posts = likeHydrated.map((row) => publicPost(row, false, actor)).filter((post) => post.postHandle);
    return { success: true, access, posts, count: posts.length };
  },

  async get(payload, env, actor) {
    const access = accessFor(actor, env);
    if (!access.allowed) return denied(access);
    if (!env?.ACTMASTER_DB) return { success: false, error: '交流專區資料庫尚未設定' };

    const postHandle = text(payload?.postHandle, 120);
    if (!postHandle) return { success: false, error: '缺少交流內容識別碼' };
    let row;
    try {
      row = await env.ACTMASTER_DB.prepare(`
        ${selectColumns()}
        WHERE p.post_handle = ?1 AND p.status = 'published'
          AND (p.expires_at = '' OR p.expires_at > CURRENT_TIMESTAMP)
        LIMIT 1
      `).bind(postHandle).first();
    } catch (error) {
      if (!isPublishSchemaError(error)) throw error;
      row = await env.ACTMASTER_DB.prepare(`
        ${selectColumns()}
        WHERE p.post_handle = ?1 AND p.status = 'published'
        LIMIT 1
      `).bind(postHandle).first();
    }
    let hydrated = row ? await hydratedPost(env.ACTMASTER_DB, row) : null;
    if (hydrated) {
      try {
        hydrated = { ...hydrated, ...(await getExchangeZoneLikeState(env.ACTMASTER_DB, postHandle, actor?.userId)) };
      } catch (error) {
        console.warn('Exchange zone like state skipped:', String(error?.message || error).slice(0, 240));
      }
    }
    return hydrated
      ? { success: true, access, post: publicPost(hydrated, true, actor) }
      : { success: false, error: '找不到這則交流內容' };
  },

  async update(payload, env, actor) {
    const access = accessFor(actor, env);
    if (!access.allowed) return denied(access);
    if (!env?.ACTMASTER_DB) return { success: false, error: '交流專區資料庫尚未設定' };

    if (payload?.toggleLike === true) {
      return toggleExchangeZoneLike(env.ACTMASTER_DB, payload, actor);
    }

    const authorUserId = text(actor?.userId, 180);
    const postHandle = text(payload?.postHandle, 120);
    if (!authorUserId || !postHandle) return { success: false, error: '缺少交流內容識別資料' };
    const input = postInput(payload, false);
    if (input.error) return { success: false, error: input.error, code: 'EXCHANGE_UPDATE_INVALID' };

    const owned = await env.ACTMASTER_DB.prepare(`
      SELECT post_handle
      FROM exchange_zone_posts
      WHERE post_handle = ?1 AND author_user_id = ?2 AND status = 'published'
        AND (expires_at = '' OR expires_at > CURRENT_TIMESTAMP)
      LIMIT 1
    `).bind(postHandle, authorUserId).first();
    if (!owned) return { success: false, error: '找不到可編輯的交流內容', code: 'EXCHANGE_UPDATE_NOT_ALLOWED' };

    await env.ACTMASTER_DB.prepare(`
      UPDATE exchange_zone_posts
      SET title = ?1,
          body = ?2,
          contact_tags_json = ?3,
          card_row_id = CASE WHEN ?4 = 1 THEN COALESCE((
            SELECT c.row_id FROM card_contacts c
            WHERE LOWER(COALESCE(c.source_type, '')) = 'self_profile'
              AND LOWER(COALESCE(c.visibility, '')) = 'public'
              AND (c.line_id = ?5 OR c.owner_user_id = ?5 OR c.profile_user_id = ?5)
            ORDER BY c.updated_at DESC, c.row_id DESC LIMIT 1
          ), '') ELSE '' END,
          updated_at = CURRENT_TIMESTAMP
      WHERE post_handle = ?6 AND author_user_id = ?5 AND status = 'published'
    `).bind(
      input.title,
      input.body,
      JSON.stringify(input.contactTags),
      input.attachMyCard ? 1 : 0,
      authorUserId,
      postHandle
    ).run();
    return { success: true, updated: true, chargedPoints: 0, postHandle, access };
  },

  async publish(payload, env, actor, points) {
    const access = accessFor(actor, env);
    if (!access.allowed || !access.canPublish) return denied(access);
    if (!env?.ACTMASTER_DB) return { success: false, error: '交流專區資料庫尚未設定' };
    if (!points || typeof points.balance !== 'function' || typeof points.adjust !== 'function') {
      return { success: false, error: '交流專區點數服務尚未設定' };
    }

    const input = postInput(payload, true);
    if (input.error) return { success: false, error: input.error, code: 'EXCHANGE_PUBLISH_INVALID' };
    const authorUserId = text(actor?.userId, 180);
    if (!authorUserId) return { success: false, error: '缺少登入會員識別資料' };

    let prior;
    try {
      prior = await existingPublish(env.ACTMASTER_DB, authorUserId, input.idempotencyKey);
    } catch (error) {
      if (isPublishSchemaError(error)) return migrationRequired();
      throw error;
    }
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
      if (isPublishSchemaError(error)) return migrationRequired();
      return { success: false, error: '刊登失敗，尚未扣點', code: 'EXCHANGE_PUBLISH_FAILED' };
    }
  }
};
