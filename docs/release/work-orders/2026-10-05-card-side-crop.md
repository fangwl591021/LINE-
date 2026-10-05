# 收藏名片雙面裁切修正

- 起點：071717a132ee55457add72fc966f102ca154d1da；分支 codex/card-sides-crop-fix。
- 範圍：收藏名片裁切模組、掃描 adapter、入口快取版本、測試與流程契約。
- 證據：已授權讀取的原照及壓縮圖完整，已存圖片卻裁掉上方並保留桌面；照片僅留在 ignored .wrangler，不納入提交。
- 禁止：身分、歸屬、點數、LINE 回覆、Worker、資料庫 schema、會員正式紀錄及其他版型。
- 已讀：core-invariants、ai-card-folder、card-resolvers、card-ownership-and-versioning。
- guard:before：PASS（.wrangler/card-crop-guard-before.log）。
- 決策：座標矛盾時不盲目套用 bounding box；各面獨立核對、可回到原圖調整；既有圖片修正只更新同一筆圖片欄位，取消不寫入、不重跑 OCR。
- guard:after：PASS（.wrangler/card-crop-guard-after.log），新增 7 項裁切／資料保留回歸案例。
- 瀏覽器：390×844 Chrome，合成雙面新增、核對阻擋、裁切取消／確認、既有圖替換、同 ID 圖片限定更新、無額外 OCR；原照正背面僅在本機測試 EXIF 正向與完整內容裁切。
- 限制：沒有重建當次未留存的 AI 座標，因此不宣稱已驗證當次模型輸出；改為拒絕互相矛盾的框線並強制逐面核對。未覆寫歷史圖片，既有錯誤照片需要重新上傳原照修正。
- 部署：驗證通過後僅 GitHub Pages；不部署 Worker、不修改正式名片資料。
- 回復：revert 本次提交並重新部署 Pages。
