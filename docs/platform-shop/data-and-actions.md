# 平台商城資料與 Action 契約

本文件定義平台商城建議資料表、action policy 與點數折抵規則。正式實作前需先依此契約建立 migration 與 contract test。

## 資料表建議

### platform_shop_products

平台商品主檔。只有平台管理員可寫入。

| 欄位 | 說明 |
| --- | --- |
| `product_id` | 商品 ID。建議使用 `PSP_` prefix。 |
| `sku` | 平台商品編號。 |
| `title` | 商品名稱。 |
| `subtitle` | 短描述。 |
| `description` | 詳細描述。 |
| `image_url` | 商品主圖。 |
| `category` | 商品分類。 |
| `price` | 商品售價。 |
| `point_redeem_type` | 商品折抵類型：`none`、`fixed`、`percent`、`full`。 |
| `point_redeem_value` | 商品折抵值。`fixed` 表示固定可折抵點數，`percent` 表示可折抵百分比，`full` 表示可全額點數兌換時可為空或 100。 |
| `point_redeem_cap` | 最終最高可折抵點數。可由 `point_redeem_type/value` 計算後寫入快照；0 表示不可折抵。 |
| `stock_qty` | 庫存數。空值或 -1 可代表不限庫存。 |
| `partner_store_id` | 合作店家 ID，可空。 |
| `fulfillment_type` | `digital`、`coupon`、`course`、`service`、`physical`。 |
| `status` | `draft`、`active`、`hidden`、`sold_out`、`archived`。 |
| `sort_order` | 排序。 |
| `raw_json` | 保留擴充資料。不得存敏感 token。 |
| `created_at` | 建立時間。 |
| `updated_at` | 更新時間。 |

### platform_shop_orders

平台商城訂單主檔。不得混用現有 `orders`。

| 欄位 | 說明 |
| --- | --- |
| `order_id` | 訂單 ID。建議使用 `PSO_` prefix。 |
| `buyer_user_id` | 買家 canonical LINE identity。 |
| `buyer_point_id` | 點數身份。 |
| `partner_store_id` | 合作履約店家，可空。 |
| `subtotal` | 商品小計。 |
| `point_discount` | 使用點數折抵金額，必須由各訂單明細可折抵上限加總後計算。 |
| `payable_amount` | 應付金額。 |
| `payment_status` | `draft`、`pending_payment`、`paid`、`cancelled`、`refunded`。 |
| `fulfillment_status` | `pending`、`issued`、`redeemed`、`fulfilled`、`cancelled`。 |
| `idempotency_key` | 建單或付款確認冪等鍵。 |
| `point_ledger_ref` | 點數帳本 reference。 |
| `raw_json` | 快照與擴充資料。 |
| `created_at` | 建立時間。 |
| `updated_at` | 更新時間。 |

### platform_shop_order_items

訂單明細。必須保留商品快照，避免商品改名或改價後歷史訂單失真。

| 欄位 | 說明 |
| --- | --- |
| `order_item_id` | 明細 ID。 |
| `order_id` | 訂單 ID。 |
| `product_id` | 商品 ID。 |
| `sku` | 商品編號快照。 |
| `title_snapshot` | 商品名稱快照。 |
| `unit_price` | 單價快照。 |
| `quantity` | 數量。 |
| `subtotal` | 明細小計。 |
| `point_redeem_type_snapshot` | 下單當下的商品折抵類型快照。 |
| `point_redeem_value_snapshot` | 下單當下的商品折抵值快照。 |
| `point_redeem_cap_snapshot` | 此明細最高可折抵點數快照。 |
| `point_discount` | 此明細實際分攤折抵點數。 |
| `raw_json` | 擴充資料。 |

### platform_shop_redemptions

若商品需要核銷，應獨立紀錄核銷憑證。

| 欄位 | 說明 |
| --- | --- |
| `redemption_id` | 核銷 ID。 |
| `order_id` | 訂單 ID。 |
| `buyer_user_id` | 買家。 |
| `partner_store_id` | 可核銷店家。 |
| `status` | `issued`、`redeemed`、`cancelled`、`expired`。 |
| `redeemed_at` | 核銷時間。 |
| `redeemed_by` | 核銷操作者。 |
| `redeem_note` | 核銷備註。 |
| `single_use` | 是否單次使用。預設 true。 |

## Action policy 建議

| Action | 權限 | D1 fallback | 說明 |
| --- | --- | --- | --- |
| `listPlatformShopProducts` | public 或 authenticated | false | 商品列表。若價格或庫存需會員條件，改 authenticated。 |
| `getPlatformShopProduct` | public 或 authenticated | false | 商品詳情。 |
| `createPlatformShopOrder` | authenticated user | false | 建立會員自己的訂單。不得信任 payload userId。 |
| `getMyPlatformShopOrders` | resource owner | false | 只可讀自己的訂單。 |
| `getPlatformShopOrder` | resource owner 或 platform admin | false | 會員讀自己的；平台管理員可讀全部。 |
| `cancelMyPlatformShopOrder` | resource owner | false | 只允許取消自己的未付款 / 未履約訂單。 |
| `savePlatformShopProduct` | platform admin | false | 新增或更新平台商品。 |
| `updatePlatformShopProductStatus` | platform admin | false | 上下架商品。 |
| `listPlatformShopOrders` | platform admin | false | 平台訂單管理。 |
| `fulfillPlatformShopOrder` | platform admin | false | 平台履約狀態。 |
| `redeemPlatformShopVoucher` | partner store staff 或 platform admin | false | 合作店家只可核銷指派給自己的憑證。 |

原則：

- 商城下單不得允許 D1 identity fallback 自動建立 actor。
- 前端傳入的 `userId` 只能當提示，不可當授權來源。
- 產品管理必須是 platform admin，不是 tenant admin。
- 合作店家核銷必須驗證 `partner_store_id` ownership。

## 點數折抵規則

- 點數折抵扣買家的 `gift_money`。
- 不扣店家點數。
- 不扣商城操作費。
- 不使用店家點數收銀 session。
- 每件商品都可以自訂點數折抵規則，不得使用全站固定折抵比例替代。
- 結帳時必須先逐品項計算可折抵上限，再加總成訂單可折抵上限。
- 會員實際折抵點數不得超過會員可用點數、訂單可折抵上限與訂單小計。
- `payable_amount` 必須由 `subtotal - point_discount` 計算，且不得小於 0。
- 帳本事件類型建議為 `platform_shop_redeem`。
- 帳本 reference 必須包含 `order_id`，例如 `platform_shop_order:PSO_xxx`。
- 同一 `order_id` 不可重複扣點。
- 訂單取消或退款時，若要退點，應使用相反事件 `platform_shop_refund`，不得刪改原事件。

### 商品折抵類型

| 類型 | 說明 |
| --- | --- |
| `none` | 不可折抵。 |
| `fixed` | 固定可折抵點數，例如最多折抵 100 點。 |
| `percent` | 依商品明細小計比例折抵，例如最多折抵 30%。 |
| `full` | 可全額點數兌換，但仍不得超過明細小計與會員可用點數。 |

### 結帳計算順序

1. 讀取商品快照與數量。
2. 計算每個明細 `line_subtotal = unit_price * quantity`。
3. 依商品折抵設定計算每個明細的 `line_redeem_cap`。
4. 加總所有 `line_redeem_cap` 成為 `order_redeem_cap`。
5. 實際折抵 `point_discount = min(member_balance, order_redeem_cap, order_subtotal, requested_points)`。
6. 將 `point_discount` 分攤到各明細，寫入 `platform_shop_order_items.point_discount`。
7. 計算 `payable_amount = max(order_subtotal - point_discount, 0)`。

禁止由前端直接傳入最終 `payable_amount` 作為後端信任值。

## 核銷規則

- 可核銷商品必須產生 `platform_shop_redemptions`。
- 預設 `single_use = true`。
- 核銷更新必須使用條件式更新：
  - 只能從 `issued` 改成 `redeemed`。
  - 已核銷不得再次核銷。
- 合作店家只能核銷 `partner_store_id` 對應的憑證。
- 平台管理員可查全部核銷紀錄。

## 禁止混用

- 不得寫入現有 `orders`。
- 不得呼叫 `storeAdjustCustomerPoints` 來做商城折抵。
- 不得把平台商品存在店家設定。
- 不得把商城券直接塞進收件匣優惠券當成訂單。
- 不得修改名片 ownership 或影音名片資料。
