CREATE TABLE IF NOT EXISTS ai_usage_logs (
  usage_id TEXT PRIMARY KEY,
  project_code TEXT NOT NULL,
  project_name TEXT NOT NULL,
  worker_name TEXT NOT NULL,
  network_id TEXT NOT NULL DEFAULT 'admin',
  actor_user_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  feature_code TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  secret_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'success',
  fallback_used INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 1,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  unit_price_twd REAL NOT NULL DEFAULT 0,
  billable_amount_twd REAL NOT NULL DEFAULT 0,
  error_code TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_project_created ON ai_usage_logs(project_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_network_created ON ai_usage_logs(network_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_feature_created ON ai_usage_logs(feature_code, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_billing_rates (
  project_code TEXT NOT NULL,
  feature_code TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  billing_unit TEXT NOT NULL DEFAULT 'request',
  unit_price_twd REAL NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_code, feature_code)
);
INSERT INTO ai_billing_rates (project_code,feature_code,feature_name,billing_unit,unit_price_twd,enabled) VALUES
('LINE-','business_card_ocr','名片 OCR','request',0,1),
('LINE-','contact_matching','智能配對','request',0,1),
('LINE-','fate_tags','五大標籤','request',0,1),
('LINE-','card_safety','名片健檢','request',0,1),
('LINE-','card_copy','名片文案','request',0,1),
('LINE-','customer_import_mapping','客戶匯入欄位分析','request',0,1)
ON CONFLICT(project_code,feature_code) DO NOTHING;
