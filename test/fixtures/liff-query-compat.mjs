// Shared, synthetic cases for Node regression and a read-only browser preview.
export const sdkVersion = '2.31.2';
export const fixedEntrypoints = ['index.html', 'admin.html', 'admin-v2.html', 'point-bridge.html', 'ocr-lab.html'];
export const forbiddenNestedKeys = ['uid', 'userId', 'admin', 'token', 'from', 'coupon'];

const nestedUrl = 'https://shop.example.test/buy?sku=1&coupon=A+B&from=dm&uid=nested-user&admin=1&token=not-a-token#detail';
const routeValues = {
  activityId: 'ACT_TEST', shareCardId: 'CARD_TEST', ref: 'ref-test', net: 'net-test',
  return_url: nestedUrl, title: '中文測試 ? & + # % =', percent: '%26uid%3Dstill-a-value'
};
const nestedQuery = new URLSearchParams(routeValues).toString();

export const queryCases = [];
for (const prefix of ['/?', '/index.html?', '?', '']) {
  for (const stateKey of ['liff.state', 'state']) {
    for (const legacy of [false, true]) {
      const route = prefix + nestedQuery;
      const envelope = legacy ? encodeURIComponent(route) : route;
      queryCases.push({
        name: `${stateKey}, ${prefix || 'bare query'}, ${legacy ? 'legacy double encoding' : 'normal encoding'}`,
        search: '?' + new URLSearchParams({ [stateKey]: envelope }),
        expected: routeValues, absent: forbiddenNestedKeys
      });
    }
  }
}
queryCases.push(
  { name: 'direct query remains intact', search: '?' + nestedQuery, expected: routeValues, absent: forbiddenNestedKeys },
  {
    name: 'outer canonical values retain priority',
    search: '?' + new URLSearchParams({ activityId: 'ACT_OUTER', shareCardId: 'CARD_OUTER', ref: 'REF_OUTER', net: 'NET_OUTER', 'liff.state': '/?' + nestedQuery }),
    expected: { ...routeValues, activityId: 'ACT_OUTER', shareCardId: 'CARD_OUTER', ref: 'REF_OUTER', net: 'NET_OUTER' }, absent: forbiddenNestedKeys
  },
  {
    name: 'liff.state retains precedence over OAuth state',
    search: '?' + new URLSearchParams({ 'liff.state': '/?activityId=ACT_LIFF', state: '/?activityId=ACT_OAUTH' }),
    expected: { activityId: 'ACT_LIFF' }
  },
  {
    name: 'literal question mark inside a bare query value is not a route boundary',
    search: '?' + new URLSearchParams({ 'liff.state': 'return_url=https://shop.example.test/buy?sku%3D1%26coupon%3DA%2BB&activityId=ACT_TEST' }),
    expected: { return_url: 'https://shop.example.test/buy?sku=1&coupon=A+B', activityId: 'ACT_TEST' }, absent: ['sku', 'coupon']
  },
  {
    name: 'fragment is excluded without stripping encoded value fragments',
    search: '?' + new URLSearchParams({ 'liff.state': '/?activityId=ACT_TEST&return_url=https%3A%2F%2Fshop.example.test%2F%23detail#ignored&admin=1' }),
    expected: { activityId: 'ACT_TEST', return_url: 'https://shop.example.test/#detail' }, absent: ['admin']
  },
  {
    name: 'malformed percent in a normal value does not discard valid routes',
    search: '?' + new URLSearchParams({ 'liff.state': '/?activityId=ACT_TEST&title=50%off&note=%E0%A4%A' }),
    expected: { activityId: 'ACT_TEST', title: '50%off', note: new URLSearchParams('note=%E0%A4%A').get('note') }
  },
  {
    name: 'opaque OAuth state does not change direct routes',
    search: '?activityId=ACT_OUTER&state=opaque-oauth-nonce',
    expected: { activityId: 'ACT_OUTER', state: 'opaque-oauth-nonce' }, absent: ['uid', 'admin']
  },
  {
    name: 'invalid legacy envelope safely leaves outer values available',
    search: '?' + new URLSearchParams({ activityId: 'ACT_OUTER', 'liff.state': '%3FactivityId%3DACT_INNER%ZZ' }),
    expected: { activityId: 'ACT_OUTER' }, absent: ['uid', 'admin']
  }
);

export function extractParser(source, kind) {
  const startMarker = kind === 'main' ? 'function readActmasterInitialParams()' : 'function readParams()';
  const endMarker = kind === 'main' ? 'function hasNfcCheckinParams' : 'function buildBusinessUrl';
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end <= start) throw new Error('Production parser boundary missing: ' + kind);
  return source.slice(start, end);
}
