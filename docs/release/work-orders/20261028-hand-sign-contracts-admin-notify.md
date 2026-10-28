# 補齊手簽合約及管理員通知

- 日期：2026-10-28；起始main8486f1f04c4f9978271fc6230dc508b991fa46eb。
- 使用者要求：完成共創115.10契約與雙向完整版申請書手簽，送出成功後通知管理員；包含既有贈點／折抵兩種申請。
- 共創原件SHA256：224dac420aba1f0990f5de713e7125c4d9699a6a11f84ee6aed6f8ddee7da4aa。完整版原件SHA256：27fcbe65095b3a5fd06e2ec51b312d44b5e8ae5f60a241a880d1e03613cf1821。原件不修改／不公開上傳。
- 延續原預覽、手寫筆跡、明確勾選、伺服器完整快照、本人／管理員讀取、不可覆寫與PDF副本。新增partner/full固定種類與獨立資料表。完整原文範本只存私有D1，API登入後按固定版本/hash讀取，不把原文／銀行資料放入公開Pages測試或原件檔案。
- 共創條文依115.10及已裁定規則：第十二條優先，終止取消已成立但未支付獎勵；已付款流水保持。每次檢查最近連續12個月新約6件，續約／停止後重加入排除。已裁定文字在簽署前明確展示並納入快照；不自行解釋其他權益或新增義務。
- 新手簽先送審，不自動提升角色、啟用合作資格、建立年度訂單、收款、獎金或改歸屬。共創外部已簽文件登錄功能保持；審核和權限開通分開。
- 成功INSERT以私有outbox排通知，重送不新增通知；四種類合併每位現行管理員為單則多頁Flex，通知不含簽名、銀行、地址等完整合約資料。收件者沿用現有管理員權威，送出前重查；不能因通知失敗丟失申請或重複簽署。既有分鐘cron處理，不增加排程。
- 允許：手簽API／UI／PDF、保護式範本、通知outbox及現有cron掛接、必要LIFF審核深連結、additive0077/0078、對應契約／測試／cache。user授權通知功能，合成測試不發正式LINE或代簽。
- 禁止：修改母站點數、交易／付款金額、partner制度算式、舊契約快照／獎勵、會員角色／UID／推薦歸屬、其他通知、金鑰／綁定／排程。原件及私有SQL／JSON／測試PDF不提交公開repo。
- 已讀AGENTS、core-invariants、reward-applications、partner-bonus-v2、發布驗證及documents／pdf技能。guard before PASS（../hand-sign-before.log）。
- guard after PASS（../hand-sign-after.log）；兩個新增業務流程與既有贈點／折抵測試36/36、UI/cache88/88、通知17/17通過。Workerd＋真D1引擎驗證四種INSERT觸發器、並行送出／重試、競爭審核、範本撤銷、通知同key重試與撤權／別名衝突；無正式送件或LINE推播。
- Chrome合成流程覆蓋320／390／1280：四種填寫→預覽→手簽→送出→重開→管理員審核→PDF，含遺失回應重試、切帳隔離、公司代表必填與唯讀推薦人。原文102／36段及各4項裁定文字逐段確認有繪入PDF，7／3頁全部Poppler渲染，無裁切或重疊；合成長文件10頁亦通過。私有證據在../contract-review/，不隨Pages發布。
- 通知深連結另以實際已註冊auth分支＋商城loader/mount＋真實申請handler驗證，指定kind/id、非法參數、一般會員、資料庫撤權與切帳均通過（../hand-sign-review-entry-browser.log）。正式僅8次SELECT核對收件，1位管理員符合原權威，1位既有身分衝突跳過；正式寫入／LINE請求均0，不擅改身分。
- Worker dry-run PASS。正式前綁定／設定hash為3b36c4b961bcc15b7e3354cbb3fa94d806afdbcbdb427816216b1f196573198d，排程hash為3daefe8b947c3a195b684f87eabed3802f9e5fe166e6f82b805479be2495d578；正式D1目前只有reward／discount兩種舊表，尚未新增本次schema。
- 最後獨立審查重現舊審核競態：另一列新增管理員alias後仍可審核。四類審核INSERT現於同次原子寫入檢查原resolver的alias唯一性及完整active-link集合；管理員七欄CAS仍保留。新增12條四類競態／合法穩定link回歸，含相關舊新簽署、通知與店家管理員共92/92通過，兩份Workerd/D1 runtime再次通過；不更改正式衝突帳號與原角色映射。
- 測試通過直接部署Worker與Pages，正式資料只新增範本及schema；前後核對設定與排程。手機LINE實收不以合成結果代替。
