# 店家商品服務知識庫上傳文件

這份文件用於測試分支的 LINE OA 店家搜尋功能。目的不是取代個人 AI 助理核心，而是建立一份可公開搜尋的店家商品與服務資料，讓 LINE OA 聊天室可以在使用者詢問商品或服務時，安全地推薦符合條件的店家內容。

## 使用對象

- 僅限店長等級以上帳號上傳。
- 每份資料必須綁定店家或店長 LINE UID。
- 上傳後只進入「店家商品服務搜尋池」，不應寫入個人 CRM、私人名片池或跨店 AI 配對池。

## 檔案格式

請使用 `store-ai-knowledge-upload-template.json`。

必要區塊：

- `store`：店家基本資料、聯絡方式、服務地區、是否公開搜尋。
- `scopePolicy`：允許與禁止回答的問題範圍。
- `products`：可被搜尋的商品。
- `services`：可被搜尋的服務。
- `faqs`：商品或服務常見問題。
- `responseRules`：AI 回答語氣、必提資訊與禁止宣稱。

## 回答範圍

AI 只能回答下列內容：

- 商品介紹
- 服務介紹
- 價格與方案
- 預約方式
- 營業時間
- 服務地區
- 店家聯絡方式
- 商品或服務常見問題

超出範圍時，必須回覆：

```text
這個問題超出本店商品與服務範圍，我只能協助介紹店家的商品、服務、預約與聯絡資訊。
```

## 驗證規則

上傳前必須檢查：

- `schemaVersion` 必須是 `store_ai_knowledge_base_v1`。
- `store.storeName` 不可空白。
- `store.ownerLineUid` 不可空白。
- `store.searchVisibility` 必須是布林值。
- `products` 與 `services` 至少要有一筆資料。
- 每個商品或服務必須有 `name`、`summary`、`description`。
- URL 必須是 `https://`、`http://`、`tel:` 或 LINE 官方連結。
- 不可包含客戶個資、私人 CRM 備註、未授權折扣或非店家商品服務內容。

## LINE OA 查詢流程

1. 店長上傳 `store_ai_knowledge_base_v1` JSON。
2. 系統驗證店長權限與 JSON 格式。
3. 通過後寫入店家商品服務搜尋池。
4. LINE OA 使用者詢問商品或服務。
5. 系統先判斷是否屬於商品或服務問題。
6. 屬於範圍內才搜尋店家知識庫並回答。
7. 超出範圍不搜尋、不生成延伸回答。

## 範例查詢

可回答：

- 你們有做 LINE OA 設定嗎？
- 台北有沒有可以預約的美容服務？
- 這個商品多少錢？
- 店家在哪裡？

不回答：

- 幫我分析股票。
- 幫我查某個客戶的私人資料。
- 這個病要怎麼治療？
- 幫我寫政治文案。

## 後續接線

此文件只定義上傳資料格式。正式接 LINE OA 前，還需要新增：

- 店長權限檢查。
- JSON 上傳 API。
- 店家知識庫儲存表。
- 商品服務搜尋 API。
- LINE OA 關鍵字或自然語句搜尋入口。
- 超出範圍防護。

## 測試分支 API

測試分支已新增三個 Worker action。這些 action 走既有 `POST /` dispatch 格式。

### 儲存店家知識庫

`saveStoreKnowledgeBase` 限店長或總管。

```json
{
  "action": "saveStoreKnowledgeBase",
  "payload": {
    "lineAccessToken": "LIFF_ACCESS_TOKEN",
    "knowledge": {
      "schemaVersion": "store_ai_knowledge_base_v1"
    }
  }
}
```

實際上傳時，`knowledge` 請填完整的 `store-ai-knowledge-upload-template.json` 內容。

### 讀取自己的店家知識庫

`getStoreKnowledgeBase` 限店長或總管。

```json
{
  "action": "getStoreKnowledgeBase",
  "payload": {
    "lineAccessToken": "LIFF_ACCESS_TOKEN"
  }
}
```

### 搜尋商品服務

`searchStoreKnowledgeBase` 是 LINE OA 搜尋入口的基礎查詢。它只搜尋已公開的店家商品服務資料。

```json
{
  "action": "searchStoreKnowledgeBase",
  "payload": {
    "query": "LINE OA 設定",
    "limit": 5
  }
}
```

若問題超出商品服務範圍，會回傳：

```json
{
  "outOfScope": true,
  "message": "這個問題超出本店商品與服務範圍，我只能協助介紹店家的商品、服務、預約與聯絡資訊。"
}
```
