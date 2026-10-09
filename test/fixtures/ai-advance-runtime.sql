CREATE TABLE users(row_id TEXT PRIMARY KEY,line_id TEXT,name TEXT,role TEXT);
CREATE TABLE user_identity_links(old_line_id TEXT,new_line_id TEXT,status TEXT);
CREATE TABLE card_contacts(row_id TEXT PRIMARY KEY,name TEXT,company_name TEXT,title TEXT,scanner_user_id TEXT,creator_id TEXT,owner_user_id TEXT,source_type TEXT,archived_at TEXT,merged_into_row_id TEXT);
INSERT INTO users VALUES('runtime-a','Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','測試甲','user'),('runtime-b','Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','測試乙','admin');
INSERT INTO card_contacts VALUES('runtime-contact','測試對象','測試公司','業務','Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','','','ocr_scan','','');
ALTER TABLE card_contacts ADD COLUMN crm_status TEXT DEFAULT '新名片';
ALTER TABLE card_contacts ADD COLUMN crm_next_action TEXT DEFAULT '首次聯繫';
ALTER TABLE card_contacts ADD COLUMN crm_next_followup_at TEXT DEFAULT '';
ALTER TABLE card_contacts ADD COLUMN crm_ai_suggestion TEXT DEFAULT '討論需求並記錄首次聯繫結果。';
