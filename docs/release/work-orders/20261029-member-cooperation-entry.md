# 會員專區合作申請入口

- 需求：在會員專區的設定與參數中新增「合作申請」，直接開啟既有本人合作申請／手簽清單，四種文件可切換。
- 基準：fangwl591021/LINE- main 757620dc03391dd1fa2eab7807d7832c2fe664d6；guard before PASS（../member-cooperation-before.log）。
- 已讀AGENTS、DESIGN、release skill、reward-applications契約及會員首頁、設定、手簽入口。新增按鈕放在會員註冊／資料維護前，註冊區保留自動展開；scroll margin確保從會員頭像進入時按鈕仍可見。
- 重用現有手簽模組與後端登入／會員／本人保護，持有頁面、LINE token及使用者快照；離開或換帳時不顯示舊資料。未登入提示、已登入未註冊沿用後端註冊提示。
- 不改Worker、後端權限、申請條款、資料、通知、點數、角色、付款、LINE webhook或任何正式合約；測試不送出正式申請、不發LINE。
- 隔離Chrome在320／390／1280各測兩種導覽配置：真實首頁頭像handler→設定頁按鈕可見可點→四種本人申請清單；未登入無API、已登入未註冊403提示、切頁與換帳自動關閉。採真實DOM／專案CSS與近似Tailwind，並測有頂欄顯示的保守配置及設定頁實際隱藏頂欄配置；非正式手機LINE驗收。資料庫query_only，阻擋非GET及外網，沒有正式申請或發訊。
- full after guard PASS（../member-cooperation-after-final.log）；Pages發布與正式檔案讀回待完成。測試通過直接部署前端。
