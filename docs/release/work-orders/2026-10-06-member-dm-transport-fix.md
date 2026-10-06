# 會員辦活動 DM 請求相容性修補

## 摘要與範圍

- 日期：2026-10-06。使用者回報「不行」，延續已授權 DM 修正與部署，沿用正式 OpenAI 金鑰。
- 起點：LINE- / fbc768e485c86560c28e417c4aef969ea6c2cf650696e0；line-engine 正式版本 cbdd4e3f-3f86-49aa-b7cc-d02a8fca880c，100%。
- 只改 worker/member-event-dm.mjs 請求 redirect 參數、test/member-event-dm-schema.test.mjs、test/member-event-dm-diagnostics.test.mjs、member-hosted-events 契約與本工作單。
- 禁止修改名片、官方活動、會員身分、點數、活動資料、前端、模型、配額、金鑰、bindings、compatibility 或 crons；不跑 migration。
- 已閱讀 feature-change-protocol、change-work-order-template、core-invariants、member-hosted-events；修改前 guard PASS（member-dm-transport-guard-before.log）。

## 原因與實作

- 正式安全監看 DM-f20592228ce5：provider_request / network_or_request_failure，HTTP 0、耗時122ms。無 DM、身分或金鑰記錄。
- 在正式 compatibility 2026-04-23 / flags [] 的 Workers runtime 使用真正 fetch 重現：redirect:error 於連線前 TypeError「Invalid redirect value」；redirect:manual 在相同端點取得預期未授權401（未帶金鑰）。上次供應商 mock 沒有執行 Workers fetch，漏掉此相容性問題。
- 修正為 manual；仍透過非成功 HTTP 分支拒絕3xx，不跟隨轉址、不重試、不帶入草稿。

## 驗證與上線

- 修改後 guard PASS（member-dm-transport-guard-after.log）、DM專項49/49 PASS（member-dm-transport-tests.log）、dry-run PASS（member-dm-transport-dry-run.log）。
- 實際修正模組使用真正 Workers fetch、synthetic invalid key（非正式金鑰）、傳入 request.signal，正常取得 OpenAI401且正確分類 provider_http；沒有遠端資料binding或業務寫入。真實 AI/手機辨識另列，不以未授權401或mock聲稱辨識成功。
- 上線前後比對 binding/secret名稱、非秘密變數雜湊、crons、compatibility 與前端內容雜湊。
- Worker回復點：cbdd4e3f-3f86-49aa-b7cc-d02a8fca880c；無資料或金鑰變更。
