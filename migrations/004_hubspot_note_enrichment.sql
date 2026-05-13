-- Phase 13: HubSpot note enrichment cache (Fireflies note sentiment/topics/actions)
-- One row per HubSpot note_id. Lets us skip re-Haiku-ing unchanged notes.
-- The app self-heals via CREATE TABLE IF NOT EXISTS on first use.

CREATE TABLE IF NOT EXISTS hubspot_note_enrichment (
  note_id TEXT PRIMARY KEY,
  enriched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sentiment TEXT NOT NULL DEFAULT 'neutral',
  topics JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Optional sanity check
SELECT 'hubspot_note_enrichment' AS table_name, COUNT(*) AS rows
FROM hubspot_note_enrichment;
