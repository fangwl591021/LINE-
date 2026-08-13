function text(value, maxLength = 200) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function countValue(row) {
  const value = Number(row?.like_count ?? row?.count ?? 0);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function blockedPreviewHost(hostname) {
  const host = text(hostname, 255).toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === 'metadata.google.internal' || host === '169.254.169.254' || host === '100.100.100.200') return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  const ipv6 = host.replace(/^\[|\]$/g, '');
  if (ipv6.includes(':')) {
    if (ipv6 === '::' || ipv6 === '::1' || ipv6.startsWith('fe8') || ipv6.startsWith('fe9') || ipv6.startsWith('fea') || ipv6.startsWith('feb') || ipv6.startsWith('fc') || ipv6.startsWith('fd')) return true;
    const mapped = ipv6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped && blockedPreviewHost(mapped[1])) return true;
  }
  return false;
}

function safePreviewUrl(value, base = '') {
  const raw = text(value, 2000);
  if (!raw) return null;
  try {
    const url = base ? new URL(raw, base) : new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if (url.port && url.port !== '443') return null;
    if (blockedPreviewHost(url.hostname)) return null;
    return url;
  } catch (error) {
    return null;
  }
}

function decodeEntities(value) {
  return text(value, 4000)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16) || 32))
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function metaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match) return decodeEntities(match[1]);
  }
  return '';
}

async function readHtmlBounded(response, maxBytes = 262144) {
  const reader = response?.body?.getReader?.();
  if (!reader) return text(await response.text(), maxBytes);
  const chunks = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;
      const remaining = maxBytes - total;
      const chunk = value.length > remaining ? value.slice(0, remaining) : value;
      chunks.push(chunk);
      total += chunk.length;
      if (value.length > remaining) break;
    }
  } finally {
    try { await reader.cancel(); } catch (error) {}
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.length;
  });
  return new TextDecoder().decode(bytes);
}

export async function fetchExchangeZoneLinkPreview(value) {
  let url = safePreviewUrl(value);
  if (!url) return { success: false, error: '只支援安全的 HTTPS 網址', code: 'EXCHANGE_PREVIEW_URL_NOT_ALLOWED' };

  let response = null;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    response = await fetch(url.href, {
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
        'User-Agent': 'Mozilla/5.0 (compatible; ACTMASTER-LinkPreview/1.0)'
      }
    });
    if (response.status < 300 || response.status >= 400) break;
    const location = response.headers.get('location');
    const nextUrl = safePreviewUrl(location, url.href);
    if (!nextUrl) return { success: false, error: '網址重新導向到不允許的位置', code: 'EXCHANGE_PREVIEW_REDIRECT_BLOCKED' };
    url = nextUrl;
  }

  if (!response?.ok) return { success: false, error: '暫時無法讀取網址預覽', code: 'EXCHANGE_PREVIEW_FETCH_FAILED' };
  const contentType = text(response.headers.get('content-type'), 160).toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
    return { success: false, error: '這個網址沒有可預覽的網頁內容', code: 'EXCHANGE_PREVIEW_NOT_HTML' };
  }

  const html = await readHtmlBounded(response);
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = text(metaContent(html, 'og:title') || metaContent(html, 'twitter:title') || decodeEntities(titleMatch?.[1] || ''), 160);
  const description = text(metaContent(html, 'og:description') || metaContent(html, 'description') || metaContent(html, 'twitter:description'), 240);
  const siteName = text(metaContent(html, 'og:site_name'), 80);
  const imageCandidate = metaContent(html, 'og:image:secure_url') || metaContent(html, 'og:image') || metaContent(html, 'twitter:image');
  const imageUrl = safePreviewUrl(imageCandidate, url.href)?.href || '';

  return {
    success: true,
    preview: {
      url: url.href,
      host: text(url.hostname, 180),
      title,
      description,
      siteName,
      imageUrl
    }
  };
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
  const userId = text(actor?.userId, 180);
  if (!userId) return { success: false, error: '缺少登入會員識別資料', code: 'EXCHANGE_LIKE_AUTH_REQUIRED' };
  if (payload?.previewUrl) return fetchExchangeZoneLinkPreview(payload.previewUrl);

  const postHandle = text(payload?.postHandle, 120);
  if (!postHandle) return { success: false, error: '缺少交流內容識別碼', code: 'EXCHANGE_LIKE_POST_REQUIRED' };
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
