# 方塊補給站 Phase 1

- 起點：1a0b3b0；分支 feat/game-center-block-supply。使用者要求分階段，Phase 0 後確認繼續。
- 範圍：純引擎、單元測試、規則契約、納入既有 full guard。
- 不改：坦克、入口、會員、LINE、點數、Worker、資料庫、正式環境。無 migration、部署或推送。
- 已讀：feature-change-protocol、core-invariants、工作單模板；沿用 tank-engine 純模擬風格。
- guard before / after：完整 smoke contracts PASS；git diff --check PASS。
- 驗收：移動、旋轉、碰撞、落地、消排、能源、連擊、勝敗、暫停、重新開始、固定種子重播。
- Phase 2 風險：手機控制器及音訊須實測；引擎測試不能當作 LIFF 或點數驗收。
- 完成：10 種混合造型、10×16 棋盤、90 秒、移動/旋轉/落地/消排、能源/連擊/警戒、勝敗/暫停/重開，以及固定種子壓縮重播驗證。
- 修改檔案：js/modules/block-supply-engine.mjs、test/block-supply-engine.test.mjs、docs/contracts/block-supply.md、本工作單、tools/run-smoke-contracts.js。
- 13 項引擎單元測試 PASS，包含 seed 1/7/44 的未修改棋盤實際操作過關與結果重播；既有坦克引擎/音訊/API 22 項測試包含在 full guard 並通過。
- 無已知引擎測試失敗；四/五排 140/200 能源、特殊格消除 +10、分數為能源×10，皆為 Phase 0 提議的第一版規則，寫入契約。
- 本阶段沒有 timer、DOM、音訊、API 或會員點數整合；多次進出清理與手機/瀏海截圖留待 Phase 2。沒有產生 migration；不推送或部署。
