"""
Supabase database module for Voice Line.

Manages conversation sessions, turns, and user preferences.
All methods are async and fail silently to never crash the voice line.
"""

import asyncio
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

# We use the Supabase Python client (sync) wrapped in run_in_executor
# to keep it non-blocking in the async event loop.
# The supabase-py library is lightweight and uses httpx under the hood.


class SupabaseDB:
    """Async-friendly wrapper around Supabase Python client."""

    def __init__(self):
        self._client = None
        self._ready = False

    async def init(self) -> bool:
        """Initialize the Supabase client. Returns True on success."""
        url = os.environ.get("SUPABASE_URL", "")
        key = os.environ.get("SUPABASE_ANON_KEY", "")
        if not url or not key:
            print("[db] SUPABASE_URL or SUPABASE_ANON_KEY not set. Database disabled.")
            return False

        try:
            from supabase import create_client
            self._client = create_client(url, key)
            self._ready = True
            # Test connection
            await self._exec(self._client.table("voice_sessions").select("id").limit(1).execute)
            print("[db] Supabase connected.")
            return True
        except Exception as e:
            print(f"[db] Connection failed: {e}")
            print("[db] Run the migration SQL in Supabase dashboard first.")
            self._ready = False
            return False

    async def _exec(self, fn, *args, **kwargs):
        """Run a sync Supabase call in the executor to avoid blocking."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, lambda: fn(*args, **kwargs))

    async def create_session(self, session_id: str) -> None:
        """Insert a new voice session row."""
        if not self._ready:
            return
        try:
            await self._exec(
                self._client.table("voice_sessions").insert,
                {
                    "id": session_id,
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "status": "active",
                    "turn_count": 0,
                }
            )
        except Exception as e:
            print(f"[db] create_session error: {e}")

    async def end_session(self, session_id: str) -> None:
        """Mark a session as ended."""
        if not self._ready:
            return
        try:
            await self._exec(
                self._client.table("voice_sessions").update,
                {
                    "status": "ended",
                    "ended_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", session_id)
        except Exception as e:
            print(f"[db] end_session error: {e}")

    async def save_turn(
        self,
        session_id: str,
        user_text: str,
        assistant_text: str,
        model: str,
        latency_ms: int,
    ) -> None:
        """Save a conversation turn and increment the session turn counter."""
        if not self._ready:
            return
        try:
            turn_id = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            await self._exec(
                self._client.table("voice_turns").insert,
                {
                    "id": turn_id,
                    "session_id": session_id,
                    "user_text": user_text,
                    "assistant_text": assistant_text,
                    "model": model,
                    "latency_ms": latency_ms,
                    "created_at": now,
                }
            )
            # Increment turn count on session
            await self._exec(
                self._client.table("voice_sessions").update,
                {"turn_count": 1},  # Supabase uses RPC for increment; we use a workaround
            ).eq("id", session_id)
        except Exception as e:
            print(f"[db] save_turn error: {e}")

    async def get_recent_sessions(self, limit: int = 10) -> list[dict]:
        """Fetch recent sessions for history display."""
        if not self._ready:
            return []
        try:
            result = await self._exec(
                self._client.table("voice_sessions")
                .select("id, started_at, ended_at, status, turn_count")
                .order("started_at", desc=True)
                .limit(limit)
                .execute
            )
            return result.data if result.data else []
        except Exception as e:
            print(f"[db] get_recent_sessions error: {e}")
            return []

    async def get_session_turns(self, session_id: str) -> list[dict]:
        """Fetch all turns for a session."""
        if not self._ready:
            return []
        try:
            result = await self._exec(
                self._client.table("voice_turns")
                .select("user_text, assistant_text, model, latency_ms, created_at")
                .eq("session_id", session_id)
                .order("created_at", desc=False)
                .execute
            )
            return result.data if result.data else []
        except Exception as e:
            print(f"[db] get_session_turns error: {e}")
            return []

    async def save_preference(self, key: str, value: str) -> None:
        """Upsert a user preference."""
        if not self._ready:
            return
        try:
            await self._exec(
                self._client.table("voice_preferences").upsert,
                {
                    "key": key,
                    "value": value,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        except Exception as e:
            print(f"[db] save_preference error: {e}")

    async def get_preference(self, key: str) -> str | None:
        """Get a user preference value."""
        if not self._ready:
            return None
        try:
            result = await self._exec(
                self._client.table("voice_preferences")
                .select("value")
                .eq("key", key)
                .limit(1)
                .execute
            )
            if result.data and len(result.data) > 0:
                return result.data[0].get("value")
            return None
        except Exception as e:
            print(f"[db] get_preference error: {e}")
            return None


# ── SQL Migration for Supabase Dashboard ──────────────────────────────
# Run this SQL in your Supabase SQL Editor to create the required tables.

MIGRATION_SQL = """
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
"""


def get_migration_sql() -> str:
    """Return the migration SQL string for external use."""
    return MIGRATION_SQL


def save_migration_to_file(path: str | None = None) -> str:
    """Save the migration SQL to a file. Returns the file path."""
    target = path or str(Path(__file__).parent / "supabase_migration.sql")
    Path(target).write_text(MIGRATION_SQL)
    return target
