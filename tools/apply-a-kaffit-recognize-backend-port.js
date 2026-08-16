const fs = require('fs');

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Missing patch anchor: ${label}`);
  return source.replace(before, after);
}

{
  const path = 'worker-entry.mjs';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "import { createCardImageJob, saveCardImageResult } from './worker/a-kaffit-card-image-processing.mjs';",
    "import { createCardImageJob, saveCardImageResult } from './worker/a-kaffit-card-image-processing.mjs';\nimport { recognizeAkaffitBusinessCard } from './worker/a-kaffit-card-recognize.mjs';",
    'recognize import'
  );
  source = replaceOnce(
    source,
    "      const action = text(postBody?.action);\n      const payload = postBody?.payload || {};",
    "      const action = text(postBody?.action);\n      const payload = postBody?.payload || {};\n      if (action === 'recognizeCardWithGPT4o') {\n        const actor = await authenticatedActor(request, payload, env);\n        if (!actor) return json({ success: false, error: 'Access Denied: Missing or invalid LINE Token' }, 403);\n        try {\n          const result = await recognizeAkaffitBusinessCard(payload, env);\n          return json({ success: true, ...result, data: result }, 200);\n        } catch (error) {\n          console.error('A-kaffit recognize failed', text(error?.message) || 'UNKNOWN');\n          return json({ success: false, error: text(error?.message) || '名片辨識失敗' }, 500);\n        }\n      }",
    'recognize action intercept'
  );
  fs.writeFileSync(path, source);
}

{
  const path = 'js/modules/a-kaffit-card-scanner-adapter.js';
  let source = fs.readFileSync(path, 'utf8');
  const before = "function normalizeCardData(ocr){\n  if(typeof window.normalizeOcrCardData==='function')return window.normalizeOcrCardData(ocr);\n  const source=unwrapOcr(ocr),out={};";
  const after = "function normalizeCardData(ocr){\n  const source=unwrapOcr(ocr),out={};";
  source = replaceOnce(source, before, after, 'prefer A-kaffit field names');
  fs.writeFileSync(path, source);
}

console.log('Applied A-kaffit recognize backend port.');
