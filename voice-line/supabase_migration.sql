
-- Voice Line Schema for Supabase
-- Run this in the Supabase SQL Editor (https://supabase.com/dashboard)

-- Sessions table: one row per voice session
CREATE TABLE IF NOT EXISTS voice_sessions (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ,
    status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'error')),
    turn_count    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Turns table: one row per conversation exchange
CREATE TABLE IF NOT EXISTS voice_turns (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    session_id      TEXT NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
    user_text       TEXT NOT NULL,
    assistant_text  TEXT NOT NULL,
    model           TEXT NOT NULL DEFAULT '',
    latency_ms      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Preferences table: key-value store for user settings
CREATE TABLE IF NOT EXISTS voice_preferences (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_voice_sessions_started_at ON voice_sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_turns_session_id ON voice_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_voice_turns_created_at ON voice_turns(created_at DESC);

-- Row Level Security: in production, add RLS policies here
-- For local dev, RLS can be disabled or set permissive policies
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_preferences ENABLE ROW LEVEL SECURITY;

-- Permissive policy for anon key usage (adjust for production)
CREATE POLICY "Allow all for anon" ON voice_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON voice_turns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON voice_preferences FOR ALL USING (true) WITH CHECK (true);
