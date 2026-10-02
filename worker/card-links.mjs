import '../js/shared/card-links.js';

export const CARD_LINKS_FLAG = 'feature:card-links-v2';
export const CardLinks = globalThis.CardLinks;

export async function cardLinksEnabled(env) {
  try {
    const row = await env.ACTMASTER_DB.prepare('SELECT value FROM app_meta WHERE key = ?').bind(CARD_LINKS_FLAG).first();
    return row?.value === 'enabled';
  } catch { return false; }
}

export async function cardLinksConfigResponse(env) {
  return Response.json({ enabled:await cardLinksEnabled(env) }, {
    headers:{ 'Access-Control-Allow-Origin':'*', 'Cache-Control':'no-store' }
  });
}
