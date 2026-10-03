PRAGMA foreign_keys = ON;

-- Kahoot-style live quiz sessions.
--
-- `state_json` is the authoritative game state — the whole `LiveQuizSession`
-- produced by the pure reducer in `src/lib/live/quiz-session.ts`. The scalar
-- columns beside it (`phase`, `question_index`, `code`, `finished_at`) are
-- denormalised copies, and they exist for two reasons only: they are what the
-- listing and "find by join code" queries filter on without parsing JSON, and
-- they make a session's progress readable in a SQL console. Nothing derives
-- game state from them; the reducer is the only writer of both the JSON and
-- the copies, so they cannot drift.
--
-- `code` is UNIQUE, which is what makes join-code minting safe: the repository
-- retries a new code on collision, and the index is the arbiter rather than a
-- prior SELECT (which two concurrent hosts could both pass).
CREATE TABLE IF NOT EXISTS live_quiz_sessions (
  id text PRIMARY KEY,
  code text NOT NULL UNIQUE,
  quiz_id text NOT NULL,
  quiz_title text NOT NULL,
  host_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase text NOT NULL DEFAULT 'lobby',
  question_index integer NOT NULL DEFAULT 0,
  state_json text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  finished_at text
);

CREATE INDEX IF NOT EXISTS idx_live_quiz_sessions_code ON live_quiz_sessions(code);

-- Backs "my recent live quizzes" for the host.
CREATE INDEX IF NOT EXISTS idx_live_quiz_sessions_host ON live_quiz_sessions(host_user_id, created_at DESC);

-- Roster. `id` is derived from the player's user id, so a second device joining
-- the same code is the same participant rather than a duplicate name.
-- `user_id` is nullable on purpose: the roster is the product's record of who
-- played, and it must survive the account being deleted.
CREATE TABLE IF NOT EXISTS live_quiz_participants (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES live_quiz_sessions(id) ON DELETE CASCADE,
  user_id text,
  name text NOT NULL,
  score integer NOT NULL DEFAULT 0,
  joined_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_live_quiz_participants_session ON live_quiz_participants(session_id);

-- One row per participant per question; the unique index is the database-level
-- twin of the reducer's "one answer per participant per question" rule, so a
-- duplicated request cannot double-count even if two writes race.
CREATE TABLE IF NOT EXISTS live_quiz_answers (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES live_quiz_sessions(id) ON DELETE CASCADE,
  question_id text NOT NULL,
  participant_id text NOT NULL,
  choice_id text NOT NULL,
  correct integer NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  answered_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_live_quiz_answers_session ON live_quiz_answers(session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_live_quiz_answers_participant_question
  ON live_quiz_answers(participant_id, question_id);
