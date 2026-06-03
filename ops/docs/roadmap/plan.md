# LEARN Comprehensive Improvement Plan

> **For maintainers:** Implement this plan phase-by-phase with the checklist syntax in `docs/roadmap/progress.md`, small commits, and verification evidence before each push.

**Goal:** Turn LEARN into a comprehensive learning operating system with stronger workflow, design, architecture, AI prompting, response handling, templates, Office-style tooling, imports, exports, presentations, discussions, quizzes, activities, and traceable delivery.

**Architecture:** Keep the app Cloudflare-first and TypeScript-first. Build shared engines for templates, AI response normalization, editor commands, import/export adapters, and activity generation, then expose them through focused UI surfaces in Studio, AI Tutor, Practice, Calendar, Social, and Admin.

**Tech Stack:** Next.js 16, React 19, TypeScript, Cloudflare Workers, D1, R2, Radix UI, Tiptap, Univer, pptxgenjs, Recharts, and the existing local test stack.

---

## Operating Rules

- Every phase must ship as small, reviewable commits.
- Every visible action must either work, open a menu/dialog, or show a disabled state with a clear reason.
- Every new AI workflow must define input schema, prompt template, output schema, response renderer, insert-back behavior, tests, and fallback states.
- Every template must be stored as structured data, support preview, support apply/reapply, and preserve user content unless the action explicitly replaces content.
- Every import/export feature must report what changed, what failed, and what the user can do next.
- Every phase updates `docs/roadmap/progress.md` before merging.
- Run `corepack pnpm test`, `corepack pnpm lint`, and targeted browser checks before marking an implementation phase complete. Run `corepack pnpm build` before release phases.

## Planned File Ownership

- `lib/ai/*`: Prompt templates, response schemas, structured generation, insertion, validation, provider routing, and safety limits.
- `lib/studio-*`: Studio records, templates, editor models, office command registry, import/export orchestration, and design presets.
- `lib/practice-*`: Quiz, discussion, drill, activity, and assessment generation.
- `lib/workspace-*`: Shared workspace metadata, search, folders, permissions, comments, versioning, and activity history.
- `components/learn/views/*`: Feature screens and focused view composition.
- `components/learn/*`: Shared shell, navigation, command menus, app-level UI contracts, and client API helpers.
- `app/api/*`: Route handlers for persistence, import/export, generation, automation, integrations, and audit logging.
- `tests/*.test.ts`: Contract tests for engines, adapters, permissions, schema migration, response handling, and critical workflows.
- `docs/*`: Plans, product decisions, changelogs, migration notes, and release checklists.

---

## Phase 1: Product Map And Workflow Inventory

**Target:** Establish a complete map of screens, tools, actions, user roles, data flows, and missing behavior.

**Mini Phase 1.1: Surface inventory**
- Subtargets:
  - List every route, view, panel, toolbar, button, context menu, empty state, and modal.
  - Mark each action as working, partial, placeholder, duplicate, hidden, or missing.
  - Capture desktop and mobile layout risks.
- Outputs:
  - `docs/audits/surface-inventory.md`
  - Updated `docs/roadmap/progress.md`
- Acceptance:
  - No major user-facing surface is undocumented.
  - Each broken or incomplete action has a phase assignment.

**Mini Phase 1.2: Workflow journey map**
- Subtargets:
  - Map learner, teacher/admin, solo study, group study, file import, AI generation, template use, and export journeys.
  - Identify friction points and repeated commands.
  - Define ideal "start from nothing to complete learning artifact" flows.
- Outputs:
  - `docs/audits/workflow-journeys.md`
- Acceptance:
  - Each journey has entry point, success outcome, failure states, and recovery path.

**Mini Phase 1.3: Priority matrix**
- Subtargets:
  - Rank improvements by learning value, user pain, technical risk, and dependency order.
  - Separate foundation work from polish work.
  - Identify what can ship independently.
- Outputs:
  - Updated `docs/roadmap/progress.md` phase ordering notes.
- Acceptance:
  - Implementation order is justified and testable.

---

## Phase 2: Design System And Interaction Standards

**Target:** Make the app feel cohesive, readable, and efficient across Studio, AI, quizzes, social spaces, files, and admin tools.

**Mini Phase 2.1: UI command language**
- Subtargets:
  - Define when to use icon buttons, text buttons, menus, segmented controls, tabs, sliders, toggles, tooltips, and context menus.
  - Standardize loading, success, warning, destructive, disabled, and empty states.
  - Standardize toolbar density for desktop and mobile.
- Outputs:
  - `docs/design/interaction-standards.md`
- Acceptance:
  - New surfaces can follow one documented command pattern.

**Mini Phase 2.2: Visual system cleanup**
- Subtargets:
  - Audit spacing, radii, typography scale, color contrast, focus rings, panel boundaries, and scroll behavior.
  - Define compact, comfortable, and presentation modes.
  - Remove one-off visual patterns where shared primitives exist.
- Outputs:
  - `docs/design/visual-system.md`
- Acceptance:
  - Main workflows avoid overlapping text, inconsistent spacing, and hidden controls.

**Mini Phase 2.3: Accessibility and responsiveness**
- Subtargets:
  - Add keyboard navigation targets for command menus and editor tools.
  - Verify mobile layouts for Studio, AI, Practice, Calendar, Social, and Files.
  - Define accessible names for icon-only controls.
- Outputs:
  - Accessibility checklist in `docs/roadmap/progress.md`
- Acceptance:
  - Critical workflows are usable by keyboard and small screens.

---

## Phase 3: Architecture Baseline And Module Boundaries

**Target:** Reduce complexity by turning repeated feature logic into shared engines with clear ownership.

**Mini Phase 3.1: Boundary audit**
- Subtargets:
  - Locate duplicated prompt, template, export, editor action, and record state logic.
  - Identify oversized files that need planned extraction.
  - Document shared contracts between UI, API, persistence, and tests.
- Outputs:
  - `docs/architecture/module-boundaries.md`
- Acceptance:
  - Each future extraction has a clear destination and reason.

**Mini Phase 3.2: Shared command registry**
- Subtargets:
  - Design a typed registry for editor commands, context menu commands, toolbar commands, shortcuts, and availability rules.
  - Include command id, label, icon, scope, shortcut, enabled condition, handler, audit metadata, and undo behavior.
  - Support Notes, Docs, Sheets, Slides, Files, AI, Quiz, Discussion, and Calendar command groups.
- Outputs:
  - Architecture specification for `lib/commands.ts` or equivalent.
- Acceptance:
  - UI can render commands from data instead of scattered button handlers.

**Mini Phase 3.3: Contract testing baseline**
- Subtargets:
  - Add tests for command availability, schema validation, response normalization, template application, and export adapters as features land.
  - Define fixture naming and test data patterns.
  - Keep tests fast enough for every commit.
- Outputs:
  - Testing strategy in `docs/architecture/testing-strategy.md`
- Acceptance:
  - Every shared engine has a contract test plan.

---

## Phase 4: Template Engine Foundation

**Target:** Build one structured template system for lessons, slides, docs, sheets, quizzes, discussions, activities, and AI responses.

**Mini Phase 4.1: Template schema**
- Subtargets:
  - Define template id, type, title, description, audience, subject, difficulty, locale, content blocks, style tokens, placeholders, metadata, version, and compatibility.
  - Support generated templates, manual templates, imported templates, and organization templates.
  - Support template dependencies such as theme, slide master, quiz rubric, or discussion protocol.
- Outputs:
  - `lib/studio-templates.ts`
  - `tests/studio-templates.test.ts`
- Acceptance:
  - Templates can be validated without rendering UI.

**Mini Phase 4.2: Template library**
- Subtargets:
  - Add built-in templates for lesson plans, micro-lessons, lecture notes, Cornell notes, revision sheets, lab reports, project briefs, flashcards, quizzes, discussions, debates, worksheets, rubrics, presentations, dashboards, and study schedules.
  - Include style variants for formal, playful, exam prep, workshop, research, and executive summary outputs.
  - Include multilingual and accessibility-aware template metadata.
- Outputs:
  - Built-in template fixtures or registry.
- Acceptance:
  - At least one template exists for every major learning artifact type.

**Mini Phase 4.3: Apply and reapply engine**
- Subtargets:
  - Apply templates to new records.
  - Reapply template style without deleting user content.
  - Warn before destructive content replacement.
- Outputs:
  - Template application tests.
- Acceptance:
  - Changing a template updates formatting consistently across linked artifacts.

---

## Phase 5: Template UI, Import, And Management

**Target:** Let users browse, apply, customize, import, export, and update templates.

**Mini Phase 5.1: Template picker**
- Subtargets:
  - Add searchable filters by type, subject, audience, difficulty, language, and output format.
  - Show preview, included sections, estimated completion time, and compatible surfaces.
  - Add recent, pinned, and recommended templates.
- Outputs:
  - Studio template picker UI.
- Acceptance:
  - Users can start a doc, slide deck, quiz, activity, or lesson from a template in under three actions.

**Mini Phase 5.2: Template editor**
- Subtargets:
  - Allow editing title, description, placeholders, default blocks, theme tokens, and output rules.
  - Add duplicate, rename, archive, restore, export, and share actions.
  - Track template version history.
- Outputs:
  - Template management surface.
- Acceptance:
  - Manual template changes are previewable and reversible.

**Mini Phase 5.3: Template import/export**
- Subtargets:
  - Import template JSON.
  - Import PPTX/DOCX/XLSX-derived structure where possible.
  - Export templates as JSON for reuse.
- Outputs:
  - Import report UI and tests.
- Acceptance:
  - Invalid imports produce clear row/field-level errors.

---

## Phase 6: AI Prompt Operating System

**Target:** Replace ad hoc prompts with targeted, reusable, tested prompt workflows.

**Mini Phase 6.1: Prompt taxonomy**
- Subtargets:
  - Define prompt families for lesson generation, slide generation, quiz generation, discussion facilitation, tutoring, summarization, transformation, critique, translation, accessibility adaptation, and export preparation.
  - Define inputs, required context, optional context, output schema, and safety limits for each family.
  - Add prompt quality labels such as concise, comprehensive, Socratic, exam-focused, creative, and professional.
- Outputs:
  - `lib/ai/prompt-library.ts` updates or new prompt registry.
- Acceptance:
  - Every AI workflow chooses a named prompt family.

**Mini Phase 6.2: Prompt builder**
- Subtargets:
  - Build prompts from structured parts instead of long string concatenation.
  - Include audience, level, subject, locale, output format, tone, template id, and insertion target.
  - Add deterministic prompt snapshots for tests.
- Outputs:
  - Prompt builder tests.
- Acceptance:
  - Prompt output is stable for the same inputs.

**Mini Phase 6.3: Prompt targeting UI**
- Subtargets:
  - Add compact controls for audience, level, tone, goal, artifact type, source material, and template.
  - Save prompt presets.
  - Recommend prompts based on current route and selected record.
- Outputs:
  - AI Tutor and Studio generation controls.
- Acceptance:
  - Users can generate targeted content without writing a long manual prompt.

---

## Phase 7: AI Response Handling And Insert-Back

**Target:** Make generated responses structured, beautiful, editable, and safely insertable into docs, slides, sheets, quizzes, discussions, and activities.

**Mini Phase 7.1: Response schemas**
- Subtargets:
  - Define schemas for rich text, lesson plan, slide deck, quiz, flashcards, discussion plan, worksheet, rubric, spreadsheet table, chart plan, and calendar plan.
  - Validate model output before rendering.
  - Add repair and fallback flows for malformed responses.
- Outputs:
  - `lib/ai/response-schemas.ts`
  - `tests/ai-response-schemas.test.ts`
- Acceptance:
  - Invalid AI output cannot silently corrupt user artifacts.

**Mini Phase 7.2: Designed response renderer**
- Subtargets:
  - Render headings, lists, tables, callouts, citations, quiz questions, speaker notes, and action cards consistently.
  - Provide copy, insert, replace, append, export, regenerate, and critique actions.
  - Show confidence, missing context, and suggested next steps when available.
- Outputs:
  - AI response preview component.
- Acceptance:
  - AI results look like usable learning artifacts, not raw chat text.

**Mini Phase 7.3: Insert-back validation**
- Subtargets:
  - Validate target compatibility before insertion.
  - Preview changes before replacing existing content.
  - Track inserted content source, prompt id, and timestamp.
- Outputs:
  - Insert-back tests for notes, docs, slides, sheets, quizzes, and discussions.
- Acceptance:
  - Insert actions are predictable and reversible.

---

## Phase 8: Lesson And Manual Learning Material Builder

**Target:** Support generated and manually-authored lessons with reusable sections and activities.

**Mini Phase 8.1: Lesson model**
- Subtargets:
  - Define lesson objective, prerequisites, key vocabulary, explanation blocks, examples, checks for understanding, practice tasks, reflection, homework, and assessment.
  - Support micro-lesson, full lesson, workshop, revision lesson, and self-study variants.
  - Support manual and AI-generated origins.
- Outputs:
  - Lesson template definitions and tests.
- Acceptance:
  - A lesson can become notes, slides, quiz, discussion, and worksheet.

**Mini Phase 8.2: Lesson editor workflow**
- Subtargets:
  - Add section reorder, duplicate, hide, convert to slide, convert to quiz, and convert to activity.
  - Add teacher notes and learner-facing notes.
  - Add estimated duration and completion targets.
- Outputs:
  - Lesson editing UI.
- Acceptance:
  - Users can build a lesson manually without AI.

**Mini Phase 8.3: Lesson generation workflow**
- Subtargets:
  - Generate lessons from prompt, uploaded file, existing notes, syllabus, or URL text when available.
  - Ask for missing constraints only when necessary.
  - Generate variants for different levels or learning needs.
- Outputs:
  - AI lesson generation flow.
- Acceptance:
  - Generated lessons are structured and editable immediately.

---

## Phase 9: Presentation And Slide Deck Excellence

**Target:** Make slides feel intentionally designed and export-ready.

**Mini Phase 9.1: Slide template system**
- Subtargets:
  - Add slide masters, layouts, title slide, agenda, section divider, content slide, comparison, timeline, process, image focus, data chart, quiz slide, discussion prompt, and closing slide.
  - Support theme tokens for fonts, colors, spacing, image treatment, and footer rules.
  - Allow template reapply across the whole deck.
- Outputs:
  - Slide template registry and apply engine.
- Acceptance:
  - A deck can switch visual template without manually editing each slide.

**Mini Phase 9.2: Designed PPT generation**
- Subtargets:
  - Generate slide outlines from lesson plans or source notes.
  - Convert structured slide JSON into canvas preview and PPTX export.
  - Include speaker notes, activity prompts, and assessment slides.
- Outputs:
  - Improved `pptxgenjs` export path.
- Acceptance:
  - Exported PPTX opens with title hierarchy, readable text, and consistent theme.

**Mini Phase 9.3: Slide editing tools**
- Subtargets:
  - Add arrange, align, distribute, group, duplicate, lock, hide, image replace, theme switch, transition preview, animation intent, and presenter notes controls.
  - Add right-click context menus for slide thumbnails and canvas objects.
  - Add warnings for text overflow.
- Outputs:
  - Slide editor improvements.
- Acceptance:
  - Common PowerPoint-style edits are available without leaving LEARN.

---

## Phase 10: Docs, Notes, And Word-Style Authoring

**Target:** Make written learning materials easy to create, format, reuse, and export.

**Mini Phase 10.1: Rich document templates**
- Subtargets:
  - Add templates for essay outline, research notes, study guide, meeting notes, lab report, reading response, glossary, rubric, and assignment brief.
  - Add style presets for headings, callouts, examples, warnings, definitions, and references.
  - Support generated and manual content blocks.
- Outputs:
  - Docs/notes templates.
- Acceptance:
  - Users can start common written artifacts from structured templates.

**Mini Phase 10.2: Word-style tools**
- Subtargets:
  - Add right-click options for rewrite, summarize, convert to quiz, convert to slide, define term, translate, add citation note, and create flashcard.
  - Add table, image, checklist, callout, equation placeholder, and page-like section tools where supported.
  - Add find, replace, outline navigation, version compare, and comments.
- Outputs:
  - Editor command additions.
- Acceptance:
  - The editor supports common document workflows without clutter.

**Mini Phase 10.3: Document import/export**
- Subtargets:
  - Import plain text, Markdown, CSV-derived tables, and DOCX-derived content when available.
  - Export clean Markdown, HTML, and printable output.
  - Track unsupported formatting in import reports.
- Outputs:
  - Import/export tests and UI reports.
- Acceptance:
  - Users understand exactly what was preserved and what changed.

---

## Phase 11: Sheets, Data, And Excel-Style Learning Tools

**Target:** Make spreadsheets useful for study planning, grading, vocabulary, datasets, and analytics.

**Mini Phase 11.1: Sheet templates**
- Subtargets:
  - Add gradebook, revision tracker, vocabulary table, reading log, experiment data, budget, attendance, study plan, and quiz analytics templates.
  - Include formulas, formatting presets, validation hints, and charts where supported.
  - Support import from CSV and structured AI-generated tables.
- Outputs:
  - Sheet template registry.
- Acceptance:
  - Sheets can be created from educational templates with useful defaults.

**Mini Phase 11.2: Excel-like commands**
- Subtargets:
  - Add sort, filter, freeze, fill, formula insert, column format, conditional style, data cleanup, duplicate removal, and chart suggestions.
  - Add right-click row, column, cell, and range actions.
  - Add formulas and validation help panel.
- Outputs:
  - Sheet command registry additions.
- Acceptance:
  - Common spreadsheet workflows are discoverable through toolbar and context menus.

**Mini Phase 11.3: Sheet intelligence**
- Subtargets:
  - Generate charts, summaries, flashcards, quiz questions, and study plans from selected ranges.
  - Detect missing values, outliers, duplicate rows, and inconsistent categories.
  - Export CSV and structured data for reuse.
- Outputs:
  - AI range actions and tests.
- Acceptance:
  - Users can turn data into learning artifacts.

---

## Phase 12: Quiz, Assessment, And Activity Generator

**Target:** Create comprehensive practice experiences from templates, lessons, docs, slides, and AI prompts.

**Mini Phase 12.1: Assessment schema**
- Subtargets:
  - Support multiple choice, multi-select, short answer, long answer, cloze, matching, ordering, flashcard, scenario, rubric, and reflection questions.
  - Include difficulty, skill tags, explanation, distractor rationale, source link, and marking guidance.
  - Add versioning for generated question banks.
- Outputs:
  - Quiz schema tests.
- Acceptance:
  - Generated questions are structured enough for review and analytics.

**Mini Phase 12.2: Activity templates**
- Subtargets:
  - Add templates for debate, think-pair-share, role play, case study, lab activity, worksheet, exit ticket, peer review, Socratic discussion, game challenge, and project sprint.
  - Include timing, group size, materials, instructions, facilitator notes, and assessment criteria.
  - Support conversion to slides and docs.
- Outputs:
  - Activity template registry.
- Acceptance:
  - Users can generate or manually create class activities.

**Mini Phase 12.3: Quiz generation and review**
- Subtargets:
  - Generate questions from notes, docs, slides, files, topics, and lessons.
  - Add review queue for accepting, editing, rejecting, and tagging questions.
  - Add quality checks for duplicate answers, ambiguous wording, and missing explanations.
- Outputs:
  - Quiz generation workflow.
- Acceptance:
  - AI-generated quizzes require review before publishing.

---

## Phase 13: Discussion, Collaboration, And Social Learning

**Target:** Make group learning more structured, useful, and connected to artifacts.

**Mini Phase 13.1: Discussion templates**
- Subtargets:
  - Add discussion protocols for seminar, debate, peer critique, brainstorming, Q&A, reading circle, project standup, and reflection.
  - Include prompts, roles, timing, turn-taking, evidence requirements, and wrap-up.
  - Allow AI generation from lesson objectives.
- Outputs:
  - Discussion template registry.
- Acceptance:
  - Discussions can be started from templates instead of blank chat.

**Mini Phase 13.2: Collaboration tools**
- Subtargets:
  - Add comments, mentions, assignments, reactions, unresolved/resolved states, and artifact-linked threads.
  - Add right-click "discuss this", "turn into task", "turn into quiz", and "summarize thread" actions.
  - Add moderation and audit visibility.
- Outputs:
  - Collaboration command plan and implementation.
- Acceptance:
  - Social activity connects back to learning artifacts.

**Mini Phase 13.3: AI facilitation**
- Subtargets:
  - Generate discussion prompts, follow-up questions, summaries, misconceptions, and next activities.
  - Detect unanswered questions and repeated confusion.
  - Produce teacher recap and learner recap.
- Outputs:
  - AI discussion assistant workflow.
- Acceptance:
  - Group discussions produce useful study outputs.

---

## Phase 14: Import Gateway And File Conversion

**Target:** Let users bring in existing materials and convert them into LEARN artifacts.

**Mini Phase 14.1: Import router**
- Subtargets:
  - Classify input as text, Markdown, CSV, JSON, DOCX-like, PPTX-like, XLSX-like, image, syllabus, notes, quiz bank, or template.
  - Route each input to compatible parsers and artifact builders.
  - Produce import reports with warnings and unsupported features.
- Outputs:
  - Import gateway tests.
- Acceptance:
  - Users can see what was imported, skipped, and transformed.

**Mini Phase 14.2: Office imports**
- Subtargets:
  - Add structured import paths for PowerPoint decks, Word-like documents, and Excel-like sheets when parser support is available.
  - Extract metadata, headings, tables, slide titles, speaker notes, and layout hints.
  - Convert imported structure into templates or records.
- Outputs:
  - Import adapters and fixtures.
- Acceptance:
  - Imported Office files become editable LEARN artifacts where possible.

**Mini Phase 14.3: Conversion workflows**
- Subtargets:
  - Convert doc to slides, slides to quiz, sheet to chart summary, lesson to activity pack, discussion to recap, and quiz to revision plan.
  - Preview conversion before creation.
  - Track source artifact relationship.
- Outputs:
  - Conversion command registry.
- Acceptance:
  - Cross-artifact conversion is consistent and reversible.

---

## Phase 15: Export, Publishing, And Share Packages

**Target:** Make outputs easy to deliver as PPT, docs, sheets, PDFs, printable packs, and shareable learning bundles.

**Mini Phase 15.1: Export adapters**
- Subtargets:
  - Standardize export to PPTX, Markdown, HTML, CSV, JSON, and printable views.
  - Add export capability matrix by artifact type.
  - Add export reports and retry behavior.
- Outputs:
  - Export adapter tests.
- Acceptance:
  - Export failures are visible and recoverable.

**Mini Phase 15.2: Learning packs**
- Subtargets:
  - Bundle lesson, slides, quiz, worksheet, discussion guide, answer key, and study plan.
  - Support teacher and learner versions.
  - Export package manifest with source links and template versions.
- Outputs:
  - Pack builder workflow.
- Acceptance:
  - A complete lesson pack can be generated from one lesson plan.

**Mini Phase 15.3: Publishing controls**
- Subtargets:
  - Add private, shared, class, public, archived, and draft states where appropriate.
  - Add permissions, copy links, duplicate to workspace, and revoke access.
  - Add audit events for sharing and export.
- Outputs:
  - Sharing tests.
- Acceptance:
  - Users can safely share outputs with clear access state.

---

## Phase 16: Automation And Workflow Builder

**Target:** Automate repeated learning workflows without making the app fragile.

**Mini Phase 16.1: Workflow recipes**
- Subtargets:
  - Add recipes such as weekly revision plan, lesson-to-pack, file-to-summary, quiz-remediation, discussion-recap, and progress-report.
  - Define trigger, inputs, steps, outputs, approvals, and failure handling.
  - Keep automations reviewable before creating artifacts.
- Outputs:
  - Automation recipe registry.
- Acceptance:
  - Users can run common workflows without reconfiguring prompts every time.

**Mini Phase 16.2: Scheduled learning jobs**
- Subtargets:
  - Support reminders, spaced repetition generation, weekly summaries, overdue tasks, and upcoming lesson prep.
  - Add job history, status, retry, cancel, and audit events.
  - Keep schedule changes visible to users.
- Outputs:
  - Automation UI and route tests.
- Acceptance:
  - Automations are understandable and controllable.

**Mini Phase 16.3: Human approval gates**
- Subtargets:
  - Require review before publishing, sharing, deleting, or bulk replacing.
  - Show generated artifact diffs where possible.
  - Add rollback for automation-created artifacts.
- Outputs:
  - Approval workflow tests.
- Acceptance:
  - Automation accelerates work without surprising users.

---

## Phase 17: Search, Organization, And Knowledge Graph

**Target:** Help users find, relate, reuse, and understand their learning materials.

**Mini Phase 17.1: Global search**
- Subtargets:
  - Search by title, type, tag, date, template, source, owner, content snippet, and recent activity.
  - Add filters for docs, slides, sheets, quizzes, files, discussions, lessons, and templates.
  - Add quick actions from search results.
- Outputs:
  - Search UI and query tests.
- Acceptance:
  - Users can locate artifacts without remembering where they were created.

**Mini Phase 17.2: Folders, tags, and collections**
- Subtargets:
  - Add move, copy, duplicate, archive, restore, delete forever, and empty trash flows.
  - Support tags, pinned collections, course folders, and recent work.
  - Add context menu actions for organization.
- Outputs:
  - Organization command tests.
- Acceptance:
  - File management feels complete and safe.

**Mini Phase 17.3: Knowledge graph**
- Subtargets:
  - Link lessons, notes, slides, quizzes, discussions, files, templates, and calendar events.
  - Show source and derivative relationships.
  - Recommend next artifacts based on graph gaps.
- Outputs:
  - Graph relationship tests.
- Acceptance:
  - Users can understand how learning materials connect.

---

## Phase 18: Analytics, Progress, And Personalization

**Target:** Make learning progress measurable and actionable.

**Mini Phase 18.1: Progress model**
- Subtargets:
  - Track study time, completion, quiz mastery, topic confidence, activity participation, revision intervals, and artifact creation.
  - Separate learner-facing progress from admin/teacher analytics.
  - Add privacy and retention rules.
- Outputs:
  - Progress model tests.
- Acceptance:
  - Progress numbers are explainable and tied to actual events.

**Mini Phase 18.2: Dashboards**
- Subtargets:
  - Add learner dashboard, teacher overview, course dashboard, and artifact analytics.
  - Include charts for mastery, time, overdue work, weak topics, and generated outputs.
  - Add drill-down into source artifacts.
- Outputs:
  - Dashboard UI improvements.
- Acceptance:
  - Dashboards suggest useful next actions.

**Mini Phase 18.3: Personalization**
- Subtargets:
  - Recommend study plans, templates, prompts, quizzes, discussions, and review schedules.
  - Adapt outputs by level, language, accessibility needs, and learning goals.
  - Let users override recommendations.
- Outputs:
  - Personalization tests.
- Acceptance:
  - Recommendations improve workflow without hiding user control.

---

## Phase 19: Reliability, Security, And Performance

**Target:** Keep the expanded app reliable, safe, fast, and deployable.

**Mini Phase 19.1: Reliability hardening**
- Subtargets:
  - Add defensive handling for empty records, malformed AI output, missing files, failed exports, network errors, and stale drafts.
  - Improve autosave, conflict detection, version restore, and undo behavior.
  - Add route-level error boundaries where needed.
- Outputs:
  - Reliability tests.
- Acceptance:
  - Common failures produce recoverable states, not blank screens.

**Mini Phase 19.2: Security hardening**
- Subtargets:
  - Review permissions, upload validation, export access, AI provider secrets, sharing links, and audit logs.
  - Prevent cross-user access to records and files.
  - Add tests for destructive and private operations.
- Outputs:
  - Security regression tests.
- Acceptance:
  - New tools respect authentication, authorization, and audit requirements.

**Mini Phase 19.3: Performance and bundle control**
- Subtargets:
  - Isolate heavy editors and import/export tools behind lazy surfaces.
  - Virtualize long lists and debounce expensive operations.
  - Track bundle size, build time, and slow interactions.
- Outputs:
  - Performance checklist.
- Acceptance:
  - The app remains usable as tool coverage grows.

---

## Phase 20: Release System, Documentation, And Continuous Improvement

**Target:** Make future changes traceable, releasable, and easy to continue.

**Mini Phase 20.1: Tracking discipline**
- Subtargets:
  - Keep `docs/roadmap/progress.md` updated with phase status, current task, commit hash, test status, risks, and next target.
  - Keep architectural decisions in docs.
  - Record user-facing changes in release notes.
- Outputs:
  - Updated tracking docs after every phase.
- Acceptance:
  - Anyone can resume the project from the docs.

**Mini Phase 20.2: Release checklist**
- Subtargets:
  - Define local gates, browser checks, Cloudflare/Vercel checks, migration checks, and rollback steps.
  - Require screenshots or notes for key UI workflows.
  - Confirm docs and templates are in sync with behavior.
- Outputs:
  - `docs/release-checklist.md`
- Acceptance:
  - Releases are repeatable.

**Mini Phase 20.3: Feedback loop**
- Subtargets:
  - Add feedback capture for confusing tools, missing templates, poor AI output, and failed imports.
  - Convert feedback into backlog items.
  - Review usage and quality metrics before each major improvement cycle.
- Outputs:
  - Feedback-to-roadmap process.
- Acceptance:
  - The platform improves from real usage, not only upfront assumptions.

---

## Definition Of Done For Each Phase

- Requirements are mapped to files, tests, and user-visible outcomes.
- Existing user changes are preserved.
- New or changed actions have loading, success, error, and disabled states.
- New schemas have validation tests.
- New UI is checked on desktop and mobile.
- `docs/roadmap/progress.md` is updated with status, evidence, and next steps.
- Commit message is specific and scoped.

## Commit Strategy

- Use one branch per implementation slice when the work is larger than one safe patch.
- Prefer commit prefixes:
  - `docs:` for planning and documentation.
  - `test:` for tests and fixtures.
  - `feat:` for user-facing capabilities.
  - `fix:` for bug fixes.
  - `refactor:` for architecture changes with no intended behavior change.
  - `chore:` for tooling and maintenance.
- Do not mix unrelated phase work in one commit.
- Never stage unrelated user edits.
- Each phase should include at least one test-focused commit and one implementation commit when code changes are involved.
