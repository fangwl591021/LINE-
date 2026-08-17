const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const bannerModule = fs.readFileSync(path.resolve(__dirname, '..', 'js/modules/card-page-banner-shortcuts.js'), 'utf8');

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
if (cardPage.includes('aria-label="名片與客戶切換"')) fail('card page must not render the lower duplicate switch');
if (customerPage.includes('aria-label="名片與客戶切換"')) fail('customer page must not render the lower duplicate switch');
if (!bannerModule.includes("window.goPage('card')") || !bannerModule.includes('收藏名片')) fail('banner module must open 收藏名片');
if (!bannerModule.includes("window.goPage('customers')") || !bannerModule.includes('我的客戶')) fail('banner module must open 我的客戶');
if (!bannerModule.includes("page === 'card' || page === 'customers'")) fail('alternate banner must persist across card and customer pages');

const featureStart = html.indexOf('id="home-feature-section"');
const featureEnd = html.indexOf('&#36817;&#26399;&#27963;&#21205;', featureStart);
const featured = html.slice(featureStart, featureEnd);
if (featured.includes("window.goPage('customers')") || featured.includes('&#25105;&#30340;&#23458;&#25142;')) {
  fail('首頁精選功能 must not keep a duplicate 我的客戶 entry');
}

console.log('Card/customer banner navigation contract passed.');
