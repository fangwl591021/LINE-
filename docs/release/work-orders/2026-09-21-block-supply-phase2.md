# 方塊補給站 Phase 2：畫面與操作

- 起點 782529b；分支 feat/game-center-block-supply；使用者確認繼續 Phase 2。
- 範圍：原創 Canvas 呈現、手機/鍵盤控制器、音訊與設定、本機獨立預覽、測試與截圖。
- 不改：坦克原檔、正式 index/商城入口、會員、Worker、點數、資料庫；不執行 migration、不推送或部署。
- 已讀 feature-change-protocol、工作單模板、block-supply 契約（沿用 Phase 1 已讀 core-invariants）。
- guard before / after：完整 smoke contracts PASS；git diff --check PASS。
- 只顯示「本機試玩，尚未串接每日獎勵」，不虛構 100 點入帳或已保存成績；遊戲館與真實獎勵狀態留待 Phase 3/4。
- 畫面沿用坦克深色/綠色主題；Canvas 補給箱與紋樣自行繪製，不使用外部素材。
- 下一階段風險：手機瀏覽器自動播放與實機安全區仍須驗收；合成測試不等於 LINE 實機音訊確認。

## 完成與驗收

- 完成原創補給箱 Canvas、能源/時間/下一件/分數/連擊、歡迎/暫停/勝敗畫面、手機四鍵與手勢、鍵盤、低音量原創音效與既有原創 chiptune。
- 共用介面提供 start/pause/resume/restart/destroy/getScore/getProgress/getResult/setMusicEnabled/setSoundEnabled 及完成/失敗回呼；每次遊戲只有一個 RAF。
- 純引擎與音訊單元測試 15/15 PASS；瀏覽器測試 PASS：鍵盤、真實 touch 輸入長按/放開、五尺寸控制界限、音訊偏好、阻擋播放不中斷、決定性合法操作過關、失敗、暫停、重開、離開回收。
- Chrome 測試尺寸：390×844、393×852、430×932、844×390、1366×768。人工檢視開始/遊玩/橫向/成功截圖，未見按鈕裁切或文字重疊。
- 坦克瀏覽器回歸 PASS，包含原本的合成會員 API/SQLite 發獎及重複守門，不接正式會員或正式點數。
- 本機網址 http://127.0.0.1:8792/；不更換原坦克 8791 預覽。未修改正式 index、Worker、坦克原檔或資料库，無 migration、push 或部署。
- 尚未完成：Phase 3 遊戲館、Phase 4 會員 session/共用每日 100 點/持久化成績與事件、Phase 5 整體驗收。現在返回遊戲館只回本機預覽入口，清楚標示後續接入。

## 修改檔案

- js/modules/block-supply-controller.mjs
- js/modules/block-supply-renderer.mjs
- js/modules/block-supply-audio.mjs
- css/block-supply.css
- tools/preview-block-supply.mjs
- tools/run-smoke-contracts.js
- test/block-supply-audio.test.mjs
- test/browser/block-supply.mjs
- test/helpers/block-player.mjs
- docs/contracts/block-supply.md
- 本工作單

## 本機截圖

位於 Windows Temp：block-supply-welcome.png、block-supply-playing.png、block-supply-393x852.png、block-supply-430x932.png、block-supply-844x390.png、block-supply-1366x768.png、block-supply-win.png、block-supply-lose.png、block-supply-landscape-result.png、block-supply-landscape-welcome.png。

## 正式環境限制

本階段禁止部署。後續需完成兩款遊戲的同日共用防重複發點、舊坦克 API 相容與實機 LINE 驗收，才可另外取得正式部署授權。
