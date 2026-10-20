import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

function simulateInitialKeywordRoute({ isKeyword, enabled, legacy, v2 }) {
  if (isKeyword && enabled) return v2();
  return legacy();
}

const legacyReply = { type: 'flex', altText: 'legacy my card' };
const v2Reply = { type: 'flex', altText: 'resolved personal card' };

assert.equal(
  simulateInitialKeywordRoute({
    isKeyword: true,
    enabled: false,
    legacy: () => legacyReply,
    v2: () => { throw new Error('V2 must not run while disabled'); }
  }),
  legacyReply,
  'flag off preserves the legacy My Card initial-keyword response'
);

assert.equal(
  simulateInitialKeywordRoute({
    isKeyword: true,
    enabled: true,
    legacy: () => { throw new Error('legacy must not run while V2 is enabled'); },
    v2: () => v2Reply
  }),
  v2Reply,
  'flag on routes the exact keyword to the V2 resolver'
);

assert.equal(
  simulateInitialKeywordRoute({
    isKeyword: false,
    enabled: true,
    legacy: () => legacyReply,
    v2: () => { throw new Error('V2 must not run for other keywords'); }
  }),
  legacyReply,
  'other LINE OA keywords remain on their existing route'
);

assert.match(
  worker,
  /if \(isKeyword && isMyCardResolverV2Enabled\(env\)\) \{[\s\S]*?resolveSimpleMyCardV2\(event, env\)/,
  'Worker gates V2 by exact keyword and the independent feature flag'
);
assert.match(
  worker,
  /async resolveSimpleMyCardV2\(event, env\) \{[\s\S]*?event\?\.source\?\.userId/,
  'V2 uses only LINE webhook event.source.userId as its actor input'
);
assert.doesNotMatch(
  worker.match(/async resolveSimpleMyCardV2\(event, env\) \{[\s\S]*?\n  \},\n  quickMyCardUrl/)?.[0] || '',
  /findMySelfCards|myCardSelectorRows/,
  'enabled V2 never falls back to legacy selector/card lookup'
);
assert.match(worker, /return new Response\('OK', \{ status: 200 \}\);/, 'webhook status contract remains 200 OK');

console.log('CS-2A My Card Worker route contract passed');
