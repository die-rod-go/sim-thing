CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

-- Placed objects became entities; saves from before them are refused and need `make reset`.
DROP TABLE IF EXISTS objects;

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL,
  label TEXT,
  location TEXT NOT NULL,
  changes TEXT NOT NULL
);

-- The memory store became one record per agent; saves from before it need `make reset`.
DROP TABLE IF EXISTS memories;

CREATE TABLE IF NOT EXISTS agent_memories (
  agent_id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  tick INTEGER NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT,
  place TEXT NOT NULL,
  text TEXT NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_by_tick ON events (tick);

CREATE TABLE IF NOT EXISTS llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  tick INTEGER NOT NULL,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  reply TEXT NOT NULL,
  parsed TEXT,
  prompt_tokens INTEGER NOT NULL,
  completion_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  latency_ms INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS llm_calls_by_agent ON llm_calls (agent_id, id);

CREATE TABLE IF NOT EXISTS token_usage (
  day TEXT PRIMARY KEY,
  tokens INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS personality_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  tick INTEGER NOT NULL,
  field TEXT NOT NULL,
  old_value TEXT NOT NULL,
  new_value TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moments (
  id INTEGER PRIMARY KEY,
  tick INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data TEXT NOT NULL
);
