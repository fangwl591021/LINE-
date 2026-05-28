const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const home = fs.readFileSync(path.join(root, 'js/modules/home.js'), 'utf8');

function fail(message) {
  console.error(`Home profile owner controls contract failed: ${message}`);
  process.exit(1);
}

if (!html.includes('id="home-profile-edit-button"') || !html.includes('id="home-profile-avatar-edit-badge"')) {
  fail('profile edit controls must have explicit IDs');
}

if (!html.includes('onclick="window.handleHomeAvatarClick?.()"')) {
  fail('avatar click must go through owner-aware handler');
}

if (!home.includes('window.isHomeProfileOwner = function()')) {
  fail('home module must expose owner detection');
}

if (!home.includes('window.updateHomeProfileOwnerControls = function()')) {
  fail('home module must toggle owner-only controls');
}

if (!home.includes('window.handleHomeAvatarClick = function()')) {
  fail('home module must guard avatar click');
}

if (!home.includes('if (!window.isHomeProfileOwner())') || !home.includes('只有本人可以編輯頭像')) {
  fail('avatar upload and setter must reject non-owner edits');
}

if (!home.includes('window.updateHomeProfileOwnerControls?.();')) {
  fail('profile refresh must apply owner-only visibility');
}

console.log('Home profile owner controls contract passed.');
