# 會員活動 DM 預設當年

日期：2026-10-06。使用者明確指定「基本上都是當年活動，預設值就直接以當年為準」。

## 範圍

- 起點 LINE- / 71bd988712808c6dd9f143c62ac4aff431b8803f；line-engine / d35d4779-533a-47f7-8d27-107c7fe4fd59，100%。
- 僅 worker/member-event-dm-schema.mjs、worker/member-event-dm.mjs、test/member-event-dm-schema.test.mjs、會員活動契約與本工作單。
- 未標年份時用伺服器當次請求的台灣（UTC+8）年，保留原文、明示年份優先，預設年份提醒可核對。年月日/時分仍使用既有日期驗證；不改為猜日期/結束時間/費用。
- 不改官方活動DM、名片、會員身分、報名、私人行程、點數、前端、模型、金鑰、bindings、compatibility、crons或配額；不跑migration。
- 已讀 feature-change-protocol、change-work-order-template、core-invariants、member-hosted-events；guard before PASS（member-dm-year-guard-before.log）。

## 驗證與發版

- 單元測試：台灣跨年、明示年份優先、缺日/缺時/無效日期仍留空、保留原文、多時段及當年時段可正常化。
- 使用1182056.jpg、實際模組及既有OpenAI金鑰的remote preview驗證；不帶DB/KV/R2/schedules，不寫業務資料、不發布活動。
- DM52/52 PASS（member-dm-year-tests.log）、完整guard after PASS（member-dm-year-guard-after.log）、實際Workers fetch transport PASS與dry-run PASS（member-dm-year-dry-run.log）。
- 1182056.jpg 真實AI測試HTTP200，耗時10196ms；startTime=2026-10-08T14:00、endTime=2026-10-08T16:00、timeStatus=single、confidenceNote含年份預設2026提醒，核心斷言PASS（member-dm-1182056-year-result.json）。測試程序已關閉，未發布或寫入業務資料。
- 通過CI後部署line-engine --keep-vars，前後核對設定與前端不變。實體手機登入操作未代替為已驗證。
- 回復Worker d35d4779-533a-47f7-8d27-107c7fe4fd59；不需回復資料或金鑰。
