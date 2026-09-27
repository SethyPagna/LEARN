# Light, Dark and Color modes

LEARN now uses one browser-local appearance choice across public, account and workspace pages. New visits default to Color. Existing explicit Light/Dark choices are retained; legacy System choices migrate to the current OS appearance.

## Behavior

- **Light:** white surfaces, dark actions and neutral interface decoration.
- **Dark:** charcoal surfaces, light actions and neutral interface decoration.
- **Color:** the current colorful interface, with six saved accent choices in Settings.
- Landing, tour and account pages expose labeled Light / Dark / Color buttons. Settings adds visual previews. The compact account control uses a keyboard-accessible native selector; the account menu and command palette expose the same choices.
- Shared tokens cover public artwork/chrome, auth illustrations, section icons, Studio project kinds, Social, Practice and learning decorations. Error/success/status colors, charts, authored canvas/document content, templates and media retain their meaning and colors.
- Browser chrome and native form controls follow the selected mode. Practice palette choices require an explicit switch to Color when a neutral mode is active.
- Accent and accessibility preferences load on public pages and synchronize across tabs. An unrelated settings edit merges the latest stored values. Failed writes retain pending session edits until storage recovers.

Removed the replaced binary toggles, System UI option, redundant dark accent overrides and delayed full-snapshot writes. Theme-dependent markup shares a hydration-safe hook.

## Verification

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Automated tests | 1,124 passed |
| Production build / emitted CSS | Pass |
| Playwright theme matrix | 108 layouts; 791 assertions including repeated layout checks; zero uncaught errors |
| Final focused checks | Selected-mode outline in all three modes; browser chrome after client navigation |
| Viewports | 320, 768 and 1440px in all three modes |
| Independent review | Two implementation reviewers and a screenshot review; findings fixed |

The matrix covers Home, Showcase, sign-in, access requests, Settings Appearance, Studio, Practice, Social, Chat, Groups, Calendar and Files. It verifies HTTP responses, overflow, accessible control names, one active mode, shared decorative tokens, native control appearance and browser theme metadata. Representative screenshots were visually inspected.

Interaction checks cover default Color on a dark OS, legacy System migration, public navigation, reload persistence, unchanged sign-in input and canvas artwork, cross-tab mode/accent updates, storage quota failure and recovery, account-menu and command-palette selection, and the explicit Practice Color action.

Browser testing caught an SSR hydration mismatch in Practice's conditional palette control. The final matrix rerun passed after moving theme-dependent rendering through the shared mounted hook. Review also caught stale cross-tab state, lost session edits after storage write failures, semantic green used as decoration, and a weak selected-mode indicator; these were corrected. A focused follow-up found that client navigation can replace browser theme metadata without remounting the provider. Metadata is now reconciled when the router changes it; the focused navigation and selected-outline checks passed and are included in the repeatable audit.

Machine-readable evidence: [theme-results.json](2026-09-27-theme-results.json).

```powershell
pnpm dev
# Use an authenticated local Admin demo session; the audit creates isolated contexts.
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=qa run-code --filename ops/scripts/test/playwright-themes.js
pnpm lint
pnpm test
pnpm build
```

Screenshots remain local in `output/playwright/themes/`. The audit changes only preferences in isolated browser contexts; it does not write accounts, messages, projects or external providers. Existing local data is preserved. This is representative appearance coverage, not a repeat of every nested feature or physical installed-PWA/device test. Existing development/build Durable Object proxy warnings are unchanged.
