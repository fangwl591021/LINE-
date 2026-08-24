import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js', 'modules', 'business-richman.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

assert.match(indexHtml, /openBusinessRichman/);
assert.match(indexHtml, /id="page-business-richman"/);
assert.match(indexHtml, /js\/modules\/business-richman\.js\?v=1\.2/);
assert.match(indexHtml, /js\/navigation\.js\?v=8\.02/);
assert.match(navigation, /page === 'business-richman'.*initBusinessRichman/);

assert.match(source, /loadCardData\(\{ render: false, harvest: true, initPanels: false \}\)/);
assert.match(source, /window\.harvestCards/);
assert.match(source, /fetchAPI\('listPublicBusinessCards'/);
assert.match(source, /excludeRowId: ownRowId/);
assert.match(source, /isPublicEligible/);
assert.doesNotMatch(source, /matchmakeContacts/);
assert.match(source, /window\.openCardDetailById\(tile\.id\)/);
assert.match(source, /tile\.origin === 'public'.*window\.openCardDetail/s);
assert.match(source, /sessionStorage\.setItem/);
assert.match(source, /registerBusinessRichmanProvider/);
assert.match(source, /state\.tiles\[index % state\.tiles\.length\]/);
assert.match(source, /providers\.card/);
assert.match(source, /STEP_DELAY_MS = 650/);
assert.match(source, /ARRIVAL_DELAY_MS = 350/);
assert.match(source, /class="br-dice-scene"/);
assert.match(source, /business-richman-dice-1/);
assert.match(source, /business-richman-dice-2/);
assert.match(source, /@keyframes brDiceRoll/);
assert.match(source, /DICE_ROLL_MS = 1100/);
assert.match(source, /var total = dice1 \+ dice2/);
assert.match(source, /for \(var step = 0; step < total; step \+= 1\)/);

assert.match(worker, /listPublicBusinessCards: \{ access: 'authenticated'/);
assert.match(worker, /async listPublicBusinessCards\(payload, env\)/);
assert.match(worker, /LOWER\(TRIM\(COALESCE\(visibility,''\)\)\) = 'public'/);
assert.match(worker, /LOWER\(TRIM\(COALESCE\(source_type,''\)\)\) = 'self_profile'/);
assert.match(worker, /CAST\(COALESCE\(pool_eligible, 0\) AS INTEGER\) = 1/);
assert.match(worker, /LOWER\(TRIM\(COALESCE\(ai_review_status,''\)\)\) = 'passed'/);
assert.match(worker, /case 'listPublicBusinessCards'/);
const actionCase = worker.match(/case 'listPublicBusinessCards':[\s\S]*?(?=case 'getPublicCardById')/)?.[0] || '';
assert.doesNotMatch(actionCase, /callOpenAI|matchmaking|matchmakeContacts/);
const publicView = worker.match(/publicBusinessCardView\(card\) \{[\s\S]*?\n  \},/)?.[0] || '';
assert.match(publicView, /name: this\.text\(card\.name\)/);
assert.match(publicView, /services: this\.text\(card\.services\)/);
assert.doesNotMatch(publicView, /ownerUserId|profileUserId|scannerUserId|crmStatus|networkId|mobile|officePhone|email|address|socials|personality|hobbies|wealth|health|career/);

console.log('business richman contract passed');
