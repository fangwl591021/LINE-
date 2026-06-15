# 名片歸屬與版本資料規格

本文件定義名片資料應如何歸屬、查詢與分版本儲存。實際欄位名稱可依目前資料庫調整，但語意不可改變。

## 1. 名片類型

系統中至少應區分兩種名片：

| 類型 | 說明 | 主要歸屬 |
| --- | --- | --- |
| 本人名片 | 使用者自己的個人專屬名片 | `ownerUid` |
| 通訊錄名片 | AI名片夾掃描、OCR 或上傳建立的他人名片 | `scannedBy` / `collectorUid` |

本人名片與通訊錄名片不可只靠姓名或電話區分。

## 2. 建議核心欄位

每張名片建議具備：

| 欄位 | 意義 |
| --- | --- |
| `cardId` | 名片唯一 ID |
| `cardType` | `personal` 或 `contact` |
| `ownerUid` | 本人名片擁有者 UID |
| `boundUid` | 被認領或綁定的 LINE UID |
| `scannedBy` | 掃描者 UID |
| `createdBy` | 建立者 UID |
| `inviterUid` | 推薦人 UID |
| `networkId` | 歸屬網，例如 admin 或子站 |
| `source` | `line_generated`、`self_upload`、`ocr_scan`、`claimed`、`legacy_import` |
| `visibility` | `private`、`public` |
| `aiHealthStatus` | `pending`、`passed`、`failed` |
| `createdAt` | 建立時間 |
| `updatedAt` | 更新時間 |

## 3. UID 歸屬規則

本人名片：

- 必須有 `ownerUid`。
- 同一 `ownerUid` 只能有一張有效本人名片。
- 若來源是認領，`ownerUid` 與 `boundUid` 應一致。

通訊錄名片：

- 必須有 `scannedBy` 或 `createdBy`。
- 可有 `boundUid`，但不一定有。
- 即使日後被認領，原始 `scannedBy` 不可清空。

沒有推薦人：

- `inviterUid` 可為空。
- 歸屬可 fallback 到 `admin`。
- 必須另有狀態可標記「無推薦人」，避免與真正 admin 建立混淆。

## 4. 版本資料

本人名片可包含四種版本：

| version | 名稱 | 說明 |
| --- | --- | --- |
| `standard` | 標準版 | 一般 Flex / 網頁名片 |
| `giga` | 滿版 / 海報版 | 大圖海報式版型 |
| `square` | 正方版 | 1:1 版型 |
| `video` | 影音版 | video hero + 縮圖 |

建議每種版本有獨立設定：

| 欄位 | 說明 |
| --- | --- |
| `coverUrl` | 封面圖 |
| `coverCrop` | 裁切資料 |
| `layout` | 版型 |
| `title` | 標題 |
| `description` | 說明 |
| `buttons` | 底部按鈕 |
| `textColor` | 文字顏色 |
| `buttonStyle` | 按鈕樣式 |
| `videoUrl` | 影音版影片網址 |
| `thumbnailUrl` | 影音版縮圖 |

禁止：

- 用 `video.thumbnailUrl` 覆蓋 `standard.coverUrl`。
- 用 `giga.coverUrl` 覆蓋 `square.coverUrl`。
- 用最後一次編輯的版本當成所有版本。

## 5. 名片版本 resolver

任何顯示或編輯名片前，都應先經過 resolver：

輸入：

- `currentUid`
- `cardId`
- `requestedVersion`
- `entrySource`
- `mode`

輸出：

- `resolvedCardId`
- `cardType`
- `ownerUid`
- `version`
- `canEdit`
- `canShare`
- `data`

resolver 必須檢查：

- 目前使用者是否有權讀取。
- 目前使用者是否有權編輯。
- requestedVersion 是否存在。
- 不存在時是否允許建立新版本。
- 是否誤取到通訊錄名片或他人名片。

## 6. 查詢規則

我的名片：

```text
cardType = personal
ownerUid = currentUid
```

AI名片夾收錄名單：

```text
cardType = contact
scannedBy = currentUid
```

公開交流池：

```text
cardType = personal
visibility = public
aiHealthStatus = passed
```

後台全站名片庫：

```text
可查 personal + contact
但必須清楚標示 ownerUid / scannedBy / boundUid
```

## 7. 去重與合併

合併名片時不可只看單一欄位。

可疑重複條件：

- 同電話
- 同 Email
- 同姓名 + 公司
- 同 boundUid
- 同 OCR 圖片 hash

合併時必須保留：

- 原始 cardId 或合併紀錄
- 原始掃描者
- 原始建立時間
- 原始來源
- 誰執行合併
- 合併時間

## 8. 稽核需求

後台應能回答：

- 這張名片是誰掃進來的？
- 這張名片現在綁定誰？
- 這張名片是否是本人名片？
- 這張名片是否進公開池？
- 這張名片有哪些版本？
- 哪個版本最後被誰修改？
- 為何某使用者的收錄名單數量變少？

若回答不了，代表資料設計或紀錄不足。
