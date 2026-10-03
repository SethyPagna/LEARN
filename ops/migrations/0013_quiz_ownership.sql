PRAGMA foreign_keys = ON;

-- Quizzes were the only user-authored content type with no owner column.
-- That made `saveQuiz`'s `INSERT … ON CONFLICT (id) DO UPDATE` a write IDOR:
-- the update branch is not filtered by owner, so any caller who supplied an
-- existing quiz id rewrote that quiz's title, topic, description and questions.
--
-- NULL means "shared, editable by anyone" — it is what the seeded demo quizzes
-- get, and it is deliberately allowed through by `assertOwnership`. Only a quiz
-- with a non-NULL owner is protected, so the shared quiz bank stays usable.
ALTER TABLE quizzes ADD COLUMN created_by_user_id text REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quizzes_owner ON quizzes(created_by_user_id, archived_at);
