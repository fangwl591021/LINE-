# 名片目標模型

## 1. 核心定位

### AI 名片夾

AI 名片夾是名片收集器與電子名片簿，屬於 CRM／Contact Card 系統。

- 掃描紙本名片、OCR、相簿上傳、收藏電子名片，均先建立 contact card。
- contact card 是收集者的私有聯絡資產，不是收集者本人的 personal card。
- 同一被辨識人物可被多個 scanner 各自收藏，各自保留獨立 collection relation。
- AI 名片夾不得直接建立第二張 personal card。

### Person identity

- canonical person key：受信 LINE UID 對應的內部 `person_id`。
- LINE UID、legacy UID、profile alias 只作 identity mapping，不直接互相覆蓋。
- tenant/network boundary 必須是 resolver 的必要輸入，不可在查不到時 fallback 到其他 network。

### Personal card

- 一個 `person_id` 僅有一個 active personal card aggregate。
- personal card 的首次來源可以是 LINE 生成、本人上傳或認領建立，但三種入口只能共用同一個 aggregate。
- 一旦已有 personal card，所有「建立」入口必須改為編輯或受控合併，不得再新增第二張。
- 聊天室關鍵字「我的名片」永遠解析這一張唯一 personal card。
- 四版型不是四個互相競爭的 owner row；它們是同一 personal aggregate 下的四個 version records：`standard`、`giga`、`square`、`video`。
- 每個 version 只能有一個 active revision，歷史 revision 保留。

### Contact card

- contact card 是 collector/scanner 的私有聯絡資產。
- contact card 可指向 recognized person，但不能因此自動取得 personal ownership。
- contact card 被認領後仍保留在原收集者的 AI 名片夾，不 move、不 delete。
- 認領只新增 recognized/bound/canonical pointer 與 claim event，不清除 scanner、creator、source event。

## 2. 認領與介紹人規則

1. 收集者掃描或建立 contact card。
2. 收集者把 claim invitation 發給名片本人。
3. 對方以受信 LINE identity 完成認領。
4. 原 contact card 保留在收集者 AI 名片夾，增加 `recognized_person_id`、`bound_user_id` 或等價 link。
5. 若 claimant 尚無 personal card，建立唯一 personal aggregate，將 contact 資料複製為 initial revision。
6. 若 claimant 已有 personal card，只建立 merge proposal 或更新 proposal，不新增第二張 personal card。
7. 介紹人關係記錄在會員／identity 關係：`inviter_person_id` 或等價欄位，固定為發出有效認領邀請的介紹人。
8. 介紹人不是 personal card owner；personal card owner 永遠是 claimant 本人。
9. 原 scanner 與 inviter 可以是同一人，也可以不同，兩個角色必須分欄保存。

## 3. 建議資料結構

- `card_entities`：card aggregate、type、person_id、network_id、visibility、status。
- `card_versions`：card_id、version、revision、content_json、cover/video namespaces、active flag。
- `card_collections`：contact card 與 scanner/collector 的關係。
- `card_identity_links`：line/profile/legacy identity 到 person_id 的 mapping。
- `card_claim_events`：claim request、inviter、proof、before/after、actor、result。
- `card_merge_events`：source/target、field decisions、actor、timestamp、rollback pointer。
- `card_resolution_traces`：masked shadow read divergence。

## 4. 欄位可變性

### Immutable

- card aggregate id
- original source event id
- original scanner/collector
- creator
- creation timestamp
- tenant/network at creation（跨 tenant 必須建立正式 transfer event）
- claim/merge/unlink audit event
- accepted claim invitation 的 inviter link（除非經正式更正事件）

### Mutable by owner/editor

- 基本聯絡與介紹資料
- visibility
- 指定 version 的 layout、cover、buttons、video/thumbnail

### Ownership action only

- person_id / owner binding
- bound LINE identity
- canonical target after merge
- active/merged state

只有 `claimCardAndRegister`、經授權的 `unlinkCard`、`confirmIdentityMerge`／正式 merge service 可修改 ownership；一般 `saveCard`、`updateCard` 不得接受 ownership 欄位。

## 5. LINE 建立限制

- LINE 生成只是建立 personal card 的其中一個首次入口。
- resolver 若已找到 claimant 的 active personal aggregate，LINE 生成按鈕必須轉為「編輯我的名片」。
- 已由認領建立 personal card 的人，不可再次以 LINE 資料建立新 row。
- 已由本人上傳建立 personal card 的人，也不可再次以 LINE 資料建立新 row。
- 所有建立入口在寫入前都必須先執行唯一 personal resolver。

## 6. Claim 轉換

1. contact card 保留原始 scanner、creator、source event。
2. 驗證 claimant identity 與 claim invitation。
3. 固定 inviter membership relation。
4. 若 claimant 已有 personal aggregate：建立 merge proposal，不直接新增第二張 personal。
5. 若 claimant 無 personal aggregate：建立 personal aggregate，將 contact 資料複製為 initial revision；contact collection 仍保留歷史與指向。
6. 寫入 claim event，包含 before/after masked identity、actor、inviter、proof type、resolver version。
7. claim 完成後，聊天室「我的名片」只能解析 claimant 的 personal aggregate。

## 7. Merge 稽核

- 不刪 source card；標記 merged 並指向 canonical card。
- 逐欄記錄保留來源。
- scanner collections 不被合併掉，只更新 recognized/canonical pointer。
- inviter relation 不因 card merge 被覆蓋。
- 支援事件級 rollback：恢復 active pointer，不覆寫歷史 revision。

## 8. Legacy identity mapping

- 禁止只用姓名或電話直接設 owner。
- phone/email/name/company 僅產生 candidate confidence。
- 只有受信 LINE login、人工審核或既有可驗證綁定能建立 canonical link。
- legacy alias 必須記錄來源、建立者、時間與信心層級。

## 9. Resolver contract

輸入：actor canonical id、network、entry source、requested version、mode、optional card id。

輸出：card aggregate、version、permission、candidate/exclusion trace、resolver version。

規則：

- 我的名片只查 personal + actor person_id。
- AI 名片夾只查 collection + scanner/collector。
- contact card 即使已認領，也不得直接作為「我的名片」結果；只能透過 canonical personal pointer 解析。
- OA 靜態入口排除 video；影音入口只取 video。
- 多個合格 personal 候選時回 `ambiguous`，不得 silently choose。
- 已有 personal 時，任何 create entry 必須回 `existing_personal_edit_required`。

## 10. Shadow read 與 rollback

- legacy resolver 保持正式結果。
- target resolver 只做 shadow read，輸出 masked candidate、排除原因與 divergence code。
- 不記完整姓名、電話、Email、UID。
- 以入口、network、version 分桶比較。
- 切換採 feature flag；rollback 只需關閉 target resolver，不需回寫資料。
- migration 採 copy + pointer，不做 destructive rewrite。