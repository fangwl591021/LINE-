# 手機 LINE 音效與掩體修正

- 起始 dcce18b，使用者確認手機 LINE 連試聽都無聲；前版自動測試只證明訊號，並未實聽手機。
- 範圍：增加原創 PCM WAV / HTMLAudio 相容播放路徑與播放模式切換；增加掩體；前後端版本一致與舊局相容。
- 禁止：不修改每日簽到、會員、贈點金額、ledger、防重鍵、正式資料或 migration。
- 已讀 core-invariants、feature-change-protocol、daily-tank-challenge；guard before PASS。
- 地圖由開始時伺服器發行的 session 版本决定；完成時不信任前端版本。舊 session/舊前端維持 1，新前端申請 2。
- 音效須手勢播放，根據 play() 成功/失敗提示；仍不能替使用者確認喇叭實際有聲。
- 檔案：tank-audio、tank-engine、daily-tank-challenge 前端與 Worker、小幅 CSS/index 版本、測試與文件。
- 測試：20/20 PASS；guard before/after PASS；瀏覽器驗證 HTMLAudio currentTime 前進、未靜音，失敗提示、雙指操作、實際新地圖重播及每日防重通過。這仍不等於實體手機喇叭已驗收。
- 地圖增加為 80 磚，seed 1/2/3 皆可破關；v1 保留 20 磚，伺服器忽略完成 payload 的 mapVersion。
- CUA 目前預覽分頁原先仍是旧版；重新載入後確認 V3、相容模式、播放成功提示，未操作正式贈點。
- Worker dry-run PASS；延續本次修正提交部署授權，發布版本 cb245ca7-b3cd-4f09-8746-b398206c8171，保留 vars。無 migration。
- 前端以既有 GitHub Pages main 工作流發布，發布後唯讀核對靜態檔案。
