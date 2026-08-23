const fs = require('fs');
const path = require('path');
const { assertCacheBust } = require('./check-cache-bust-contract');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js', 'modules', 'home.js'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'js', 'navigation.js'), 'utf8');

function fail(message) {
  console.error('Home design contract failed:', message);
  process.exit(1);
}

[
  'home-profile-card',
  'home-header-site-name',
  'home-top-nav-switch',
  'home-profile-avatar',
  'home-profile-points',
  'home-zodiac-weekly-btn',
  'home-profile-qr',
  'home-onboarding-ai-list',
  'home-sales-assistant-list'
].forEach((id) => {
  if (!index.includes(`id="${id}"`)) fail(`missing required home id: ${id}`);
});

[
  "window.openTodayFortune?.()",
  "window.shareHomeProfileCard(this)",
  "window.claimDailyPointCheckin(this)",
  "window.goPage('card')",
  "window.shareMyCard(this)",
  "window.openInboxSendCenter ? window.openInboxSendCenter() : window.goPage('inbox')"
].forEach((needle) => {
  if (!index.includes(needle)) fail(`missing home action: ${needle}`);
});

try {
  assertCacheBust('js/auth.js');
} catch (e) {
  fail(e.message);
}

if (!index.includes('home-action-card')) {
  fail('home cards should use the refreshed white card styling');
}
if (!index.includes('overflow-y-auto overflow-x-hidden')) {
  fail('main app surface should prevent horizontal overflow on mobile');
}
if (!index.includes('id="home-profile-card" class="home-profile-v2 mx-0 -mt-1 shadow-sm"')) {
  fail('profile panel should keep the v2 layout without an outer frame');
}
if (!index.includes('home-profile-hero')) {
  fail('profile panel should render the dark dotted hero header');
}
if (!index.includes('id="top-nav"') ||
    !index.includes('body.home-page #top-nav { display: none !important; }') ||
    !(index.includes('body.home-page #main { padding-top: 0; }') || index.includes('body.home-page #main { padding: 0 '))) {
  fail('home page should move the white nav title into the green hero');
}
if (!index.includes('id="bottom-nav"') || index.includes('body.home-page nav { display: none !important; }')) {
  fail('home page must not hide the bottom navigation');
}
[
  ['nav-btn-card', "window.goPage('card')"],
  ['nav-btn-matchmake', "window.goPage('matchmake')"],
  ['nav-btn-inbox', "window.openInboxSendCenter ? window.openInboxSendCenter() : window.goPage('inbox')"],
  ['nav-btn-admin-settings', "window.goPage('admin-settings')"],
  ['nav-btn-home', "window.goPage('home')"]
].forEach(([id, action]) => {
  if (!index.includes(`id="${id}"`) || !index.includes(action)) {
    fail(`bottom navigation must keep current action: ${id}`);
  }
});
if (!/js\/navigation\.js\?v=(?:7\.(?:9\d*)|8\.0[01])/.test(index) ||
    !navigation.includes("} else if (page === 'home')") ||
    !navigation.includes("if (bottomNav) bottomNav.classList.remove('hidden');") ||
    !navigation.includes("if (bottomNavAdmin) bottomNavAdmin.classList.add('hidden');")) {
  fail('home page must keep the user bottom navigation visible on home and hide admin navigation');
}
if (!index.includes('grid grid-cols-4 gap-y-4 gap-x-1')) {
  fail('quick actions should keep the current four-column mobile grid');
}
if (!index.includes('hidden space-y-0 animate-in') || !index.includes('text-[26px] leading-none')) {
  fail('home top spacing and point size should stay compact');
}
if (!index.includes('id="home-feature-section"')) {
  fail('featured function section should be present');
}
if (!index.includes('&#32879;&#35516;') || index.includes('&#32879;&#35522;')) {
  fail('social activity shortcut must display the exact Traditional Chinese label 聯誼');
}
const defaultSearchEntry = index.indexOf('id="home-network-search-entry"');
const quickActionsEnd = index.indexOf('id="home-exchange-zone-button"');
const systemTicker = index.indexOf('id="home-system-ticker"');
if (defaultSearchEntry < 0 || defaultSearchEntry < quickActionsEnd || defaultSearchEntry > systemTicker) {
  fail('network search entry must be visible on the default home below quick actions');
}
[
  '你現在想找誰？',
  'name="businessHomeSearchQuery"',
  'name="businessHomeSearchScope"',
  'value="own" checked',
  'value="public"',
  'value="ai"',
  "if (!query && scope === 'ai')",
  'window.openBusinessHomeSearch',
  "window.matchmakePoolScope = scope === 'public' || scope === 'ai' ? 'public' : 'own'",
  "window.goPage?.('matchmake')",
  "if (matchQuery) matchQuery.value = query"
].forEach((needle) => {
  if (!home.includes(needle)) fail(`business home search must reuse existing matchmake flow: ${needle}`);
});
try {
  assertCacheBust('js/modules/home.js');
} catch (e) {
  fail(e.message);
}
if (!index.includes('id="home-media-container"') || !home.includes('hasHomeMedia')) {
  fail('optional home media container must stay hidden unless media is enabled');
}
[
  "widget.id = 'home-ai-assistant'",
  'assets/ai-home-assistant.png?v=1',
  'window.refreshHomeAiAssistant',
  'window.openHomeAiAssistantAdvice',
  'HOME_AI_ASSISTANT_POSITION_KEY',
  '#home-ai-assistant{position:fixed;right:8px;bottom:96px;z-index:65',
  'body:not(.home-page) #home-ai-assistant',
  'prefers-reduced-motion:reduce',
  'HOME_AI_ASSISTANT_COPY',
  'HOME_AI_ASSISTANT_MOTIONS',
  'homeAiAssistantCycleTimer_',
  'homeAiAssistantBounce',
  'homeAiAssistantSway',
  'homeAiAssistantPeek',
  'window.setInterval',
  '30000',
  'resolveHomeAiAssistantOwnCard_',
  "return ['loading']",
  "return ['myCard']",
  "sourceType !== 'self_profile'",
  'home-ai-assistant-title',
  'home-ai-assistant-cta',
  'HOME_AI_ASSISTANT_TITLES',
  'chooseHomeAiAssistantAction_',
  "myCard: '我的名片'",
  "businessIntent: 'AI 業務需求'",
  "cardFolder: '收藏名片'",
  "matchmake: 'AI 人脈交流圈'",
  "'前往「' + advice.title + '」 →'",
  'configs.find(item => item.businessIntent',
  'card.customConfig'
].forEach((needle) => {
  if (!home.includes(needle)) fail(`home AI assistant contract missing: ${needle}`);
});
if (!fs.existsSync(path.join(root, 'assets', 'ai-home-assistant.png'))) {
  fail('home AI assistant image must exist');
}
if (!home.includes('border border-pink-100') || !home.includes('text-pink-500')) {
  fail('dynamic home suggestion cards should match the refreshed pink design');
}

console.log('Home design contract passed.');
