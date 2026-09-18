# 消費日誌（第一階段）

- 本人商城入口，與原「點數紀錄」並存。以交易為單位，不直接重命名點數流水。
- 讀取既有成功店內消費與本人網購訂單。純贈點、簽到、邀請獎勵不作消費；未知／失敗收銀不顯示成功。
- 同一來源交易只一筆；網購狀態更新沿用訂單 ID，不加出重複消費。
- 僅信任驗證 LINE token 的本人身分；不接受 client UID、角色或點數 ID 擴權，不新增管理員跨店權限。
- 清單／明細對個資欄位採白名單；不傳出母站回應、token、銀行或收件個資。
- 店內折抵紀錄僅證明點數操作，顯示應付、不宣稱已收現金。網購付款狀態以既有訂單為準。
- 日期查詢以 Asia/Taipei 日界線，API 回傳 UTC ISO；UI 統一顯示台灣時間。
- 穩定、受限分頁；來源唯一鍵去重。第一階段不計消費總額，避免待付款或取消訂單誤算。
- 已讀資料與交易表分離；歷史資料不全部變未讀；點開明細成功才送出已讀，失敗提示不假裝已存。
- 全部已讀以伺服器簽發的列表快照為範圍，快照後新增或更新的通知不被吃掉。
- 獨立 migration，不於請求內建表；缺 schema 回明確不可用錯誤。
- 模組按需載入，不增加登入流程或收銀送出的等待；不改原收件匣的已讀或通知數。
- 關閉、離頁、登出、換帳號／token：中止請求與清除畫面，不持久化交易或token於瀏覽器。
- 第一階段不新增 LINE 推播、發票串接、外部消費、退款或金流能力。
- 消費日誌只查本人，即使管理員也不擴權；商家原有業績／訂單管理保持原入口。未讀數僅為當次篩選範圍，不取代原收件夾徽章。
- 快照15分鐘有效，逾時／訂單版本已變更請重新整理。每次建立快照，限清除本人100筆已過期快照；不刪已讀、會員基準或交易資料。
- 首次開啟建立本人歷史基準；之後的新交易／網購狀態更新才標未讀。網購仍以原訂單建立時間排序，不因出貨更新再計一筆消費。
- 店內店名取目前店家資料並於詳情說明；舊交易不從目前商品价格重算。缺漏的商品／運費數值維持 null，不捏造零元。

## API

共同前綴 `/v1/store-consumption-journal`，需 LINE Bearer token，不接受 client UID 擴權。

- GET：`type=all|store|online`、`start/end=YYYY-MM-DD`；`cursor+snapshot` 讀下一頁。
- GET `/detail?id=...&snapshot=...`：只讀明細，不直接標已讀。
- POST `/read`：`{id,snapshot}`；只寫觀看者的已讀版本。
- POST `/read-all`：`{snapshot}`；只標已讀該快照範圍，後來新增或更新的紀錄保留未讀。
- 列表回 `items,nextCursor,snapshot,unreadCount,timeZone`；項目使用 `earnedPoints` 表示消費贈點，金額為整數分。詳情只傳欄位白名單，不含銀行或收件人個資。

## 驗證

`node --test test/store-consumption-journal.test.mjs test/store-consumption-journal-ui.test.mjs`。
`node test/browser/store-consumption-journal-preview.mjs` 僅啟動127.0.0.1:8775合成資料，不呼叫正式API。瀏覽器mock只供畫面驗收，後端SQL／權限另以真SQLite測試。

API型別已核對 @cloudflare/workers-types 5.20260918.1；依 [Cloudflare D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/) 綁定參數，依 [D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/) 原子建立讀取基準；不是金融帳本的第二套寫入。

## 發版前

另行授權後才執行：核對0039 migration、Worker bundle、前端版本；先 migration，後 Worker，再前端。不得僅發前端造成入口呼叫尚未存在的 API。
