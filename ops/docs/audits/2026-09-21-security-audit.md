# Security Audit — LEARN (20-Point Hardening Review)

**Revision audited:** `5f06f9e1` (`main`) · **Date:** 2026-09-21 · **Remediation commit:** `582d149`
**Skills applied:** `security-secrets-hardening`, `security-auth-access-hardening`, `security-input-data-hardening`
**Scope:** 50 API route handlers, 89 `lib/` modules, auth/session layer, upload pipeline, DB access layer, Cloudflare Workers config, git history, CI

## Verdict

| Status | Count | Items |
| --- | --- | --- |
| ✅ **PASS** | 14 | 1, 2, 3, 6, 7, 8, 9, 11, 13, 15, 16, 17, 18, 19 |
| ⚠️ **PARTIAL** | 4 | 4, 5, 10, 14 |
| ❌ **FAIL** | 2 | 12, 20 |

**Overall: a genuinely strong security posture for a solo-built application.** The fundamentals are right — parameterized queries everywhere, explicit response allowlists, httpOnly cookies, real upload validation, durable rate limiting on the sensitive endpoints, and a clean git history. There are no injection holes and no leaked credentials.

### Remediation status

All three immediate items are **fixed** in commit `582d149`, plus HSTS (Item 19):

| Item | Was | Now |
| --- | --- | --- |
| 5 — fallback encryption key | 🔴 Derived the AES key from the literal `"learn-local-development-key"` when no master key was set, silently, in production | ✅ Throws in production; development keeps the fallback. Status surfaced via `/api/integrations/health` |
| 6 — CSRF on mutation routes | 🟠 4 mutation routes authenticated via `getCurrentUser()`, skipping `hasTrustedOrigin()` | ✅ All migrated to `requireApiUser()`; an invariant test now enforces this for every future route |
| 18.3 — `Permissions-Policy` | 🟠 `camera=()` / `microphone=()` **broke group calling and call recording**, because `getUserMedia` is rejected before the permission prompt | ✅ `camera=(self), microphone=(self)` |
| 19 — HSTS | 🟠 Absent | ✅ `max-age=63072000`, deliberately without `includeSubDomains`/`preload` (see Item 19) |

**Still open, in priority order:**

1. 🟠 **Items 12 + 20 — no bot protection and no dependency scanning.** Combined with 100k PBKDF2 iterations (Item 10), credential stuffing is cheaper than it should be. Both are cheap to fix.
2. 🟠 **Item 18.1 — `'unsafe-eval'` in the production CSP.** Not fixed here: dropping it has a real chance of breaking a client bundle at runtime, and this environment cannot run the app to verify. Needs a browser check, not a blind edit.
3. 🟡 **Item 5 follow-through — rotate any provider secrets that were encrypted while the fallback may have been active.** The code fix stops new exposure; it does not undo past exposure.
4. 🟡 **Item 10 — raise PBKDF2 to 600k iterations for new hashes**, re-hashing on login.

---

## Category A — Secrets & Transport

### 1. Hide API Keys — ✅ PASS

| Evidence | Detail |
| --- | --- |
| `.gitignore:24-26` | `.env*` ignored, `!.env.example` re-included — correct pattern |
| `ops/env/env.example`, `ops/env/dev.vars.example` | All secrets present as **empty placeholders**; no real values |
| `ops/env/env.example:22` | `# AI provider selection. Set only server-side…` — explicit server-only intent |
| `src/lib/ai/provider-admin.ts:140` | Provider secrets encrypted before storage |

Keys live in Cloudflare Workers bindings / platform secrets. Nothing sensitive reaches the client bundle. **No action.**

### 2. Purge Git Secrets — ✅ PASS

| Evidence | Detail |
| --- | --- |
| Full-history scan | `git log --all -p` grepped for `sk-…`, `ghp_…`, `AKIA…`, `-----BEGIN … PRIVATE KEY`, and populated `CLOUDFLARE_API_TOKEN=` / `GROQ_API_KEY=` patterns → **zero hits** |
| Files ever added | Only `.env.example` was ever committed. No `.env`, no `.dev.vars`. |

History is clean; no rewrite required. **No action.**

### 3. Use Public Database Key — ✅ PASS *(by design)*

D1 is reached through Workers bindings (`LEARN_DB`/`DB`) server-side, or via Cloudflare API credentials held in server env. No database key is ever exposed to the browser. The client-side concept does not apply. **No action.**

### 4. Enable Row-Level Security — ⚠️ PARTIAL

| Evidence | Detail |
| --- | --- |
| Platform | Cloudflare **D1 / SQLite** — no native RLS |
| App-level equivalent | 32 ownership-scoped clauses in `src/lib/data.ts` (`user_id = $1` / `owner_id = $1`), plus `owner OR admin` visibility on the shared containers (`learning_spaces`, `study_rooms`, `study_battles`) |

Enforcement is *effective* but **per-query and conventional** — the database will not stop a new query that forgets the `WHERE user_id = $1` clause. This is the structural weakness of RLS-free stacks.

**Action:** introduce a scoped-query helper (e.g. `queryOwned(table, userId, …)`) so ownership filtering is applied by construction rather than by memory. Add a test that asserts every user-data query in `data.ts` contains an ownership predicate.

### 5. Encrypt Sensitive Data at Rest — ✅ **FIXED** *(was ⚠️ PARTIAL 🔴)*

| Evidence | Detail |
| --- | --- |
| `src/lib/ai/provider-admin.ts:140-156` | ✅ **AES-256-GCM** with random IV + auth tag, versioned format `v1.iv.tag.ciphertext` |
| `src/lib/ai/provider-admin.ts:130` | 🔴 `crypto.createHash("sha256").update(masterKey \|\| "learn-local-development-key")` |

**The finding:** if `LEARN_SECRET_KEY` and `AUTH_SECRET` are both unset, the AES key is derived from the hardcoded literal `"learn-local-development-key"` — a value that is now published in this report and in the repository. In that configuration, every stored provider secret is decryptable by anyone with database read access.

The code path is a convenience fallback for local development. The risk is that a production deployment missing one environment variable **fails open, silently** — encryption still "works", so nothing looks wrong.

**Action (highest priority):**
1. ✅ **Done** — `resolveMasterKey()` now throws when `NODE_ENV === "production"` and no master key is set, with a message naming the env var and warning to rotate. Development keeps the fallback so local work is unaffected. Covered by 4 tests, including the subtle case where secrets were stored under the fallback and then read back in production (that must throw, not return `""`).
2. ⬜ **Outstanding — rotate any provider secrets encrypted while the fallback may have been active.** The code fix stops *new* exposure; it cannot undo exposure that already happened. Rotate the keys at each provider and re-enter them.
3. ✅ **Done** — `isProviderSecretKeyConfigured()` is surfaced in the admin-only `/api/integrations/health` response as `encryption.providerSecretKeyConfigured`, so the misconfiguration is visible before it bites rather than presenting as a runtime failure.

---

## Category B — Auth, Access & Sessions

### 6. Enforce Server-Side Auth — ✅ **FIXED** *(was ⚠️ PASS with a CSRF gap)*

| Evidence | Detail |
| --- | --- |
| `src/lib/api.ts:39-51` | `requireApiUser()` = DB-configured guard + **`hasTrustedOrigin()` CSRF check** + session lookup |
| Coverage | **38 of 49** routes use `requireApiUser` |
| Remaining 11 | `auth/{login,logout,session,signup-request}` (public by design), `invites/accept` + `profile/public` (public by design), `integrations/health` (admin-gated), **`automation/run`, `import`, `files` (POST/DELETE), `files/[id]/download`** |

All 11 remaining routes **do** authenticate — via `getCurrentUser()` and an explicit 401. So there is **no unauthenticated endpoint**. But the four `getCurrentUser()`-based routes include **mutation endpoints** (`import` POST, `files` POST/DELETE, `automation/run` POST) that therefore **skip the `hasTrustedOrigin()` cross-origin mutation check** that `requireApiUser()` applies.

**Impact:** those endpoints are authenticated but not CSRF-checked — a cross-origin form post could act with the victim's session cookie. `SameSite=lax` on the session cookie mitigates most cross-site POST vectors, so this is defence-in-depth rather than an open door.

**Action:** ✅ **Done.** `automation/run` (POST), `import` (POST) and `files` (POST, DELETE) now use `requireApiUser()`. `files/GET` was migrated as well so the file has one auth path — `hasTrustedOrigin()` only fires on mutations, so the read path is unchanged.

The audit enumerated **4** mutation routes but the verdict summary said 5; 4 is correct. Re-running the enumeration after the fix confirms exactly 4 mutation routes remain without `requireApiUser()`, and all four are public by design: `auth/login`, `auth/logout`, `auth/signup-request`, `invites/accept`.

**Regression guard:** a test now walks every `src/app/api/**/route.ts`, and fails if any handler exporting `POST`/`PUT`/`PATCH`/`DELETE` lacks `requireApiUser` without appearing in a documented allowlist — with a cap on the allowlist size so it cannot be quietly widened instead of fixing a route. This is the part that matters: the original gap existed because coverage was *inconsistent*, which is exactly what a per-route fix does not prevent from recurring.

### 7. Lock Record Access — ✅ PASS

| Evidence | Detail |
| --- | --- |
| `src/app/api/files/[id]/download/route.ts:9-14` | `getMediaAsset(id, user)` (owner-scoped) → falls back to `isFileSharedWithUserViaChat(id, user)` → else 404 |
| `data.ts` | 32 ownership predicates; shared containers use `owner OR admin` |
| `automation/run`, `import` | Operate on `user.id` from the session, never a client-supplied user id |

Record-level authorization is consistently applied. **No action.**

### 8. Block Field Tampering — ✅ PASS

| Evidence | Detail |
| --- | --- |
| `src/app/api/profile/route.ts:15-23` | Explicit field whitelist: `name`, `email`, `avatarUrl`, `bio`, `profileVisibility`, `preferences` |
| `data.ts:455-471` | `updateProfile` accepts a typed subset; `profileVisibility` validated against `["private","connections","public"]` |
| Consequence | `role`, `id`, `xpTotal`, `streakCurrent` **cannot** be set by a client request — privilege escalation via mass assignment is not possible |

**No action.**

### 9. Secure Session Cookies — ✅ PASS

| Evidence | Detail |
| --- | --- |
| `src/app/api/auth/login/route.ts:36-42` | `httpOnly: true`, `sameSite: "lax"`, `secure: request.nextUrl.protocol === "https:"`, `expires`, `path: "/"` |
| `data.ts:226` | 14-day server-side expiry |
| `data.ts:192` | `WHERE s.token_hash = $1 AND s.expires_at > now()` — expiry enforced in the query, not just the cookie |
| `data.ts:76-87` | Tokens are **hashed** (SHA-256) before storage — a DB leak does not yield usable sessions |
| `data.ts:228-230` | 32 random bytes (`SESSION_TOKEN_BYTES`) |

**Minor hardening (optional):** use the `__Host-` cookie name prefix to prevent cookie-tossing from a subdomain.

### 10. Hash Passwords — ⚠️ PARTIAL

| Evidence | Detail |
| --- | --- |
| `src/lib/auth.ts:3-5` | `pbkdf2_sha256`, **100,000** iterations, 64-byte key |
| `src/lib/auth.ts:90` | Per-user random 16-byte salt; stored as `algorithm$iterations$salt$hash` |
| `src/lib/auth.ts:105` | `timingSafeEqualText()` — timing-safe comparison ✅ |
| `src/lib/auth.ts:99` | Algorithm/params read from the stored hash → future upgrades are possible without breaking old hashes |

**The gap:** OWASP's current guidance for PBKDF2-HMAC-SHA256 is **600,000** iterations. At 100,000 the work factor is ~6× cheaper than recommended, which matters most against offline cracking after a DB compromise.

**Action:** raise to 600,000 for *new* hashes (the versioned format already supports per-hash parameters), and transparently re-hash on next successful login. Consider Argon2id if the runtime permits.

### 11. Rate Limit Login — ✅ PASS

| Evidence | Detail |
| --- | --- |
| `src/app/api/auth/login/route.ts:20-28` | **8 attempts / 10 min**, keyed `login:${ip}:${identifier.toLowerCase()}` — per-IP *and* per-account |
| Response | HTTP 429 + `retry-after` header |
| `src/lib/rate-limit.ts:27-37` | Durable D1-backed bucket, falling back to in-memory |
| `rate-limit.ts:32` | Keys are hashed before storage (no PII/IP at rest) |
| Also limited | signup 4, uploads 20, AI chat 40 |
| `getClientIp` | Prefers `cf-connecting-ip` (unspoofable behind Cloudflare) |

**Minor caveat:** `checkDurableRateLimit` does `SELECT` → compute → `INSERT … ON CONFLICT`. That read-modify-write is **not atomic**, so concurrent requests can lose increments and slightly undercount. Acceptable for login throttling; use an atomic `UPDATE … SET count = count + 1` if precise enforcement is ever needed.

### 12. Add Bot Protection — ❌ FAIL

| Evidence | Detail |
| --- | --- |
| Scan | No Turnstile, reCAPTCHA, hCaptcha, or any bot signal anywhere in `src/` (the only `bot` matches are the `Bot` lucide icon) |
| Only defence | Rate limiting (Item 11) |

Rate limiting alone does not stop distributed credential stuffing from many IPs, nor scripted signup abuse. Cloudflare's edge WAF/bot rules may be active at the platform layer, but **nothing is configured in the repository**.

**Action:** add Cloudflare Turnstile (native to this stack) to the login and signup-request forms, verified server-side. Alternatively, document the Cloudflare Bot Fight Mode / WAF rule relied upon, so the protection is explicit rather than assumed.

---

## Category C — Input, Output & Data

### 13. Parameterize Queries — ✅ PASS

| Evidence | Detail |
| --- | --- |
| `src/lib/data.ts` | Regex scan for interpolated SQL (`query(\`…${…}\`)`) → **zero matches** |
| Throughout | `$1, $2, …` placeholders with a separate params array |
| `src/lib/db.ts` | `normalizeD1Sql()` rewrites `$n` → `?` for D1/SQLite at the driver boundary |

No SQL injection surface found. **No action.**

### 14. Validate All Input — ⚠️ PARTIAL

**Working well:**
- Length caps: `identifier.slice(0, 254)`, `password.length > 1024` rejected, `bio.slice(0, 800)`, `source.slice(0, 48)`
- Enum whitelists: `profileVisibility`, import `target`
- Type guards: `isPlainRecord()`; `readJsonObject()` never throws on malformed JSON
- Upload validation is genuinely thorough (see Item 16)

**Gaps:**
- Many routes pass `body` straight through to `save*()` functions without schema validation (e.g. the CRUD triplet, notes, quizzes). Validation is delegated to the data layer, inconsistently.
- `readJsonObject()` swallows a malformed body into `{}`, which can turn a client bug into a confusing "field required" error rather than a 400 parse error.
- No shared schema/validator library — each route re-invents ad-hoc coercion.

**Action:** adopt one validation approach (e.g. a small `zod`-style schema per route, or a shared `requireFields()` helper) and apply it at the API boundary, so validation is consistent and testable rather than spread across layers.

### 15. Escape User Content — ✅ PASS *with duplication risk*

| Evidence | Detail |
| --- | --- |
| `dangerouslySetInnerHTML` | Exactly **one** occurrence — `src/app/layout.tsx:38`, a static theme-init script with no user input |
| `.innerHTML =` | None |
| React rendering | All user content flows through JSX text nodes → auto-escaped |
| `escapeHtml()` | Defined **5×**: `ai-view.tsx:1026`, `studio-view.tsx:349`, `lib/ai/insert-back.ts:185`, `lib/import-gateway.ts:329`, `lib/studio-design.ts:442` |

**No XSS vector found.** The risk is **future drift**: two of the five copies escape three characters (`& < >`) and two escape five (adding `" '`). A future feature that renders AI-generated or imported HTML using the 3-character variant could be exploitable.

**Action:** consolidate into one `lib/html-text.ts` with the **5-character** escape (see the code-quality audit §2.4). This is a correctness fix disguised as a cleanup.

### 16. Restrict File Uploads — ✅ PASS *(exemplary)*

| Evidence | Detail |
| --- | --- |
| `src/lib/file-security.ts:4-26` | Extension **blocklist**: 21 types incl. `exe`, `dll`, `bat`, `cmd`, `ps1`, `sh`, `jar`, `msi`, `html`, `vbs`, `zip` |
| `file-security.ts:55-63` | Content-type **allowlist**: `image/*`, `video/*`, `audio/*`, PDF, OOXML (docx/xlsx/pptx), CSV, Markdown, plain text |
| `file-security.ts:43-53` | **Magic-byte check** for executables — MZ, ELF, Mach-O (both endiannesses), Java class |
| `file-security.ts:82` | 100 MB cap |
| `src/app/api/files/route.ts:18-23` | Per-user upload rate limit (20 / 10 min) |
| `files/[id]/download/route.ts:22-25` | Downloads forced as `content-disposition: attachment` + `x-content-type-options: nosniff` + `cache-control: private, no-store` |

Blocklist **and** allowlist **and** signature inspection — defence in depth that is unusual to see done properly. **No action.**

### 17. Trim API Responses — ✅ PASS

| Evidence | Detail |
| --- | --- |
| `src/lib/data.ts:113-132` | `normalizeUser()` returns an **explicit allowlist** of fields — so `SELECT u.*` (which includes `password_hash`) never leaks it |
| `data.ts:185-199` | Same pattern for the session lookup |
| `next.config.mjs:53-57` | `Cache-Control: no-store, max-age=0` on all `/api/*` |
| Error responses | `fail(message, status)` returns only `{ error }` — no stack traces to the client (details go to `console.error`) |

**No action.**

### 18. Add Security Headers — ⚠️ PARTIAL *(18.3 fixed; 18.1 outstanding)*

**Present and strong** (`next.config.mjs:7-34`, applied to `/:path*` and `/api/:path*`):

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`; `upgrade-insecure-requests`; explicit `connect-src` allowlist |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Permissions-Policy` | ✅ **fixed** — was `camera=(), microphone=()`; now `camera=(self), microphone=(self)`, other directives still `()` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `X-Permitted-Cross-Domain-Policies` | `none` |

**Gaps:**
1. 🔴 `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — `'unsafe-inline'` and `'unsafe-eval'` together largely defeat CSP as an XSS mitigation. Next.js needs `'unsafe-inline'` for its bootstrap script, but `'unsafe-eval'` is typically only required in development. **Deliberately not fixed here:** removing it has a genuine chance of breaking a client bundle at runtime, and this environment cannot run the app in a browser to verify. Make it conditional on `NODE_ENV` and confirm the quiz, Studio, and call flows still work — do not edit it blind.
2. ✅ **Done** — `Strict-Transport-Security` added (see Item 19).
3. ✅ **Fixed.** `Permissions-Policy` denied `microphone=()` — and the app has WebRTC calling and call recording, both of which need it. The audit asked whether the header was wrong or the features were broken: **the header was wrong, and the features were broken.** `views/productivity-views.tsx:655` calls `navigator.mediaDevices.getUserMedia({ audio: true, video })`. An empty allowlist makes the browser reject that request *before* any permission prompt, so `startCall()` always landed in its `catch` and showed "Couldn't access your camera/microphone — check permissions." Every call failed. Now `camera=(self), microphone=(self)`.

**Action:** drop `'unsafe-eval'` from production CSP (dev-only); move to a nonce-based `script-src` if feasible. HSTS and the `microphone` directive are done.

### 19. Force HTTPS — ✅ **FIXED** *(was ⚠️ PARTIAL)*

| Evidence | Detail |
| --- | --- |
| `next.config.mjs:20` | `upgrade-insecure-requests` in CSP ✅ |
| `login/route.ts:39` | Cookie `secure` flag set when the request is HTTPS ✅ |
| HSTS | ✅ **Added** — `Strict-Transport-Security: max-age=63072000` in `next.config.mjs` `headers()`, applied to `/:path*` and `/api/:path*` |

Transport security no longer depends solely on Cloudflare's edge defaults. Without HSTS, the first request in a session could still be downgraded (SSL-strip) if the user typed the bare hostname.

**Deliberate deviation from this report's own recommendation.** It suggested `max-age=63072000; includeSubDomains; preload`. The committed header omits both directives, on purpose:

- `includeSubDomains` applies to **every** subdomain of whatever host the app is served from — including ones this application does not control. On a shared parent domain that is a change with blast radius well beyond this repo.
- `preload` submits the domain to a hardcoded browser list that is deliberately slow and awkward to reverse.

Neither belongs in an application-level header without an explicit decision about the deployment's domain. Add them at the Cloudflare edge, or here once every subdomain is confirmed HTTPS-only. A test asserts they stay absent so this is not re-added by accident.

### 20. Scan Dependencies — ❌ FAIL

| Evidence | Detail |
| --- | --- |
| `.github/workflows/ci.yml` | Runs `pnpm test`, `pnpm lint` (tsc), `pnpm build` — **no audit step** |
| `.github/` | No `dependabot.yml`, no CodeQL workflow |
| `package.json` | No audit/snyk script |
| Exposure | **63 dependencies**, including 21 Tiptap packages, Next.js, React, and the Cloudflare toolchain |

No dependency vulnerability monitoring of any kind.

**Action (cheap and high-value):**
1. Add `pnpm audit --audit-level=high` as a CI step.
2. Add `.github/dependabot.yml` for weekly `npm` + `github-actions` updates.
3. Consider CodeQL for static analysis.
4. Bonus: removing the **17 unused dependencies** identified in the code-quality audit (16 Radix packages + `class-variance-authority`) shrinks this attack surface by 27% before any scanning is added.

---

## Prioritized Remediation Plan

### 🔴 Immediate — ✅ **ALL DONE** (`582d149`)

1. ✅ **Item 5** — fails closed when no master key is set in production; status surfaced in `/api/integrations/health`. **Rotating secrets encrypted under the fallback is still outstanding** — that is a manual provider-side action, not a code change.
2. ✅ **Item 18.3** — `Permissions-Policy` now allows `camera=(self), microphone=(self)`. This was not just misleading config: it broke group calling and call recording outright.
3. ✅ **Item 6** — the 4 mutation routes moved to `requireApiUser()`, plus an invariant test so a new route cannot reintroduce the gap.

### 🟠 Short term (this month)

4. **Item 20** — add `pnpm audit --audit-level=high` to CI and a `.github/dependabot.yml`. *(The 17 unused dependencies this report flagged for removal were already deleted in cleanup stage 1 — 19 removed in total, 63 → 44 — which shrank this attack surface before any scanning was added.)*
5. **Item 18.1** — remove `'unsafe-eval'` from the **production** CSP only. Not done here on purpose: it needs a browser check that this environment cannot perform. Make it `NODE_ENV`-conditional and verify the quiz, Studio and call flows.
6. **Item 12** — add Cloudflare Turnstile to login/signup, or document the edge protection relied upon.
7. **Item 10** — raise PBKDF2 to 600k iterations for new hashes; re-hash on login.

### 🟡 Medium term

8. **Item 4** — introduce an ownership-scoped query helper; add a test asserting every user-data query is scoped.
9. **Item 14** — adopt one consistent input-validation approach at the API boundary.
10. **Item 15** — consolidate the 5 `escapeHtml` copies into one 5-character implementation.
11. **Item 9 (minor)** — `__Host-` cookie prefix.
12. **Item 11 (minor)** — make the durable rate-limit increment atomic.

### One correction

The verdict summary in the original draft said "**5** mutation routes" bypassed the CSRF check while the detail section correctly listed **4**. 4 is right, and re-running the enumeration after the fix confirms it: 32 mutation routes use `requireApiUser`, 4 are public by design (`auth/login`, `auth/logout`, `auth/signup-request`, `invites/accept`), and none are unguarded.

---

## Method & Confidence

- **Evidence:** direct source inspection with file:line citations; full git-history secret scan (`git log --all -p`); regex sweeps for SQL interpolation, `dangerouslySetInnerHTML`, `innerHTML`, CAPTCHA, HSTS, and audit tooling; route-by-route auth-coverage enumeration (49 handlers).
- **Confidence:** **high** for all PASS/FAIL verdicts (mechanically verified). **Medium** for Item 4 and Item 14, where the weakness is a missing *pattern* rather than a missing check.
- **Not covered:** runtime/dynamic testing (no penetration test), Cloudflare dashboard-level configuration (WAF, Bot Fight Mode, TLS settings) which may already compensate for Items 12 and 19, and third-party provider security (Cloudflare AI Gateway, Groq, Mistral, etc.).
- **`pnpm audit` could not be executed.** The local install could not be completed in the sandbox (symlink creation, `wmic.exe`, and package renames are all blocked), so no currently-known-vulnerable versions could be enumerated. Item 20's verdict therefore reflects the **absence of monitoring**, not a confirmed vulnerable dependency. Re-run `pnpm audit --audit-level=high` in a normal environment to complete this item.
- **Verified separately:** typecheck passes and 358/358 tests pass at `5f06f9e1`. Note that the suite covers no route handlers and no `lib/data.ts`, so **none of the security controls in this report are covered by automated tests** — they were verified by reading the source.
