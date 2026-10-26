import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js', 'modules', 'business-richman.js'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'workerbackup.js'), 'utf8');

assert.match(indexHtml, /openBusinessRichman/);
assert.match(indexHtml, /id="page-business-richman"/);
assert.match(indexHtml, /js\/modules\/business-richman\.js\?v=1\.4/);
assert.match(indexHtml, /js\/navigation\.js\?v=8\.04/);
assert.match(navigation, /page === 'business-richman'.*initBusinessRichman/);
assert.match(indexHtml, /id="page-business-island"/);
assert.match(indexHtml, /aria-label="開啟人脈島"/);
assert.match(indexHtml, /travel_explore/);
assert.ok(indexHtml.indexOf('js/modules/business-island.js?v=10') > indexHtml.indexOf('js/modules/store-richman.js?v=1'));
assert.match(navigation, /page === 'business-island'.*initBusinessIsland/);

// Exercise compatibility entry points without mounting either product UI.
const entryCalls = [];
const entryWindow = {
  openBusinessIsland(options) { entryCalls.push(['island', options]); return 'island'; },
  goPage(...args) { entryCalls.push(['page', ...args]); }
};
vm.runInNewContext(source, { window: entryWindow, document: { getElementById: () => null } });
const islandOptions = { mode: 'card', onExit() {} };
assert.equal(entryWindow.openBusinessRichman(islandOptions), 'island');
assert.equal(entryWindow.initBusinessRichman(islandOptions), 'island');
assert.equal(entryCalls.length, 2);
assert.ok(entryCalls.every(call => call[0] === 'island' && call[1] === islandOptions));
entryCalls.length = 0;
const storeOptions = { mode: 'store', resume: true, onExit() {} };
const legacyInit = entryWindow.initBusinessRichman;
entryWindow.initBusinessRichman = options => entryCalls.push(['store-init', options]);
entryWindow.openBusinessRichman(storeOptions);
assert.deepEqual(entryCalls[0], ['page', 'business-richman', true]);
assert.equal(entryCalls[1][1], storeOptions);
assert.equal(entryCalls[1][0], 'store-init');
entryWindow.initBusinessRichman = legacyInit;
entryCalls.length = 0;
await entryWindow.initBusinessRichman(storeOptions);
entryWindow.leaveBusinessRichman();
assert.equal(entryCalls.length, 0, 'store init and cleanup must not redirect to the island or run an exit route');

const routeCalls = [];
const router = {
  currentPage: 'home', currentViewMode: 'user',
  initBusinessIsland() { routeCalls.push('island-init'); },
  leaveBusinessIsland() { routeCalls.push('island-leave'); },
  leaveBusinessRichman() { routeCalls.push('store-leave'); },
  document: { body: { classList: { toggle() {} } }, getElementById: () => null, querySelectorAll: () => [] }
};
router.window = router;
vm.runInNewContext(navigation, router);
router.goPage('business-island');
assert.deepEqual(routeCalls, ['island-init']);
router.goPage('business-island', true);
assert.deepEqual(routeCalls, ['island-init'], 'same-page navigation does not cancel or initialize twice');
router.goPage('business-richman', true);
assert.deepEqual(routeCalls, ['island-init', 'island-leave']);
router.goPage('store-shop', true);
assert.deepEqual(routeCalls, ['island-init', 'island-leave'], 'normal storefront navigation must preserve the store board generation');

assert.match(source, /loadCardData\(\{ render: false, harvest: true, initPanels: false \}\)/);
assert.match(source, /window\.harvestCards/);
assert.match(source, /fetchAPI\('listPublicBusinessCards'/);
assert.match(source, /excludeRowId: ownRowId/);
assert.match(source, /isPublicEligible/);
assert.match(source, /return collected\.concat\(publicCards\)/);
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
const publicList = worker.match(/async listPublicBusinessCards\(payload, env\) \{[\s\S]*?(?=\n  async getPublicCardById)/)?.[0] || '';
assert.match(publicList, /const storedVisibility = this\.text\(row\.visibility\)\.toLowerCase\(\)/);
assert.match(publicList, /const storedSourceType = this\.text\(row\.source_type\)\.toLowerCase\(\)/);
assert.match(publicList, /const storedPoolEligible = Number\(row\.pool_eligible\) === 1/);
assert.match(publicList, /const storedReviewStatus = this\.text\(row\.ai_review_status\)\.toLowerCase\(\)/);
assert.match(publicList, /poolEligible: true/);
assert.doesNotMatch(publicList, /card\.poolEligible === true/);
const actionCase = worker.match(/case 'listPublicBusinessCards':[\s\S]*?(?=case 'getPublicCardById')/)?.[0] || '';
assert.doesNotMatch(actionCase, /callOpenAI|matchmaking|matchmakeContacts/);
const publicView = worker.match(/publicBusinessCardView\(card\) \{[\s\S]*?\n  \},/)?.[0] || '';
assert.match(publicView, /name: this\.text\(card\.name\)/);
assert.match(publicView, /services: this\.text\(card\.services\)/);
assert.doesNotMatch(publicView, /ownerUserId|profileUserId|scannerUserId|crmStatus|networkId|mobile|officePhone|email|address|socials|personality|hobbies|wealth|health|career/);

console.log('business richman contract passed');
