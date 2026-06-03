# LEARN Change Control

Status: Active
Last updated: 2026-05-21

## Purpose

This file defines how roadmap changes, implementation changes, tests, commits, and release notes stay traceable while the 20 phase improvement plan is executed.

## Tracking Rules

- `ops/docs/roadmap/plan.md` describes the intended roadmap and phase scope.
- `ops/docs/roadmap/progress.md` tracks current status, checklists, evidence, risks, and next target.
- Phase-specific audit, architecture, design, release, and decision docs live under `ops/docs/`.
- Every implementation phase must update `ops/docs/roadmap/progress.md`.
- Every major architectural decision must be recorded in a doc under `ops/docs/architecture/` or a dedicated decision log before implementation proceeds.
- Every user-facing capability should have a release note before deployment.

## Commit Rules

- Keep commits small and scoped to one phase or one clearly related subtarget.
- Stage only files related to the current work.
- Do not stage unrelated user edits.
- Use these commit prefixes:
  - `docs:` for plans, progress, design docs, architecture docs, and release notes.
  - `test:` for tests and fixtures.
  - `feat:` for new user-facing capabilities.
  - `fix:` for bug fixes.
  - `refactor:` for structure changes with no intended behavior change.
  - `chore:` for tooling, dependencies, and maintenance.
- Include the phase number in commit bodies for larger work.

## Required Evidence By Change Type

| Change Type | Required Evidence |
| --- | --- |
| Planning docs | Updated `ops/docs/roadmap/plan.md` or phase doc plus `ops/docs/roadmap/progress.md` log entry |
| New AI workflow | Prompt schema, output schema, response renderer, insert behavior, tests |
| New template | Template data, preview behavior, apply/reapply behavior, tests |
| New editor command | Command registry entry, availability rule, UI access point, tests |
| Import feature | Import report, unsupported-feature handling, malformed input tests |
| Export feature | Export report, generated artifact check, failure handling tests |
| Sharing feature | Permission tests, audit event, revoke or rollback behavior |
| Automation | Recipe schema, job history, approval gate for risky outputs, tests |
| UI redesign | Desktop check, mobile check, keyboard/focus check, no-overlap check |
| Release | Local gates, deployment notes, rollback note, updated progress entry |

## Verification Gates

Run the lightest gate that honestly covers the change:

- Documentation-only: review changed Markdown for broken headings, stale dates, and missing links.
- Shared library or API change: `corepack pnpm test` plus `corepack pnpm lint`.
- UI workflow change: targeted browser check plus `corepack pnpm lint`.
- Release candidate: `corepack pnpm test`, `corepack pnpm lint`, `corepack pnpm build`, and deployment smoke checks.

## Progress Update Format

Each work session should update `ops/docs/roadmap/progress.md` with:

- Date.
- Phase and mini phase.
- What changed.
- Files changed.
- Verification performed.
- Known risks.
- Next target.

## Branching Guidance

- Use descriptive branch groups such as `feature/<short-name>`, `fix/<short-name>`, or `refine/<short-name>` for larger implementation branches.
- Documentation-only updates can stay on the current branch if the user asks for that.
- Merge only after checklists, tests, and progress entries are complete.
