# 我的店面 AI 草稿連線相容性修補

## 範圍與基準

- 延續已授權 AI 店面草稿實作，修正使用者回報 SD-e42fa85c-2f7 / SD-52ed9f91-9e0 失敗；沿用平台現有金鑰。
- checkout：.worktrees/member-dm-diagnostics；origin fangwl591021/LINE-；分支 codex/store-ai-transport-fix。
- 起點／回復 commit：f20d374a75296d3956c253f4efd62cb250f3f683；Worker 51a6897b-c0b7-4aaf-88e0-3c23851644f2（100%）。
- 只改店面草稿 OpenAI fetch 與共用公開來源 DNS fetch 的 redirect 參數、safe providerStatus/errorClass 診斷、對應 regression、store-ai-draft 契約及本工作單。
- 不改前端、登入／角色／UID、店面欄位／儲存／公開、模型、配額、金鑰、點數、商品、訂單、bindings、compatibility 或 crons；無 migration。
- 已讀 feature-change-protocol、change-work-order-template、core-invariants、store-shop、store-ai-draft、partner-onboarding-ai、regression-matrix 及 Workers runtime/observability 指引。
- 修改前 guard PASS：.wrangler/store-ai-transport-guard-before.log。

## 原因證據

- 正式安全監看 SD-52ed9f91-9e0：stage=provider、status=503、timeout=false；沒有記錄輸入、金鑰或 UID。
- 相同 compatibility_date=2026-04-23、flags=[] 的 workerd 真實 fetch：redirect:error 在網路呼叫前 TypeError「Invalid redirect value」；manual 在固定 OpenAI 端點取得無金鑰的預期401。
- 公開來源核對的 DNS fetch 也使用 error，因此即使修正 AI 呼叫仍會無法核對來源。僅把兩處改成 manual，所有非成功 HTTP（包括3xx）仍拒絕，不跟隨轉址、不傳遞憑證。
- 上次 Node/mocked fetch 未驗證 Workers 的實際 RequestInit 支援，漏掉相容性缺陷。

## 驗證與上線

- focused tests 51/51 PASS：store-ai-draft backend/UI 及 partner-onboarding-ai；含 OpenAI3xx拒絕、DNS3xx不跟隨、來源核對與 no-business-write regression。
- guard after PASS（完整160個 smoke/contract檢查程式）：.wrangler/store-ai-transport-guard-after.log。
- 修正後實際模組經 esbuild bundle 在 workerd（2026-04-23、flags=[]）使用真 fetch：合成無效測試key取得 OpenAI401、診斷 providerStatus=401；readWebsite 的 DNS及HTML完整鏈成功讀取 https://example.com/。不使用正式金鑰、無遠端business binding。
- Wrangler4.148.0 dry-run --keep-vars PASS：.wrangler/store-ai-transport-dry-run.log；起始正式版本25個 binding/var/secret項目，existing OPENAI_API_KEY 存在（仅查名稱）。
- 真正 AI 內容生成以正式登入會員重試為準，不把無金鑰401或 mock 成功視為正式 AI 成功。
- 部署只更新 Worker，--keep-vars；比對前後 binding/secret 名稱、非秘密 vars 與 compatibility/crons；Pages 不變。
- 回退 Worker 至上述版本，不涉及資料或金鑰回退。
