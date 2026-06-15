const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');
const mycard = fs.readFileSync(path.join(root, 'js', 'modules', 'mycard.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'contracts', 'card-resolvers.md'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(contract.includes('resolvePersonalCard') && contract.includes('resolveCollectedCard') && contract.includes('resolvePublicPoolCard'), 'resolver contract documents three resolver classes');

ok(worker.includes('async findMySelfCard(env, userId)'), 'personal card resolver entry exists in LINE OA module');
ok(worker.includes('async findMySelfCards(env, userId)'), 'multiple personal card resolver exists');
ok(worker.includes('async findMySelfCardByRowId(env, userId, rowId)'), 'personal card resolver by row id exists');
ok(worker.includes("AND LOWER(COALESCE(source_type, '')) = 'self_profile'"), 'personal card resolver only reads self_profile');
ok(worker.includes('isLineOaMyCardCandidate(row)'), 'personal card resolver filters valid candidates');
ok(worker.includes("if (sourceType !== 'self_profile') return false;"), 'personal card candidate rejects non-self profile cards');

ok(worker.includes("sourceType: 'private_import'"), 'collected OCR cards use private_import source type');
ok(worker.includes('scanner_user_id') && worker.includes('scanner_name'), 'collected-card ownership tracks scanner fields');
ok(worker.includes("WHERE LOWER(COALESCE(source_type,'')) = 'private_import'"), 'private import queries exist for collected cards');

ok(worker.includes("visibility === 'public'") && worker.includes("sourceType === 'self_profile'"), 'public pool filters self_profile public cards');
ok(worker.includes('poolEligible'), 'public pool uses explicit eligibility flag');

ok(worker.includes('normalizeVersion') && worker.includes('layoutForVersion'), 'server-side card version resolver exists');
ok(worker.includes("if (version === 'video') return 'CARD_VIDEO';"), 'video cards use dedicated row id prefix');
ok(worker.includes("sourceType: version === 'video' ? 'video_profile' : 'self_profile'"), 'version save maps video to video_profile and static to self_profile');
ok(worker.includes("delete nextCfg.videoCard") && worker.includes("delete nextCfg.videoStorageKind") && worker.includes("delete nextCfg.videoUrl"), 'static saves clear video-only fields');

ok(mycard.includes("if (targetVersion === 'video') return sourceType === 'video_profile'"), 'frontend resolver accepts video only for video target');
ok(mycard.includes("if (sourceType === 'video_profile') return false;"), 'frontend resolver excludes video from static target');
ok(mycard.includes('layoutToCardVersion') && mycard.includes('cardVersionFromCard'), 'frontend maps layout to card version');

console.log('\nCard resolver contract passed.');
