# 平台商城導入計畫

本計畫採最小風險導入。每一階段都必須能獨立驗證，且不得順手修改名片、店家收銀、收件匣或租戶年費訂單。

## Phase 0：文件與保護規則

狀態：本文件階段。

交付：

- `docs/platform-shop/architecture.md`
- `docs/platform-shop/data-and-actions.md`
- `docs/platform-shop/implementation-plan.md`

禁止：

- 不新增 runtime action。
- 不修改 UI。
- 不新增 migration。
- 不部署。

## Phase 1：只讀商品目錄

目標：平台能維護商品資料，會員能看到商品列表，但尚不下單。

建議工作：

1. 建立 `platform_shop_products` migration。
2. 新增 `listPlatformShopProducts`、`getPlatformShopProduct`。
3. 新增 `savePlatformShopProduct`、`updatePlatformShopProductStatus`，限 platform admin。
4. 新增 contract test：
   - 商品列表不可讀到 archived。
   - 一般會員不可儲存商品。
   - 租戶 admin 不等於 platform admin。

驗證：

```powershell
node --check workerbackup.js
npm run smoke
git diff --check
```

## Phase 2：購物車與訂單草稿

目標：會員可建立訂單草稿，尚不接點數折抵。

建議工作：

1. 建立 `platform_shop_orders`、`platform_shop_order_items`。
2. 新增 `createPlatformShopOrder`。
3. 訂單建立必須有 `idempotency_key`。
4. 前端購物車可先使用 local state，送出時建立訂單。

保護：

- 不使用現有 `orders`。
- 不觸碰 MLM bonus。
- 不接店家點數收銀。

## Phase 3：點數折抵

目標：會員可用自己的點數折抵平台商城訂單。

建議工作：

1. 每件商品先定義 `point_redeem_type` 與 `point_redeem_value`。
2. checkout 時逐品項計算可折抵上限，再加總成訂單可折抵上限。
3. 後端重新查買家點數，不信任前端餘額。
4. 後端重新計算 `subtotal`、`point_discount`、`payable_amount`。
5. 使用帳本 reference `platform_shop_order:{orderId}` 防重複扣點。
6. 成功扣點後更新訂單 `point_ledger_ref`。

測試要求：

- 會員點數不足不可折抵。
- 商品不可折抵時，即使會員有點數也不得折抵該商品。
- 固定折抵、比例折抵、全額折抵都必須依明細上限計算。
- 多商品訂單必須先逐品項計算，再加總訂單折抵上限。
- `payable_amount` 不得由前端決定，且不得小於 0。
- 重送 checkout 不可重複扣點。
- 扣點成功但付款失敗時狀態必須可補償。
- 取消或退款只能用反向帳本事件，不刪原帳本。

## Phase 4：核銷與合作店家履約

目標：服務券、課程券、優惠券類商品可以由合作店家核銷。

建議工作：

1. 建立 `platform_shop_redemptions`。
2. 訂單 paid 或 issued 後產生核銷憑證。
3. 合作店家只能核銷自己的 `partner_store_id`。
4. 平台 admin 可查所有核銷。

測試要求：

- 同一憑證只能核銷一次。
- A 店不可核銷 B 店憑證。
- 平台 admin 可人工處理例外。

## Phase 5：首頁入口與平台後台

目標：將商城入口放到首頁，商品管理放到平台後台。

前端原則：

- 首頁「線上商城」導向會員商城頁。
- 商品管理不放在店家設定。
- 合作店家核銷入口與商品管理入口分開。

## 回復策略

每階段都需獨立 commit。若發生問題：

1. Phase 1 可隱藏入口並保留資料表。
2. Phase 2 可停止建立新訂單，既有草稿保留。
3. Phase 3 若點數異常，先關閉折抵，訂單仍可無折抵成立。
4. Phase 4 若核銷異常，先關閉合作店家核銷，改平台人工核銷。

任何回復不得刪除已產生的訂單、帳本或核銷紀錄。
