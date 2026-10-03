# Cloudflare release and local version cleanup — 2026-10-03

## Resume here

- Actual checkout: `C:/Users/user/Downloads/Projects/LEARN`, `cleanup/stage-1`, source `b7ec6b277a5410615996aef8072e27b1c4bd453e`. GitHub confirms this branch is 249 commits ahead of default `main`, zero behind; its October 1 tests/type/build CI passed. Keep GitHub branches and history.
- Preserve the earlier publication lane's historical appendices in `ops/docs/roadmap/progress.md` and `ops/docs/sessions/2026-10-01-navigation-polish.md`. After stable repeated reads, root saved them unchanged in a separate documentation commit under the user's commit authorization. Their earlier deployment-order limitations are superseded by this release's source/evidence below.
- User authorizes publishing LEARN and the portfolio to Cloudflare, replacing the outdated portfolio link, and removing proven obsolete local versions/useless files. Their explicit clarification is to move both sites. No new Vercel deployment.
- Harness Build run: `run-d9e4d03d-907f-4a3d-9c51-eab577d723e8`, area `cloud-release`. Goal is current public LEARN, accurate portfolio link and only the latest useful local source, preserving data/assets/WIP/history.
- Cloudflare connector confirms account `d105a82bc26b6913575355352c2d1bb1`, sole LEARN Worker `learn`, `https://learn.learn-app.workers.dev`, D1 `learn-db`, R2 `learn-files`/`learn-next-cache`. Other Workers are unrelated and untouched. Live Worker last deployed June 21; its migration tag is `v6_add_presence_durable_object`, absent from both source configurations.
- The latest failed Cloudflare workflow reported error 10074: trying to recreate an already-used StudyRoom Durable Object. Wrangler 4.95.0 replays all configured migrations if it cannot find the live tag. Repair requires a matching applied-history marker before a unique new Chat migration, preserving existing namespaces.
- Remote D1 ledger contains migrations 0001–0012; 0013–0018 are pending. Only read-only schema/ledger queries and a Time Travel recovery-bookmark read ran. Confirm additive columns against current schema before any application. Local Wrangler OAuth points at unrelated BusinessOS; do not change its login or use it to deploy LEARN. Existing GitHub deployment credentials/workflow target this project's configured account.
- Canonical portfolio is `C:/Users/user/Projects/pagna-portfolio`, clean main `851ccc02c8f3ea910ad10246231e8321236ea68b`, repo `SethyPagna/SethyPagna`, root `portfolio/`, public `https://sethy-pagna.vercel.app`. Its first LEARN link is outdated `learn-ten-pearl.vercel.app`; replace with the verified Cloudflare URL and update matching release notes/screenshots.
- Root owns release config/workflow/tests/log. Delegates audit GitHub, portfolio and local-copy inventory read-only. No heavy laptop build/test/install is running or planned: use hosted GitHub checks/builds, with serial project verification. Next: repair/review migration config and build-before-schema deployment ordering, run hosted checks, dispatch existing Cloudflare workflow, verify live app, update portfolio and clean only proven obsolete local artifacts.

## Request and decisions

- Paraphrased: inspect GitHub and cloud services, publish the latest LEARN, correct the portfolio, keep GitHub branches, remove outdated local copies and unnecessary files, and use Cloudflare for LEARN rather than Vercel.
- Keep the existing account, Worker, database, buckets and Durable Object data. Do not provision replacements, move the project, delete Git history, change global provider login, touch cleanup staging, or delete unrelated projects.
- A READY Vercel preview at the latest SHA establishes a frontend preview, not the requested Cloudflare production release. The Vercel connector's project-read schema is inconsistent; no Vercel write was attempted.

## Tasks

| Task | Status |
| --- | --- |
| GitHub/source and existing cloud inventory | Done, fresh read-only provider/GitHub evidence |
| Migration/config and safe deployment ordering | Committed; independent static review passed, hosted tests pending |
| Hosted verification / Cloudflare deployment | CI 37094509890 passed 1372 tests/typecheck/build/four CSS checks at b6731be; deployment pending |
| Public browser/editor/auth smoke | To do |
| Portfolio canonical link / current preview | To do, stale checkout avoided |
| Local duplicate/cache inventory | Done, six generated candidates total 8.37 GiB; no deletion |
| Focused commits / push / integrity / receipts | To do; prior WIP preserved |

## Evidence and checkpoints

- Read current Resume/session/Git state, meta-harness GET-STARTED/core/Build/team guidance and current skills. Independently checked GitHub and portfolio source. Provider inventory confirms real live age, resources, applied migration tag and database ledger. No deployment, schema write, local deletion, merge or global login change has occurred.
- A separate storage coordinator requested heavy-job timing. A read of that chat verified direct human permission to coordinate with LEARN; root sent a current no-heavy-job ACK. Hosted release checks avoid competing for the PC. Local cleanup will wait until its metadata census finishes, with exact deletion receipts supplied afterwards.
- Independent review confirmed Wrangler 4.95.0 submits only the migration suffix after the matching applied v6 tag. Both configs now preserve the applied tag and create only Chat at v7. Regression guard covers the entire suffix, duplicate tags and configuration parity. No DO data/class deletion.
- Root split the runner into build/upload/default operations, removed destructive broad workspace cleanup from publication, serialized hosted releases and moved compilation before live D1 in both workflow and Windows run file. Upload requires the pinned account; a delegated read-only preflight will verify live bindings/ledger/schema and record a recovery point before writes. These changes are written but NOT YET TESTED.
- Fresh read-only D1 PRAGMAs confirm all three columns targeted by pending 0013/0014 are absent. Ledger remains the exact 0001–0012 prefix; no database changes occurred. Existing correct GitHub credentials will be used without changing global Wrangler OAuth.
- Local inventory at 03:30 UTC found only the active checkout and a 45 KB unborn June archive with unique configuration/environment/Git objects. Preserve/reconcile its material before retiring the older folder. Six cache candidates are recorded in ignored `.cache/design-review/2026-10-03-local-version-inventory.json`; local data, evidence, original assets and production output are preserved.
- Review caught and fixed a direct-run edge case: the default deploy command now applies D1 after build/preflight as well. All three entry points use the same ordering, upload refuses a missing completed artifact, and production runs cannot cancel an in-progress migration. The hosted artifact preserves only the nonsecret timestamp/source/ledger summary; private bookmarks stay in ignored recovery receipts. A current provider bookmark and prior deployment/version/bindings are retained locally before release.
- User authorized coordination with "Improve portfolio immersion". That chat is now the sole portfolio writer/deployer and accepted handoff of the six scoped LEARN link/docs/art changes. It is creating `sethy-pagna` Pages via the existing Cloudflare Git integration, planned `https://sethy-pagna.pages.dev`; not yet live. Root will send verified LEARN evidence before its publication and will not duplicate portfolio deployments.
- Focused local commits preserve applied DO history (`03eed5e`) and disable new Vercel Git deployments (`bb35ad1`). No cloud write by this LEARN lane yet. Hosted CI is the next gate; no laptop heavy job or reservation is held.
- Hosted CI `37094509890` at exact `b6731be366ec0aa1327b8eb11aa5d60563f9317d` completed successfully: 1372 tests, zero failures, typecheck, production build and four CSS checks. Log saved privately under `.cache/release/ci-b6731be.log`. Two Git remote reads and independent GitHub ref agree with local HEAD at that checkpoint. Anonymous browser regression is being added for the hosted release; no public-user data write or account creation is part of its checks.
- The 45 KB June archive's 37 files, including local configuration and original Git objects, are preserved in ignored `.cache/recovery/learn-2026-06`, verified with two reads of each original and copy against a before-copy manifest. Original archive has not been removed; cleanup waits for the storage census. Receipt remains private and no secret values were printed.
