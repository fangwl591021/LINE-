# 新手教學入口與播放器

- 日期：2026-10-05；使用者核准三欄示意圖並沿用測試後部署指示。
- 起始 commit / 回復點：2d9d12301a00886d04492a981d2e650f2341fd3c。
- 本次只允許改什麼：首頁精簡入口、獨立教學清單、會員註冊／我的名片／收藏名片就近入口、可關閉的播放器、三支既有影片的版本化公開發布、測試與文件。
- 預計檔案：index.html、css/tutorial-center.css、js/modules/tutorial-center.js、test/tutorial-center.test.mjs、test/browser/tutorial-center-*、test/home-reference-theme.test.mjs、tools/run-smoke-contracts.js、本文件與教學契約。
- 本次禁止碰什麼：身分／推薦歸屬／名片擁有权與版本／OCR／分享傳送／點數／D1／Worker 程式、secrets、vars、bindings；不更動原始影片。
- 必讀規格：docs/rules/core-invariants.md、docs/release/feature-change-protocol.md、docs/contracts/tutorial-center.md。
- 修改前：npm run guard:before PASS（全套）。
- 實作：獨立原生 dialog，無 LIFF/API 呼叫、不切換原功能頁、不新增底部頁籤。影片不自動播放；清单不請求影片；返回／關閉拆除媒體來源並恢復焦點。
- 店家公司／商品教學尚未完成，只標示即將推出，不提供播放。
- 媒體：既有 linengine R2 儲存桶的 tutorials/2026-10-05/ 新 key，逐一先確認不存在，再上傳與核對。未更改儲存桶設定。
- 修改後：首次 guard 偵測舊首頁測試以商城 banner 為截取邊界，誤將新教學入口算成第 9 個快捷鍵；改為新 banner 邊界，仍嚴格驗證原有 8 個快捷鍵與完整 handlers，未放寬數量或行為規格。npm run guard:after 全套重跑 PASS；新增 4 個教學契約通過。
- 瀏覽器驗證：320／390／768／1366px Chrome 均通過真實公開影片載入、無自動播放、章節跳轉與解碼、返回／關閉後 src 卸載、焦點恢復、背景暫停、原表單草稿保留、失敗提示／重試；確認無會員 API 請求。已目視核對 390px 首頁／清單／播放器截圖。尚未在實體 iOS／Android LINE WebView 測試。
- 部署：只發布前端 Pages 和三支影片；Worker 不需部署。
- 回退：revert 本次前端 commit / PR；新版 R2 影片可保留，沒有資料遷移。舊影片與既有程式不變。

## 媒體發布證據

已確認 bucket `linengine` 公開域名與既有設定一致；三個 key 發布前均回報不存在。
URL prefix: `https://pub-1e42b8765b1e4675bfb7be60f0e785ca.r2.dev/tutorials/2026-10-05/`
三個檔案公開 GET 200、Content-Type video/mp4、Range 206，遠端 SHA-256 與本機原件相同：

| Key | Bytes | SHA-256 |
| --- | ---: | --- |
| registration-v2.mp4 | 2080317 | 9eefe9836bee902221719f955b9c3d4b62e36e86f97417b48abe74e4ebb81f34 |
| business-card-v2.mp4 | 4811734 | 74e190b75a37cb18a50304b41b2aab1f7e8a673849a56320887e2a845310a04b |
| card-collection-v2.mp4 | 8433975 | 010c8d1926d314b32006e2f90293291327d2c4ecb928ed5513d6b88c264a7e2b |

使用既有已安裝 Wrangler 4.119.0，未安裝／升級依賴；未重部署 Worker。正式前端部署完成狀態見本次 PR／Pages 執行紀錄。
