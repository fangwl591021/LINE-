# AI商務導航完整影音教學

- User requested the full reminder/task/report/AI-next-step flow as narrated video in the current UI. Standing instruction: deploy after passing tests.
- Base 3d2d29c6d8a651a9b39d1862a7817fcb50112a52, fangwl591021/LINE-, isolated clean branch codex/ai-task-tutorial-20261024.
- Scope: add complete narrated Traditional Chinese workflow lesson in AI任務 category; contextual help button in task dialog; versioned media in R2. Preserve original sixteen course metadata and original video assets.
- Expected files: tutorial-center.js, ai-advance.js, ai-advance.css, index cache versions, tutorial contract/tests, work order. Production assets contain synthetic examples only.
- Excluded: Worker API/task/reminder/classification logic, users/roles/identity/referrals/points, real task writes, messages, AI provider calls, secret/binding/cron changes.
- Read: feature-change-protocol and tutorial-center contract. Media plan: real module/handler with isolated SQLite and fictional identities, LINE Flex rendering explicitly illustrative, local Taiwan Mandarin voice plus burned Traditional Chinese subtitles, complete decode and duration verification.
- Before guard: PASS, TEMP/line-ai-task-tutorial-before-20261024.log.
- Key teaching points: new-card first CRM task, old-card preview and opt-in backfill, manual tasks, real user action, four report modes, completed report before confirmed AI next task, independent opt-in self reminders/multipage Flex, history and applications.
- After guard: PASS, TEMP/line-ai-task-tutorial-after-20261024.log; 15 focused tutorial/entry checks PASS.
- Media: 465.875seconds, 1600x900,24fps,H.264/AAC,54 narration-caption blocks,17 chapters; full decode passed. Actual frames and phone player visually inspected. SHA-256 847f6a6fa121e39f31b6bbc6a5fe1ee07436fe493c62280efea9565d381685ba;11138635bytes. Taiwan Mandarin local SAPI voice, all speech captions burned into reserved left panel. LINE cards explicitly illustrative.
- Browser: 320/390/1280 PASS; unsaved task draft preserved, help causes no business requests, no autoplay, seeks17chapters, playback stops/detaches on close and focus restored. Formal phone LINE acceptance not performed.
- Media key absent (HTTP404) before upload. Publish new versioned asset only; source sixteen lessons untouched. Pages deployment/live byte and media checks pending; no Worker deployment.
