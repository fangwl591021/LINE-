# CRM 永久個人編號

- 日期：2026-10-21；需求：系統自動編配日期＋每日流水號，CRM 可查加入日期／資歷及以編號填推薦人。
- 基準：origin/main e9be475741339e8df01f08d2c533e3afccda00d9；分支 codex/crm-member-number-20261021。
- before：`node tools/run-change-guard.js before` PASS。
- 只改：附加會員號 migration／讀取投影、推薦編號解析、admin/admin-v2 CRM 顯示及測試。
- 不改：登入 UID、母站、點數、角色授權、推薦獎金、既有歸屬保護、名片版本、LINE reply、bindings/secrets/cron。
- 已讀：feature-change-protocol、工作單模板、core-invariants、card-resolvers、liff-routes、button-actions、card-ownership-and-versioning、identity-migration-checklist、regression-matrix。
- 新契約：docs/contracts/member-number.md。編號不是認證憑證，不接受前端指定／修改。
- 正式唯讀盤點：401 users、7 筆 SQLite 無法解析的 created_at、8 active identity links；SELECT rows_written=0。日期不明者不假造資歷。
- 方案：0067 additive migration；不可變號碼簿＋users 附加欄位；INSERT trigger 同交易配號，歷史資料用既有建檔時間穩定排序補編，無效日期以補編日配號但 joined_at 空白。號碼至少三碼，超過999自然延長。
- 發布：測試通過後只套用0067、原 Worker keep-vars、Pages；先保存既有表聚合／指紋與 Time Travel bookmark，驗證禁止區不變。回復程式不刪除已發號碼。
- after：完整 guard after PASS；初輪舊 VM 測試不認識投影 helper，將共用 userRow 保持自足投影後全部通過，未刪減任何原斷言。
- 新增 SQLite／安全測試7項 PASS（包含1005人、重試／回收／回滾、台北日界、身分alias、偽造欄位、原角色權限）。原贈扣點／身分70項與活動註冊7項 PASS。
- 原生 workerd（compatibility2026-04-23，無flags）＋D1：0067與trigger、40併發／重試得到30新號，歷史日期、精確查號、原權限／點數不變 PASS；不連正式服務。
- 真實 admin.html／admin-v2.html 表單及函式 ×320/390/1280共6組 PASS：編號日期唯讀、按號搜尋、推薦人預覽競態／文字逃逸／版面；全為合成資料，沒有實際LINE手機登入或正式推薦改寫。390px截圖已目視確認。
- 正式資料套用／Worker與Pages發布：待執行，不宣稱完成。
