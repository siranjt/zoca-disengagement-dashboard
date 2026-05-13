CREATE TABLE IF NOT EXISTS customer_notes (
  am_name TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  customer_id TEXT,
  bizname TEXT,
  note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (am_name, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_customer_notes_am ON customer_notes(am_name);
