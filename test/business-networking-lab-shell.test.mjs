import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const lab = readFileSync(new URL('../js/modules/business-networking-lab.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../workerbackup.js', import.meta.url), 'utf8');

test('business assistant exposes an isolated networking lab shell', () => {
  assert.match(index, /openBusinessNetworkingLab \? window\.openBusinessNetworkingLab\(\) : window\.openHomeLowerPanel\?\.\('assistant'\)/);
  assert.match(index, /js\/modules\/business-networking-lab\.js\?v=1\.4/);
  assert.match(lab, /交流合作實驗區/);
  assert.match(lab, /今日建議/);
  assert.match(lab, /私人人脈/);
  assert.match(lab, /公開交流/);
  assert.match(lab, /企業合作/);
  assert.match(lab, /查看原有今日跟進建議/);
  assert.match(lab, /window\.openHomeLowerPanel\?\.\('assistant'\)/);
});

test('today suggestions reuse private CRM read authority without mutation', () => {
  assert.match(lab, /fetchAPI\('getCrmContacts', \{ limit: 80, scope: 'self' \}, true\)/);
  assert.match(lab, /今天值得重新聯絡/);
  assert.match(lab, /filter\(needsFollowup\)/);
  assert.match(lab, /sourceType \|\| ''\) !== 'self_profile'/);
  assert.match(lab, /slice\(0, 3\)/);
  assert.doesNotMatch(lab, /fetchAPI\('(updateCard|saveBusinessIntent|matchmakeContacts|send|push|broadcast)'/);
});

test('self CRM scope remains personal even for an admin actor', () => {
  assert.match(worker, /const selfScope = this\.text\(payload\.scope\)\.toLowerCase\(\) === 'self'/);
  assert.match(worker, /if \(actorId && selfScope\)/);
  assert.match(worker, /WHERE c\.owner_user_id IN \(\$\{placeholders\}\) OR c\.creator_id IN \(\$\{placeholders\}\)/);
  const selfScopeBranch = worker.match(/if \(actorId && selfScope\)[\s\S]*?\} else if \(role === 'admin'\)/)?.[0] || '';
  assert.doesNotMatch(selfScopeBranch, /profile_user_id|c\.line_id/);
});

test('private networking uses existing CRM classifications without inventing referral evidence', () => {
  assert.match(lab, /最近應該聯絡/);
  assert.match(lab, /可能成為合作夥伴/);
  assert.match(lab, /\['合作夥伴', '通路資源', '課程合作', '供應商'\]/);
  assert.match(lab, /目前沒有可信的關係與引薦證據，因此不自動推測/);
});

test('recommendations explain detailed reasons from existing CRM evidence', () => {
  assert.match(lab, /為什麼建議/);
  assert.match(lab, /crmStatus/);
  assert.match(lab, /crmType/);
  assert.match(lab, /crmNextFollowupAt/);
  assert.match(lab, /lastActivityTime/);
  assert.match(lab, /事業／標籤資料/);
  assert.match(lab, /renderTodayContact\(contact, followups\.length \+ index, 'collaboration'\)/);
  assert.doesNotMatch(lab, /fetchAPI\('explain|generateRecommendation|analyzeContact/);
});

test('public cooperation profile reads only the resolved own card', () => {
  assert.match(lab, /const card = window\.currentUserCard \|\| null/);
  assert.match(lab, /readOwnBusinessIntent/);
  assert.match(lab, /我可以提供/);
  assert.match(lab, /我正在尋找/);
  assert.match(lab, /希望合作方式/);
  assert.match(lab, /收藏的別人名片不會出現在公開合作檔案/);
  assert.match(lab, /window\.openMyCardSettings\(\)/);
  assert.doesNotMatch(lab, /getCurrentBusinessIntent\s*\(/);
  assert.doesNotMatch(lab, /window\.allCards/);
});

test('networking lab preserves public and enterprise authority boundaries', () => {
  assert.match(lab, /不會公開資料、寫入資料或傳送訊息/);
  assert.match(lab, /自己的可以公開；別人的不可以/);
  assert.match(lab, /收藏的別人名片永遠屬於私人資料/);
  assert.match(lab, /經驗證企業代表/);
  assert.match(lab, /setMatchmakePoolScope\('public'\)/);
  assert.match(lab, /不會混用現有優惠／折抵店家/);
  assert.match(lab, /目前不會代替使用者傳送邀請或 LINE 訊息/);
  assert.doesNotMatch(lab, /startMatchmaking\s*\(/);
  assert.doesNotMatch(lab, /shareTargetPicker|pushMessage|broadcast/);
});
