const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function fail(message) {
  console.error('Home service menu contract failed:', message);
  process.exit(1);
}

const quickStart = html.indexOf('<div class="grid grid-cols-4 gap-y-4 gap-x-1">');
const quickEnd = html.indexOf('<section id="home-recurring-task-panel"', quickStart);
const quickMenu = html.slice(quickStart, quickEnd);

if (quickStart < 0 || quickEnd < 0) fail('home quick menu boundaries are missing');

const savedCards = quickMenu.indexOf('收藏名片');
const registration = quickMenu.indexOf('會員註冊');
if (savedCards < 0 || registration < 0) fail('收藏名片 and 會員註冊 must both be present');
if (savedCards > registration) fail('收藏名片 must be before 會員註冊');

const firstFourLabels = Array.from(quickMenu.matchAll(/home-quick-label[^>]*>([^<]+)</g))
  .slice(0, 4)
  .map((match) => match[1].trim());
if (firstFourLabels[0] !== '收藏名片' || firstFourLabels[3] !== '會員註冊') {
  fail('收藏名片 must be far left and 會員註冊 must be far right in the first row');
}

const aiStart = html.indexOf('<h3 class="home-section-kicker">&#65;&#73;&#26381;&#21209;</h3>');
const aiEnd = html.indexOf('<section id="home-feature-section"', aiStart);
const aiServices = html.slice(aiStart, aiEnd);
if (aiStart < 0 || aiEnd < 0) fail('AI service section boundaries are missing');
if (aiServices.includes('&#36319;&#36914;') || aiServices.includes('>跟進<')) {
  fail('AI service section must not contain the duplicate 跟進 action');
}

if (!html.includes('id="nav-btn-card"') || !html.includes('>收藏名片</span>')) {
  fail('bottom navigation must use the 收藏名片 label');
}

console.log('Home service menu contract passed.');
