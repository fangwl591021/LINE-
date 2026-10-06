# AI 推進教學與 VEO 流程移植

使用者核准雙入口預覽並要求開始製作；2026-10-06 核准沿用點數通既有金鑰。
基線：72265545d242cf34141348e6f876178e1305b99e。Worker 基線：90a39558-56f9-4b9c-a2b2-f903ef9c910f。

僅允許：首页新手教學／AI 推進雙入口、獨立 AI 任務與回報、個人有效收藏名片唯讀、明確同意的 AI 請求、預設關閉的獨立 LINE 到期提醒、新教學媒體。
VEO 僅讀取 src/task-engine.js 與 migration 作語意參考；不修改或部署 VEO。
禁止：改寫金鑰、會員／名片／歸屬資料、點數、既有行事曆、商城、私訊設定、原四部教學媒體。

安全設計：LINE profile 驗證與既有明確身分連結解析；所有 SQL 依會員範圍；建立／回報冪等；修訂版本衝突保護。
AI 用既有 OPENAI_API_KEY，沿用 OPENAI_TEXT_MODEL / OPENAI_MODEL，未設定時用原文字處理預設 gpt-4o-mini（workerbackup.js 的既有文字處理路徑）；store=false，每日最多十次；只送任務回報及選取名片姓名、公司、職稱。
模型 structured outputs 與文字功能確認：https://developers.openai.com/api/docs/models/gpt-4o-mini 。不更動既有 OCR 模型設定。
AI 產生建議後由人確認才建立下一步。LINE 提醒獨立 opt-in、持久重試與固定 retry key，不包含聯絡或任務詳細內容。

回復：AI_ADVANCE_DISABLED=1 可立即停用新 API 與提醒；首頁及獨立 CSS/JS 可還原至基線。
完整 Worker 回復至上述 version；新增資料表保留，不刪除新建立資料，不 rollback 會員或點數。

修改前 guard:before 已通過，輸出 .wrangler/ai-advance-before.log。
發佈前必跑：guard:after、AI 權限/冪等/回報/AI 失敗及確認/提醒重試測試、手機 320/390/768px UI、Worker dry-run 與本機 HTTP。
正式環境只執行新 migration；不得將未部署的其他工作樹內容打包。
本機驗收：12 個 AI/入口單元測試通過；完整 guard:after 通過；Worker dry-run 通過。
真實 Workers/D1 本機 runtime：跨帳號拒絕、並行建立與回報冪等、D1 batch/session、AI 確認與 LINE opt-in 去重通過。
瀏覽器：320/390/768/1200px 等寬入口、無橫向溢出、建立/回報/確認下一步、返回/關閉/未儲存確認通過。
影片：4:18，720x1280，中文 SAPI 旁白、Whisper medium per-block 定時、103 段燒錄繁體字幕；463/463 字詞覆蓋，對齊相似度 0.98315；完整解碼與影音長度一致。
成片 SHA256：8442c29b34e1841e016cc9fee5c69e12dbed002a602e1310f907305833aaa262。
媒體新物件：tutorials/2026-10-06/ai-advance-tutorial-v1.mp4。原四部影片不變。
本機預覽：http://127.0.0.1:8828/ ，正式會員/名片/AI 提供者均用隔離虛構資料，不拿正式資料錄影。
正式網站、Worker、D1 migration 尚未變更；已詢問使用者是否正式上線，等待選擇。沒有新建或改寫金鑰，真實 AI 提供者與手機提醒仍待正式驗收，不將 mock 結果當 live 成功。
remote migrations list 另顯示 0042/0043 未標記，與本次無關，禁止順便套用。

2026-10-06 入口位置修正：使用者指定右側只放功能入口；標題改「AI推進」，直接進任務清單。教學影片移入原新手教學，現在共五個課程；原四部課程不變。任務清單返回會關閉並還原焦點，不再返回獨立教學頁。保留舊 openAiAdvanceGuide 呼叫相容，轉入新手教學的 AI 推進課程。影片不重新剪輯，課程說明明確告知開頭舊入口已調整；本次只移動入口與課程，不修改後端、金鑰、資料庫或正式環境。
修正驗收：16 個 AI／教學單元測試及完整 guard:after 通過；320/390/768/1200px 瀏覽器驗證直接功能入口、五個課程、影片章節跳轉、退出釋放影片、返回首頁焦點與任務操作均通過。本機教學原本缺 Material Symbols 字型，已補正式首頁同來源字型；不是正式網站樣式更改。AI 資料傳送說明保留在實際 AI 按鈕旁，避免不看教學的使用者漏看。

部署授權：使用者 2026-10-06 明確要求「部署」。重新確認 origin/main 仍為 72265545；line-engine 現用版本仍為 90a39558，後端檔案與已部署 c690260 來源一致。本次只執行 0054，驗證後單獨登記 d1_migrations；不套用 0042/0043。Wrangler 4.119.0 使用 deploy --keep-vars，保留原 compatibility_date、bindings、crons 與 secrets。完整回復以原 Worker 版本與 Pages 基線為準；新資料表與使用者建立的新任務保留，不還原整個 D1。真實 AI 回應與 LINE 手機跳通知不以虛構測試冒充成功，正式登入驗收仍須使用者實際操作。
