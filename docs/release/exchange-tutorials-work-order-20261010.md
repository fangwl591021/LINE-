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
- guard after／媒體驗證／播放器驗證／部署：待完成後補記。僅版本化 R2 新資產及 GitHub Pages，不部署 Worker。
