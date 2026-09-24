# Personal Studio lobby and appearance refresh

The signed-in landing page now opens one personal Studio lobby. Canvas, notes,
documents, slides and sheets can be created there and reopened from the same
recent-project grid. `/studio` and `/canvas` remain supported aliases; canvas
deep links still open the saved design editor. The previous dashboard component
was removed, while learning progress remains available through Progress.

## Appearance

- Cool neutral light surfaces and graphite dark surfaces replace the sand palette.
- A geometric LEARN mark replaces the notebook icon in navigation and app icons.
- Quieter navigation, consistent line icons and sans-serif display typography.
- Settings > Appearance offers Light, Dark and System modes, six accent choices,
  a workspace name and a short daily focus. Preferences persist on this browser.
- The lobby shows six recent projects initially, with search, filters and Show more.
- Existing authored canvas colors and saved projects are preserved.

## Behavior and recovery

Creation uses the existing resource APIs, then opens the saved record by ID.
Editor home/back actions return to the shared lobby. Explicit project links only
restore a local draft belonging to the requested, loaded record. The document
Copy to Designs action updates shell routing as well as the browser URL.

## Validation

- Windows check launcher: TypeScript and all 1,069 tests passed.
- Windows production build: Next.js build, 87 static-generation tasks and built
  CSS validation passed. Existing local Durable Object binding-proxy warnings
  remain; this is not a deployed Worker verification.
- Browser: each of the five creation tiles opened its persisted editor; canvas
  title edits survived save, return to the lobby and reopening.
- Browser: document Copy to Designs opened the newly created canvas editor.
- Browser: `/`, `/studio` and `/canvas` opened the signed-in shared lobby.
- Browser: light/dark appearance, accent, workspace name and daily focus persisted
  across reload; settings deep links rendered without hydration errors.
- Desktop at 1440 x 1000 and phone at 390 x 844 inspected; no horizontal document
  overflow at phone width. Both light and dark lobby screenshots inspected.
- Six records created specifically for these checks were archived afterward.
  Existing records and earlier verification history were retained.

Local screenshots (ignored build artifacts):

- `output/playwright/redesign-home-desktop.png`
- `output/playwright/redesign-home-mobile.png`
- `output/playwright/redesign-home-dark.png`
- `output/playwright/redesign-settings-light.png`

This change follows the completed takeover work documented in
`2026-09-24-takeover-verification.md`; it does not supersede that history.
