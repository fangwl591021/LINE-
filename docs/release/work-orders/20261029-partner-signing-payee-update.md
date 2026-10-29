# 共創夥伴線上手簽：新版收款資料

- 使用者提供 D:/服務客戶/好神奇/點數通共創夥伴推展合作契約書115.10版.docx，核對與上線來源不同：新SHA256 1fa48f76ed888e656a5e1efac84c670b1132f8f1cf6a62fa8c8c76b48ba7f42c，舊SHA256 224dac420aba1f0990f5de713e7125c4d9699a6a11f84ee6aed6f8ddee7da4aa。雙方第1至13條正文相同；新文件增加甲方公司戶名／公司帳戶、移除乙方代表人空白欄及移動推薦人欄位。
- 使用者明確選擇「更新收款資料，保留代表人欄」。新版保留完整103段原文及原4項使用者已裁定的補充文字；手簽表單對法人保留代表人必填。銀行值、來源DOCX、私有SQL/JSON/PDF在repo外且只進已驗證的私有D1，不放公開Pages或日誌。
- 基準main b01af5cfece1947bc5bbefa96cf0018a74ea1a32；guard before PASS（../partner-signing-update-before.log）。已讀AGENTS、reward-applications、partner-bonus-v2、core-invariants與發布技能。
- 方案：先部署能驗證舊版和新版固定pin的Worker，私有D1仍用舊範本；再以單筆CAS針對kind/version/source/content/full old terms/active逐一比對更新partner一列；full不變。若正式目前不符預期立即停止。舊未送出預覽在切換後須重新預覽，已簽原快照與既有相同重送維持。前後核對完整內容SHA與原文件SHA，不公開原文。
- 禁止：修改既有已簽資料、訂單、獎金、會員、推薦、點數、角色、私有資料公開、未經授權代簽、發送測試LINE、修改全站其他範本、綁定/排程/金鑰。原版外部制度與115.10演算法不變，既有第十條／第十二條衝突仍依使用者原裁定由補充文字說明。
- 現行CRM逐筆簽約記錄不應把一個全站空白範本SHA推斷為每份文件的來源；只在實際有逐筆來源時顯示，舊資料未知即標示未記錄；保留已簽文件hash，不改歷史資料。
- 隔離SQLite手簽及新舊制度66/66 PASS，涵蓋雙pin、錯誤pin與內容hash拒絕、切換時preview/INSERT競態、切換後舊預覽409、已簽記錄與重送、新表單法人代表人、full不變；實際Workerd/D1亦通過相同換版及原四類送審保護。CRM合成Chrome驗證逐筆來源未知不誤標、已簽文件hash保留。
- 新檔103段及4項補充完整保存在私有repo外，實際應用PDF產生器以合成法人資料生成7頁，代表人欄與全部原文／附註有繪製，所有文字在畫布內，收款欄未裁切；未對正式系統代簽。私有新terms內容SHA256 `94e7facfd9bf586052f11c7745c5f2f2f8df26688b46aa3096481aa28ae83c81`。
- 最終full after guard PASS（../partner-signing-update-after.log）、CRM畫面及手簽入口5/5 PASS、Worker dry-run PASS。CI及正式私有模板安全切換與前後hash讀回待完成；測試通過自動部署。
