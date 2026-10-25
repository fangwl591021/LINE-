# 找會員實際 LINE 頭貼最小修復

- 日期：2026-10-25；起始 commit：27060d920250cd285e5383a477fed2862afb48e5。
- 使用者指定：最小更動、直接修復「找會員」，顯示實際 LINE 頭貼，沒有頭貼或載入失敗才顯示姓名字首，其餘功能不要動。
- 部署目標：既有 line-engine Worker 與 fangwl591021/LINE- GitHub Pages。
- 預計檔案：worker/member-chat.mjs、獨立頭貼 helper、js/modules/member-chat.js、css/member-chat.css、exchange-zone.js/index.html 載入版本、相關頭貼/私訊測試、本工作單與 exchange-top-tabs 契約。

## 允許範圍

- 僅在已通過既有權限過濾的當頁會員上新增 avatarUrl；伺服器內部 UID 不回傳。
- 使用驗證後 LINE profile、獨立 MEMBER_CHAT_LINE_AVATAR_ KV 快取及既有 OA 使用者頭貼唯讀備援，必要時有界查詢 Bot profile。
- 驗證後的無頭貼狀態須保存，不能以舊 OA 圖覆蓋；頭貼服務失敗不得使搜尋或會員名單失敗。
- 前端僅找會員使用圖片；圖片載入前、無網址、非法網址或載入失敗均保留姓名字首。

## 禁止範圍

- 不修改 users、card_contacts、身分連結、點數、名片歸屬、資料庫 schema、正式 bindings/secrets、OA 私訊紀錄。
- 不修改搜尋、業種、排序、配對、聊天、通知、封鎖、接受新聯絡、公開動態或本人頁面。
- 不使用自訂 PROFILE_AVATAR 或名片封面冒充 LINE 頭貼。

## 合約與驗證

- 已讀 feature-change-protocol、core-invariants、card-resolvers、card-ownership-and-versioning、regression-matrix、exchange-top-tabs。
- guard:before：PASS（功能修改前）。
- guard:after：PASS；私訊後端/UI/頭貼測試 77/77 PASS；Chrome 合成測試 9 情境 PASS；Wrangler 4.152.0 dry-run 與 git diff --check PASS；獨立審查無阻擋問題。
- 正式部署前 Worker 程式與起始 commit 打包結果 SHA-256 完全一致；OA 使用者 410 筆中 351 筆有 HTTPS 圖，抽查 3 圖 GET 均為 200 image/jpeg。
- 正式驗證只讀聚合與未登入 API；不建立正式聊天、不傳訊、不操作點數。
- 上線前後保留原 Worker bindings、vars/secrets、triggers；部署使用 --keep-vars。
