# Public entry and account redesign

The public home, product tour and account entry now use the same visual
direction: neutral light/charcoal surfaces, cobalt actions, lilac/apricot/mint
artwork, large short headings and a focused next action.

## Experience

- `/` presents “Your ideas, in full color” with an interactive Studio example,
  a quick practice question and a selectable weekly plan. Three visual paths
  link to the matching tour section. Existing signed-in routing is preserved.
- `/showcase` offers Create, Understand, Practice, Plan and Connect previews.
  The samples are explicitly examples; they do not call AI, send messages or
  change a workspace. Tabs support arrow/Home/End keys. Normal page scrolling
  replaces the old wheel/global-arrow interception and fixed viewport clipping.
- `/login` combines a creative collage with a focused form. On phones the
  artwork becomes a small header vignette. Password visibility, demo filling,
  recovery guidance, pending states and error feedback remain accessible.
- `/login?mode=request` opens the access form directly. Role choices are native
  radios presented as visual tiles. Confirmation clearly states that an admin
  reviews requests and an invitation is still required; it does not claim that
  an email was sent or an account was created.
- `/invite/[token]` uses the same frame. Verified email is bound to the invite;
  invalid links hide account creation. Connection, server and rate-limit lookup
  errors offer retry. Failed submission retains details and permits retry.
- Synchronous pending guards prevent repeated login, request and invite submits.
  Switching account modes closes old password help and resets transient errors.
  Internal return paths remain protected by the existing redirect validator.
- `/intro-classic` redirects to the new tour. Its unused 524-line workflow
  component is removed. Public styles are scoped CSS modules; app workspaces
  retain their own styles. Public pages retain theme switching; the locale
  control that changed document language without translating the English copy
  is removed. Language settings inside the app remain available.

## Verification

Final browser result: **32/32 layouts and 71 interaction assertions pass**
(32 public, 23 login/request, 16 invite), with no uncaught page errors.

`ops/scripts/test/playwright-public.js` runs an anonymous local browser audit.
All account, signup-request and invitation writes and their destination pages
are intercepted with fixtures. No account, access request, invite or message is
created and no external AI request is made.

The layout matrix covers home, tour, sign-in, access request, ready invite and
expired invite at 1440×900 and 390×844 in light and dark mode. Home and tour also
run at 768×1024 and 320×740. Checks include HTTP status, one main landmark,
horizontal overflow, visible control names, clipped direct button text and
uncaught browser errors.

Behavior checks cover palette changes, practice feedback, calendar selection,
tour keyboard controls/deep links, theme persistence, reduced motion, CTA
routing, password visibility, pending guards, failure/rate-limit recovery,
request confirmation, safe login redirects and invitation creation states.
Expanded tutor previews are measured in the 320/390px viewport: a fixed-height
clipping defect found during review is now covered by a regression assertion.

Screenshots were visually inspected for desktop, tablet and narrow phone
layouts. The 320px auth artwork no longer overlaps its heading. Mobile inputs
use 16px text. Reduced-motion behavior is also guarded for both public CSS
modules by the repository quality tests.

See `2026-09-27-public-entry-results.json` for final machine-readable counts.
TypeScript, all 1,111 repository tests, the production build and emitted CSS
validation pass. Existing local Durable Object proxy warnings remain unrelated
to this public-interface change; deployed Worker behavior was not tested.

## Repeat

Start `pnpm dev` and create `output/playwright/public` if needed. Use a dedicated
anonymous browser session because the audit clears that session's cookies:

```powershell
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=public-review open http://localhost:3000/ --browser=chrome
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=public-review run-code --filename ops/scripts/test/playwright-public.js
```

The runner throws on failed assertions, layout failures or page errors. Reports
and screenshots are local artifacts under ignored `.cache/` and
`output/playwright/`; the recorded result JSON is versioned. Production auth
delivery, real invite issuance, deployment and native browser installation are
outside this visual/account-entry pass.
