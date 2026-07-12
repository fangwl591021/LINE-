#!/usr/bin/env node
'use strict';

/** Fixture-only card resolver trace. Does not import or modify runtime. */
const fs = require('fs');
const crypto = require('crypto');
const args = process.argv.slice(2);
if (args.some((v) => /--remote|--prod|production/i.test(v))) {
  console.error('REFUSED: remote/production input is forbidden.');
  process.exit(2);
}
const idx = args.indexOf('--fixture');
if (idx < 0 || !args[idx + 1]) {
  console.error('Usage: node tools/trace-card-resolution.js --fixture masked-fixture.json');
  process.exit(2);
}
const fixture = JSON.parse(fs.readFileSync(args[idx + 1], 'utf8'));
const mask = (v) => {
  const s = String(v || '');
  return s ? `${s.slice(0,3)}…${crypto.createHash('sha256').update(s).digest('hex').slice(0,8)}` : '';
};
const actor = String(fixture.actorCanonicalId || fixture.actor || '');
const requestedVersion = String(fixture.requestedVersion || 'standard').toLowerCase();
const entrySource = String(fixture.entrySource || 'unknown');
const action = String(fixture.action || 'read');
const candidates = Array.isArray(fixture.candidates) ? fixture.candidates : [];

function versionOf(c) {
  const id = String(c.row_id || c.card_id || c.id || '');
  const cfg = c.custom_config || c.config || {};
  const explicit = c.cardVersion || c.card_version || cfg.cardVersion || cfg.layoutStyle || cfg.cardVariant || (cfg.videoCard ? 'video' : '');
  const prefix = /^CARD_VIDEO_/i.test(id) ? 'video' : /^CARD_SQUARE_/i.test(id) ? 'square' : /^CARD_POSTER_/i.test(id) ? 'giga' : /^CARD_STD_/i.test(id) ? 'standard' : '';
  return { resolved: String(explicit || prefix || 'unknown').toLowerCase(), explicit: String(explicit || '').toLowerCase(), prefix };
}
function sourceOf(c) { return String(c.source_type || c.sourceType || c.source || 'legacy_unknown'); }
function classify(c) {
  const source = sourceOf(c);
  if (['private_import','ocr_scan','referral_placeholder','claimed_contact'].includes(source)) return 'contact';
  if (['self_profile','video_profile','line_generated','self_upload','claimed_personal'].includes(source)) return 'personal';
  if (source === 'claimed') return c.scanner_user_id || c.scannerUid || c.scanned_by ? 'claimed_ambiguous_contact' : 'claimed_ambiguous_personal';
  return c.owner_user_id || c.ownerUserId ? 'personal_candidate' : 'unknown';
}
function identities(c) {
  return [c.owner_user_id,c.ownerUserId,c.profile_user_id,c.profileUserId,c.line_id,c.lineId,c.bound_user_id,c.boundUserId].filter(Boolean).map(String);
}
function scannerOf(c) { return String(c.scanner_user_id || c.scannerUid || c.scanned_by || ''); }
function inviterOf(c) { return String(c.inviter_user_id || c.inviterUid || c.referrer_id || c.introducer_id || ''); }
function recognizedOf(c) { return String(c.recognized_user_id || c.recognizedPersonUid || c.recognized_uid || c.bound_user_id || c.boundUserId || ''); }
function isPersonalEntry() { return /my.?card|line_oa_my_card|edit_personal|create_personal/i.test(entrySource); }
function isAiFolderEntry() { return /ai.?card|card_folder|harvest|crm_contact|collected/i.test(entrySource); }
function isLineCreateAction() { return /line_generate|create_from_line|line_generated/i.test(action) || /line_create/i.test(entrySource); }

const traced = candidates.map((c) => {
  const reasons = [];
  const warnings = [];
  const type = classify(c);
  const versionInfo = versionOf(c);
  const ids = identities(c);
  const source = sourceOf(c);
  const scanner = scannerOf(c);
  const inviter = inviterOf(c);
  const recognized = recognizedOf(c);

  if ((type === 'contact' || type === 'claimed_ambiguous_contact') && isPersonalEntry()) reasons.push('MY_CARD_RESOLVED_CONTACT');
  if ((type === 'personal' || type === 'personal_candidate' || type === 'claimed_ambiguous_personal') && isAiFolderEntry()) reasons.push('PERSONAL_EXCLUDED_FROM_AI_FOLDER');
  if (requestedVersion !== 'any' && versionInfo.resolved !== requestedVersion) reasons.push(`VERSION_MISMATCH:${versionInfo.resolved}`);
  if (actor && !ids.includes(actor) && !(isAiFolderEntry() && scanner === actor)) reasons.push('ACTOR_IDENTITY_MISMATCH');
  if (source === 'video_profile' && requestedVersion !== 'video') reasons.push('VIDEO_EXCLUDED_FROM_STATIC_REQUEST');
  if (versionInfo.prefix && versionInfo.explicit && versionInfo.prefix !== versionInfo.explicit) warnings.push('PREFIX_CONFIG_VERSION_CONFLICT');
  if ((source === 'claimed' || source === 'claimed_contact') && !scanner) warnings.push('CLAIM_CONTACT_LOST');
  if ((source === 'claimed' || source === 'claimed_contact') && !recognized) warnings.push('CLAIM_POINTER_MISSING');
  if (/claimed/.test(source) && scanner && inviter && scanner !== inviter) warnings.push('INVITER_CONFLICT');

  return {
    card: mask(c.row_id || c.card_id || c.id),
    sourceType: source,
    type,
    version: versionInfo.resolved,
    identity: {
      ownerMatch: actor ? ids.includes(actor) : null,
      scannerMatch: actor ? scanner === actor : null,
      recognized: mask(recognized),
      inviter: mask(inviter)
    },
    permission: {
      read: reasons.length === 0,
      edit: reasons.length === 0 && !['contact','claimed_ambiguous_contact'].includes(type)
    },
    exclusionReasons: reasons,
    warnings
  };
});

const personalEligible = traced.filter((x) => x.exclusionReasons.length === 0 && ['personal','personal_candidate','claimed_ambiguous_personal'].includes(x.type));
const eligible = traced.filter((x) => x.exclusionReasons.length === 0);
const diagnostics = [];
if (eligible.length > 1) diagnostics.push('MULTIPLE_ELIGIBLE_CARDS');
if (isPersonalEntry() && personalEligible.length > 1) diagnostics.push('MULTIPLE_PERSONAL');
if (isLineCreateAction() && personalEligible.length > 0) diagnostics.push('EXISTING_PERSONAL_CREATE_ATTEMPT');
if (traced.some((x) => x.exclusionReasons.includes('MY_CARD_RESOLVED_CONTACT'))) diagnostics.push('MY_CARD_RESOLVED_CONTACT');
for (const code of ['CLAIM_CONTACT_LOST','CLAIM_POINTER_MISSING','INVITER_CONFLICT','PREFIX_CONFIG_VERSION_CONFLICT']) {
  if (traced.some((x) => x.warnings.includes(code))) diagnostics.push(code);
}

const finalCard = eligible.length === 1 ? eligible[0] : null;
const result = {
  actorCanonicalId: mask(actor),
  entrySource,
  action,
  requestedVersion,
  targetModel: 'AI folder retains contact; claim creates/links one personal; LINE generation is disabled after personal exists',
  candidateCards: traced,
  finalCard: finalCard ? finalCard.card : null,
  permission: finalCard ? finalCard.permission : { read:false, edit:false },
  ambiguity: eligible.length > 1,
  diagnostics: diagnostics.length ? diagnostics : [eligible.length === 0 ? 'NOT_FOUND' : 'RESOLVED'],
  invariantDecision: isLineCreateAction() && personalEligible.length > 0 ? 'BLOCK_CREATE_AND_ROUTE_TO_EDIT' : 'NO_WRITE_DECISION_THIS_TRACE'
};
console.log(JSON.stringify(result, null, 2));
