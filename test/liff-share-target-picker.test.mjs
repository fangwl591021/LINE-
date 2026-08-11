import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let calls = 0;
const window = {
  location: { search: '', href: 'https://example.test/', origin: 'https://example.test', pathname: '/' },
  liff: {
    isLoggedIn: () => true,
    isApiAvailable: name => name === 'shareTargetPicker',
    shareTargetPicker: async messages => {
      calls += 1;
      assert.equal(messages[0].type, 'text');
      // The official API may resolve without a value after opening/sending.
      return undefined;
    }
  }
};
const document = {
  readyState: 'complete',
  createElement: () => ({}),
  head: { appendChild() {} },
  addEventListener() {},
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => []
};
const context = vm.createContext({
  window,
  document,
  console,
  URLSearchParams,
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  setTimeout
});
vm.runInContext(fs.readFileSync(new URL('../js/config.js', import.meta.url), 'utf8'), context);

const result = await window.actmasterShareTargetPicker([{ type: 'text', text: '測試分享' }]);
assert.equal(calls, 1);
assert.equal(result.ok, true);

window.liff.shareTargetPicker = async () => false;
const cancelled = await window.actmasterShareTargetPicker([{ type: 'text', text: '測試取消' }]);
assert.equal(cancelled.ok, false);
assert.equal(cancelled.reason, 'cancelled_or_not_opened');

const ecardSource = fs.readFileSync(new URL('../js/modules/ecard.js', import.meta.url), 'utf8');
const shareHandler = ecardSource.match(/window\.shareECardToLine\s*=\s*async function[\s\S]*?\n};/)?.[0] || '';
assert.ok(shareHandler.includes('isInLiffClient'));
assert.ok(shareHandler.includes('window.location.href = directShareUrl'));
assert.ok(shareHandler.indexOf('window.location.href = directShareUrl') < shareHandler.indexOf('await window.triggerFlexSharing'));

console.log('LIFF share target picker result contract passed.');
