const fs = require('fs');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(before, after);
}

// Worker: A-kaffit image-job transport, adapted only for LINE access-token auth.
{
  const path = 'worker-entry.mjs';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "import { ExchangeZoneCouponModule } from './worker/exchange-zone-coupon.mjs';",
    "import { ExchangeZoneCouponModule } from './worker/exchange-zone-coupon.mjs';\nimport { createCardImageJob, saveCardImageResult } from './worker/a-kaffit-card-image-processing.mjs';",
    'worker import'
  );
  const anchor = `export default {\n  async fetch(request, env, ctx) {`;
  const replacement = `async function handleAkaffitCardImageRoute(request, env) {\n  const url = new URL(request.url);\n  const actor = await authenticatedActor(request, {}, env);\n  if (!actor) return json({ success: false, error: 'Access Denied: Missing or invalid LINE Token' }, 403);\n  try {\n    if (request.method === 'POST' && url.pathname === '/v1/card-images') {\n      const job = await createCardImageJob(env.ACTMASTER_DB, env.IMG_BUCKET, actor.userId, request);\n      return json({ success: true, job }, 201);\n    }\n    const resultMatch = url.pathname.match(/^\\/v1\\/card-images\\/([^/]+)\\/result$/);\n    if (request.method === 'POST' && resultMatch) {\n      const form = await request.formData();\n      const job = await saveCardImageResult(env.ACTMASTER_DB, env.IMG_BUCKET, actor.userId, decodeURIComponent(resultMatch[1]), form);\n      return json({ success: true, job }, 200);\n    }\n  } catch (error) {\n    console.error('A-kaffit card image route failed', text(error?.message) || 'UNKNOWN');\n    return json({ success: false, error: text(error?.message) || '名片影像處理失敗' }, 400);\n  }\n  return null;\n}\n\nexport default {\n  async fetch(request, env, ctx) {\n    const pathname = new URL(request.url).pathname;\n    if (pathname === '/v1/card-images' || /^\\/v1\\/card-images\\/[^/]+\\/result$/.test(pathname)) {\n      const cardImageResponse = await handleAkaffitCardImageRoute(request, env);\n      if (cardImageResponse) return cardImageResponse;\n    }`;
  source = replaceOnce(source, anchor, replacement, 'worker route');
  fs.writeFileSync(path, source);
}

// Frontend: load exact Vision V3 crop module after the legacy cropper and let the adapter own the scan entry.
{
  const path = 'index.html';
  let source = fs.readFileSync(path, 'utf8');
  const oldTag = '<script type="module" src="js/modules/a-kaffit-card-scanner-adapter.js?v=1.0"></script>';
  const newTag = '<script type="module" src="js/modules/a-kaffit-card-scanner-adapter.js?v=2.0"></script>';
  if (source.includes(oldTag)) source = source.replace(oldTag, newTag);
  else if (!source.includes(newTag)) throw new Error('Missing adapter script tag');
  fs.writeFileSync(path, source);
}

console.log('Applied A-kaffit full card workflow wiring.');
