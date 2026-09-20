# 點數紀錄整合與電話格式修正

- 起始版本：1b085b0；main，工作目錄乾淨。
- 使用者要求：最小修正，贈扣點／消費折抵紀錄整合；註冊及查詢電話忽略分隔符。已授權提交部署。
- 範圍：workerbackup.js 點數紀錄讀取與電話查詢／會員保存、store-history-popup.js 顯示及快取版本、相關測試。
- 不變：點數餘額、入帳、身分綁定、角色、防重送、180 秒收銀通道與 fallback、母站金鑰及 bindings。不批次改既有會員資料。
- 已讀：core-invariants、points-ledger、store-point-cashier-protected-flow、feature-change-protocol、regression-matrix。
- guard before：PASS。
- guard after：PASS；僅新增電話格式／空紀錄及 receipt 格式相關案例，相關 55 項測試通過。
- Worker dry-run：PASS；前端只更名為本人點數紀錄並更新快取版本，不整合其他會員的操作到本人帳本。
- 回復點：1b085b0；不新增 migration，不執行正式贈扣點。
