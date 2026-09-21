# LEARN — Audits

Audit outputs for the LEARN app. Each report is reproducible from the revision it
names; re-run after any structural change.

| Date | Report | Skill used | Scope |
| --- | --- | --- | --- |
| 2026-09-21 | [Code Quality & Maintainability Audit](./2026-09-21-code-quality-audit.md) | `code-quality-audit` | Dead code, duplication, complexity, legacy, redundant IO, tech debt — 37 findings, ~2,900 lines removable |
| 2026-09-21 | [Security Audit (20-point)](./2026-09-21-security-audit.md) | `security-*-hardening` (×3) | 12 PASS / 6 PARTIAL / 2 FAIL |
| 2026-09-21 | [AI Council](./2026-09-21-ai-council.md) | `ai-council` | Scope & sequencing decision — 5 advisors + cross-critique + Chairman verdict |

**Revision audited:** `5f06f9e1` (`main`)

## Start here

1. **Read the AI Council report first.** It frames *why* the cleanup matters — the
   root cause is scope *order*, not scope size.
2. **Then the code-quality audit's Cleanup Plan.** Stage 0 is a prerequisite:
   restore a working `node_modules` and record a green `lint` + `test` + `build`
   baseline. Nothing should be deleted before that.
3. **Then the security audit's Prioritized Remediation Plan.** Three items are
   immediate.

## Reproducing the static analysis

```bash
node ~/.workbuddy-ai/skills/code-quality-audit/scripts/deadcode.mjs . --format md
node ~/.workbuddy-ai/skills/code-quality-audit/scripts/deadcode.mjs . --format json
```

## Verified baseline

At `5f06f9e1`, after rebuilding `node_modules`:

| Check | Result |
| --- | --- |
| `tsc --noEmit` | ✅ PASS (exit 0) |
| Test suite | ✅ **358/358 pass**, 44 files, ~5.5s |
| `next build` | ⚠️ Not verified — the sandbox blocks symlinks, `wmic.exe`, and package renames, so the install could not be completed |

## Known caveats

1. **`next build` was not verified.** The sandbox prevented a complete install (473/509 packages placed). Confirm a green `pnpm build` in a normal environment before starting Stage 1 deletions.
2. **The green test suite does not cover the risky code.** No test file imports `app/api`, `lib/data`, or `workers/`. All 50 route handlers, the DB layer, and the realtime/WebRTC Worker are untested. Treat "tests pass" as *not* evidence of safety for those paths.
3. **`pnpm audit` could not be run**, so the security report's Item 20 reflects the absence of monitoring rather than a confirmed vulnerability.

## Housekeeping changes made by this audit

To keep the structural guard test green, these were updated:

- `.gitignore` — added `.workbuddy-ai/` (follows the existing `.agents/` convention for local tooling metadata)
- `.dockerignore` — added `.workbuddy-ai`
- `src/tests/project/project-structure.test.ts` — registered `audits` as an allowed docs topic
