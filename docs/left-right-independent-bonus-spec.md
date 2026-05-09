# 左右雙位獨立分潤制規格

版本：2026-05-09

## 制度定位

本制度不是外界常稱的 2-UP pass-up。系統內名稱統一為「左右雙位獨立分潤制」。

核心原則：

- 租戶年費含稅 NT$ 6,300，未稅收入 NT$ 6,000。
- 每筆租戶年費提撥 BV NT$ 3,000 作為獎金基準。
- 每位租戶若要取得獨立資格，必須完成左右各一位合格租戶。
- 自己未獨立前，左右兩位仍先安置在自己底下，作為自己的獨立資格。
- 自己完成左右各一並獨立後，後續推薦獎金才改為全額歸自己。
- 不管自己是否獨立，自己底下的人若要獨立，都必須上交左右各一位給自己。
- 退款、退租、爭議期內取消時，未結算流水必須作廢或沖回。

## 角色與欄位

會員欄位：

- `memberId`：會員 LINE ID 或系統會員 ID。
- `sponsorId`：推薦人，也就是介紹此會員的人。
- `placementParentId`：組織圖安置父節點。
- `placementSide`：安置位置，值為 `left` 或 `right`。
- `qualificationCount`：已完成可用於獨立的合格件數。
- `qualificationLeftMemberId`：左位合格會員。
- `qualificationRightMemberId`：右位合格會員。
- `independentAt`：取得獨立資格時間。空值代表尚未獨立。

訂單欄位：

- `orderId`：訂單編號。
- `buyerId`：付款租戶。
- `orderType`：`tenant_annual_fee` 或 `tenant_renewal_fee`。
- `grossAmount`：含稅金額，預設 6300。
- `netAmount`：未稅金額，預設 6000。
- `bv`：獎金基準，預設 3000。
- `paymentStatus`：`pending_payment`、`paid`、`cancelled`、`refunded`。
- `bonusStatus`：`not_generated`、`pending`、`settled`、`cancelled`、`reversed`。
- `bonusPolicyType`：`left_right_independent_split`。

流水欄位：

- `transactionId`：流水編號。
- `orderId`：來源訂單。
- `memberId`：收款人。
- `sourceMemberId`：產生此筆獎金的租戶。
- `bonusType`：`direct_full`、`direct_split`、`sponsor_split`、`renewal_referral`、`renewal_placement`、`reversal`。
- `amount`：獎金金額。
- `status`：`pending`、`settled`、`cancelled`、`reversed`。
- `freezeUntil`：可結算時間，預設付款後 14 天。

## 入會年費獎金規則

### 推薦人已獨立

條件：

- 推薦人 `independentAt` 有值，或 `isIndependent = true`。

撥發：

- 推薦人取得全額 BV：NT$ 3,000。
- 不再拆給推薦人的上線。

流水：

- `direct_full`：推薦人 +3000。

### 推薦人未獨立

條件：

- 推薦人尚未完成左右各一，或 `independentAt` 空值。

撥發：

- 推薦人取得 NT$ 1,500。
- 推薦人的上線取得 NT$ 1,500。
- 此筆合格訂單可用於推薦人的左右雙位獨立資格。

流水：

- `direct_split`：推薦人 +1500。
- `sponsor_split`：推薦人的上線 +1500。

資格：

- 若此筆被指定為左位，寫入 `qualificationLeftMemberId`。
- 若此筆被指定為右位，寫入 `qualificationRightMemberId`。
- 左右都完成後，推薦人取得 `independentAt`。

## 年度續約獎金規則

年度續約獎金以當下組織狀態計算：

- 自己直接推薦且仍有效的租戶續約：推薦人可得 NT$ 1,500。
- 當下安置在自己底下的租戶續約：安置父節點可得 NT$ 1,500。
- 若同一人同時是推薦人與安置父節點，可同時符合兩種角色；是否合併成一筆或兩筆，資料庫可用 `bonusType` 區分。
- 續約仍需 14 天凍結期，退款或取消要作廢未結算流水。

## 測試案例

| 編號 | 情境 | 前置狀態 | 訂單 | 預期流水 | 預期資格變化 |
| --- | --- | --- | --- | --- | --- |
| T01 | 推薦人已獨立後推薦新租戶 | A 已獨立，B 由 A 推薦 | B 入會年費 6300，BV 3000 | A `direct_full` +3000 | A 資格不變 |
| T02 | 推薦人未獨立，第一位左位 | A 未獨立，A 上線為 S，B 由 A 推薦，指定 left | B 入會年費 6300，BV 3000 | A `direct_split` +1500；S `sponsor_split` +1500 | A `qualificationLeftMemberId = B`，尚未獨立 |
| T03 | 推薦人未獨立，第二位右位後獨立 | A 已有左位 B，A 上線為 S，C 由 A 推薦，指定 right | C 入會年費 6300，BV 3000 | A `direct_split` +1500；S `sponsor_split` +1500 | A `qualificationRightMemberId = C`，寫入 `independentAt` |
| T04 | 獨立後再推薦 | A 已完成左右各一並獨立，D 由 A 推薦 | D 入會年費 6300，BV 3000 | A `direct_full` +3000 | A 資格不變 |
| T05 | 下線想獨立仍要上交左右各一 | A 已獨立，B 在 A 下方，B 推薦 E/F | E/F 入會年費各 6300 | B 未獨立期間每筆 B +1500、A +1500 | B 左右各一完成後獨立 |
| T06 | 退款於凍結期內 | B 訂單已付款但尚未結算 | B 訂單退款 | 原 pending 流水取消或沖回 | 若 B 曾被計入資格，資格需回復待補 |
| T07 | 重複付款通知 | 同一訂單已處理付款回調 | 同 paymentNo 再送一次 | 不新增流水 | 資格不重複計算 |
| T08 | 續約直接推薦 | B 為 A 直接推薦租戶 | B 年度續約 | A `renewal_referral` +1500 | 資格不變 |
| T09 | 續約安置底下 | B 當下安置在 A 底下 | B 年度續約 | A `renewal_placement` +1500 | 資格不變 |
| T10 | 缺少推薦人資料 | B 沒有 sponsorId | B 入會年費付款 | 不產生推薦流水，標記 `bonusStatus = review_required` | 不改資格 |

## 組織圖查詢要求

組織圖需要能查：

- 以推薦關係查詢：`treeType = sponsor`。
- 以安置關係查詢：`treeType = placement`。
- 可指定根節點 `memberId`。
- 可指定深度 `depth`，預設 3，最高 10。
- 每個節點至少顯示姓名、LINE ID、角色、獨立狀態、左位/右位完成狀態、直接推薦數、有效租戶數。

## 後續串金流要求

金流回調只做三件事：

1. 驗證 paymentNo / tradeNo 不重複。
2. 將訂單改成 paid。
3. 呼叫同一套 `left_right_independent_split` 規則產生 pending 獎金流水。

前台人工確認收款與未來第三方金流，都必須走同一個訂單付款入口，避免兩套邏輯算出不同結果。
