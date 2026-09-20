# 原創背景音樂與商城遊戲入口

- 起點 cf2a87e；使用者確認音效正常，要求復古 8 位元背景音樂及將重複查看/更新點數入口改為玩遊戲拿點數，並授權直接提交部署。
- 範圍：獨立背景音樂播放器（沿用已確認正常的 HTMLAudio 方式）、商城入口路由、快取版本及相關測試。
- 不改：已正常的音效播放邏輯、QR 操作、會員、每日簽到、100 點、防重、Worker、migration。
- 已讀：core-invariants、daily-tank-challenge、feature-change-protocol；guard before PASS。
- 音樂為原創方波旋律/三角波低音/合成打擊，無外部素材；僅開始/繼續等手勢播放，獨立開關，暫停/勝敗/離開停止。
- 修改：tank-music 新模組、daily-tank-challenge、store-points-home/store-shop 及其載入版本、預覽與相關測試、契約。
- guard before / after：完整 smoke contracts 均 PASS；git diff --check PASS。
- 聚焦測試：tank-audio + store-points-home 共 19 項 PASS；包含原創 PCM、延遲建立播放器、阻擋後重試、開關/清理、各角色遊戲入口與 QR 保留。
- 瀏覽器：daily-tank PASS；實際循環媒體時間前進、音效獨立、暫停/繼續/關閉/破關停止、手機橫直向/雙指操作、音訊被阻擋仍可玩、模擬 API/SQLite 防重複獎勵。
- 限制：自動化瀏覽器驗證媒體播放，不等同於實際手機 LINE 揚聲器聽音；未操作正式點數。僅發布 GitHub Pages 前端，無 Worker 或 migration。
