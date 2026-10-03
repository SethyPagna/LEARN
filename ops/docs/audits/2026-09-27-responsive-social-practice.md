# Responsive Social and Practice redesign

The Social workspace now separates browsing from the current conversation or record. Practice opens a visual set library before starting a session. Mobile section navigation keeps every destination visible instead of placing essential tabs outside the viewport.

## Changes

- **Chat:** searchable People / Groups / Saved inbox, recipient picker, intentional empty state, conversation search, contextual reactions, one optional media picker, compact composer, load retries and duplicate-send protection. Drafts belong to an account and conversation; switching recipients preserves separate text. Saved/helpful flags now survive an inbox reload and remain scoped to the current actor.
- **Community:** colored cards for Groups, Rooms and Battles, full in-page details, consistent Back navigation, contextual editing, explicit status selectors, draft recovery, validation and retryable mutations. Existing membership/permission APIs remain authoritative.
- **Practice:** visual library and saved-attempt filter; explicit Quiz, Exam and Cards setup; focused player, pause, marks, question map, visual results, retry and review-card actions. Loading no longer starts the timer; obsolete fetches cannot replace the selected set; scored answers are locked. Repeated search launches, canonical library links and archive cache updates work across navigation.
- **Draft safety:** submitting or archiving while navigating elsewhere reconciles successful storage/cache changes without pulling the user back. A late submit response cannot clear a newer practice draft.
- **Responsive shell:** visible learning/practice/Settings sections at 320px, compact Social tabs, immediate sidebar breakpoint changes, accessible More-panel focus containment, Escape restoration, scroll lock cleanup on desktop resize and page scroll reset on navigation.
- **Cleanup:** removed 74 confirmed unused global selectors from the replaced Social/quiz layouts and obsolete component controls. Kept Games, calls, stories and existing backend capabilities intact.

## Verification

The machine-readable results are in [responsive-social-practice-results.json](2026-09-27-responsive-social-practice-results.json).

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Automated tests | 1,113 passed |
| Production build and emitted CSS | Pass |
| Route matrix | 145 layouts: 29 routes × 320/390/768/1024/1440px; zero failures |
| Shell/menu workflows | 11 passed |
| Responsive navigation and Settings | 32 passed |
| Profile, Settings and Admin regressions | 25 passed |
| Chat | 10 light/dark viewport combinations and 59 assertions; zero runtime errors |
| Community | 60 layouts/panels and 99 assertions; light/dark |
| Practice | 30 layouts, 40 workflow assertions and 15 targeted follow-up assertions |

The route audit checks document overflow, controls/headings outside the content boundary, clipped button labels, accessible control names, a single main landmark, HTTP status and uncaught errors. Horizontal content scrollers are allowed deliberately. Dedicated suites exercise selected populated, empty, loading, failure and retry states. Screenshots were visually inspected for phone, tablet and desktop layouts.

Practice follow-up cases cover focus/keyboard restoration, Back/archive URL behavior, repeat launch from search, delayed submit after navigation, preservation of a newer draft, and delayed archive cache reconciliation. Community tests exercise all three record types, detail tabs, validation, status rollback, draft restoration and duplicate mutation guards. No live accounts, invitations, messages, calendar providers or external services were modified by these tests; mutation requests were intercepted locally.

### Repeating the browser checks

Run `pnpm dev`, open a local Playwright CLI session and sign in with the built-in Admin demo. Each audit creates an isolated browser context with the same authentication and service workers blocked, then closes it. This prevents fixtures, preferences and navigation from affecting another browser session.

```powershell
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=qa run-code --filename ops/scripts/test/playwright-routes.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=qa run-code --filename ops/scripts/test/playwright-responsive.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=qa run-code --filename ops/scripts/test/playwright-social.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=qa run-code --filename ops/scripts/test/playwright-community.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=qa run-code --filename ops/scripts/test/playwright-practice.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=qa run-code --filename ops/scripts/test/playwright-chat.js
```

Screenshots are intentionally local in `output/playwright/`; temporary logs and fixtures remain ignored in `.cache/`. Draft data and `.wrangler/state` were preserved.

## Review and limits

Independent agents reviewed implementation and then cross-reviewed the other workspaces. Their actionable findings—stale library URLs, hidden Create after focus mode, repeated launch state, archive caching, and late-response draft loss—were fixed and checked with targeted browser regressions.

This covers representative routes and nested workflows, not every data state or role. Real provider activation, physical camera/microphone behavior, WAN calling and installed-PWA behavior were not repeated in this pass. No new membership/join API or external social platform was introduced. Browser-local drafts do not imply cross-device draft synchronization. Leaving Chat during an in-flight send can retain the unacknowledged draft even if delivery succeeds; the retired instance cannot overwrite the new workspace's drafts. Exactly-once delivery is not claimed.

The long-running hot-reload development server exhausted its Node heap during stress testing. It was restarted and the interrupted targeted checks rerun successfully. The production build passed; sustained development-server memory behavior remains a separate issue. Existing local Durable Object proxy warnings remain. No merge, remote migration or manual deployment was performed.
