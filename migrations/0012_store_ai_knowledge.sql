CREATE TABLE IF NOT EXISTS store_ai_knowledge_profiles (
  profile_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL DEFAULT '',
  network_id TEXT NOT NULL DEFAULT 'admin',
  store_name TEXT NOT NULL DEFAULT '',
  schema_version TEXT NOT NULL DEFAULT '',
  search_visibility INTEGER NOT NULL DEFAULT 0,
  knowledge_json TEXT NOT NULL DEFAULT '{}',
  summary_json TEXT NOT NULL DEFAULT '{}',
  searchable_text TEXT NOT NULL DEFAULT '',
  item_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_store_ai_profiles_owner ON store_ai_knowledge_profiles(owner_user_id, status);
CREATE INDEX IF NOT EXISTS idx_store_ai_profiles_network ON store_ai_knowledge_profiles(network_id, status, search_visibility);
CREATE INDEX IF NOT EXISTS idx_store_ai_profiles_updated ON store_ai_knowledge_profiles(updated_at);
