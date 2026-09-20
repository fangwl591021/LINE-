// Isolated layout fixture: real markup/CSS, no login, APIs or production data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require = createRequire(import.meta.url);
const {chromium} = require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<link\b[^>]*>/gi, '')
  .replace(/<img\b[^>]*>/gi, '')
  .replace('</head>', '<script src="https://cdn.tailwindcss.com"></script></head>');
const browser = await chromium.launch({headless:true, channel:'chrome'});
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.request().url().startsWith('https://cdn.tailwindcss.com/') ? route.continue() : route.abort());
  await page.setContent(html, {waitUntil:'networkidle'});
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.admin-content')).display === 'flex');
  await page.evaluate(() => {
    document.querySelector('#loading-screen').remove();
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelector('#tab-cards').classList.remove('hidden');
    const option = document.createElement('option');
    option.textContent = '合成測試歸屬名稱'.repeat(20);
    option.selected = true;
    document.querySelector('#card-tenant-filter').append(option);
    document.querySelector('#cards-table-body').innerHTML = '<tr>' + Array.from({length:9}, () => '<td>' + 'SyntheticLongValue'.repeat(3) + '</td>').join('') + '</tr>';
  });
  for (const width of [390, 820, 1280, 1637]) {
    await page.setViewportSize({width, height:900});
    await page.evaluate(w => document.querySelector('#admin-sidebar').classList.toggle('sidebar-collapsed', w <= 1024), width);
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
      const toolbar = document.querySelector('.card-library-toolbar');
      const bounds = toolbar.getBoundingClientRect();
      const controls = [...toolbar.querySelectorAll('input, select, button')];
      const main = document.querySelector('main');
      const tableScroll = document.querySelector('#cards-table-body').closest('table').parentElement;
      return {
        overflow: controls.filter(el => {const r = el.getBoundingClientRect(); return r.left < bounds.left - 1 || r.right > bounds.right + 1;}).map(el => el.id || el.textContent.trim()),
        mainWidth:main.clientWidth, mainScroll:main.scrollWidth,
        tableScrollable:tableScroll.scrollWidth > tableScroll.clientWidth && getComputedStyle(tableScroll).overflowX === 'auto',
        toolbarHeight:bounds.height
      };
    });
    assert.deepEqual(result.overflow, [], `${width}px controls overflow`);
    assert.ok(result.mainScroll <= result.mainWidth + 1, `${width}px main overflow: ${JSON.stringify(result)}`);
    assert.ok(result.tableScrollable, 'wide table must retain its own horizontal scroll');
    assert.ok(result.toolbarHeight < 650, 'no unintended flex-basis blank space on mobile');
    if (width === 390 || width === 1637) await page.locator('.card-library-toolbar').screenshot({path:join(tmpdir(), `admin-card-filter-${width}.png`)});
    console.log(`${width}px PASS ${JSON.stringify(result)}`);
  }
} finally { await browser.close(); }
