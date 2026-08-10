const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');

function fail(message) {
  console.error('Card/customer switch contract failed:', message);
  process.exit(1);
}

const cardPageStart = html.indexOf('id="page-card"');
const cardPageEnd = html.indexOf('id="page-card-detail"', cardPageStart);
const customerPageStart = html.indexOf('id="page-customers"');
const customerPageEnd = html.indexOf('id="customer-form-panel"', customerPageStart);

if (cardPageStart < 0 || cardPageEnd < 0) fail('card page boundaries are missing');
if (customerPageStart < 0 || customerPageEnd < 0) fail('customer page boundaries are missing');

const cardPage = html.slice(cardPageStart, cardPageEnd);
const customerPage = html.slice(customerPageStart, customerPageEnd);

for (const [name, page] of [['card', cardPage], ['customer', customerPage]]) {
  if (!page.includes('card-customer-switch')) fail(`${name} page must render the shared switch`);
  if (!page.includes('名片收藏') || !page.includes('我的客戶')) fail(`${name} page must show both switch labels`);
}

if (!cardPage.includes("window.goPage('customers')")) fail('card page must open 我的客戶');
if (!customerPage.includes("window.goPage('card')")) fail('customer page must return to 名片收藏');

const featureStart = html.indexOf('id="home-feature-section"');
const featureEnd = html.indexOf('&#36817;&#26399;&#27963;&#21205;', featureStart);
const featured = html.slice(featureStart, featureEnd);
if (featured.includes("window.goPage('customers')") || featured.includes('&#25105;&#30340;&#23458;&#25142;')) {
  fail('首頁精選功能 must not keep a duplicate 我的客戶 entry');
}

console.log('Card/customer switch contract passed.');
