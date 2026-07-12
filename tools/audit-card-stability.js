#!/usr/bin/env node
'use strict';

/**
 * Card Stabilization 0 — read-only audit.
 *
 * Safe modes:
 *   node tools/audit-card-stability.js --snapshot path/to/schema.sql
 *   node tools/audit-card-stability.js --local-db path/to/local.sqlite
 *
 * This tool refuses remote/prod flags and never executes INSERT/UPDATE/DELETE,
 * migrations, PRAGMA writes, or wrangler d1 execute --remote.
 */

const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
if (argv.some((v) => /(^|=)(remote|production|prod)$/i.test(v) || /--remote|--prod/i.test(v))) {
  console.error('REFUSED: remote/production access is forbidden for this audit tool.');
  process.exit(2);
}

const argValue = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : '';
};
const snapshotPath = argValue('--snapshot');
const localDbPath = argValue('--local-db');
if (!snapshotPath && !localDbPath) {
  console.error('Usage: --snapshot <schema.sql> OR --local-db <local.sqlite>');
  process.exit(2);
}

const mask = (value) => {
  const s = String(value == null ? '' : value);
  if (!s) return '';
  return `${s.slice(0, 3)}…${crypto.createHash('sha256').update(s).digest('hex').slice(0, 8)}`;
};

function sqlite(db, sql) {
  if (!/^\s*(SELECT|WITH|PRAGMA\s+table_info)/i.test(sql)) throw new Error('Read-only SQL required');
  const out = execFileSync('sqlite3', ['-json', db, sql], { encoding: 'utf8' });
  return JSON.parse(out || '[]');
}

function schemaColumnsFromSnapshot(text, table) {
  const rx = new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+[\"'\\[]?${table}[\"'\\]]?\\s*\\(([^;]+)\\)`, 'is');
  const m = text.match(rx);
  if (!m) return [];
  return m[1].split(',').map((line) => line.trim().match(/^[`"\[]?([A-Za-z0-9_]+)/)?.[1]).filter(Boolean);
}

const table = 'card_contacts';
let columns = [];
let query = () => [];
if (localDbPath) {
  if (!fs.existsSync(localDbPath)) throw new Error(`Local DB not found: ${localDbPath}`);
  columns = sqlite(localDbPath, `PRAGMA table_info(${table})`).map((r) => r.name);
  query = (sql) => sqlite(localDbPath, sql);
} else {
  if (!fs.existsSync(snapshotPath)) throw new Error(`Snapshot not found: ${snapshotPath}`);
  columns = schemaColumnsFromSnapshot(fs.readFileSync(snapshotPath, 'utf8'), table);
}

const has = (...names) => names.find((n) => columns.includes(n));
const id = has('row_id', 'card_id', 'id');
const owner = has('owner_user_id', 'owner_uid', 'owner_id');
const profile = has('profile_user_id', 'profile_uid', 'profile_id');
const bound = has('bound_user_id', 'bound_uid', 'line_id');
const line = has('line_id', 'line_uid');
const scanner = has('scanner_user_id', 'scanner_uid', 'scanned_by');
const creator = has('creator_id', 'created_by');
const source = has('source_type', 'source');
const config = has('custom_config', 'config_json');
const active = has('is_active', 'active', 'status');
const visibility = has('visibility');

const checks = [];
function add(code, severity, description, sql, required) {
  const missing = required.filter((x) => !x);
  if (missing.length) {
    checks.push({ code, severity, description, status: 'not_evaluable', missing: required.map((x, i) => x ? null : i).filter((x) => x !== null) });
    return;
  }
  if (!localDbPath) {
    checks.push({ code, severity, description, status: 'query_ready', sql });
    return;
  }
  const rows = query(sql);
  checks.push({ code, severity, description, status: rows.length ? 'finding' : 'clear', count: rows.length, samples: rows.slice(0, 20).map((r) => Object.fromEntries(Object.entries(r).map(([k,v]) => [k, /id|uid|phone|email|name/i.test(k) ? mask(v) : v]))) });
}

const activePredicate = !active ? '1=1' : active === 'status' ? `${active} NOT IN ('deleted','merged','inactive')` : `${active} = 1`;
const personalPredicate = source ? `${source} IN ('self_profile','video_profile','line_generated','self_upload','claimed')` : '1=1';
const contactPredicate = source ? `${source} IN ('private_import','ocr_scan','referral_placeholder','legacy_import')` : '1=1';

add('A01','critical','Same owner has multiple active personal candidates',`SELECT ${owner} owner_key, COUNT(*) count FROM ${table} WHERE ${activePredicate} AND ${personalPredicate} GROUP BY ${owner} HAVING COUNT(*) > 1`,[owner]);
add('A02','critical','Personal card has no owner',`SELECT ${id} card_key FROM ${table} WHERE ${activePredicate} AND ${personalPredicate} AND COALESCE(${owner},'')='' LIMIT 100`,[id,owner]);
add('A03','high','Contact card is assigned an owner',`SELECT ${id} card_key, ${owner} owner_key FROM ${table} WHERE ${contactPredicate} AND COALESCE(${owner},'')<>'' LIMIT 100`,[id,owner]);
add('A04','high','private_import scanner equals owner',`SELECT ${id} card_key FROM ${table} WHERE ${source}='private_import' AND COALESCE(${scanner},'')<>'' AND ${scanner}=${owner} LIMIT 100`,[id,source,scanner,owner]);
add('A05','critical','Duplicate same card/version candidate',`SELECT ${owner} owner_key, json_extract(${config},'$.cardVersion') version, COUNT(*) count FROM ${table} WHERE ${activePredicate} GROUP BY ${owner}, version HAVING COUNT(*)>1`,[owner,config]);
add('A06','critical','Same UID has multiple standard candidates',`SELECT COALESCE(${owner},${profile},${line}) uid_key, COUNT(*) count FROM ${table} WHERE ${activePredicate} AND (${config} LIKE '%standard%' OR ${id} LIKE 'CARD_STD_%') GROUP BY uid_key HAVING COUNT(*)>1`,[id,config,owner||profile||line]);
add('A07','high','Video data appears in a standard candidate',`SELECT ${id} card_key FROM ${table} WHERE (${id} LIKE 'CARD_STD_%' OR ${config} LIKE '%standard%') AND (${config} LIKE '%videoUrl%' OR ${config} LIKE '%videoStorageKind%') LIMIT 100`,[id,config]);
add('A08','high','Static cover and video thumbnail appear mixed',`SELECT ${id} card_key FROM ${table} WHERE ${config} LIKE '%cover%' AND ${config} LIKE '%thumbnail%' LIMIT 100`,[id,config]);
add('A09','high','Card ID prefix conflicts with config version',`SELECT ${id} card_key FROM ${table} WHERE (${id} LIKE 'CARD_STD_%' AND ${config} NOT LIKE '%standard%') OR (${id} LIKE 'CARD_VIDEO_%' AND ${config} NOT LIKE '%video%') OR (${id} LIKE 'CARD_SQUARE_%' AND ${config} NOT LIKE '%square%') OR (${id} LIKE 'CARD_POSTER_%' AND ${config} NOT LIKE '%poster%' AND ${config} NOT LIKE '%giga%') LIMIT 100`,[id,config]);
add('A10','critical','Same bound UID is linked to multiple personal cards',`SELECT ${bound} bound_key, COUNT(*) count FROM ${table} WHERE ${activePredicate} AND ${personalPredicate} AND COALESCE(${bound},'')<>'' GROUP BY ${bound} HAVING COUNT(*)>1`,[bound]);
add('A12','critical','owner/profile/line identity disagreement',`SELECT ${id} card_key FROM ${table} WHERE COALESCE(${owner},'')<>'' AND COALESCE(${profile},'')<>'' AND ${owner}<>${profile} OR COALESCE(${owner},'')<>'' AND COALESCE(${line},'')<>'' AND ${owner}<>${line} LIMIT 100`,[id,owner,profile,line]);
add('A13','high','Legacy row cannot be classified personal/contact',`SELECT ${id} card_key FROM ${table} WHERE COALESCE(${source},'')='' LIMIT 100`,[id,source]);
add('A14','critical','Owner can only be inferred by name/phone',`SELECT ${id} card_key FROM ${table} WHERE COALESCE(${owner},'')='' AND COALESCE(${profile},'')='' AND COALESCE(${line},'')='' LIMIT 100`,[id,owner,profile,line]);

const report = {
  mode: localDbPath ? 'local-db' : 'schema-snapshot',
  table,
  columns,
  identityColumnsDetected: [line, owner, profile, bound, scanner, creator].filter(Boolean),
  warning: 'A11 claim-audit and A15 cross-entry resolver divergence require claim/event and trace fixtures; they are intentionally not guessed from card_contacts alone.',
  checks
};
console.log(JSON.stringify(report, null, 2));
