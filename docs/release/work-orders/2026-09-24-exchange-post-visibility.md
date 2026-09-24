# 交流貼文隱藏／重新顯示

- 日期：2026-09-24
- 需求：作者選擇隱藏後不出現在前台，保留內容並可重新顯示。沿用使用者修好直接部署的授權。
- 起始 commit / 回復點：0ccace29a51f1219943432be3b49bd585f78bcbc
- 範圍：exchange-zone 後端、前端模組、入口快取版本、相關測試與契約。
- 禁止：會員／名片歸屬、點數帳本、私訊內容、商城、遊戲、正式 secrets；不刪資料、不修改其他 migration。
- 已讀：feature-change-protocol、core-invariants、card-ownership-and-versioning、card-resolvers、points-ledger、liff-routes、regression-matrix。
- guard before：PASS（node tools/run-change-guard.js before）。

## 契約與決策

- 詳見 docs/contracts/exchange-post-visibility.md。
- 沿用 exchange_zone_posts.status 的 hidden，不增加資料表／migration。
- 公開查詢保持只讀 published；作者在「我的貼文」查自己的 published / hidden，其他帳號及管理員不能跨作者讀取隱藏內容。
- 隱藏／恢復使用已驗證 actor，條件 UPDATE，不靠前端過濾；不再次扣點、不退款、不變更發布時間、內容、名片或券。
- 隱藏中可查看、刪除或重新顯示，需先重新顯示才可編輯，保留既有編輯與優惠券流程。

## 驗證／發版

- guard after：PASS（完整 smoke contracts）。
- 相關測試：7 項 SQLite 狀態／權限／優惠券驗證、既有 exchange-zone.test.mjs 全數通過；390px／1440px 真實模組搭配合成 API 操作測試通過（隱藏、恢復、取消、失敗、延遲回應、刪除）。不在正式會員貼文上做操作測試。
- Wrangler dry-run：PASS，保留既有 bindings、vars、crons，無 migration。
- 正式 Worker / Pages：待部署並核對發布資產。
- 限制：管理清單顯示最近 50 則；隱藏貼文須重新顯示才可編輯。已經開啟的畫面不會主動清除快照，後續公開讀取／操作均重新檢查狀態。
