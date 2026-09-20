# 扣點用戶權限

- 需求：新增可扣點、不可贈點的店家操作模式；使用者已授權測試後提交部署。
- 起始版本：d7a2931；main，工作目錄乾淨。
- 範圍：CRM 角色選項、角色保存、防越權、商家首頁與收銀 UI、測試。
- 新角色 redeem（扣點用戶）：會員 QR／電話查詢、消費折抵、本人查單／紀錄；不授予贈點、店長管理、商品管理、系統管理權限。
- 不變：既有店長與贈點角色、180 秒收銀通道、防重交易、身份及歸屬、點數計算與帳本、金鑰／bindings。
- 已讀：core-invariants、points-ledger、store-point-cashier-protected-flow、feature-change-protocol。
- guard before：PASS。
- guard after：PASS（完整 smoke contracts）。
- 手機瀏覽器：390 × 844 本機合成會員電話查詢及折抵 10 點成功；僅一次模擬送出，無贈點選項，未連正式點數。
- Worker deploy --dry-run --keep-vars：PASS；無 migration 或 binding 修改。
- 不變更正式會員角色，不執行真實扣點／贈點。
- 回復：起始版本；無 migration。
