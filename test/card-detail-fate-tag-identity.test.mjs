import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const elements = new Map();
const element = id => {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      innerHTML: '',
      value: '',
      className: '',
      classList: { add() {}, remove() {}, toggle() {} }
    });
  }
  return elements.get(id);
};

const own = { rowId: 'CARD_OWN', personality: '自己的個性', 個性: '自己的個性', 姓名: '自己' };
const staleOther = { rowId: 'CARD_OTHER', personality: '自己的個性', 個性: '自己的個性', 姓名: '別人' };
const freshOther = { rowId: 'CARD_OTHER', personality: '別人的個性', 個性: '別人的個性', 姓名: '別人' };

const window = {
  currentUserProfile: { userId: 'U_SELF' },
  currentUser: { userId: 'U_SELF' },
  userRole: 'admin',
  currentPage: 'card',
  currentUserCard: own,
  harvestCards: [staleOther],
  allCards: [own, staleOther],
  fetchAPI: async (action, payload) => {
    assert.equal(action, 'getPublicCardById');
    assert.equal(payload.rowId, 'CARD_OTHER');
    return { success: true, data: freshOther };
  },
  goPage() {},
  escapeHTML: value => String(value),
  escapeJS: value => String(value),
  getZodiacProfileForBirthday: () => null
};

const context = vm.createContext({
  window,
  document: { getElementById: element, querySelectorAll: () => [] },
  console,
  alert() {},
  confirm: () => true,
  setTimeout,
  clearTimeout
});
vm.runInContext(fs.readFileSync(new URL('../js/modules/cards.js', import.meta.url), 'utf8'), context);

await window.openCardDetailByRowId('CARD_OTHER');
assert.equal(window.currentCard.rowId, 'CARD_OTHER');
assert.equal(window.currentCard.personality, '別人的個性');
assert.equal(window.currentCardRowId, 'CARD_OTHER');

window.switchTab('tags');
const tagsHtml = element('card-fate-tags-grid').innerHTML;
assert.match(tagsHtml, /別人的個性/);
assert.doesNotMatch(tagsHtml, /自己的個性/);

console.log('Card detail five-tag identity test passed.');
