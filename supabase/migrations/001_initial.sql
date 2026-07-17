-- =======================================================
-- 鳥生獅子連 管理システム — 初期スキーマ
-- =======================================================

-- -------------------------------------------------------
-- users
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  user_id        SERIAL PRIMARY KEY,
  stored_name    TEXT NOT NULL,
  stored_hash    TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  status         TEXT NOT NULL DEFAULT 'hold',   -- 'hold' | 'active' | 'deleted'
  position       TEXT,
  phone          TEXT,
  prefecture     TEXT,
  city           TEXT,
  address_detail TEXT,
  birthday       DATE,
  sns_consent    TEXT DEFAULT 'no',              -- 'yes' | 'no'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- children
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS children (
  child_id   SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(user_id),
  child_name TEXT NOT NULL,
  birthday   DATE,
  role       TEXT NOT NULL DEFAULT 'child',
  status     TEXT NOT NULL DEFAULT 'hold',    -- 'hold' | 'active' | 'deleted'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- sessions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(user_id),
  role       TEXT NOT NULL,
  user_name  TEXT,
  children   JSONB DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-clean expired sessions (optional trigger)
-- Sessions older than expiry are ignored by the API anyway.

-- -------------------------------------------------------
-- events
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  event_id   SERIAL PRIMARY KEY,
  date       DATE NOT NULL,
  title      TEXT NOT NULL,
  type       TEXT,                    -- 'festival' | etc.
  time       TEXT,                    -- 'HH:MM' | '未定' | ''
  location   TEXT,
  comment    TEXT,
  deadline   TEXT,                    -- deadline label as text
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- practices
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS practices (
  practice_id SERIAL PRIMARY KEY,
  date        DATE NOT NULL,
  title       TEXT NOT NULL DEFAULT '練習',
  type        TEXT,
  start       TEXT,   -- 'HH:MM'
  "end"       TEXT,   -- 'HH:MM'
  location    TEXT,
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- answers_events
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS answers_events (
  id         SERIAL PRIMARY KEY,
  event_id   INTEGER NOT NULL REFERENCES events(event_id),
  user_id    INTEGER NOT NULL REFERENCES users(user_id),
  status     TEXT NOT NULL,   -- '参加' | '不参加'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, user_id)
);

-- -------------------------------------------------------
-- answers_practices
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS answers_practices (
  id          SERIAL PRIMARY KEY,
  practice_id INTEGER NOT NULL REFERENCES practices(practice_id),
  user_id     INTEGER NOT NULL REFERENCES users(user_id),
  status      TEXT NOT NULL,   -- '欠席' | '遅刻'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (practice_id, user_id)
);

-- -------------------------------------------------------
-- performances
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS performances (
  performance_id SERIAL PRIMARY KEY,
  event_id       INTEGER NOT NULL REFERENCES events(event_id),
  name           TEXT,
  "order"        TEXT,
  roles          JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- performance_roles  (master list of role names)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS performance_roles (
  id        SERIAL PRIMARY KEY,
  role_name TEXT NOT NULL UNIQUE
);

-- Seed default roles
INSERT INTO performance_roles (role_name) VALUES
  ('天狗'), ('ひょっとこ'), ('きつね'), ('三番叟'), ('練る')
ON CONFLICT DO NOTHING;

-- -------------------------------------------------------
-- otabi_places
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS otabi_places (
  place_id   SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT,
  tel        TEXT,
  "group"    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- otabi_schedules
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS otabi_schedules (
  entry_id    SERIAL PRIMARY KEY,
  year        TEXT NOT NULL,
  "group"     TEXT NOT NULL,   -- '上組' | '下組' | '合同'
  day         TEXT NOT NULL DEFAULT '土曜',
  no          TEXT,            -- display order number
  no_ue       TEXT,            -- order number for 上組 (joint entry)
  no_shita    TEXT,            -- order number for 下組 (joint entry)
  time        TEXT,            -- 'HH:MM'
  place_id    INTEGER REFERENCES otabi_places(place_id),
  place_name  TEXT,
  memo        TEXT,
  donation    INTEGER NOT NULL DEFAULT 0,
  actual_time TEXT,            -- 'HH:MM' when completed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- memos  (ししまる気づきメモ)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS memos (
  memo_id    BIGINT PRIMARY KEY,   -- Date.now() as ID
  user_id    INTEGER NOT NULL REFERENCES users(user_id),
  user_name  TEXT,
  text       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- member_gear
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS member_gear (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL UNIQUE REFERENCES users(user_id),
  happi_no     TEXT,
  tshirt_size  TEXT,
  tekkou       TEXT,
  hakama       TEXT,
  kimono_top   TEXT,
  kimono_bottom TEXT,
  memo         TEXT
);

-- -------------------------------------------------------
-- child_gear
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS child_gear (
  id            SERIAL PRIMARY KEY,
  child_id      INTEGER NOT NULL UNIQUE REFERENCES children(child_id),
  kimono_top    TEXT,
  kimono_bottom TEXT
);

-- -------------------------------------------------------
-- gear_spare  (undistributed stock)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS gear_spare (
  id        SERIAL PRIMARY KEY,
  item_type TEXT NOT NULL,    -- 'Tシャツ' | '手甲'
  value     TEXT NOT NULL,
  quantity  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (item_type, value)
);

-- -------------------------------------------------------
-- Indexes
-- -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_events_date          ON events(date);
CREATE INDEX IF NOT EXISTS idx_practices_date       ON practices(date);
CREATE INDEX IF NOT EXISTS idx_answers_events_uid   ON answers_events(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_events_eid   ON answers_events(event_id);
CREATE INDEX IF NOT EXISTS idx_answers_pracs_uid    ON answers_practices(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_pracs_pid    ON answers_practices(practice_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires     ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_otabi_sched_year_grp ON otabi_schedules(year, "group");

-- -------------------------------------------------------
-- settings  (アプリ設定 key-value)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id         SERIAL PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------
-- game_scores  (ゲームランキング)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_scores (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL UNIQUE,
  user_name  TEXT NOT NULL,
  score      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- -------------------------------------------------------
-- password_reset_requests  (パスワード再発行申請)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  user_name  TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'done'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pwreset_status ON password_reset_requests(status);

-- -------------------------------------------------------
-- push_subscriptions  (Web Push 購読情報)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER,
  endpoint     TEXT NOT NULL UNIQUE,
  subscription JSONB NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- -------------------------------------------------------
-- sessions.impersonated_by  (システム管理者のなりすましログイン)
-- -------------------------------------------------------
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS impersonated_by TEXT;

-- -------------------------------------------------------
-- performances: add fields collected by the event form
-- -------------------------------------------------------
ALTER TABLE performances ADD COLUMN IF NOT EXISTS time_from TEXT;
ALTER TABLE performances ADD COLUMN IF NOT EXISTS time_to TEXT;
ALTER TABLE performances ADD COLUMN IF NOT EXISTS taiko_dai TEXT;
ALTER TABLE performances ADD COLUMN IF NOT EXISTS taiko_ko TEXT;

-- -------------------------------------------------------
-- users: emergency contact fields
-- -------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_relation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
