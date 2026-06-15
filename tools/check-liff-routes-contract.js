const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const auth = fs.readFileSync(path.join(root, 'js', 'auth.js'), 'utf8');
const mycard = fs.readFileSync(path.join(root, 'js', 'modules', 'mycard.js'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'docs', 'contracts', 'liff-routes.md'), 'utf8');

function ok(condition, message) {
  if (!condition) {
    console.error(`FAIL ${message}`);
    process.exit(1);
  }
  console.log(`OK ${message}`);
}

ok(contract.includes('View Route') && contract.includes('Edit Route') && contract.includes('Share Route'), 'LIFF route contract documents route classes');

ok(auth.includes('async function handleAutoShareCardEntry(shareCardId, refId, netId)'), 'shareCardId auto-share route handler exists');
ok(auth.includes('async function handleAutoSendCardEntry(shareCardId, refId, netId)'), 'send-to-chat route handler exists');
ok(auth.includes('async function renderStandaloneWebCardPage(webCardId, refId, netId)'), 'webCardId standalone web route handler exists');
ok(auth.includes('handleAutoShareCardEntry(shareCardId, refId, netId)'), 'auto-share route is invoked from auth flow');
ok(auth.includes('handleAutoSendCardEntry(shareCardId, refId, netId)'), 'auto-send route is invoked from auth flow');
ok(auth.includes('await renderStandaloneWebCardPage(') && auth.includes('webCardId,'), 'webCardId route renders before normal app entry');

const domReady = auth.match(/document\.addEventListener\('DOMContentLoaded', async \(\) => \{[\s\S]*?\n\}\);/);
ok(!!domReady, 'DOMContentLoaded auth flow exists');
const domReadyBody = domReady[0];
const webRouteIndex = domReadyBody.indexOf('renderStandaloneWebCardPage(');
const shareRouteIndex = domReadyBody.indexOf('handleAutoShareCardEntry(shareCardId, refId, netId)');
const checkUserIndex = domReadyBody.indexOf("window.fetchAPI('checkUser'");
ok(webRouteIndex >= 0 && checkUserIndex > webRouteIndex, 'webCardId renders before checkUser');
ok(shareRouteIndex >= 0 && checkUserIndex > shareRouteIndex, 'shareCardId share route runs before checkUser');

ok(mycard.includes("params.get('mode') === 'wysiwyg-card'") || mycard.includes('function isMyCardWysiwygContext') || mycard.includes("mode: 'wysiwyg-card'"), 'WYSIWYG edit route is represented in mycard module');
ok(mycard.includes('isEditableOwnCard'), 'WYSIWYG edit route checks editable own card');
ok(mycard.includes('videoDraft') && mycard.includes('videoCard'), 'video edit route keeps video context explicit');

ok(auth.includes('The permission is not in LIFF app scope') || auth.includes('shareTargetPicker'), 'LIFF scope-sensitive share behavior is explicit');
ok(!/sharePlainCardViewUrl\s*\(/.test((auth.match(/window\.shareCardFromLink\s*=\s*async function[\s\S]*?\n\};/) || [''])[0]), 'share route does not fall back to plain URL sharing');

console.log('\nLIFF route contract passed.');
