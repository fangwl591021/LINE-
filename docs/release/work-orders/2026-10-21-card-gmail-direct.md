# 名片Email單一步驟直開Gmail網頁

- 使用者明確選擇Gmail網頁，不要App、不想再經過寄信方式選擇頁。沿用測試通過直接部署指示。
- 日期2026-10-21；repo fangwl591021/LINE-；checkout .worktrees/veo-crm-tasks-release；branch codex/card-gmail-direct-20261021；起始main65ec962f976cc7e413951469324ac4e64501ec37。
- guard before完整PASS，line-gmail-direct-before.log。
- 僅修改Email Flex目標、上版card-email.html相容入口自動轉Gmail、編輯器提示／快取、相應安全及瀏覽器測試。原mailto儲存內容、四版、revision、電話／網站按鈕、UID、推薦、點數、金鑰／bindings／cron不動，無migration及正式資料寫入。
- 新Flex直接使用固定Gmail HTTPS撰信網址，帶入經驗證／編碼的收件人；不是mailto scheme、不經選擇頁、不呼叫App、不複製、不寄出。Google若未登入可要求登入，不能繞過。
- 舊版已發訊息的HTTPS相容頁保留，改為自動轉Gmail；無效或多重收件人／注入資料仍拒絕，只有固定Gmail可導向，保留手動Gmail及返回作失敗備援。
- 適用規格：button-actions、core-invariants、feature-change-protocol、card-resolvers及既有card-links版本保護；沿用Workers／Wrangler安全發布，不擴充架構。
- guard after完整PASS；針對性29PASS／1選配browser skip；另開Chromium6PASS，驗證320/390/1280三尺寸新Flex直接抵達Gmail、舊入口自動跳轉與無效資料拒絕。Google頁由測試攔截，無帳號存取／寄信，不是真實手機驗收。
- 真實未登入唯讀HTTP：Gmail入口302到accounts.google.com；解碼continue後確認回到mail.google.com、view=cm與原收件人均保留。第一次直接字串檢查因雙層編碼誤判false，改用URLSearchParams核對，沒有更動流程或跳過檢查。
- 待CI與正式發布核對。測試不登入Google、不真的寄信；金鑰／設定全部沿用。
