import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../js/modules/tutorial-center.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../css/tutorial-center.css',import.meta.url),'utf8');
const context=vm.createContext({window:{addEventListener(){}},document:{addEventListener(){}}});
vm.runInContext(source.replace('  let dialog = null;', '  window.testCourses = courses; window.testCategories = categories; window.testMediaBase = mediaBase;\n  let dialog = null;'),context);
const courses=JSON.parse(JSON.stringify(context.window.testCourses));
const categories=JSON.parse(JSON.stringify(context.window.testCategories));
test('two point lessons follow the original eleven movies without changing existing metadata',()=>{
  assert.equal(courses.length,13);
  assert.deepEqual(courses.filter(c=>c.file).map(c=>c.id),['registration','mycard','collection','merchant','ai-advance','activity-publish','activity-settings','course-settings','social-settings','attendee-checkin','organizer-checkin','store-point-gift','point-redemption']);
  assert.equal(createHash('sha256').update(JSON.stringify(courses.slice(0,9))).digest('hex'),'3c7a17942e387bce6366c6be58498627a9ad0010fe276ac7f5b52b6e07226958','all original nine course fields must remain unchanged');
  assert.equal(createHash('sha256').update(JSON.stringify(courses.slice(0,11))).digest('hex'),'6f80ab1c681b7a009f389cf133b068c3a26692bc2b72095ea10b7d5b534b3092','all original eleven course fields must remain unchanged');
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
  assert.match(html,/tutorial-center\.js\?v=8/);
  assert.match(html,/tutorial-center\.css\?v=2/);
});
test('setting series uses distinct versioned movies, measured chapters and accurate scope notes',()=>{
  const series=courses.slice(6,9);
  assert.deepEqual(series.map(c=>c.title),['活動設定','課程設定','聯誼設定']);
  assert.deepEqual(series.map(c=>c.duration),['4:48','4:10','4:13']);
  assert.deepEqual(series.map(c=>c.file),['activity-settings-tutorial-v1.mp4','course-settings-tutorial-v1.mp4','social-settings-tutorial-v1.mp4']);
  assert.deepEqual(series.map(c=>c.chapters.find(ch=>ch[1]==='公開／僅歸屬可見')[0]),[166.167,139.792,143]);
  assert.deepEqual(series.map(c=>c.chapters.find(ch=>ch[1]==='修改後再選公開範圍')[0]),[251.917,221.417,224.375]);
  for(const course of series){
    assert.equal(course.mediaBase,'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-09/');
    assert.match(course.description,/首頁近期活動 →/);
    assert.match(course.note,/中文旁白＋步驟標示/);
    assert.match(course.note,/虛構資料/);
    assert.match(course.note,/沒有建立正式/);
    assert.match(course.note,/所有登入且已註冊的平台會員/);
    assert.match(course.note,/未登入不開放/);
    assert.match(course.note,/僅歸屬會員可見/);
    assert.match(course.note,/取消不送出/);
    assert.match(course.note,/不會自動扣點/);
    assert.doesNotMatch(course.note,/繁體字幕|實錄/);
    assert.ok(course.chapters.every((ch,i)=>i===0||ch[0]>course.chapters[i-1][0]),'chapters must be ordered');
  }
  assert.match(series[0].note,/保留例會類型/);
  assert.match(series[1].note,/保留課程類型/);
  assert.match(series[2].note,/保留聯誼類型/);
  assert.equal(courses.some(c=>c.id==='other-settings'),false,'unfinished lesson must not be published');
});
test('check-in lessons use measured chapters and accurately disclose the member-hosted test flow',()=>{
  const series=courses.slice(9,11);
  assert.deepEqual(series.map(c=>c.title),['報名者接受核銷','主辦人核銷報名者']);
  assert.deepEqual(series.map(c=>c.duration),['2:06','2:24']);
  assert.deepEqual(series.map(c=>c.file),['attendee-accept-checkin-tutorial-v1.mp4','organizer-checkin-roster-tutorial-v1.mp4']);
  assert.deepEqual(series[0].chapters,[[0,'從頭觀看'],[13.583,'首頁我的報名'],[28.458,'會員活動／課程報名'],[40.542,'查看本場活動'],[52.125,'出示報名 QR'],[65.667,'重新產生 QR'],[80.375,'現場出示 QR'],[93.208,'確認已核銷'],[110.208,'重點複習']]);
  assert.deepEqual(series[1].chapters,[[0,'從頭觀看'],[14.583,'首頁個人行事曆'],[27.292,'我辦的活動'],[39.333,'報名名冊'],[55.167,'開啟核銷掃描器'],[68.833,'開始掃描'],[83.75,'確認核銷成功'],[96,'貼上 QR 內容'],[111.917,'查看更新名單'],[125.958,'重點複習']]);
  for(const course of series){
    assert.equal(course.mediaBase,'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-10/');
    for(const label of ['中文旁白＋步驟標示','會員自建活動／課程','虛構會員','測試資料','測試相機','未異動正式報名或核銷紀錄','平台內的核銷掃描器','LINE 一般掃描器','商城點數 QR','活動期間'])assert.ok(course.note.includes(label),label);
    assert.doesNotMatch(course.note,/繁體字幕|正式操作實錄/);
    assert.ok(course.chapters.every((ch,i)=>i===0||ch[0]>course.chapters[i-1][0]));
  }
  assert.match(series[0].note,/五分鐘有效/);
  assert.match(series[0].note,/舊碼失效/);
  assert.match(series[1].note,/僅本場主辦人/);
  assert.match(series[1].note,/重複核銷不重複計算/);
  assert.match(series[1].note,/不等同真人手機相機驗收/);
});
test('exclusive categories cover every lesson once and do not default to an all-course list',()=>{
  assert.deepEqual(categories.map(c=>[c.id,c.title,c.courses.length]),[['members','會員與名片',3],['stores','店家與點數',3],['activities','活動與課程',6],['tasks','AI任務',1]]);
  const ids=categories.flatMap(c=>c.courses);
  assert.equal(new Set(ids).size,13);
  assert.deepEqual([...ids].sort(),courses.map(c=>c.id).sort());
  assert.match(source,/let selectedCategory = categories\[0\]\.id/);
  assert.match(source,/courses\.filter\(course => category\.courses\.includes\(course\.id\)\)/);
  assert.match(source,/aria-pressed/);
  assert.match(source,/returnTarget.*filters\.querySelector/);
  assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
test('point tutorials have measured chapters and disclose synthetic, distinct commerce workflows',()=>{
  const gift=courses.find(c=>c.id==='store-point-gift'),redeem=courses.find(c=>c.id==='point-redemption');
  assert.deepEqual([gift.duration,redeem.duration],['2:23','3:00']);
  assert.deepEqual([gift.file,redeem.file],['store-point-gift-tutorial-v1.mp4','point-redemption-tutorial-v1.mp4']);
  for(const course of [gift,redeem]){
    assert.equal(course.mediaBase,'https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-10/');
    for(const text of ['中文旁白＋步驟標示','虛構會員','測試資料','未異動正式點數或交易紀錄','不是活動／課程核銷'])assert.ok(course.note.includes(text),text);
    assert.ok(course.chapters.every((ch,i)=>i===0||ch[0]>course.chapters[i-1][0]));
  }
  assert.deepEqual(gift.chapters.slice(6,8),[[93.167,'確認贈點'],[110.417,'會員點數紀錄']]);
  assert.deepEqual(redeem.chapters.slice(7,10),[[109.833,'確認送出'],[129.708,'店家最近收銀紀錄'],[144.833,'會員點數紀錄']]);
  assert.match(gift.note,/電話贈點填點數、不填消費金額/);
  assert.match(redeem.note,/掃碼只查找會員，不會直接扣點/);
  assert.match(redeem.note,/應收不代表平台已收款/);
  assert.match(redeem.note,/測試相機/);
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
