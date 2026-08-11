# Phase 1：合作店家目錄

## 目標

建立「折抵店家」的唯讀目錄與後續點數折抵所需的 D1 資料骨架。Phase 1 只處理合作店家、服務據點與折抵政策展示，不建立訂單、不建立核銷碼，也不扣除會員點數。

## 與既有功能的邊界

- 合作店家目錄與平台線上商城是不同功能；目錄描述可到店消費的店家，商城描述平台商品。
- 不得呼叫 `storeAdjustCustomerPoints`、`insertUserPoint` 或任何既有點數異動 action。
- 不得寫入既有 `orders`、店家收銀紀錄或點數 ledger。
- `point_redeem_enabled` 在 Phase 1 只代表政策展示，不代表可執行扣點。
- 正式點數折抵、動態 QR、核銷、沖正與結算留待後續 Phase。

## D1 資料骨架

Migration：`migrations/0019_point_redemption_partner_directory.sql`

| Table | 用途 | Phase 1 寫入來源 |
| --- | --- | --- |
| `point_redemption_partners` | 店家公開資料與狀態 | migration 後由受控後台或人工 SQL 建檔 |
| `point_redemption_partner_locations` | 分店、地址、營業資訊 | migration 後由受控後台或人工 SQL 建檔 |
| `point_redemption_partner_policies` | 是否規劃折抵、比例上限、最低消費與說明 | migration 後由受控後台或人工 SQL 建檔 |

資料表不預載示範店家，避免測試資料出現在正式目錄。內部 `partner_id`、`location_id` 不會由公開 API 回傳；前端只使用不透明的 `partner_handle` 與 `location_handle`。

## Worker 契約

### `listPointRedemptionPartners`

- 權限：public、唯讀。
- 輸入：`query`、`category`、`city`、`limit`。
- `limit` 範圍為 1 至 50。
- 只回傳 `active` 店家與 `active` 據點。
- SQL 必須使用 prepared statement bind，不拼接使用者輸入。

### `getPointRedemptionPartner`

- 權限：public、唯讀。
- 輸入：`partnerHandle`。
- 只回傳 `active` 店家與 `active` 據點。
- 回傳公開欄位，不回傳內部數字 ID、員工、帳務或會員資料。

## 前端契約

- 首頁「折抵店家」進入站內 `partner-directory` 頁，不跳出 LIFF。
- 支援名稱關鍵字、類別與縣市篩選。
- 店家詳情可顯示據點、聯絡方式與政策預覽。
- 畫面必須明示 Phase 1 不執行扣點或付款。
- 空資料與 API 失敗都要有安全提示。

## 上線門檻

1. 契約測試與 Worker module test 通過。
2. 完整 smoke contracts 通過。
3. Wrangler dry-run 通過。
4. 上正式環境前另行審核並套用 migration；本 Phase 實作本身不自動套用遠端 D1。

## Phase 1.5：總管管理後台

- `listAdminPointRedemptionPartners`、`savePointRedemptionPartner`、`archivePointRedemptionPartner` 均為 admin-only action。
- 總管可在「AI商脈系統後台 → 系統管理 → 合作店家管理」建立或修改店家、主要據點與折抵政策。
- 新店家預設為 `draft`，必須明確改成 `active` 才會出現在前台。
- 停用採軟封存：店家改為 `archived`、據點改為 `hidden`，不直接刪除資料。
- 圖片、LINE、網站及地圖欄位只允許 `http`／`https`，拒絕 `javascript:` 等危險協定。
- 新增店家可選擇目前總管「自己收藏」的名片，自動帶入公司、聯絡人、電話、Email、統編、網站與地址空白欄位。
- 名片僅作為建檔來源：不改變名片擁有權、不綁定名片本人為店家帳號、不自動啟用店家，也不執行扣點。
- `contact_name`、`contact_email`、`tax_id` 與 `source_card_row_id` 僅供總管建檔與追溯，公開店家 API 不回傳。
- 後台只能設定未來折抵政策；仍不得執行扣點、付款、核銷或結算。
- 不預載測試店家；第一家店家必須使用經確認的真實資料建檔。
