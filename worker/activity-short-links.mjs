// Activity-only redirects: no arbitrary destination, identity credential or write-on-open.
const text = value => String(value ?? '').trim();
const validId = value => /^[A-Za-z0-9_-]{1,160}$/.test(value);
const published = status => ['上架', 'active', 'published'].includes(text(status));
const findLink = (db, network, activity, ref) => db.prepare(
  'SELECT code FROM activity_share_links WHERE network_id=? AND activity_id=? AND referrer_id=?'
).bind(network, activity, ref).first();

export async function createActivityShareLink(payload, request, env, actor, loadActivity) {
  if (!actor?.token || !/^U[0-9a-f]{32}$/i.test(text(actor.userId))) {
    return { success: false, error: '請重新從 LINE 登入後分享活動' };
  }
  const activityId = text(payload.activityId);
  const requestedNetwork = text(payload.networkId || actor.networkId || 'admin');
  if (!validId(activityId) || !validId(requestedNetwork)) return { success: false, error: '活動連結資料不正確' };
  try {
    const result = await loadActivity({ activityId, networkId: requestedNetwork }, env, actor);
    const activity = result?.data;
    if (!result?.success || !published(activity?.status)) return { success: false, error: '活動已下架或無法分享' };
    const network = text(activity.networkId || activity.network_id || 'admin');
    if (!validId(network)) return { success: false, error: '活動歸屬資料不正確' };
    const db = env.ACTMASTER_DB, ref = actor.userId;
    let row = await findLink(db, network, activityId, ref);
    // Both unique constraints are authoritative. Never overwrite a previously issued route.
    for (let attempt = 0; !row && attempt < 3; attempt++) {
      const code = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))))
        .replace(/\+/g, '-').replace(/\//g, '_');
      await db.prepare('INSERT INTO activity_share_links(code,network_id,activity_id,referrer_id) VALUES(?,?,?,?) ON CONFLICT DO NOTHING')
        .bind(code, network, activityId, ref).run();
      row = await findLink(db, network, activityId, ref);
    }
    if (!row) throw new Error('SHORT_CODE_UNAVAILABLE');
    return { success: true, data: { code: row.code, url: new URL('/a/' + row.code, request.url).href } };
  } catch (_) {
    console.error('activity_share_link_create_failed');
    return { success: false, error: '短網址暫時無法產生，請使用原活動網址' };
  }
}

function problem(request, status, message) {
  return new Response(request.method === 'HEAD' ? null : message, {
    status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', ...(status === 405 ? { Allow: 'GET, HEAD' } : {}) }
  });
}

export async function handleActivityShortLink(request, env) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/a/')) return null;
  if (!['GET', 'HEAD'].includes(request.method)) return problem(request, 405, '請直接開啟活動連結。');
  const code = path.slice(3);
  if (!/^[A-Za-z0-9_-]{16}$/.test(code)) return problem(request, 404, '活動連結不存在，請向分享者索取正確網址。');
  try {
    const row = await env.ACTMASTER_DB.prepare(`SELECT s.activity_id,s.network_id,s.referrer_id,a.status,
      COALESCE(NULLIF(a.network_id,''),'admin') AS current_network
      FROM activity_share_links s LEFT JOIN activities a ON a.activity_id=s.activity_id WHERE s.code=? LIMIT 1`).bind(code).first();
    if (!row) return problem(request, 404, '活動連結不存在，請向分享者索取正確網址。');
    if (!published(row.status) || row.current_network !== row.network_id) {
      return problem(request, 410, '活動已下架或連結已異動，請向主辦單位確認。');
    }
    const liffId = text(env.POINT_LIFF_ID || env.LIFF_ID || '1660923784-vViMTZ1y');
    if (!/^\d+-[A-Za-z0-9]+$/.test(liffId)) throw new Error('INVALID_LIFF_CONFIG');
    const target = new URL('https://liff.line.me/' + liffId);
    target.search = new URLSearchParams({ a: row.activity_id, r: row.referrer_id, n: row.network_id, v: 'a' }).toString();
    return new Response(null, { status: 302, headers: { Location: target.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  } catch (_) {
    console.error('activity_share_link_resolve_failed');
    return problem(request, 503, '活動連結暫時無法讀取，請稍後重新整理此頁。');
  }
}
