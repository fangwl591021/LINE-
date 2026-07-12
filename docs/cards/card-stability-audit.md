# Card Stabilization 0：名片系統全貌稽核

> 範圍：只讀研究、診斷與工具。未修改 worker、`js/modules/mycard.js`、`js/modules/ecard.js`、UI、D1 資料或 migration，未部署。

## 稽核基準

已讀：`docs/flows/my-card.md`、`docs/flows/ai-card-folder.md`、`docs/data/card-ownership-and-versioning.md`、`docs/contracts/card-resolvers.md`、`docs/rules/core-invariants.md`。

缺件：`docs/security/trusted-identity-and-tenant-boundary.md` 在 main 不存在，不能視為已落地契約。

## 已確認的產品語意

1. AI 名片夾是名片收集器與電子名片簿，只管理 contact card／collection relation。
2. 掃描、OCR、相簿上傳或收藏取得的名片，預設都不是掃描者本人的 personal card。
3. contact card 可發送給對方認領；認領後原 contact card 仍留在介紹人／收集者的 AI 名片夾。
4. 認領建立或連結 claimant 的唯一 personal card，同時固定 inviter membership relation。
5. inviter 不是 personal card owner；personal owner 永遠是被認領者本人。
6. 已有 personal card 後，不論來源是認領、本人上傳或 LINE 建立，都不可再用 LINE 建立第二張。
7. 聊天室關鍵字「我的名片」永遠編輯與顯示該 UID 唯一的 personal card。

## 入口／action 盤點

| 入口或函式 | action／資料源 | 身分來源 | 選卡方式 | 可能讀 contact | 可能跨版型 | 可改 ownership |
|---|---|---|---|---|---|---|
| 我的名片首頁／設定／LIFF | `resolveMyCardVersion`、`loadCardData`、`currentUserCard` | Auth、LIFF profile、全域 currentUser 多 alias | 唯一 personal + requested version；現況仍有混合 fallback | 不應；現況有風險 | 有風險 | 否 |
| LINE OA「我的名片」 | webhook userId + resolver／public lookup | webhook source userId | 唯一 personal 靜態版本 | 不應；現況有風險 | 有風險 | 否 |
| LINE OA「影音名片」 | webhook userId + video candidate | webhook source userId | 唯一 personal 的 video version | 不應 | 有風險 | 否 |
| AI 名片夾 | `getCardContacts`、`getCardHarvestContacts`、`myCards` | scanner/collector/current UID | collection relation + contact source | 應為是 | 應否 | 否 |
| OCR／掃描建檔 | `saveCard`／OCR 核對提交 | scanner + creator | 建立 contact row／重複判斷 | 是 | 不應 | 不應直接改 |
| LINE 資料建立 | `saveCard`／`syncUserCardMatch` | LINE UID | 先查唯一 personal；不存在才建立 | 不應 | 有風險 | 僅首次建立 |
| 自己上傳名片 | `saveCard`／`updateCard` | current UID | 先查唯一 personal；不存在才建立 | 不應走 contact | 有風險 | 僅首次建立 |
| 名片認領 | `claimCardAndRegister` | claim actor + invitation + bound/profile/line | contact + claimant personal resolver | 是 | 可能 | 是，必須稽核 |
| 解除綁定 | `unlinkCard` | 管理者／本人 | 指定 identity link／claim relation | 是 | 否 | 是，必須稽核 |
| 合併 | `confirmIdentityMerge`、`resolveDuplicateCardBinding` | canonical actor + legacy identities | 多候選選 canonical personal | 是 | 是 | 是，必須稽核 |
| 公開名片 | `getPublicCardById` | public card id／network | personal card id | 不應 | 可能 | 否 |
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
| inviter | `inviter_id` / `referrer_id` / inviter alias | claim invitation／會員建立 | 會員歸屬、推薦關係 | 高，不能與 owner 混用 | 正式更正事件 only |
| source | `source_type` / `sourceType` / `source` | create／migration | resolver、列表、權限 | 高，但空值 legacy 很危險 | 僅 migration/受控轉換 |
| network | `network_id` | create／tenant routing | CRM/public/tenant | 高 | tenant-bound action only |
| visibility | `visibility` | owner/admin | public pool | 高 | owner/admin |
| config | `custom_config` / `config_json` | 四版型編輯 | renderer/resolver | 中；承載多種版本 alias | 只改指定版本 namespace |
| image | cover/hero/image aliases | editor/OCR | Flex/web renderer | 中；靜態與 video 易混 | 版本隔離 |
| video | video URL/storage/thumbnail aliases | video editor | OA video/Flex | 中；可能寫入 standard row | video namespace only |

可辨識 identity／relationship 概念至少 **7 類**：line、owner、profile、bound、scanner、creator、inviter；再加 collector、recognized person 等契約欄位，完整系統可能超過 10 類。

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
| `claimed_contact` | contact + recognized/bound link | 空 | 保留原值 | 保留原值 | 原收藏者可管理 collection | 是 | 已完成 | 否 | 否 |
| `claimed_personal` | personal | claimant | 空 | 系統/claim service | claimant | 是 | 已完成 | 可，需審核 | 是 |
| `legacy_import` | 未知直到 mapping | mapping 後 | 保留 | migration actor | 受限 | 受限 | 視 mapping | 否至確認 | 僅明確 mapping 後 |

`claimed` 不再視為單一 row 狀態：目標模型必須同時保留 claimed contact 與 claimant personal，兩者以 claim event／canonical pointer 關聯。

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
6. 若 claim 直接把 contact row 改成 personal，會同時破壞 CRM collection、scanner history 與唯一 personal 規則。

### High

1. 指定 trusted identity／tenant boundary 文件缺失。
2. repository migration 不含 `card_contacts` 完整 schema，無法由版本庫重建欄位真相。
3. `mycard.js` 同時接受多個 current-user alias，雖提高相容性，也會掩蓋 canonical identity 缺失。
4. `private_import`／claimed 的 contact + personal 雙實體關係尚未由單一狀態機表達。
5. image/video 欄位沒有已證實的版本 namespace 約束。
6. 已有 personal 時，LINE 建立入口是否確實被阻擋尚未證實。
7. inviter、scanner、owner 若共用或覆寫同一欄位，會造成會員歸屬錯誤。

## 風險結論

- 重複本人名片：**高**，尤其 claim 後仍允許 LINE 建立。
- AI 名片夾污染本人名片：**高**，尤其 source 空值、self scan、claim 直接改 row、resolver fallback。
- CRM collection 消失：**高**，若認領採 move/delete 而非保留 contact + pointer。
- 介紹人歸屬錯置：**高**，若 inviter 與 owner/scanner 混用。
- 四版型互覆：**高**。
- 認領與合併：**高至 Critical**，因 ownership、scanner history、inviter、canonical UID、audit event 必須同時成立。

## 只讀工具結果

本提交新增 `tools/audit-card-stability.js` 與 `tools/trace-card-resolution.js`。因本階段禁止 remote D1，未對 production/staging 執行資料查詢。對 repository schema snapshot 的預期結果是：現有 `migrations/0001_core_schema.sql` 找不到 `card_contacts CREATE TABLE`，所以資料型檢查會標為 `not_evaluable/query_ready`，不會猜測欄位，也不會輸出 PII。

後續 audit 應新增／確認以下規則：

- 已有 personal 的 UID 又存在 LINE-generated create candidate。
- claimed contact 被刪除或 scanner 被清空。
- claimed contact 與 personal 沒有 claim event／canonical pointer。
- inviter 與 owner 相同欄位覆寫，或 claim 後 inviter 遺失。
- 聊天室「我的名片」解析到 contact row。

## 建議第一個修補批次

**Batch CS-1：Canonical identity + read-only shadow resolver**

1. 先建立不改結果的 canonical identity adapter。
2. 所有入口並行呼叫 legacy resolver 與新 shadow resolver，只記錄 masked divergence。
3. 明確分類 personal/contact/version，不做自動 merge。
4. 把 claim 定義為「保留 contact collection + 建立／連結唯一 personal + 固定 inviter」。
5. 新增 `EXISTING_PERSONAL_CREATE_ATTEMPT`、`CLAIM_CONTACT_LOST`、`INVITER_CONFLICT` divergence。
6. divergence 歸零前不得切換正式讀取。
