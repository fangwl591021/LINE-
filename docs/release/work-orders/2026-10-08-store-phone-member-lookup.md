# 店家電話查找必須確認有效點數會員

## 1. 變更摘要
- 使用者明確授權「修正查找流程並部署」。只修正查找誤把電話當成點數帳號的缺陷。
- 基線 origin/main d27fba7edd6efcf741dfa326549b5d36bf5dbf4e；branch codex/store-phone-member-lookup；checkout .worktrees/member-dm-diagnostics；origin fangwl591021/LINE-。
- 正式目標 line-engine／account 8058cf61f0cd44c4edd78080b193033a／D1 actmaster_db；Worker 回復點 57abec34-5821-4a94-be73-d4c2b37b12c7；前端 GitHub Pages LINE-。

## 2. 本次只允許改什麼
- 店家電話／手動客戶查找必須解析成既有有效 LINE 點數 UID，與既有送點檢查一致。
- 未匹配、電話型補建帳號及無效點數映射應立即提示，不能查錢包、補建帳號、準備母站會員或收銀通道。
- 已驗證身分映射、正常電話格式、有效 UID／QR、未綁定名片及多會員同電話的安全限制保留。
- 前端拒絕無效查找結果及送出，移除「補建索引即可正常贈扣點」的保證；更新載入版號。
- 預計檔案 workerbackup.js、js/auth.js、index.html、契約、相关測試與 full guard 清單。

## 3. 本次禁止碰什麼
- 不刪除或修補任何正式會員／名片／身分映射；不憑電話或姓名自動綁定或合併帳本。
- 不送真實點數、不改餘額、交易紀錄、防重送、未知結果鎖、消費計算、角色政策、有效會員的 fallback／180 秒通道。
- 不改登入、LINE reply ownership、推薦／名片歸屬、商品或 AI 審核。
- 不改 bindings、vars、secrets、compatibility_date、cron；不套用 migration。

## 4. 必讀規格及修改前驗證
- 已讀 feature-change-protocol、core-invariants、points-ledger、store-point-cashier-protected-flow、regression-matrix。
- npm run guard:before PASS；.wrangler/phone-lookup-guard-before.log。工作樹修改前乾淨。
- 正式設定快照 .wrangler/phone-lookup-version-before.json、phone-lookup-deployments-before.json；25 個 binding/var/secret metadata 保留。

## 5. 驗證與發布要求
- 合成 SQLite 重現電話補建紀錄；無會員／無效 point_line_id 在 wallet、母站、KV 及資料寫入前拒絕。
- store/admin/redeem/reward 均覆蓋；正常電話、國碼／分隔符、QR、已驗證映射、未綁定名片、多會員同電話回歸。
- 前端舊成功會員狀態不能在失敗查找後保留；無效回應不能顯示可贈點／送出；有錯誤提示且操作狀態恢復。
- npm run guard:after、相关點數防重／權限測試、語法檢查、Wrangler dry-run 通過後才提交／發布。
- 發布後核對 Worker 版本、設定 metadata、前端 hash；瀏覽器只做查找，絕不點正式送點。
- 回復僅撤回此修正；保留先前商城標籤、AI 審核及資料。

## 6. 驗證與發布結果
- 170 項相關測試通過：.wrangler/phone-lookup-focused-final.log；涵蓋真實身分／電話 SQL、四種角色、有效 UID／映射、未綁定名片、模糊候選、原始安全送點邊界及前端過期狀態。
- 修改前 guard 通過；修改後完整 guard 通過（162 個檢查）：.wrangler/phone-lookup-guard-after.log。同步更新 auth.js 11.08 的既有版號斷言，未改其他功能。
- node --check、git diff --check 及 Wrangler 4.148.0 --dry-run --keep-vars 打包通過。
- 隔離 Chrome 390×844：電話贈點 POP 查無會員時禁止確認；舊收銀 UI 即使收到 phone-keyed／balance=350／canAdjust=true 的錯誤成功回應，仍清空客戶與餘額、隱藏可贈扣點提示，顯示核對手機／錢包 QR 的引導。
- 瀏覽器合成資料不連正式點數，未點確認送出。正式瀏覽器無登入狀態，不能宣稱完成真實會員登入後的送點驗證；發布後另核對正式 bytes／版本與唯讀資料。
- 無 migration 或正式會員、名片、映射、餘額、帳本變動；沒有新建或旋轉金鑰。
- 待核對 PR、正式 Worker 及 Pages 發布結果。
