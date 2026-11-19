CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  subject     TEXT,
  due_date    DATE NOT NULL,
  due_time    TIME,
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE items ADD COLUMN IF NOT EXISTS created_by TEXT;

-- Kinds: homework | ulangan_harian | uts | uas  (older task/quiz/exam rows are converted)
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_kind_check;
UPDATE items SET kind = CASE kind WHEN 'task' THEN 'homework' WHEN 'quiz' THEN 'ulangan_harian' WHEN 'exam' THEN 'uts' ELSE kind END
  WHERE kind IN ('task', 'quiz', 'exam');
ALTER TABLE items ADD CONSTRAINT items_kind_check CHECK (kind IN ('homework', 'ulangan_harian', 'uts', 'uas'));

CREATE INDEX IF NOT EXISTS items_due_idx ON items (due_date) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS reminders_sent (
  item_id  INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  stage    TEXT NOT NULL,           -- '3d' | '1d' | '0d' (stage is tied to the due date it was sent for)
  due_date DATE NOT NULL,
  sent_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, stage, due_date)
);

CREATE TABLE IF NOT EXISTS chat_usage (
  day   DATE PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         SERIAL PRIMARY KEY,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_email TEXT;

CREATE TABLE IF NOT EXISTS timetable (
  id         SERIAL PRIMARY KEY,
  weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),  -- 1 = Monday ... 7 = Sunday
  start_time TIME NOT NULL,
  end_time   TIME,
  subject    TEXT NOT NULL,
  room       TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS timetable_day_idx ON timetable (weekday, start_time);

-- Timetable versions: each term has an effective date range; classes belong to one term.
CREATE TABLE IF NOT EXISTS timetable_terms (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
ALTER TABLE timetable ADD COLUMN IF NOT EXISTS term_id INTEGER REFERENCES timetable_terms(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS chat_usage_user (
  day           DATE NOT NULL,
  email         TEXT NOT NULL,
  messages      INTEGER NOT NULL DEFAULT 0,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, email)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL,
  extra JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_email_idx ON chat_messages (email, id);
