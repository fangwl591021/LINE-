# 找會員：業種搜尋

- 起始版本：9d60b9e；分支 codex/member-chat-industry。
- 使用者要求在會員私訊的文字搜尋下方增加業種搜尋，沿用修正後直接部署指示。
- 僅調整找會員查詢、篩選 UI、對應 cache version 及測試；不變更登入、會員資格、名片所有權、私訊／通知、點數或其他搜尋。
- 已讀 feature-change-protocol、core-invariants、card-ownership-and-versioning、regression-matrix、change-work-order-template 及 member-chat-notifications 工作單。
- guard before：PASS。guard after：PASS（完整 smoke contracts）。
- 預計檔案：worker/member-chat.mjs、worker/member-chat-industry.mjs、js/modules/member-chat.js、css/member-chat.css、exchange-zone.js、index.html 與既有 chat 測試。

## 搜尋契約

1. 文字搜尋下方提供「業種搜尋」下拉選單，預設「全部業種」；可單獨使用或與姓名、英文名、公司、職稱一起篩選。
2. 沿用名片現有 15 業種及待分類，不新增會員／名片／分類表、不更新正式資料。
3. 優先使用 custom_config.industryClassification 的主次業種；缺少有效主業種時，先用 tags 的既有業種標籤，再用收藏名片既有服務／標籤／公司／職稱關鍵字規則補充。規則是搜尋時的暫時判斷，不宣稱人工認證、不觸發 AI 或改寫分類。
4. 後端 SQL 在 LIMIT 31 前完成交集篩選；未知／重複業種参数拒絕。切換篩選清空分頁與舊結果，過期回應不可覆蓋新結果。
5. 保留有效本人名片、目前登入帳號、本人排除、停止新聯絡及雙向封鎖條件；回傳仍只有姓名／公司／職稱摘要與固定分類選項，不增加私人資料欄位。
6. 不影響我的聊天、原私訊、離頁通知或公開名片池。無 migration、無正式資料寫入、無實際私訊或 LINE 通知測試。

## 驗證與部署

- SQLite：主次業種、舊標籤與既有規則、錯誤 JSON、文字交集、分頁、封鎖／停止聯絡、唯讀、安全參數。
- 瀏覽器：手機與桌面下拉篩選、清除條件、舊回應與分頁隔離，以及原聊天流程。
- 執行 guard before/after、node syntax、git diff --check、Wrangler dry-run --keep-vars；依 Workers／Wrangler 技能維持參數化查詢及原 bindings/vars/secrets。
- 驗證通過後提交 PR，先部署 Worker，再合併及確認 Pages 實際資產；回退只還原本次程式，不動資料庫。

## 已完成驗證

- 37 項後端／前端相關測試通過，包含業種參數防注入、主次業種／舊標籤優先、舊名片關鍵字規則一致、破損 JSON、交集與 33 筆結果跨頁、封鎖／停止聯絡及不更動名片資料。
- 本機 Chrome 390px 手機與 1440px 桌面合成資料操作通過：選單位於搜尋下方、主／次業種、英文名交集、切換時忽略過期回應、全部業種還原、原聊天與通知流程。未以正式會員傳訊或實發 LINE 通知。
- 語法檢查、git diff --check、Wrangler deploy --dry-run --keep-vars 通過。Wrangler 日誌改存 TEMP，未變更正式 config。
- 正式資料庫只讀聚合確認：75 張有效本人名片中僅 3 張有結構化主業種、7 張有標籤，因此需保留既有名片夾的唯讀關鍵字補充分類。缺少可辨識資料歸「其他行業」；不保證推定分類皆準確。
- 無 migration、不改登入／會員資料／所有權／點數／通知設定或正式資料。
