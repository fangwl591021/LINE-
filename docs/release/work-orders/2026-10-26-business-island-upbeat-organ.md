# 人脈島輕快電玩風琴背景音樂

- 日期：2026-10-26；基準main `2e62b080653eebe41a1eb8544c2f8a5b0d19753b`，保留近期PR270至275的人脈島加入／分享／本人資料與專案指引。
- 使用者要求：背景音樂太小、調性沉悶，改成輕快電玩風琴；沿用本次已授權範圍的測試後直接發布。
- 已讀：AGENTS、DESIGN相關範圍、feature-change-protocol、core-invariants、人脈島契約及line-release-verification技能；guard:before PASS（work/island-organ-guard-before.log）。
- 只改：business-island-audio.mjs的背景編曲／風琴音色／音樂bus音量、controller音樂提示與audio快取、入口快取／對應入口契約、音訊瀏覽器測試。
- 保持：原音效與soundBus、獨立儲存偏好／手勢解鎖／拒絕重試／暫停及釋放；人物與船程／骰子／公開名片與聊天／手機版／商城／加入分享。不得修改Worker、schema、正式資料、bindings、vars、secrets、cron或其他音訊。
- 背景樂使用原創明亮大調與較清楚節奏、風琴泛音和適當留白，無遠端媒體／套件。實際PCM比對原版音量、峰值／破音、節奏及泛音，聲部／排程須適合手機。
- 驗證：原生Chrome音訊離線render及即時手勢／開關／背景／釋放、新舊PCM及原音效不變；原場景31項含原生音訊回歸、入口契約與前後完整guard。預覽WAV及量測資料存repo外work目錄，不整包公開。
- 發布僅Pages；合併後讀回正式入口與音訊JS等檔案SHA／MIME，核對Worker前後版本、來源與設定（起始正式版本f687f57c-26d4-4144-8261-32ccdfccb5ad），不部署Worker。
- 最終本機驗證：完整guard前後與入口契約PASS；音訊10項、原場景31項共41項Chrome檢查PASS。原生32秒PCM RMS0.0036905→0.0133302（+11.155dB／3.61倍訊號幅度），音樂峰值0.051926、含音效混音0.057231、零削波；126BPM／短音風琴、最多10個活躍音源與1個排程timer。三種原音效PCM逐位元相同，原偏好／音效／生命周期19個函數保持原碼。
- 證據及32秒預覽：repo外work/island-organ-qa-summary.json、work/business-island-organ-audio/upbeat-organ-preview.wav、work/island-organ-original-final.log。屬原生瀏覽器渲染／合成流程，未當成實體手機喇叭驗收；不公開測試中間檔。
- 發布以PR合併後Pages為準；正式29檔／預設入口SHA、原生正式模組播放及Worker前後核對的結果補記於PR。
