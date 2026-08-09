CREATE TABLE IF NOT EXISTS checkin_template_images (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  bytes BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  starts_at TEXT NOT NULL DEFAULT '',
  ends_at TEXT NOT NULL DEFAULT '',
  required_creative_count INTEGER NOT NULL DEFAULT 1,
  rotation_mode TEXT NOT NULL DEFAULT 'sequential',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  creative_type TEXT NOT NULL DEFAULT 'image',
  title TEXT NOT NULL DEFAULT '',
  media_url TEXT NOT NULL DEFAULT '',
  preview_url TEXT NOT NULL DEFAULT '',
  target_url TEXT NOT NULL DEFAULT '',
  required_watch_seconds INTEGER NOT NULL DEFAULT 3,
  required_completion_ratio REAL NOT NULL DEFAULT 0,
  display_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  image_link TEXT NOT NULL DEFAULT '',
  buttons_json TEXT NOT NULL DEFAULT '[]',
  bubble_size TEXT NOT NULL DEFAULT 'kilo',
  image_aspect_ratio TEXT NOT NULL DEFAULT '800:1200',
  image_aspect_mode TEXT NOT NULL DEFAULT 'cover',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign
ON ad_creatives(campaign_id, status, display_order);

CREATE TABLE IF NOT EXISTS ad_view_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  platform_user_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  creative_id TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL DEFAULT '',
  observed_seconds INTEGER NOT NULL DEFAULT 0,
  completion_ratio REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_ad_view_events (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  creative_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  view_session_id TEXT NOT NULL,
  observed_seconds INTEGER NOT NULL DEFAULT 0,
  completion_ratio REAL NOT NULL DEFAULT 0,
  qualified_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform_user_id, campaign_id, creative_id, business_date)
);

CREATE TABLE IF NOT EXISTS daily_checkins (
  id TEXT PRIMARY KEY,
  platform_user_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  business_date TEXT NOT NULL,
  checked_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'verified',
  reversed_at TEXT,
  reversal_reason TEXT NOT NULL DEFAULT '',
  UNIQUE(platform_user_id, campaign_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user
ON daily_checkins(platform_user_id, business_date DESC);
