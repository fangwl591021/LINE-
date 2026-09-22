# 五子棋貓咪棋子微調

- 需求：棋子改成貓貓，僅視覺調整；不部署。
- 保留目前五子棋整合未提交內容；修改前完整 guard PASS。
- 閱讀：feature-change-protocol、gomoku-preview 契約、工作單模板。
- 修改：gomoku-controller 的 Canvas 棋子繪製、玩家圖例與說明，gomoku.css 圖例色；相關瀏覽器測試。
- 禁止：引擎規則、AI、完成 API、會員身分、點數、資料庫、正式環境。
- 造型：原創橘貓與灰貓頭像，耳朵、眼睛、鼻口、鬍鬚；不載入新圖片，不新增素材請求。
- 保留半透明落點預覽與最後一步外圈標記，角色文字同步。
- guard after：`node tools/run-change-guard.js after` PASS；`git diff --check` PASS。
- 瀏覽器：`node test/browser/gomoku.mjs` PASS；包含既有操作測試及手機 24 手棋盤、橘/灰毛色像素檢查、角色說明、截圖人工確認。截圖：`C:/Users/User/AppData/Local/Temp/gomoku-cat-pieces-board.png`。
- 預覽沿用 `http://127.0.0.1:8795/`，重新整理載入新版棋子；沒有提交或部署。
