const fs = require('fs');
const assert = require('assert');
const html = fs.readFileSync('index.html', 'utf8');
const nav = fs.readFileSync('js/navigation.js', 'utf8');

const bannerPos = html.indexOf('id="home-profile-card"');
const homePos = html.indexOf('id="page-home"');
assert.ok(bannerPos >= 0 && homePos >= 0 && bannerPos < homePos, 'shared banner must live outside page-home');
assert.strictEqual((html.match(/id="home-profile-card"/g) || []).length, 1, 'banner must remain a single DOM instance');
assert.match(nav, /new Set\(\['home', 'card', 'customers'\]\)/);
assert.match(nav, /classList\.toggle\('shared-front-banner-page', showSharedBanner\)/);
assert.match(nav, /sharedBanner\.classList\.toggle\('hidden', !showSharedBanner\)/);
assert.match(html, /body\.shared-front-banner-page #top-nav \{ display: none !important; \}/);
assert.match(html, /body\.shared-front-banner-page:not\(\.home-page\) #main \{ padding-top: 0; \}/);
assert.match(html, /body\.home-page\.business-home-v2-active #home-profile-card \{ display: none !important; \}/);
console.log('shared frontend banner contract passed');
