CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS objects (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  bucket TEXT NOT NULL,
  tick INTEGER NOT NULL,
  text TEXT NOT NULL,
  tags TEXT NOT NULL,
  strength REAL NOT NULL,
  last_recalled_tick INTEGER
);
CREATE INDEX IF NOT EXISTS memories_by_agent ON memories (agent_id, bucket);

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
