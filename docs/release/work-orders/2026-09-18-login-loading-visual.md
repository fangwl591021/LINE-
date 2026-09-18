# 初始登入 Loading 視覺調整

## 1. 變更摘要
- 日期：2026-09-18；起始／回復 commit：37c85c6。
- 使用者要求：初始登入顯示明確 Loading，取代目前空白骨架；測試完成直接提交、部署。
- 修改範圍：index.html 的同步 Loading 樣式／標記、登入測試、本機唯讀視覺預覽及本工作單。
- 發布目標：GitHub Pages；不部署 Worker。

## 2. 本次只允許改什麼
- 以既有透明 Logo、品牌文字、CSS 轉圈及狀態文字取代骨架占位。
- 動畫不依賴外部字型、JavaScript 或圖片載入完成；不加入最低展示時間。
- 保留 loading-screen、loading-text、login-slow-hint，以及狀態播報、八秒提示與重新連線。
- 支援窄螢幕、短螢幕及 prefers-reduced-motion。

## 3. 本次禁止碰什麼
- 不改 auth.js、config.js、login-bootstrap.js、登入時序、LIFF 路由／scope、會員權限、資料背景排程。
- 不改 Worker、資料庫、點數、分享贈點、名片匹配或其他商城功能。
- 不清除正式登入狀態，不以正式交易驗證。

## 4. 必讀規格
- docs/release/feature-change-protocol.md
- docs/rules/core-invariants.md
- docs/contracts/liff-routes.md
- test/login-bootstrap.test.mjs

## 5. 驗證
- guard:before：PASS；起始工作目錄乾淨。
- guard:after：PASS；登入專項 27/27 PASS；git diff --check PASS。
- 本機抽出正式 Loading 樣式／標記與實際 config 失敗函式：390×844 初始畫面、CSS spinner 0.85s infinite、八秒慢速提示均通過。
- 320×480 錯誤畫面：無橫向溢出，重試按鈕完整可見且可重回 Loading，spinner 停止、預告文字隱藏。
- `.hidden` 實際 computed display 為 none；reduced-motion 靜態契約通過。
- 獨立覆核：必要 ID、狀態播報、八秒提示保留；auth/config/bootstrap 無變更、未新增等待或資料呼叫。
- 上線後核對 CI、Pages commit、正式 index 與一般登入可正常離開 Loading。

## 6. 上線判斷
- 所有測試與範圍覆核通過後提交、部署；不因動畫延遲登入。
