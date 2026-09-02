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

## 版本規則

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
