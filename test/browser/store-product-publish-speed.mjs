import assert from 'node:assert/strict';
import {join} from 'node:path';

// Local SQLite, a paused image upload and a mocked review provider.
export async function verifyProductUpload({browser, origin, root, fixture}) {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  let posts = 0;
  try {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) {
        if (url.pathname === '/v1/store-shop/product') posts++;
        return route.continue();
      }
      return route.fulfill({status: 200, body: ''});
    });
    await page.goto(origin);
    await page.locator('[data-do=new]').click();
    const form = page.locator('[data-form=product]');
    const choose = () => form.locator('input[type=file]').setInputFiles(join(root, 'assets/points-mall-banner-20260916.png'));
    const save = form.locator('.shop-row button.primary');
    await page.evaluate(() => {
      window.fetchAPI = (action, payload) => {
        if (action !== 'uploadImageToR2' || !payload.base64Image.startsWith('data:image/jpeg;')) throw Error('Unexpected upload');
        return new Promise(resolve => { window.finishUpload = result => { delete window.finishUpload; resolve(result); }; });
      };
    });
    await choose();
    await page.waitForFunction(() => !!window.finishUpload);
    await form.locator('[name=title]').fill('手機測試帆布袋');
    await form.locator('[name=price]').fill('200');
    await form.locator('[name=redeem_type]').selectOption('full');
    await form.locator('[name=status]').selectOption('active');
    await save.click();
    await page.evaluate(() => window.finishUpload({success: false, error: '測試上傳失敗'}));
    await form.getByText(/未更新圖片/).waitFor();
    assert.equal(posts, 0);
    assert.equal(await form.locator('[name=title]').inputValue(), '手機測試帆布袋');
    await choose();
    await page.waitForFunction(() => !!window.finishUpload);
    await save.click();
    await save.click();
    assert.equal(posts, 0);
    await page.evaluate(() => window.finishUpload({success: true, url: 'https://example.com/shop.jpg'}));
    await form.waitFor({state: 'detached'});
    assert.equal(posts, 1);
    assert.equal(fixture.state.providerCalls, 1);
    const row = fixture.sql.prepare('SELECT status, image_url FROM store_shop_products WHERE title=?').get('手機測試帆布袋');
    assert.equal(row?.status, 'active');
    assert.equal(row.image_url, 'https://example.com/shop.jpg');
    return 'PASS editing during upload, failed upload, retry, and single reviewed publication';
  } finally {
    await page.close();
  }
}
