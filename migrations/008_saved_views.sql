CREATE TABLE IF NOT EXISTS saved_views (
  id SERIAL PRIMARY KEY,
  am_name TEXT NOT NULL,
  name TEXT NOT NULL,
  filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(am_name, name)
);
CREATE INDEX IF NOT EXISTS idx_saved_views_am ON saved_views(am_name);
