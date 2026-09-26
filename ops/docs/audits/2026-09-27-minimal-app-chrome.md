# Minimal visual interface

This pass applies the user's request for less interface copy across LEARN.
Section names, project names, form labels, learning content, permission choices,
recording state and error messages remain readable. Repeated instructions and
secondary explanations no longer fill the default screen.

- Navigation: remove duplicate sidebar submenus for Learning, Practice and
  Social, retaining their page section tabs. Use compact help and presence
  controls and a shorter search label.
- Studio: reduce the recent-project card, remove the default greeting and
  empty promotional banner, and retain the user's own daily focus when set.
- Editor: an icon rail and icon header controls leave more canvas space.
  Selection tools, accessible names, tooltips and menu behavior remain intact.
  Remove repeated panel instructions; retain tool and section names.
- Learning: compact Calendar and Vault actions, simpler Progress headings,
  expandable Feed reading, and fewer duplicated Review counters/instructions.
- Practice: visual launch tiles with short names; Host/Join live quiz cards
  replace repeated introductions. Keep question and answer text untouched.
- Social and AI: compact composer, dictation and common actions. Detailed
  menu descriptions remain available to assistive technology. Recording state
  stays visible. AI task and filter choices remain in their menus.
- Files, Settings, Profile and Admin: reduce introductory copy and redundant
  metadata; keep privacy, sharing and moderation controls unchanged.
- Shared empty states: a simple illustration, title and optional information.

## Validation

TypeScript, 1,104 existing tests, the production build and emitted CSS checks
pass. One existing test caught a lost accessible guide name; it was restored.

Local browser layout checks cover desktop Learning, Files, Settings, Profile,
Admin, Social, Games and Reviews, plus Studio, AI, Live and Canvas inspection.
Sixteen main routes were checked at 390px: dashboard, calendar, vault, progress,
graph, feed, files, ai, practice, live, games, reviews, social, settings, profile
and admin. No document horizontal overflow or rendered application-error page
was found. Canvas Insert and Notes still open through their labelled controls.

Visual evidence is local under `.cache/design-review/minimal-*`. These are
layout and interaction checks, not a new end-to-end verification of external
providers, calls, deployment or every feature. Existing activation limits apply.
