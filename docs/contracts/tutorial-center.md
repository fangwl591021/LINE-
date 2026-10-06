# Tutorial center contract

- Home has one compact tutorial entry immediately after its primary shortcut grid. Existing shortcuts and bottom navigation are unchanged.
- Four static course entries with versioned movies. Merchant v3 begins at the homepage mall banner, then the mall's 店家設定 button, before store registration and product listing. It retains sharing and the online-point workflow preview. Its narration, captions and player note explicitly say that online points await safety acceptance and are not yet released; tutorial publishing does not enable commerce point transactions.
- Contextual help never submits forms, routes to another business page, writes records, changes identity, or starts LIFF sharing.
- A single native modal contains either course list or player. Close / Escape returns focus to the opener; returning to list retains the original opener.
- No autoplay. No media request before selecting a course. Native video controls support pause, seek and fullscreen, with playsinline on mobile.
- Leaving the player pauses and detaches its src, then calls load; no background audio. Hiding the document pauses playback. Chapters use known video timestamps and retain the most recent pending seek until metadata loads.
- Media failures show an actionable retry rather than false completion. No analytics or private account values appear in video URLs.
- Collection video v2 includes front-required, back-optional, paired recognition and adding a back to an existing record. Existing spoken-caption coverage is not misrepresented: added sections use voice and fixed step labels.
- Versioned R2 assets are uploaded only after confirming absence, verified by hash/length/content-type and HTTP Range. Do not overwrite original local masters.
