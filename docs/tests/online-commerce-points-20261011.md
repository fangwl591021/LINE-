# 網購購物金折抵：隔離驗證紀錄

日期：2026-10-11。來源：正式 main 3fbe0a2；非舊 dirty 草稿部署。

## 已通過

- Change guard before / after 完整 PASS。快取版本更新後原相關斷言同步，沒有移除／降低測試。
- `node --test test/store-commerce-points.test.mjs test/store-commerce-mother.test.mjs test/store-commerce.test.mjs`：56/56。
- SQLite：同訂單重送、不同編號並行、原收銀鎖競爭、身份／餘額／權限變動、裸 success、回執 ID／幣別／點數錯配、母站斷線、D1 成功後落盤失敗、唯讀原單對帳、退點原扣點連結／唯一性、跨店／匿名拒絕、關閉开關後既有對帳與退點。
- 母站 adapter：只查 raw ledger，嚴格資料格式，完整有界分頁唯一性，超出範圍保持待查核；通用 insert 不冒充母站原子／冪等 API。
- Headless Chrome 使用 localhost:8794、虛構會員與假母站：390px / 1280px，折抵 50 點，NT$8,810 淨應收；返回編輯保留點數、買家取消退點、店家銀行核帳及確認退款後退點、沒有 JS 錯誤或橫向溢位。
- 假帳本最後 `[-50,+50,-50,+50]`，餘額回到 1,000；正式點數／訂單寫入 0。
- 本機 D1 / Wrangler 單一 0062 migration：舊訂單 1、舊事件 1 保留，FK check 空，旧訂單 points_status=none，原金額不變。
- Wrangler 4.120.0 dry-run PASS，line-engine / actmaster_db / ACTMASTER_KV / linengine 原 binding 不變。

## 正式資料唯讀前檢查

- 既有網購訂單 1，total_cents 合計 1,000,000，version 合計 1，snapshot_json 長度 683；事件 0。
- 表格只有原兩個訂單索引及原事件唯一索引，無額外 trigger；只有 store_commerce_events 引用訂單；FK check 空。
- 0062 尚未套用；共享 cashier 未完成交易 0。所有前檢查 SELECT 的 rows_written=0。
- 另讀既有本人授權 -1/+1 的回執，確認 `data.insertResult.data.insert_id` 與 insert_row 格式、完整 event_content 原樣保留。没有重做扣點／退點。

## 驗收界線與復原

- 本輪沒有新的正式網購折抵／退點實扣，隔離測試不宣稱正式訂單已驗收。
- 沿用既有 mother 金鑰、canonical identity、gift_money 原始帳本，不修改電話／QR cashier 或 180 秒 session。
- 母站通用接口不保證跨系統原子扣款。跨站並行仍可能改餘額；實際入帳／當前餘額異常時鎖定，不允許履約／自動重扣。
- 待查核只可「查核原交易結果」。未找到不能當未扣點、更不能換編號重扣；不自動退未知的扣點。
- 停新折抵：STORE_COMMERCE_POINTS_ENABLED=false；原單對帳與有原始確認回執的退點保留。不可删除點數操作紀錄或恢復舊 schema。
- 原 Worker 回復點為本次前一個部署；程式回退不回退 D1 資料。部署保持 --keep-vars。
