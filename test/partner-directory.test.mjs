import assert from 'node:assert/strict';
import { PartnerDirectoryModule } from '../worker/partner-directory.mjs';

function fakeEnv(rows) {
  const calls = [];
  return {
    calls,
    ACTMASTER_DB: {
      prepare(sql) {
        const call = { sql, bindings: [] };
        calls.push(call);
        return {
          bind(...bindings) {
            call.bindings = bindings;
            return this;
          },
          async all() {
            return { results: rows };
          }
        };
      }
    }
  };
}

const rows = [{
  partner_handle: 'partner_demo',
  name: '測試合作店家',
  category: '餐飲',
  summary: '公開摘要',
  description: '公開說明',
  logo_url: '',
  cover_image_url: '',
  partner_phone: '02-1234-5678',
  line_url: 'https://line.me/R/ti/p/@demo',
  website_url: 'https://example.com',
  point_redeem_enabled: 1,
  max_redeem_percent: 20,
  min_spend_amount: 100,
  policy_note: '實際折抵於後續階段開放',
  location_handle: 'location_demo',
  branch_name: '台北店',
  city: '台北市',
  district: '中正區',
  address: '測試路 1 號',
  latitude: 25.0,
  longitude: 121.5,
  maps_url: 'https://maps.example.com',
  location_phone: '02-1111-2222',
  business_hours: '09:00-18:00'
}];

{
  const env = fakeEnv(rows);
  const result = await PartnerDirectoryModule.list({ query: '測試', category: '餐飲', city: '台北市', limit: 999 }, env);
  assert.equal(result.success, true);
  assert.equal(result.count, 1);
  assert.equal(result.partners[0].partnerHandle, 'partner_demo');
  assert.equal(result.partners[0].locations.length, 1);
  assert.equal(result.partners[0].redeemPolicy.maxRedeemPercent, 20);
  assert.equal('partnerId' in result.partners[0], false);
  assert.match(env.calls[0].sql, /p\.status = 'active'/);
  assert.match(env.calls[0].sql, /l\.status = 'active'/);
  assert.deepEqual(env.calls[0].bindings, ['餐飲', '台北市', '測試', '%測試%', 50]);
}

{
  const env = fakeEnv(rows);
  const result = await PartnerDirectoryModule.get({ partnerHandle: 'partner_demo' }, env);
  assert.equal(result.success, true);
  assert.equal(result.partner.name, '測試合作店家');
  assert.match(env.calls[0].sql, /p\.partner_handle = \?1 AND p\.status = 'active'/);
  assert.deepEqual(env.calls[0].bindings, ['partner_demo']);
}

{
  const env = fakeEnv([]);
  const result = await PartnerDirectoryModule.get({}, env);
  assert.equal(result.success, false);
  assert.equal(env.calls.length, 0);
}

console.log('Partner directory module tests passed.');

