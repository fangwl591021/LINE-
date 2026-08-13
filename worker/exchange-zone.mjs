const MAX_POSTS = 50;

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
  return { mode, allowed, canManage: isAdmin && allowed };
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
    access: { mode: access.mode, allowed: false, canManage: false }
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
      LIMIT 1
    `).bind(postHandle).first();
    return row
      ? { success: true, access, post: publicPost(row, true) }
      : { success: false, error: '找不到這則交流內容' };
  }
};
