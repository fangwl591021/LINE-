# Card Stabilization 0：名片系統全貌稽核

> 範圍：只讀研究、診斷與工具。未修改 worker、`js/modules/mycard.js`、`js/modules/ecard.js`、UI、D1 資料或 migration，未部署。

## 稽核基準

已讀：`docs/flows/my-card.md`、`docs/flows/ai-card-folder.md`、`docs/data/card-ownership-and-versioning.md`、`docs/contracts/card-resolvers.md`、`docs/rules/core-invariants.md`。

缺件：`docs/security/trusted-identity-and-tenant-boundary.md` 在 main 不存在，不能視為已落地契約。

## 入口／action 盤點

| 入口或函式 | action／資料源 | 身分來源 | 選卡方式 | 可能讀 contact | 可能跨版型 | 可改 ownership |
|---|---|---|---|---|---|---|
| 我的名片首頁／設定／LIFF | `resolveMyCardVersion`、`loadCardData`、`currentUserCard` | Auth、LIFF profile、全域 currentUser 多 alias | owner/profile/line/source/version 混合 | 有風險 | 有風險 | 否 |
| LINE OA「我的名片」 | webhook userId + resolver／public lookup | webhook source userId | 靜態候選、fallback 邏輯 | 有風險 | 有風險 | 否 |
| LINE OA「影音名片」 | webhook userId + video candidate | webhook source userId | source/prefix/config | 低至中 | 有風險 | 否 |
| AI 名片夾 | `getCardContacts`、`getCardHarvestContacts`、`myCards` | scanner/collector/current UID | scanner + source + list filter | 應為是 | 應否 | 否 |
| OCR／掃描建檔 | `saveCard`／OCR 核對提交 | scanner + creator | 新 row／重複判斷 | 是 | 可能 | 不應直接改 |
| LINE 資料建立 | `saveCard`／`syncUserCardMatch` | LINE UID | 既有 personal 或新增 | 有風險 | 有風險 | 建立時可設定 |
| 自己上傳名片 | `saveCard`／`updateCard` | current UID | personal resolver 或 OCR 路徑 | 有風險 | 有風險 | 受控 |
| 名片認領 | `claimCardAndRegister` | claim actor + bound/profile/line | 被認領 row + personal candidate | 是 | 可能 | 是，必須稽核 |
| 解除綁定 | `unlinkCard` | 管理者／本人 | 指定 row | 是 | 否 | 是，必須稽核 |
| 合併 | `confirmIdentityMerge`、`resolveDuplicateCardBinding` | canonical actor + legacy identities | 多候選選 canonical | 是 | 是 | 是，必須稽核 |
| 公開名片 | `getPublicCardById` | public card id／network | card id | 不應 | 可能 | 否 |
| CRM／後台 | `allCards`、`loadCardData`、`deleteCard`、`updateCard` | admin/session/network | row id/list filters | 是 | 是 | 依 action |

程式搜尋命中的核心 action／resolver 名稱共 **17 組**（依本階段指定清單去重）；實際 HTTP action 數需以 worker route 全檔 AST/grep 再確認。已知主要入口面共 **17 類**，但單一入口可能有多個 HTML、OA 關鍵字或 legacy alias。

## 實際資料欄位與可信度

目前 migration 只為既有 `card_contacts` 建索引，沒有完整 `CREATE TABLE`；因此 remote schema 才是欄位真相，本稽核不連 remote。

| 概念欄位 | 常見實際／alias | 寫入位置 | 讀取位置 | 可信度 | 更新規則 |
|---|---|---|---|---|---|
| row id | `row_id` / `card_id` / `id` | 建立入口 | 全部 resolver | 高，但 prefix 被拿來推版本 | immutable |
| LINE identity | `line_id` / `lineId` | LINE 建立、claim、legacy sync | 我的名片、CRM、公開 | 中；可能同時表示 owner/bound | 只由受信 action 改 |
| owner | `owner_user_id` / `ownerUserId` / `owner_id` | personal 建立、claim/merge | personal resolver、權限 | 應最高，但 legacy 缺值 | ownership action only |
| profile | `profile_user_id` / `profileUserId` | profile sync／legacy | mycard 權限、resolver | 中；與 owner 重疊 | 不應任意覆蓋 |
| bound | `bound_user_id` / `boundUserId` | claim/unlink | claim、重複綁定 | 高但需 audit | claim/unlink only |
| scanner | `scanner_user_id` / `scannerUid` / `scanned_by` | OCR/import | AI 名片夾 | 高，應 immutable | 不可因 claim 清空 |
| creator | `creator_id` / `created_by` | 所有 create | fallback、CRM | 中；不可取代 owner | immutable |
| source | `source_type` / `sourceType` / `source` | create／migration | resolver、列表、權限 | 高，但空值 legacy 很危險 | 僅 migration/受控轉換 |
| network | `network_id` | create／tenant routing | CRM/public/tenant | 高 | tenant-bound action only |
| visibility | `visibility` | owner/admin | public pool | 高 | owner/admin |
| config | `custom_config` / `config_json` | 四版型編輯 | renderer/resolver | 中；承載多種版本 alias | 只改指定版本 namespace |
| image | cover/hero/image aliases | editor/OCR | Flex/web renderer | 中；靜態與 video 易混 | 版本隔離 |
| video | video URL/storage/thumbnail aliases | video editor | OA video/Flex | 中；可能寫入 standard row | video namespace only |

可辨識 identity 概念至少 **6 類**：line、owner、profile、bound、scanner、creator；再加 inviter/collector/recognized person 等契約欄位，完整系統可能超過 9 類。這是目前最大複雜度來源。

## 名片狀態矩陣

| source/state | personal/contact | owner | scanner | creator | edit | share | claim | public pool | 可作我的名片 |
|---|---|---|---|---|---|---|---|---|---|
| `self_profile` | personal | 本人 | 空 | 本人/系統 | 是 | 是 | 否 | 可，需審核 | 是 |
| `video_profile` | personal version | 本人 | 空 | 本人/系統 | 是 | 是 | 否 | 視政策 | 是（影音入口） |
| `private_import` | contact | 空 | 掃描者 | 掃描者 | 掃描者可 | 是 | 是 | 否 | 否 |
| `referral_placeholder` | contact/placeholder | 空 | 可空 | 邀請者/系統 | 受限 | 受限 | 是 | 否 | 否 |
| `line_generated` | personal | 本人 | 空 | 本人/系統 | 是 | 是 | 否 | 可 | 是 |
| `self_upload` | personal（若走我的名片） | 本人 | 空 | 本人 | 是 | 是 | 否 | 可 | 是 |
| `ocr_scan` | contact | 空 | 掃描者 | 掃描者 | 是 | 是 | 是 | 否 | 否 |
| `claimed` | personal 或 contact+binding（現況需明確化） | claimant | 保留原值 | 保留原值 | claimant | 是 | 已完成 | 可，需審核 | 是 |
| `legacy_import` | 未知直到 mapping | mapping 後 | 保留 | migration actor | 受限 | 受限 | 視 mapping | 否至確認 | 僅明確 mapping 後 |

## 四版型現況判斷

現況是**混合模型**：程式同時以 row ID prefix 與 JSON／欄位旗標推斷版本，且契約又允許一個 personal 主體有四版本。已找到的判斷方法至少 **9 種**：

1. `CARD_STD_`
2. `CARD_POSTER_`
3. `CARD_SQUARE_`
4. `CARD_VIDEO_`
5. `cardVersion`
6. `layoutStyle`
7. `cardVariant`
8. `videoCard`
9. `videoStorageKind`

衝突情境：prefix 與 JSON 不一致、standard row 含 video data、video thumbnail 覆蓋 static cover、同 UID 同版本多 row、`video_profile` 被靜態入口選中、最後編輯版本成為共用 fallback。

## 問題分級

### Critical

1. owner/profile/line/bound 多套 identity 可互相矛盾，resolver 可能依入口選到不同 row。
2. source 為空或 legacy row 可能被 creator/姓名/電話 fallback 誤認本人。
3. 同 UID 多個 active personal／standard candidate 時，入口可靜默選不同名片。
4. claim/merge/unlink 可變更 ownership，但完整不可竄改 audit contract 尚未證實。
5. 四版型混合 row/prefix/config 判斷，存在互相覆蓋與重複 row 的雙重風險。

### High

1. 指定 trusted identity／tenant boundary 文件缺失。
2. repository migration 不含 `card_contacts` 完整 schema，無法由版本庫重建欄位真相。
3. `mycard.js` 同時接受多個 current-user alias，雖提高相容性，也會掩蓋 canonical identity 缺失。
4. `private_import`／claimed 的 personal/contact 轉換語意未由單一狀態機表達。
5. image/video 欄位沒有已證實的版本 namespace 約束。

## 風險結論

- 重複本人名片：**高**。
- AI 名片夾污染本人名片：**高**，尤其 source 空值、self scan、claim 後 fallback。
- 四版型互覆：**高**。
- 認領與合併：**高至 Critical**，因 ownership、scanner history、canonical UID、audit event 必須同時成立。

## 只讀工具結果

本提交新增 `tools/audit-card-stability.js` 與 `tools/trace-card-resolution.js`。因本階段禁止 remote D1，未對 production/staging 執行資料查詢。對 repository schema snapshot 的預期結果是：現有 `migrations/0001_core_schema.sql` 找不到 `card_contacts CREATE TABLE`，所以資料型檢查會標為 `not_evaluable/query_ready`，不會猜測欄位，也不會輸出 PII。

## 建議第一個修補批次

**Batch CS-1：Canonical identity + read-only shadow resolver**

1. 先建立不改結果的 canonical identity adapter。
2. 所有入口並行呼叫 legacy resolver 與新 shadow resolver，只記錄 masked divergence。
3. 明確分類 personal/contact/version，不做自動 merge。
4. 建立 claim/merge/unlink audit event contract。
5. divergence 歸零前不得切換正式讀取。
