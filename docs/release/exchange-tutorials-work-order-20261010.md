# 交流專區使用與應用教學工作單

- 日期：2026-10-10；需求：交流專區操作及實際應用教學影片，通過測試後上架。
- 專案：fangwl591021/LINE-；正式 GitHub Pages `/LINE-/`；起點 `b703600450d68213bb07621ae0efafb8a62f45ab`。
- 範圍：新增 exchange-use、exchange-applications 兩支影片與教學 metadata，放入會員與名片；保留四個橫向分類及原十四支影片。
- 預計檔案：教學 JS／版本、契約、單元與播放器測試、獨立錄製／剪輯／驗證腳本、本工作單。
- 禁止：不改交流、私訊、優惠券業務程式、Worker、身分、公開池、歸屬、點數、通知、secrets；不發布正式貼文或傳送真實訊息。
- 已讀：core-invariants、feature-change-protocol、tutorial-center、exchange-top-tabs、exchange-post-visibility；已核對 exchange-zone-core、member-chat 與 coupon 實際 UI／API。
- guard before：PASS (`node tools/run-change-guard.js before`)。
- 示範：逐 byte 核對正式 HTML／CSS／JS 與上述 Git 基線；隔離虛構會員、貼文、聊天與 AI 回應，所有 API 截留。剪輯以原生 Higgsedit 圖層及台灣中文旁白完成。
- 說明界線：會員私訊不是 LINE 原生聊天；找會員不是私人名片／AI 公開池權限的替代；刊登成功扣 10 點、編輯與隱藏不另扣點、刪除不退點，均依現有規則。優惠券教學只填表，沒有正式發券或核銷。AI 審核回應為示範，不是成功合作或身分保證。
- 影片：使用篇 248 秒（4:08）、應用篇 196.084 秒（3:16），720×1600／24fps／H.264＋AAC；台灣中文旁白＋原生步驟標示，非逐字字幕。完整解碼及關鍵輸出畫面已檢查，平均音量皆 -22.5dB。
- guard after：PASS；教學單元 11/11、交流 8/8、私訊 62/62；原十四支 metadata SHA256 `4e580a6d60bdeee1be54339a5465d9cee6244c30784303509c36e28bccb4d953` 保持不變。
- 媒體：R2 `linengine/tutorials/2026-10-10/` 下兩個新 key 上傳前 HEAD 404；上傳後 HEAD 200、video/mp4、Range 206、完整下載與本機 SHA256 相符。使用篇 15349145 bytes／`cdd91e4c260b8eff3d00049a205181849002de1bd3c2af098e433126a350bb40`；應用篇 13194037 bytes／`5e25dc41df6506759904855b6a37629fdf7597973f17728f8564c0fcff35b898`。
- 播放器：初次 320/390/768/1366px 回歸通過；目視發現新標題重複「教學」，已以不重複附加字尾修正，既有標題不變，新增精確標題斷言並重跑驗收。
- 證據：`C:/Users/User/.codex/visualizations/2026/08/24/01a03430-08fc-7dd2-9cff-51f0c9b9a81d/exchange-tutorials-20261010/`（兩支 MP4、可重編 ZIP、source/export-evidence.json、media-verification.json）。
- 最終播放器驗證：320/390/768/1366px 全部 PASS；四分類同列、16 支覆蓋、無列表媒體預載、不自動播放、影片尺寸／時長／聲音解碼、章節、返回焦點與停止播放，含兩支新影片的精確標題。證據 `.wrangler/exchange-tutorial-browser.log` 與 `.wrangler/tutorial-proof/exchange-*-390.png`。
- 部署：PR CI 通過後合併；Pages 發布後由 verify-live.mjs 核對正式檔案與四尺寸播放器，結果另存部署回執。僅新增版本化 R2 資產及 GitHub Pages；不部署 Worker，不更動任何正式交流資料、私訊、點數或優惠券。
