import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mycard = readFileSync(new URL('../js/modules/mycard.js', import.meta.url), 'utf8');
const home = readFileSync(new URL('../js/modules/home.js', import.meta.url), 'utf8');
const cards = readFileSync(new URL('../js/modules/cards.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');

test('home My Card opens the WYSIWYG editor directly', () => {
  const start = mycard.indexOf('async function openMyCardEntry');
  const end = mycard.indexOf('function getCardRowId', start);
  const entry = mycard.slice(start, end);

  assert.match(entry, /currentCardData = await resolveCurrentUserCard\(true\)/);
  assert.match(entry, /return openMyCardWysiwyg\(evt, currentCardData\)/);
  assert.doesNotMatch(entry, /window\.openCardDetail\(currentCardData\)/);
  assert.match(home, /window\.openMyCardSettings = function\(evt\)[\s\S]*return window\.openMyCardEntry\(evt\)/);
  assert.match(index, /id="home-my-card-button" onclick="window\.openMyCardEntry \? window\.openMyCardEntry\(event\)/);
  assert.match(index, /<details id="details-my-ecard"[\s\S]*?<summary onclick="window\.openMyCardEntry\(event\)"/);
  assert.match(index, /js\/modules\/mycard\.js\?v=8\.87/);
  assert.match(index, /js\/modules\/home\.js\?v=8\.07/);
  assert.match(mycard, /await load\(\);\s*await openMyCardDetail\(\);/);
});

test('editable current card can open record-scoped WYSIWYG without becoming the personal card', () => {
  assert.match(index, /id="btn-open-card-wysiwyg"[\s\S]*?window\.openCardRecordWysiwyg\(window\.currentCard, event\)/);
  assert.match(mycard, /function openCardRecordWysiwyg\(card, evt\)[\s\S]*?canEditCardRecord\(card\)/);
  assert.match(mycard, /if \(!wysiwygState\.recordMode\) window\.currentUserCard = currentCardData/);
  assert.match(mycard, /wysiwygState\.recordMode\s*\?\s*await saveCardRecordWysiwyg\(\)/);
  assert.match(mycard, /window\.fetchAPI\('updateCard', \{ rowId: rowId, data: payloadData \}, true\)/);
  assert.match(cards, /if \(cardLineId\) return cardLineId === userId;[\s\S]*?if \(creatorId\) return creatorId === userId/);
  assert.match(worker, /const isBoundToActor = !!\(actorId && existingLineId && existingLineId === actorId\)/);
  assert.match(worker, /const isUnboundOwner = !!\(actorId && !existingLineId && \(existingCreatorId === actorId \|\| existingOwnerId === actorId\)\)/);
  assert.match(worker, /return \{ success: false, error: 'Access Denied: cannot update this card' \}/);
});
