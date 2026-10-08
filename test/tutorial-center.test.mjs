import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../js/modules/tutorial-center.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/tutorial-center.css',import.meta.url),'utf8');
const context=vm.createContext({window:{addEventListener(){}},document:{addEventListener(){}}});
vm.runInContext(source.replace('  let dialog = null;', '  window.testCourses = courses; window.testMediaBase = mediaBase;\n  let dialog = null;'),context);
const courses=JSON.parse(JSON.stringify(context.window.testCourses));
test('activity publishing joins beginner lessons while the original five movies remain unchanged',()=>{
  assert.equal(courses.length,6);
  assert.deepEqual(courses.filter(c=>c.file).map(c=>c.id),['registration','mycard','collection','merchant','ai-advance','activity-publish']);
  assert.equal(courses[4].file,'ai-advance-tutorial-v1.mp4');
  assert.equal(courses[4].duration,'4:18');
  assert.match(courses[4].note,/直接點首頁「AI推進」/);
  assert.equal(courses[3].file,'merchant-tutorial-v3.mp4');
  assert.equal(courses[3].duration,'6:41');
  assert.deepEqual(courses[3].chapters.slice(1,3),[[10.938,'首頁點商城橫幅'],[18.410,'商城點店家設定']]);
  assert.match(courses[3].description,/首頁商城橫幅 → 店家設定/);
  assert.equal(courses[3].mediaBase,'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-06/');
  assert.match(courses[3].note,/未正式開放/);
  assert.deepEqual(courses.slice(0,3).map(c=>c.file),['registration-v2.mp4','business-card-v2.mp4','card-collection-v2.mp4']);
  assert.equal(context.window.testMediaBase,'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-05/');
  assert.match(html,/tutorial-center\.js\?v=5/);
});
test('activity publishing lesson explains the real entry, verified-member scope and explicit cancellation',()=>{
  const course=courses.find(c=>c.id==='activity-publish');
  assert.equal(course.title,'活動上架');
  assert.equal(course.file,'activity-publish-tutorial-v1.mp4');
  assert.equal(course.duration,'3:18');
  assert.equal(course.chapters.find(c=>c[1]==='選擇公開／歸屬可見')[0],100.833);
  assert.equal(course.chapters.find(c=>c[1]==='首頁活動縮圖')[0],154.833);
  assert.match(course.note,/AI 辨識回應為示範資料/);
  assert.match(course.note,/DM 未標示年分採當年/);
  assert.equal(course.mediaBase,'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-08/');
  assert.equal(course.description,'首頁個人行事曆 → 辦活動 → DM核對 → 選擇公開範圍');
  assert.match(course.note,/台灣中文旁白/);
  assert.match(course.note,/真實 UI 模擬活動/);
  assert.match(course.note,/所有登入平台會員可見/);
  assert.match(course.note,/未登入不開放/);
  assert.match(course.note,/僅歸屬會員可見/);
  assert.match(course.note,/取消不送出活動/);
});
test('chapters match existing masters and stay within video duration',()=>{
  for(const course of courses.filter(c=>c.file)){
    const [m,s]=course.duration.split(':').map(Number);
    assert.ok(course.chapters.every(([time,title])=>time>=0 && time<m*60+s && title));
  }
  assert.equal(courses[2].chapters.find(c=>c[1]==='補上背面')[0],156.096);
  assert.equal(courses[1].chapters[1][0],131.01);
  assert.match(courses[2].note,/固定步驟文字/);
});
test('one home banner follows shortcuts; contextual buttons cannot submit; bottom nav unchanged',()=>{
  assert.equal((html.match(/id="home-tutorial-entry"/g)||[]).length,1);
  assert.ok(html.indexOf('id="home-primary-shortcuts"')<html.indexOf('id="home-tutorial-entry"'));
  assert.ok(html.indexOf('id="home-tutorial-entry"')<html.indexOf('id="home-mall-banner"'));
  for(const button of html.match(/<button[^>]*data-tutorial-open[^>]*>/g))assert.match(button,/type="button"/);
  for(const id of ['registration','mycard','collection'])assert.ok(html.includes(`data-tutorial-open="${id}"`));
  const nav=html.match(/<nav id="bottom-nav"[\s\S]*?<\/nav>/)[0];
  assert.doesNotMatch(nav,/tutorial|新手教學/);
});
test('isolated module has no data mutation or identity/routing dependencies and no autoplay',()=>{
  assert.doesNotMatch(source,/fetch\(|fetchAPI|localStorage|sessionStorage|goPage\(|liff\.|autoplay/i);
  assert.match(source,/controls playsinline preload="metadata"/);
  assert.match(source,/video\.pause\(\);[\s\S]*video\.removeAttribute\('src'\);[\s\S]*video\.load\(\);/);
  assert.match(source,/visibilitychange/);
  assert.match(source,/pagehide/);
  assert.match(source,/showModal\(\)/);
  assert.match(source,/isConnected.*focus\(/);
  assert.match(source,/loadedmetadata', seek/);
  assert.match(css,/100dvh/);
  assert.match(css,/\.tutorial-dialog \[hidden\]/);
});
