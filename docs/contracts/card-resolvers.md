# 名片 Resolver 契約

本文件定義名片查詢與版本選擇規則。所有入口都必須透過 resolver，不得各自寫查詢邏輯。

## Resolver 類型

### `resolvePersonalCard(currentUid, options)`

用途：查目前使用者自己的個人名片。

必要輸入：

- `currentUid`
- `version`，可選：`standard`、`giga`、`square`、`video`
- `mode`，可選：`view`、`edit`、`send`

查詢規則：

- `ownerUid = currentUid`
- `sourceType = self_profile` 或 `sourceType = video_profile`
- 不查 `private_import`
- 不查公開池
- 不查 scannerUid

輸出必須包含：

- `cardId`
- `ownerUid`
- `sourceType`
- `version`
- `canEdit`
- `canSend`
- `displayName`

找不到資料時：

- 回傳 `not_found`。
- 不得 fallback 到 admin 或其他 UID。

### `resolveCollectedCard(currentUid, cardId)`

用途：查目前使用者掃描或上傳進 AI 名片夾的收錄名片。

查詢規則：

- `scannerUid = currentUid` 或 `collectorUid = currentUid`
- `sourceType = private_import`；若原收藏名片已被對方認領，允許保留其
  `sourceType = self_profile` 的同一筆資料，但必須同時滿足
  `scannerUid = currentUid` 且 `recognizedPersonUid != currentUid`
- 可指定 `cardId`

輸出必須包含：

- `cardId`
- `scannerUid`
- `collectorUid`
- `recognizedPersonUid`，若有認領才存在
- `sourceEventId`
- `canEdit`
- `canSend`

認領後權限：

- 收藏者仍可在「我的收錄名單」查看同一筆名片。
- `recognizedPersonUid` 只能編輯自己的認領名片。
- 收藏者的 `canEdit = false`，不得更新、刪除或解除綁定；此規則必須由前端與伺服器共同執行，管理者身分不可繞過。

禁止：

- 不得把 `recognizedPersonUid` 當成目前操作人。
- 不得把收錄名片顯示在「我的名片」。

### `resolvePublicPoolCard(options)`

用途：查公開交流池可被配對或搜尋的名片。

查詢規則：

- `sourceType = self_profile`
- `visibility = public`
- `aiReviewStatus = passed`
- 必須是本人完成編修的名片。

禁止：

- 掃描來的 `private_import` 不得進公開池。
- 未通過 AI 體檢不得進公開池。

## 收藏列表配對結果（2026-09-21：既有分數優先，受保護流程）

- `getCardHarvestContacts` 先沿用原收藏權限查詢，再附查看者專屬 `aiMatch`；通用 `cardRow()`、公開名片 API 不得附加該私密結果。
- 分數僅限已驗證 token 的 actor、`own` 範圍、已授權收藏的同一名片。優先目前 exact intent/version，否則沿用此會員此名片的有效歷史分數與理由；沒有需求、需求或名片版本變更都不得遮掉歷史結果。UID-only fallback 不得取得配對理由。
- 本人需求只來自真正擁有的 `self_profile`；自己曾建立但已被他人認領的名片不能當成本人。
- 讀取為批次 SELECT；不得發起 AI、改點數／配額、排程或重算。快取缺表或失敗不得令原收藏名單消失。
- `aiMatch` 包含 status、score、reason、source、updatedAt、intentKey、basis。只有沒有有效結果才為 null；合法 0 分保留。AI 與規則結果必須分別標示。basis=previous 為既有需求評估，profile 為名片綜合配對，均非成交機率。
- 列表提供「最新收藏／配對排名」，已有有效結果按分數降冪、同分依原最新順序、缺結果置後；切換保留搜尋與分類並重置分頁。
- 歷史結果不得假稱目前需求或新 AI 綜合分析。不可取用其他會員或 public pool 的分數。
- `refreshCardHarvestMatches` 是獨立、token 驗證的補算 action；只處理沒有任何有效歷史分數的名片，每批最多五張。伺服器自行查會員、收藏名片與本人資料，不接受前端傳分數或 key。
- 沿用既有 OpenAI 服務與配額，只傳公司、職稱、服務、行業、個性/興趣/事業標籤；不傳姓名、電話、生日、健康、財富。資料庫租約防雙分頁重送，失敗退避，AI 不可阻塞名單呈現。
- 不刪除、不重設、不自動覆寫已有分數；無 migration。此規則由 card-harvest-match、collection-match-history、card-harvest-match-ui 測試鎖定，部署 guard 必須通過，不能為通過測試而刪除保護案例。

## 版本規則

### 會員私訊唯讀延伸（2026-09-24）

- 找會員只批次附加查看者自己已授權收藏的歷史 own 配對分數；須以持久化名片歸屬／有效身分連結確認同一對方，不以姓名電話猜測，不重算、不修改快取。無結果不能假造百分比。
- 聊天內「查看名片」POP 先驗證對話雙方與封鎖狀態，再讀對方公開、審核通過、未封存的 self_profile。僅回傳交流區既有安全公開投影，不開放原始資料列或私人名片，不修改目前編輯／分享名片狀態。

一個 UID 最多有四種個人名片版本：

- `standard`：標準版
- `giga`：滿版或海報版
- `square`：正方版
- `video`：影音版

版本隔離：

- `video` 不得覆蓋 `standard`、`giga`、`square`。
- 靜態版型切換不得改變 `video`。
- 編輯某一版，只能儲存該版。
- 發送版型是偏好設定，不是資料覆蓋。

## 一人一張個人名片

個人名片以 UID 為唯一主體：

- 認領名片、自己上傳、用 LINE 生成，都必須歸到同一個 UID。
- 若 UID 已有個人名片，新的建立入口應改成編輯或合併。
- 不得因為入口不同而新增第二張個人名片。

## 自掃排除

若使用者在 AI 名片夾掃到自己的名片：

- 不建立新的收錄名片。
- 提示改用「我的名片」編輯。
- 若可辨識到同 UID，提供跳轉到個人名片入口。

## Duplicate Merge

判斷重複時至少比對：

- normalized phone
- normalized email
- normalized name
- company
- recognized LINE UID

合併規則：

- 已綁定 UID 的個人名片優先。
- 掃描記錄保留在 import event。
- 不刪除歷史，只更新指向。

## 測試要求

每次改 resolver 前，至少檢查：

- 我的名片不會抓到 AI 名片夾資料。
- AI 名片夾不會顯示個人名片版本。
- 影音版不會覆蓋靜態版。
- 同一 UID 不會出現多張個人名片。
- 修改歸屬後，列表會跟著新歸屬更新。
