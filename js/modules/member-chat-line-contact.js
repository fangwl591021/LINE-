// Shared server/browser validation. This is an add-friend link, NEVER a push recipient.
export function normalizeLineContact(value) {
  if (typeof value !== 'string' || value.length > 500 || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  const input = value.trim();
  if (!input) return '';
  if (/^U[0-9a-f]{32}$/i.test(input)) return null;
  if (/^[a-z0-9_.-]{4,20}$/i.test(input)) return 'https://line.me/ti/p/~' + input;
  if (/^@[a-z0-9_.-]{1,32}$/i.test(input)) return 'https://line.me/R/ti/p/' + encodeURIComponent(input);
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || (url.hash && url.hash !== '#~')) return null;
    const profile = url.hostname === 'line.me' && /^\/(?:R\/)?ti\/p\/(?:~|@|%40)?[a-z0-9_.-]{1,160}\/?$/i.test(url.pathname);
    const short = url.hostname === 'lin.ee' && /^\/[a-z0-9_-]{1,160}\/?$/i.test(url.pathname);
    return profile || short ? url.href : null;
  } catch { return null; }
}
