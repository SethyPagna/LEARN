# LEARN Relational Schema And Workflow Final Phase 6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current LEARN data model into a cleaner, faster, collaboration-ready relational schema while merging the existing product maturity plans into one detailed implementation track for schema, UI organization, workflows, and verification.

**Architecture:** Keep the Cloudflare-first runtime: Next.js App Router, TypeScript, Cloudflare Workers, D1, R2, Durable Objects, and encrypted AI provider routing. Normalize the core relational model around users, workspaces, content items, practice/review, sharing, permissions, realtime snapshots, and audit events, while leaving heavy editor payloads in JSON columns only where that is the right storage boundary.

**Tech Stack:** TypeScript, React, Next.js, Cloudflare D1, Cloudflare R2, Cloudflare Durable Objects, Tiptap, Univer, PptxGenJS, Radix UI, TanStack Virtual, dnd-kit, React Resizable Panels, localStorage drafts as the current offline layer, optional future Yjs/Automerge after schema preparation.

---

## Sweep Evidence

### Verification Pass 1: Filesystem And Feature Inventory

- Reviewed repo directories with `rg --files`, root directory scan, and migration listing.
- Key directories scanned:
  - `app/api/**`: public API payloads and route guards.
  - `components/learn/views/**`: UI flows for dashboard, Studio, practice, social, settings, admin, files, AI.
  - `lib/**`: schema, query layer, data access, learning/review logic, social helpers, storage, drafts, navigation, AI providers.
  - `migrations/**`: D1 relational schema.
  - `workers/realtime.js`: Durable Object WebSocket snapshot/event model.
  - `tests/**`: current behavior coverage and accepted contracts.

### Verification Pass 2: D1 Migration Schema

- Current D1 migrations define 47 tables:
  - Identity: `users`, `user_sessions`, `workspaces`, `workspace_members`, `workspace_invites`.
  - Studio/content: `notes`, `note_blocks`, `note_versions`, `tags`, `note_tags`, `editor_documents`, `sheet_documents`, `slide_decks`, `media_assets`.
  - Practice/review: `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_attempt_answers`, `game_attempts`, `review_items`, `review_logs`, `learning_goals`.
  - Learning graph/feed: `knowledge_nodes`, `knowledge_edges`, `micro_lessons`, `feed_interactions`, `achievements`, `user_achievements`.
  - Social/realtime metadata: `learning_spaces`, `learning_space_members`, `workspace_groups`, `group_members`, `chat_threads`, `chat_messages`, `study_rooms`, `study_battles`, `social_actions`, `moderation_items`.
  - Operations/security: `ai_provider_configs`, `ai_chats`, `ai_messages`, `ai_response_logs`, `automation_jobs`, `automation_runs`, `rate_limit_buckets`, `audit_logs`.

### Verification Pass 3: Query And API Cross-Check

- `lib/data.ts` is the primary data access module and references all core tables listed above.
- Automated table-reference scan found no real application table missing from migrations; false positives came from SQL text in tests/comments (`SET`, `recent`, `returns`).
- Important mismatches and risks:
  - `lib/schema.ts` embeds only the base schema string, while migrations contain later additive tables. The app relies on applied migrations in Cloudflare rather than `ensureDatabase()` creating all tables locally.
  - Notes have `note_versions`; docs/sheets/slides do not yet have equivalent version tables.
  - Sharing is currently polymorphic through `social_actions(target_type, target_id)` but lacks a first-class `shared_access` permission table.
  - Friends/follows are represented indirectly through spaces/groups/memberships, not explicit social graph tables.
  - Realtime Durable Object events are stored in DO storage only, with D1 `study_rooms` / `study_battles` as metadata snapshots.

### Verification Pass 4: Client Types, Caches, And Offline State

- `components/learn/types.ts` already defines richer contracts than the database for Studio panes, draft status, sheet metadata, slide objects, AI insert targets, review items, and social records.
- Offline/draft state is localStorage-based:
  - `lib/studio-drafts.ts`: one local draft per `StudioKind`.
  - `lib/practice-drafts.ts`: local quiz/practice draft store keyed by quiz id.
  - AI Tutor and Social views also keep local drafts in browser storage.
- No CRDT/Yjs sync is implemented yet. Current collaboration is route/API CRUD plus Durable Object events.

### Verification Pass 5: Security, Media, And Runtime

- `lib/api.ts` blocks cross-origin mutations and requires signed-in users for protected APIs.
- `lib/rate-limit.ts` uses D1 `rate_limit_buckets` when configured, then falls back to memory.
- `lib/storage.ts` stores R2 keys under `apps/learn/workspaces/.../users/...`, and `lib/file-security.ts` blocks common executable extensions/signatures while preserving image/video/audio/PDF/Office/CSV/text uploads.
- `workers/realtime.js` accepts JSON messages with a `type` and persists recent events in Durable Object storage, but message schemas are intentionally loose today.

---

## Current Data Flow Map

### Note Creation To Review To Practice

1. User creates a note through `/api/notes` or `/api/notes/[id]`.
2. `saveNote()` stores the row in `notes` and appends a snapshot to `note_versions`.
3. `note_blocks` can store structured blocks through `/api/vault/blocks`.
4. AI/practice can create review cards through `/api/reviews`, stored in `review_items` with source type `practice_mistake` or block-like sources.
5. Review completion writes `review_logs`, updates `review_items`, increments user XP/streak values.
6. Quiz attempts write `quiz_attempts` and `quiz_attempt_answers`; missed items can become review cards.

### Sharing And Social Flow

1. Current public/private state lives on content-ish records:
   - `users.profile_visibility`
   - `knowledge_nodes.visibility`
   - `micro_lessons.visibility`
   - `learning_spaces.visibility`
2. Social reactions/comments use `social_actions` with polymorphic `target_type` and `target_id`.
3. Chat is in `chat_threads` and `chat_messages`.
4. Groups and spaces are separate:
   - `workspace_groups` / `group_members`
   - `learning_spaces` / `learning_space_members`
5. There is no universal permission table for notes/docs/sheets/slides/files/lessons/decks yet.

### Realtime And Collaboration Flow

1. `study_rooms` and `study_battles` keep D1 metadata and persisted list views.
2. Durable Objects keep live WebSocket connections, presence count, and a recent event log.
3. Realtime events are not yet projected into D1 audit/history tables.
4. Editor collaboration is not yet CRDT-based; local drafts are localStorage-only.

### Content And Media Flow

1. R2 stores actual file bytes.
2. D1 `media_assets` stores metadata and ownership.
3. Files can be listed/downloaded/deleted if owned by the user or the user is admin.
4. Media is not yet attached through a generic `content_attachments` join table; `media_assets.note_id` is note-specific.

---

## Optimized Relational Schema Target

### Principle 1: Keep One Canonical Content Registry

Add a `content_items` table that indexes all user-created and shareable learning artifacts without forcing every editor surface into one payload table.

```sql
CREATE TABLE IF NOT EXISTS content_items (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN (
    'note', 'doc', 'sheet', 'slide_deck', 'media', 'micro_lesson',
    'quiz', 'review_item', 'knowledge_node'
  )),
  source_table text NOT NULL,
  source_id text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  visibility text NOT NULL DEFAULT 'private',
  archived_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_table, source_id)
);

CREATE INDEX IF NOT EXISTS idx_content_items_workspace_recent
  ON content_items(workspace_id, archived_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_owner_type_recent
  ON content_items(owner_user_id, item_type, archived_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_items_visibility_recent
  ON content_items(visibility, updated_at DESC);
```

Why:
- Gives Dashboard, Feed, Search, Files, Studio, and Social one fast route to recent artifacts.
- Avoids brittle polymorphic joins everywhere.
- Keeps specialized payloads in `notes`, `editor_documents`, `sheet_documents`, `slide_decks`, `media_assets`, and `micro_lessons`.

### Principle 2: Add Universal Sharing And Permissions

```sql
CREATE TABLE IF NOT EXISTS shared_access (
  id text PRIMARY KEY,
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  grantee_type text NOT NULL CHECK (grantee_type IN ('user', 'group', 'space', 'public_link')),
  grantee_id text,
  role text NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor', 'owner')),
  created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  expires_at text,
  created_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (content_item_id, grantee_type, grantee_id, role)
);

CREATE INDEX IF NOT EXISTS idx_shared_access_grantee
  ON shared_access(grantee_type, grantee_id, role);

CREATE INDEX IF NOT EXISTS idx_shared_access_content
  ON shared_access(content_item_id, role);
```

Why:
- Supports notes/docs/sheets/slides/media/quizzes/lessons uniformly.
- Keeps privacy defaults private while allowing opt-in sharing.
- Makes friend/group searches and collaborator checks queryable without parsing JSON.

### Principle 3: Normalize Social Graph Separately From Groups

```sql
CREATE TABLE IF NOT EXISTS user_connections (
  requester_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_type text NOT NULL CHECK (connection_type IN ('follow', 'friend')),
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (requester_user_id, target_user_id, connection_type)
);

CREATE INDEX IF NOT EXISTS idx_user_connections_target
  ON user_connections(target_user_id, connection_type, status);
```

Why:
- Groups/spaces are collaboration containers; follows/friends are identity relationships.
- Personalized feed, friend search, and public profile visibility need direct graph edges.

### Principle 4: Add Versioning For Every Studio Kind

```sql
CREATE TABLE IF NOT EXISTS content_versions (
  id text PRIMARY KEY,
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_id text NOT NULL,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  version_number integer NOT NULL,
  title text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  plain_text text NOT NULL DEFAULT '',
  change_summary text NOT NULL DEFAULT '',
  created_at text NOT NULL DEFAULT (datetime('now')),
  UNIQUE (content_item_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_content_versions_item
  ON content_versions(content_item_id, version_number DESC);
```

Why:
- Generalizes `note_versions` to docs, sheets, slides, and future content without duplicating tables.
- Lets UI show History consistently in Studio inspector.

### Principle 5: Split Collaboration Logs From Core Content

```sql
CREATE TABLE IF NOT EXISTS collaboration_sessions (
  id text PRIMARY KEY,
  content_item_id text REFERENCES content_items(id) ON DELETE CASCADE,
  room_id text REFERENCES study_rooms(id) ON DELETE SET NULL,
  battle_id text REFERENCES study_battles(id) ON DELETE SET NULL,
  session_type text NOT NULL CHECK (session_type IN ('editor', 'room', 'battle', 'presence')),
  status text NOT NULL DEFAULT 'active',
  started_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  started_at text NOT NULL DEFAULT (datetime('now')),
  ended_at text
);

CREATE TABLE IF NOT EXISTS collaboration_events (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  durable_object_key text,
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_collaboration_events_session
  ON collaboration_events(session_id, created_at DESC);
```

Why:
- Durable Objects stay fast for realtime.
- D1 gets durable replay/audit snapshots without stuffing event streams into core content tables.

### Principle 6: Normalize Review Sources Without Losing Flexibility

Keep `review_items(source_type, source_id)` for compatibility, but add a nullable `content_item_id`.

```sql
ALTER TABLE review_items ADD COLUMN content_item_id text REFERENCES content_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_review_items_content_due ON review_items(content_item_id, due_at);
CREATE INDEX IF NOT EXISTS idx_review_items_source ON review_items(user_id, source_type, source_id);
```

Why:
- Review cards can point to blocks, notes, docs, sheets, slides, quiz misses, lessons, and media-derived facts.
- Existing unique constraint remains useful while new content registry powers joins/search.

### Principle 7: Make Attachments Generic

```sql
CREATE TABLE IF NOT EXISTS content_attachments (
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  media_asset_id text NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  attachment_role text NOT NULL DEFAULT 'source',
  sort_order integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (content_item_id, media_asset_id, attachment_role)
);

CREATE INDEX IF NOT EXISTS idx_content_attachments_media
  ON content_attachments(media_asset_id, created_at DESC);
```

Why:
- Replaces note-only attachment assumptions.
- Supports slide images, doc uploads, sheet imports, AI source files, feed media, and generated lessons.

### Principle 8: Add Search And Feed Index Tables

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS content_search USING fts5(
  content_item_id UNINDEXED,
  title,
  summary,
  plain_text,
  tags
);

CREATE TABLE IF NOT EXISTS feed_rank_cache (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  rank_score real NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT 'preferred',
  expires_at text NOT NULL,
  created_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, content_item_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_rank_cache_user_score
  ON feed_rank_cache(user_id, expires_at, rank_score DESC);
```

Why:
- Search across personal and friend/shared notes needs a dedicated index.
- Feed selection should not repeatedly scan and rank all lessons/content on every request.

---

## Recommendations By Domain

### Users And Profiles

- Keep `users` for auth/profile basics.
- Add `user_connections` for follows/friends; do not overload `workspace_members`.
- Move public profile artifacts through `content_items` + `shared_access`.
- Index:
  - `users(username)`
  - `users(profile_visibility, updated_at)`
  - `user_connections(requester_user_id, status)`
  - `user_connections(target_user_id, status)`

### Notes, Docs, Sheets, Slides

- Keep existing specialized tables for payload ownership:
  - `notes`: simple note compatibility and legacy note route.
  - `editor_documents`: docs and future rich text documents.
  - `sheet_documents`: cells/history JSON and future metadata.
  - `slide_decks`: slides/speaker notes JSON.
- Add `content_items` mirror rows for every record.
- Replace note-only version thinking with `content_versions`.
- Add `content_attachments` for all media references.
- Add a `content_item_tags` join later if tags need to be shared across all item types.

### Decks / Collections / Review

- Current `review_items` is the scheduler; current `quizzes` are assessment banks.
- Add a true collection layer:

```sql
CREATE TABLE IF NOT EXISTS study_collections (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  collection_type text NOT NULL CHECK (collection_type IN ('deck', 'folder', 'course', 'review_set')),
  visibility text NOT NULL DEFAULT 'private',
  created_at text NOT NULL DEFAULT (datetime('now')),
  updated_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS study_collection_items (
  collection_id text NOT NULL REFERENCES study_collections(id) ON DELETE CASCADE,
  content_item_id text NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at text NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (collection_id, content_item_id)
);
```

- This gives decks/folders/courses a single model without merging all content payloads.

### Practice Sessions And Performance

- Current state:
  - `quiz_attempts` / `quiz_attempt_answers`
  - `game_attempts`
  - `review_logs`
- Add a unifying `practice_sessions` table:

```sql
CREATE TABLE IF NOT EXISTS practice_sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  session_type text NOT NULL CHECK (session_type IN ('quiz', 'exam', 'flashcards', 'matching', 'sprint', 'review', 'battle')),
  source_content_item_id text REFERENCES content_items(id) ON DELETE SET NULL,
  started_at text NOT NULL DEFAULT (datetime('now')),
  ended_at text,
  duration_seconds integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS practice_session_items (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,
  question_id text,
  review_item_id text REFERENCES review_items(id) ON DELETE SET NULL,
  content_item_id text REFERENCES content_items(id) ON DELETE SET NULL,
  prompt text NOT NULL DEFAULT '',
  answer text NOT NULL DEFAULT '',
  user_answer text NOT NULL DEFAULT '',
  correct integer NOT NULL DEFAULT 0,
  elapsed_ms integer NOT NULL DEFAULT 0,
  metadata text NOT NULL DEFAULT '{}',
  created_at text NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user_recent
  ON practice_sessions(user_id, started_at DESC);
```

- Keep legacy tables until UI/API migration is complete; write both during transition.

### Social, Sharing, Friends, Groups

- Keep:
  - `learning_spaces` for learning circles.
  - `workspace_groups` for workspace-internal groups.
  - `chat_threads` and `chat_messages` for async communication.
  - `social_actions` for comments/reactions.
- Add:
  - `user_connections` for follows/friends.
  - `shared_access` for permissions.
  - `content_items` for shareable targets.
- Tighten polymorphic actions with a check-style contract in code:
  - Valid target types: `content_item`, `learning_space`, `chat_message`, `micro_lesson`, `profile`, `study_battle`.
  - Store legacy target table/id in metadata only when needed.

### Realtime And Offline

- Durable Objects remain source of truth for live presence and transient messages.
- D1 should receive periodic compact snapshots:
  - `collaboration_sessions`
  - `collaboration_events`
- Offline-first editor path:
  - Phase A: keep localStorage drafts, add server-side `content_versions`.
  - Phase B: add `client_mutations` queue table.
  - Phase C: introduce Yjs/Automerge for docs/slides only after the D1 item registry and permissions are complete.

```sql
CREATE TABLE IF NOT EXISTS client_mutations (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_item_id text REFERENCES content_items(id) ON DELETE CASCADE,
  mutation_type text NOT NULL,
  payload text NOT NULL DEFAULT '{}',
  client_created_at text NOT NULL,
  server_received_at text NOT NULL DEFAULT (datetime('now')),
  applied_at text,
  status text NOT NULL DEFAULT 'pending'
);
```

---

## UI And Workflow Merge Targets

These targets merge the earlier product maturity, navigation, Studio, AI Tutor, practice, and design-system plans into one schema-aware workflow.

### Navigation And Page Organization

- [ ] Keep fewer than 9 primary sidebar destinations.
- [ ] Keep aliases stable:
  - `/notes`, `/docs`, `/sheets`, `/slides` open Studio tabs.
  - `/quizzes`, `/games` open Practice tabs.
  - `/chat`, `/spaces`, `/rooms`, `/battles` open Social tabs.
  - `/vault`, `/feed`, `/graph`, `/progress`, `/reviews` resolve into Learn/Dashboard/Reviews surfaces.
- [ ] Move dense subfeatures into:
  - collapsible groups,
  - `i` info hover panels,
  - `...` action menus,
  - inspector tabs,
  - command palettes.
- [ ] Do not delete functions; hide advanced functions behind grouped menus when they crowd the first viewport.

### Studio UX

- [ ] Continue splitting `components/learn/views/studio-view.tsx` into:
  - `components/learn/studio/studio-shell.tsx`
  - `components/learn/studio/studio-command-bar.tsx`
  - `components/learn/studio/studio-explorer.tsx`
  - `components/learn/studio/studio-pane.tsx`
  - `components/learn/studio/studio-inspector.tsx`
  - `components/learn/studio/rich-text-editor.tsx`
  - `components/learn/studio/sheet-editor.tsx`
  - `components/learn/studio/slide-editor.tsx`
  - `components/learn/studio/context-menu.tsx`
  - `components/learn/studio/template-picker.tsx`
- [ ] Replace text-heavy panels with compact:
  - document title,
  - save state chip,
  - Format / Insert / Data / Design / Review / Export menus,
  - `...` item actions,
  - right inspector tabs.
- [ ] Connect all archive/restore/history actions to `content_items`, `content_versions`, and specialized records after the migration.

### AI Tutor And Import Gateway

- [ ] Keep the current compact top command row: Task, Filters, Gateway.
- [ ] Make filter changes visible in prompt preview and persisted in AI draft state.
- [ ] Make insert-back targets rely on `content_items` so AI can target note/doc/sheet/slide/quiz/review without fragile per-route logic.
- [ ] Add import preview rows that map to:
  - `content_items`,
  - specialized payload table,
  - optional `content_attachments`,
  - optional `practice_sessions` or `review_items`.

### Practice And Reviews

- [ ] Write practice attempts to `practice_sessions` while keeping legacy `quiz_attempts` during transition.
- [ ] Convert missed session items into `review_items(content_item_id, source_type, source_id)`.
- [ ] Add query indexes for:
  - due reviews,
  - weak topics,
  - recent sessions,
  - retry missed.

### Social And Feed

- [ ] Use `user_connections` for friend/follow state.
- [ ] Use `shared_access` for item-level access.
- [ ] Use `feed_rank_cache` to avoid repeated heavy ranking.
- [ ] Use `content_search` for personal, shared, and friend-note search.
- [ ] Keep social pages visually clean:
  - Chat, Spaces, Rooms, Battles as tabs.
  - Filters collapsed into one menu.
  - Actions collapsed into `...`.
  - Sharing/permissions in a right-side inspector or modal.

---

## Implementation Tasks

### Task 1: Schema Snapshot And Tests

**Files:**
- Create: `tests/schema-contract.test.ts`
- Modify: `docs/superpowers/plans/2026-05-18-learn-relational-schema-and-workflow-final-phase-6.md`

- [x] Add a test that parses `migrations/*.sql` and asserts required current tables exist.
- [x] Include required tables:
  - `users`
  - `notes`
  - `editor_documents`
  - `sheet_documents`
  - `slide_decks`
  - `review_items`
  - `learning_spaces`
  - `study_rooms`
  - `study_battles`
  - `social_actions`
  - `media_assets`
- [x] Run `corepack pnpm test`.
- [x] Commit: `Add schema contract coverage`.

### Task 2: Content Registry Migration

**Files:**
- Create: `migrations/0006_content_registry_permissions.sql`
- Modify: `lib/data.ts`
- Test: `tests/schema-contract.test.ts`

- [x] Add `content_items`, `shared_access`, `content_versions`, `content_attachments`, and indexes.
- [x] Add helper functions in `lib/data.ts`:
  - `upsertContentItemForSource(input)`
  - `archiveContentItemForSource(sourceTable, sourceId)`
  - `appendContentVersion(input)`
- [x] Update note/doc/sheet/slide/media/micro-lesson save paths to upsert content registry rows.
- [x] Keep existing specialized tables and route payloads stable.
- [x] Run `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm build`.
- [x] Commit migration and helpers separately.

### Task 3: Social Graph And Sharing Layer

**Files:**
- Create: `migrations/0007_social_graph_permissions.sql`
- Create: `lib/sharing.ts`
- Create: `tests/sharing.test.ts`
- Modify: `app/api/social/actions/route.ts`
- Modify: `lib/data.ts`

- [x] Add `user_connections` and helper tests for follow/friend/block state.
- [x] Add permission resolver:
  - owner always has `owner`.
  - admin has `owner`.
  - `shared_access` grants viewer/commenter/editor.
  - public content grants viewer.
- [x] Update social action validation to accept only known target types.
- [x] Add indexes for friend search and shared-content listing.
- [x] Commit sharing helpers and route validation separately.

### Task 4: Practice Session Unification

**Files:**
- Create: `migrations/0008_practice_sessions.sql`
- Create: `lib/practice-sessions.ts`
- Create: `tests/practice-sessions.test.ts`
- Modify: `lib/data.ts`
- Modify: `app/api/quizzes/attempts/route.ts`
- Modify: `app/api/games/route.ts`

- [x] Add `practice_sessions` and `practice_session_items`.
- [x] Write a session row when a quiz attempt is recorded.
- [x] Keep writing legacy `quiz_attempts` and `quiz_attempt_answers` until UI migration is complete.
- [x] Add helper to convert missed `practice_session_items` into `review_items`.
- [x] Add indexes for recent sessions and topic performance.
- [x] Commit migration, helpers, and API wiring separately.

### Task 5: Collaboration Event Projection

**Files:**
- Create: `migrations/0009_collaboration_events.sql`
- Create: `lib/collaboration-events.ts`
- Create: `tests/collaboration-events.test.ts`
- Modify: `workers/realtime.js`
- Modify: `app/api/realtime/[kind]/[id]/route.ts`

- [ ] Add `collaboration_sessions`, `collaboration_events`, and `client_mutations`.
- [ ] Keep Durable Object storage for live events.
- [ ] Add a compact event schema:
  - `presence`
  - `pomodoro`
  - `battle-answer`
  - `editor-change`
  - `snapshot`
- [ ] Reject invalid realtime messages before broadcast.
- [ ] Persist snapshots or validated events to D1 only when useful, not every heartbeat.
- [ ] Commit migration and realtime validation separately.

### Task 6: Search, Feed, And Read Performance

**Files:**
- Create: `migrations/0010_search_feed_cache.sql`
- Create: `lib/content-search.ts`
- Create: `lib/feed-cache.ts`
- Create: `tests/content-search.test.ts`
- Modify: `lib/data.ts`

- [ ] Add `content_search` FTS table if D1 FTS support is enabled for the environment.
- [ ] Add fallback search query over `content_items(title, summary)` if FTS is unavailable.
- [ ] Add `feed_rank_cache` with expiry.
- [ ] Update feed selection to use cache first, then recompute.
- [ ] Add tests for friend/shared search visibility and mandatory serendipity.
- [ ] Commit search and feed-cache changes separately.

### Task 7: UI Workflow Declutter Bound To Schema

**Files:**
- Modify: `components/learn/app-nav.tsx`
- Modify: `components/learn/views/studio-view.tsx`
- Modify: `components/learn/views/ai-view.tsx`
- Modify: `components/learn/views/combined-workspace-views.tsx`
- Modify: `components/learn/views/ecosystem-views.tsx`
- Modify: `components/learn/views/dashboard-view.tsx`
- Test: existing UI helper tests plus browser smoke.

- [ ] Replace long visible explanations with `InfoMenu` / `i` icon panels.
- [ ] Move secondary functions into `...` menus:
  - share,
  - permissions,
  - export,
  - history,
  - duplicate,
  - restore,
  - delete forever.
- [ ] Keep primary actions visible:
  - Start / Save / Create / Run / Upload / Review.
- [ ] Add per-page collapsible groups:
  - Studio: Explorer, Editor, Inspector.
  - AI: Task, Filters, Gateway, Result, Import.
  - Practice: Mode, Timer, Questions, Results.
  - Social: Chat, Spaces, Rooms, Battles.
  - Dashboard/Learn: Today, Reviews, Calendar, Progress.
- [ ] Browser-test desktop/mobile for no horizontal overflow.
- [ ] Commit each page cleanup separately.

### Task 8: Migration Backfill And Compatibility

**Files:**
- Create: `scripts/backfill-content-items.mjs`
- Create: `docs/schema-migration-runbook.md`
- Modify: `.github/workflows/*` if migration checks need expansion.

- [ ] Backfill `content_items` from:
  - `notes`
  - `editor_documents`
  - `sheet_documents`
  - `slide_decks`
  - `media_assets`
  - `micro_lessons`
  - `quizzes`
  - `review_items`
  - `knowledge_nodes`
- [ ] Backfill `content_versions` from `note_versions` and current docs/sheets/slides payloads.
- [ ] Backfill `content_attachments` from `media_assets.note_id`.
- [ ] Add rollback notes: new tables can be ignored by old code; do not drop legacy columns until a later release.
- [ ] Run D1 migration dry/local/remote checks before deploy.
- [ ] Commit runbook and scripts separately.

---

## Indexing Plan

### Immediate Indexes

- `content_items(workspace_id, archived_at, updated_at DESC)`
- `content_items(owner_user_id, item_type, archived_at, updated_at DESC)`
- `shared_access(grantee_type, grantee_id, role)`
- `content_versions(content_item_id, version_number DESC)`
- `practice_sessions(user_id, started_at DESC)`
- `practice_session_items(session_id, created_at)`
- `user_connections(requester_user_id, connection_type, status)`
- `user_connections(target_user_id, connection_type, status)`
- `content_attachments(media_asset_id, created_at DESC)`

### Query Patterns To Optimize

- Dashboard recent work:
  - `content_items WHERE owner_user_id = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT ?`
- Shared/friend notes:
  - `shared_access JOIN content_items`
  - `user_connections JOIN shared_access JOIN content_items`
- Review scheduling:
  - `review_items WHERE user_id = ? AND due_at <= ? ORDER BY due_at ASC`
- Feed:
  - `feed_rank_cache WHERE user_id = ? AND expires_at > now ORDER BY rank_score DESC`
- Search:
  - `content_search MATCH ?` filtered by permission resolver.

---

## Trade-Off Notes

- A canonical `content_items` table adds write complexity but makes read performance and cross-feature workflows much simpler.
- Keeping specialized payload tables avoids a giant EAV/content blob table that would be hard to validate and migrate.
- `shared_access` is more verbose than simple visibility columns, but it is required for friends, groups, public links, and collaborative editing permissions.
- D1 is relational and appropriate for this scale; graph data can stay in `knowledge_nodes` / `knowledge_edges` with indexes before considering any separate graph system.
- Durable Objects should stay responsible for realtime fan-out; D1 should store summaries, snapshots, and durable audit trails, not every transient presence event.
- LocalStorage drafts are acceptable now; offline multi-device sync requires `client_mutations` and eventually CRDT-aware editor surfaces.

---

## Acceptance Gates

- [ ] Current tests stay green: `corepack pnpm test`.
- [ ] Typecheck stays green: `corepack pnpm lint`.
- [ ] Production build stays green: `corepack pnpm build`.
- [ ] D1 migrations apply locally and remotely.
- [ ] Existing routes stay compatible:
  - `/api/notes/*`
  - `/api/docs`
  - `/api/sheets`
  - `/api/slides`
  - `/api/quizzes/*`
  - `/api/reviews`
  - `/api/feed`
  - `/api/files`
  - `/api/social/actions`
  - `/api/study-rooms`
  - `/api/study-battles`
  - `/api/integrations/health`
- [ ] Browser smoke passes on desktop/mobile:
  - Dashboard
  - Studio
  - AI Tutor
  - Practice
  - Reviews
  - Files
  - Social
  - Settings
  - Admin
- [ ] Live Worker health reports Cloudflare D1/R2/AI configured.
- [ ] No allchess or edsync resources are touched.

---

## Self-Review

- **Spec coverage:** This plan covers the requested sweep areas: notes, decks, practice modules, social features, user management, media storage, relational schema, verification passes, holistic flow analysis, normalization/read performance, collaborative logs, indexes, offline/realtime support, UI grouping, expand/collapse, info icons, and `...` menus.
- **Placeholder scan:** No implementation task uses TBD or vague placeholder work. Each task names exact files, tables, indexes, commands, and commit boundaries.
- **Type consistency:** New schema terms are consistent across the plan: `content_items`, `shared_access`, `content_versions`, `content_attachments`, `user_connections`, `practice_sessions`, `collaboration_sessions`, `collaboration_events`, `client_mutations`, `content_search`, and `feed_rank_cache`.
- **Merge status:** This final phase merges prior product maturity work into a schema-backed roadmap instead of replacing existing Phase 1-20 plans. The earlier plans remain valid; this document is the detailed schema/workflow spine for the next implementation wave.
