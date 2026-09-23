# 大富翁走格閃爍最小修正

- 需求：人物每走一步閃爍，使用者要求修正、部署。
- 起始版本／回復點：42dc8fb；僅發布 GitHub Pages 前端。
- 根因：每步 `render()` 清空並重建棋盤、圖片與人物，人物的 brHop 動畫與格子放大重複觸發。
- 允許檔案：`js/modules/business-richman.js` 的走格更新／CSS、`index.html` 模組快取版本、`test/store-richman.test.mjs`、遊戲館契約與本工作單。
- 修正：走格途中重用棋盤、圖片、骰子與人物 DOM，只更新目前格與人物位置；取消人物彈跳與格子放大，保留辨識用邊框。名片／商城兩種模式共用此修正。
- 禁止：遊戲玩法、骰子結果、步速、會員與名片資料、商城 API、點數／獎勵、Worker、migration。
- 已讀：feature-change-protocol、change-work-order-template、core-invariants、game-center 契約。
- guard before／after：PASS；`git diff --check` PASS。
- 相關測試：`node --test test/store-richman.test.mjs test/business-richman.test.mjs`，13 項通過；新增逐步驗證兩種模式棋格、圖片、骰子與人物皆沿用同一節點，落點／回合不變。
- 瀏覽器驗證：390px 隔離預覽，擲骰後成功抵達商城、返回第 2 回合且可再擲骰；人物 computed animationName=none、目前格 transform=none。使用合成資料，不涉及正式點數；手機 LINE 實機仍待使用者確認。
- 發布：相關測試與 CI 通過後提交／合併；等 Pages 成功並比對線上 HTML、棋盤 JS 雜湊。不代會員操作正式點數。
