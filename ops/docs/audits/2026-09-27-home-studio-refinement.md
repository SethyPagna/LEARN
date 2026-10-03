# Public home and Studio refinement

The public landing page now leads with “Learn it. Make it yours.” on a lilac hero, followed by an interactive workspace and three illustrated Create, Practice and Plan cards. Copy stays short; real tour links, preview interactions, theme switching and the invitation-request entry point remain available.

Studio places project search, workspace appearance and a text-only Add trigger together at every tested width. Categories remain above the tools on smaller screens. Account controls now read theme, notifications, then profile. Custom workspace names remain visible on phones even without daily-focus text. A synchronous pending guard prevents duplicate project creation.

## Validation

| Check | Result |
| --- | --- |
| TypeScript (`pnpm lint`) | Passed |
| Unit tests (`pnpm test`) | 1,111 passed; no failures or skips |
| Production build (`pnpm build`) | Passed, including emitted CSS validation |
| Studio | 89 assertions; 10 layouts at 320/390/768/1024/1440 px in both themes |
| Public/account entry | 32 layouts; 74 interaction/link assertions |
| App routes | 58 layouts across 29 routes; 11 shell/menu assertions |
| Browser errors | None in the successful audits |
| Git integrity | `git fsck --full --no-dangling` passed before changes; remote base contained all of `origin/main` |

The browser audits measure overflow, accessible control names, button-label clipping, main landmarks, menu bounds and focus. Studio checks also cover search/categories, recent previews, sidebar modes, personalized mobile headings and intercepted creation failure/retry. Public checks exercise interactive examples, reduced motion, theme persistence, deep links and mocked sign-in/invitation failure, retry, pending and redirect behavior.

Desktop, tablet and phone screenshots were inspected in light and dark themes, including the final 320px landing page. Independent review caught the personalized-heading issue and removed 29 obsolete landing-only CSS classes and their responsive variants while preserving shared showcase styles.

## Repeatable evidence

- [Machine-readable results](2026-09-27-home-studio-results.json)
- `ops/scripts/test/playwright-studio.js`: authenticated demo Admin; requires existing projects in all five formats and scrollable recents.
- `ops/scripts/test/playwright-public.js`: dedicated anonymous local session; account and invite writes are intercepted.
- `ops/scripts/test/playwright-routes.js`: authenticated local session.
- Local screenshots: `output/playwright/public/`, `output/playwright/routes/`, `output/playwright/studio-home-*.png`, `output/playwright/studio-sidebar-*.png` and `output/playwright/studio-personal-title-390.png`.

Run these scripts with the pinned Playwright CLI, for example:

```powershell
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=publicqa open http://localhost:3000/
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=publicqa run-code --filename ops/scripts/test/playwright-public.js
```

## Scope and test setup

This verifies representative routes and the changed workflows, not every state or external service. Existing local Durable Object proxy warnings remain; deployed Worker, live provider accounts and installed-PWA behavior were not revalidated in this pass. Sign-up still requests an invitation for admin review.

An early Studio test used an indefinite intercepted-request barrier and failed during cleanup. A blank local `Untitled canvas` appeared afterward, but its origin could not be proven from a captured response ID. The record investigated (`design_71f5tu8u87h`) was briefly archived and immediately restored; restoration was verified active, with its original blank content unchanged. It was left intact. The final repeatable test uses a bounded intercepted 503 response and sent no real project-creation request. Browser preferences and sidebar state were restored after the Studio audit. No production data or external provider data was changed.
