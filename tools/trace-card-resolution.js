#!/usr/bin/env node
'use strict';

/** Fixture-only card resolver trace. Does not import or modify runtime. */
const fs = require('fs');
const crypto = require('crypto');
const args = process.argv.slice(2);
if (args.some((v) => /--remote|--prod|production/i.test(v))) {
  console.error('REFUSED: remote/production input is forbidden.'); process.exit(2);
}
const idx = args.indexOf('--fixture');
if (idx < 0 || !args[idx + 1]) {
  console.error('Usage: node tools/trace-card-resolution.js --fixture masked-fixture.json'); process.exit(2);
}
const fixture = JSON.parse(fs.readFileSync(args[idx + 1], 'utf8'));
const mask = (v) => {
  const s = String(v || '');
  return s ? `${s.slice(0,3)}…${crypto.createHash('sha256').update(s).digest('hex').slice(0,8)}` : '';
};
const actor = String(fixture.actorCanonicalId || fixture.actor || '');
const requestedVersion = String(fixture.requestedVersion || 'standard');
const entrySource = String(fixture.entrySource || 'unknown');
const candidates = Array.isArray(fixture.candidates) ? fixture.candidates : [];

function versionOf(c) {
  const id = String(c.row_id || c.card_id || c.id || '');
  const cfg = c.custom_config || c.config || {};
  if (/^CARD_VIDEO_/i.test(id)) return 'video';
  if (/^CARD_SQUARE_/i.test(id)) return 'square';
  if (/^CARD_POSTER_/i.test(id)) return 'giga';
  if (/^CARD_STD_/i.test(id)) return 'standard';
  return String(c.cardVersion || c.card_version || cfg.cardVersion || cfg.layoutStyle || cfg.cardVariant || (cfg.videoCard ? 'video' : '') || 'unknown').toLowerCase();
}
function sourceOf(c) { return String(c.source_type || c.sourceType || c.source || 'legacy_unknown'); }
function classify(c) {
  const source = sourceOf(c);
  if (['private_import','ocr_scan','referral_placeholder'].includes(source)) return 'contact';
  if (['self_profile','video_profile','line_generated','self_upload','claimed'].includes(source)) return 'personal';
  return c.owner_user_id || c.ownerUserId ? 'personal_candidate' : 'unknown';
}
function identities(c) {
  return [c.owner_user_id,c.ownerUserId,c.profile_user_id,c.profileUserId,c.line_id,c.lineId,c.bound_user_id,c.boundUserId].filter(Boolean).map(String);
}
const traced = candidates.map((c) => {
  const reasons = [];
  const type = classify(c);
  const version = versionOf(c);
  const ids = identities(c);
  if (type === 'contact' && /my.?card|line_oa_my_card|edit_personal/i.test(entrySource)) reasons.push('contact card excluded from personal entry');
  if (requestedVersion !== 'any' && version !== requestedVersion) reasons.push(`version mismatch: ${version}`);
  if (actor && !ids.includes(actor)) reasons.push('actor identity does not match owner/profile/line/bound');
  if (sourceOf(c) === 'video_profile' && requestedVersion !== 'video') reasons.push('video profile excluded from static request');
  return {
    card: mask(c.row_id || c.card_id || c.id), sourceType: sourceOf(c), type, version,
    permission: { read: reasons.length === 0, edit: reasons.length === 0 && type !== 'contact' },
    exclusionReasons: reasons
  };
});
const eligible = traced.filter((x) => x.exclusionReasons.length === 0);
const result = {
  actorCanonicalId: mask(actor), entrySource, requestedVersion,
  candidateCards: traced,
  finalCard: eligible.length === 1 ? eligible[0].card : null,
  permission: eligible.length === 1 ? eligible[0].permission : { read:false, edit:false },
  ambiguity: eligible.length > 1,
  diagnostic: eligible.length > 1 ? 'multiple eligible cards: resolver must not silently choose' : eligible.length === 0 ? 'not_found' : 'resolved'
};
console.log(JSON.stringify(result, null, 2));
