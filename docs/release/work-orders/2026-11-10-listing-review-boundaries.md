# 一般健康與環境清潔上架審核誤判

- 需求：可通過者公開，有實際疑義者紅字說明。正式回應發現店面只因「健康」名稱、一般環境去味防霉品只因病房使用場景／洗衣機除臭及ECO圖文，被推測為醫療用品。
- 基線：main df6a403；修改前完整guard:before PASS（repo外listing-boundary-before.log）。
- 限定：澄清原本允許非醫療日用品／一般食品的審核指示；新增prompt快取版本，舊誤判不重用；政策版本、snapshot原hash、已釘死單品例外及所有商品內容、價格、折抵、owner／CAS／點數交易保持原流程。
- 不把「無法排除醫療」當證據。有具體疾病、器官修護、醫療用途或圖片證據時仍拒絕／人工核對；服務未完成仍不公開。
- 待驗證：審核及既有單品例外回歸、舊cache失效及新cache重用、原snapshot穩定、完整after guard、dry-run；發布後重新透過正常API／管理介面逐件審核授權店家。
- Target測試：審核與既有單品例外共38項PASS；新測試確認舊reject/manual快取失效、原snapshot固定值與manual原紀錄保留、新prompt快取重用、具體醫療reject/manual仍阻擋。
