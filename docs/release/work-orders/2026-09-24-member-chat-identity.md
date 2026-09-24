# 私訊誤判未註冊：已確認的新舊 LINE 帳號

## 變更摘要與邊界

- 起始 commit：9dd1dc3；只修正會員私訊登入／會員搜尋／開啟對話。
- 回報：開啟「找會員」即提示未註冊；另提供搜尋姓名「王子齊」。目前登入帳號尚待確認。
- 正式 D1 唯讀查核：7 個重疊別名皆有 active 身分連結；6 組連結同時保留新舊 users，新會員列皆保留舊 UID 別名。指定姓名對應一組已連結新舊會員，新會員有有效本人名片。
- 舊私訊 resolver 將 users 命中 0 筆與多筆一律回 MEMBER_REQUIRED，是已註冊帳號被誤擋的可重現缺陷；未將此查核冒充實際登入者的端到端驗證。
- 預計修改：worker/member-chat.mjs、test/member-chat.test.mjs、本工作單。
- 禁止：正式 users／身分連結／名片／點數寫入、其他 resolver、推播、私訊代發、migration、bindings 或 secrets。
- 是否部署：2026-09-24 使用者明確授權「以後修正好就直接部署」，本次測試通過後提交及部署；回復點 9dd1dc3，Worker b033467f-89f1-418f-b5bb-335182ea74a8。

## 本次私訊身分合約（功能修改前）

1. LINE token 仍由伺服器向 LINE profile 驗證；不接受前端 UID、姓名或電話作為登入證明。
2. 只在唯一 active old_line_id → new_line_id 連結可解釋所有命中會員、且新 UID 唯一命中一筆會員時，允許同時保留新舊列，私訊主鍵沿用新會員 row_id。沒有新列時維持既有單列結果。
3. 無會員才回 MEMBER_REQUIRED；未被該連結解釋的第三個會員、無 active 連結的別名碰撞、多組連結或異常連結皆回 IDENTITY_CONFLICT，不任取第一筆放行。
4. 私訊目錄與對話對象排除已有 active 新帳號的舊會員列；現有別名查詢使舊 UID 本人名片仍可對應新會員。封鎖、接受新聯絡、排除自己皆使用同一會員主鍵。
5. 不更新／合併會員或聊天歷史。保留本人名片資格、第三人隔離、後端驗證、私訊免費；不改其他功能的身分解析。

## 必讀與驗證

- 已讀 core-invariants、card-ownership-and-versioning、regression-matrix、feature-change-protocol、既有私訊合約；以上為本次限定補充。
- guard:before：PASS。
- 回歸測試先確認舊程式會將合法雙列回成 MEMBER_REQUIRED，再套用最小修正。
- 20 項後端／UI 測試通過，包含合成新舊雙列的 `/me`、搜尋只出現一次、共用對話／重送冪等、封鎖／停止聯絡、不可信碰撞拒絕、第三人隔離、真正未註冊仍拒絕；member/card/link 快照保持不變。
- guard:after、node --check、git diff --check 與 Wrangler deploy --dry-run --keep-vars：PASS。首次 dry-run 打包成功但沙箱不允許寫 Wrangler 日誌，提升權限重跑確認無此警告；未執行正式部署。
- 正式查詢皆為 SELECT，rows_written=0；未使用真實 LINE access token、未替會員建立對話或傳訊。仍待使用者確認目前登入帳號，正式 LINE 實機複測尚未完成。
- Cloudflare / Workers 指引：維持 D1 綁定與參數化查詢、有限查詢上限、失敗時拒絕存取；不輸出 token、UID 或私訊內容。
