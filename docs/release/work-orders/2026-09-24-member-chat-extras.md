# 交流內容與會員私訊補強

- 起點：b040b7cccb0a439925b07a2daad504ee348f1608；分支 codex/member-chat-extras。
- 使用者授權：取消刊登天數及自動下架；私訊附加本人優惠券；顯示既有配對百分比；對方名片 POP；完成後直接部署。
- 僅限交流／私訊。保留刊登 10 點、既有扣點冪等與退款、優惠券有效期限與每人一次核銷。
- 不改登入／歸屬 resolver、點數帳本、AI 計分、名片編輯、LINE 通知或其他商城／遊戲功能。
- 必讀：core-invariants、card-ownership-and-versioning、card-resolvers、points-ledger、liff-routes、regression-matrix、feature-change-protocol。
- guard before：PASS（2026-09-24）。

## 設計

- 刊登後不按 expires_at 隱藏；既有 published 內容同樣取消期限。deleted/draft 仍不公開。保留欄位相容舊資料，新刊登 expires_at 留空。
- 聊天訊息僅新增 coupon_handle 欄位（0048）。附件從現有交流優惠券選取，不接受上傳檔案或任意網址。伺服器於同一 INSERT 再驗證發送者歸屬、已刊登及券有效性；clientId 冪等包含附件。
- 查看／核銷附件必須是對話當事人、同對話訊息且未封鎖；沿用優惠券模組及唯一核銷紀錄，傳送免费、不自動核銷。
- 配對僅取目前登入者已授權收藏、可明確對應對方本人帳號的既有 own 分數，沿用歷史分數 helper，不呼叫 AI、不用姓名猜測。不足資料標示尚無配對，合法 0 分保留。
- 對方名片以 POP 唯讀展示現有安全投影；後端再次驗證對話、本人歸屬、公開且審核通過。未公開名片不外洩。開啟不改 currentCard、歸屬或發送設定。

## 驗證與上線

- 相關 Node/SQLite 測試、前端測試、手機／桌面合成帳號瀏覽器測試、guard after、Wrangler dry-run。
- 不向正式會員傳訊、不核銷正式券、不異動正式點數。
- 發布：單一 additive migration、Worker --keep-vars、GitHub Pages；確認正式資產 hash 與未授權 API。
- 回復：基準 commit；附加欄位保留，不刪正式訊息。

## 完成驗證

- 修改：worker/member-chat.mjs 與新增 member-chat-extras.mjs；exchange-zone.mjs、exchange-zone-likes.mjs、exchange-zone-coupon.mjs；私訊 JS/CSS 與新 POP 模組；交流核心／入口及 index 快取版本；0048 migration；相關測試與契約。
- 46 項私訊 Node/SQLite/UI 測試通過。測試包括他人附件拒絕、權限／分頁、過期與下架券、重送、核銷唯一限制、核銷前撤券競態、0 分與既有分數、未公開名片拒絕、原通知流程。
- 原交流區刊登／扣點／補償／冪等契約與測試通過。僅更新本次明確授權的刊登期限期待值。
- guard before / after 全部通過；git diff --check 通過；Wrangler dry-run 通過。
- Chrome 合成帳號手機 390×844 與桌面 1440×900 測試通過：既有 82% 顯示、選券不自動送出、聊天附件、POP、明確確認核銷、關閉與切換帳號清除彈窗。不是正式手機 LINE 實機測試。
- 正式資料庫只新增 member_chat_messages.coupon_handle；採隔離 migration 目錄，只套用 0048，保留既有待執行的 0042／0043 不動。
- 限制：只展示目前會員自己收藏、可由帳號確認對方的既有分數；未收藏或無法確認同一人顯示尚無配對。未公開／未審核名片不透過 POP 揭露。優惠券期限仍有效，傳送不等於核銷。

## 交叉檢查補丁

- 主版本已以 PR 141 合併 747170a，Worker a2fe61e0-f27a-4faa-83a8-696c92786741；正式六個前端檔案 SHA-256 一致、0048 完成且 0042／0043 未執行。
- 最後檢查找到 workerbackup.js 的交流貼文站內信入口尚有 post expiry 條件。這屬取消刊登期限的同一授權範圍，只移除該查詢的 expires_at 限制；不改收件者身分、自寄拒絕、發送權限、點數與站內信本身期限。
- 補丁以 747170a 為起點，codex/exchange-contact-no-expiry；guard before PASS。調整對應契約並加 SQLite 測試驗證舊貼文可聯絡、隱藏／封存不可聯絡；完成後補部署 Worker。
- 補丁 guard after、47 項私訊相關測試、diff check、Wrangler dry-run 均 PASS；無新增 migration 或前端變更。
