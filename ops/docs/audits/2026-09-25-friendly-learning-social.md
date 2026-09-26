# Learning, practice and social usability refinement

## Delivered

- Narrowed the expanded sidebar from 232 to 196px and its icon rail from 76 to
  64px. Tightened navigation rows and placed account, theme and notification
  controls together. Learning, Practice and Social have independent page tabs,
  so their destinations remain accessible with collapsed navigation.
- Calendar opens with its category/source filters folded into one control,
  including a hidden-filter count. Existing connections, event editing and
  separate year/month controls remain available.
- Vault uses a note picker/list, the selected note's saved blocks, short source
  actions and optional block/topic tools. Open notes targets the selected note.
- Progress shows one goal ring, three supporting metrics and short next actions.
  Removed the duplicate goal value, internal priority labels and command panels.
- Graph fits its visible topics, supports keyboard selection and filters edges
  along with nodes. Filtering out the selection chooses a visible topic. Empty
  filter results have feedback instead of a blank map.
- Feed shows short lesson cards, topic filters and expandable questions. Failed
  answer saves leave the question available for retry and show the error.
- Practice has six persisted visual designs: Confetti, Ocean, Arcade, Sunset,
  Garden and Minimal. Their colors carry into quizzes, live quiz panels and game
  prompts/choices. Quizzes open one question at a time, with Previous/Next and an
  All questions toggle. Focus hides the extra launchers and set list.
- Social uses Chats/Groups/Rooms/Battles tabs, searchable record lists, a selected
  record cover and separate Overview/Invite/People/Activity/Manage sections.
  Forms open only when adding or editing. Unsaved records offer setup without a
  wall of disabled action tiles. Workspace people and activity are labeled as
  workspace data, not presented as group membership or fabricated activity.
- Chat uses a story avatar strip and a modal viewer/composer. The modal is
  portalled outside the inbox so collapsing/hiding the inbox cannot hide an open
  modal. Recipient selection and composer tools now use distinct menu state.
  New message opens recipients; phone composer controls fit above navigation.
- Removed replaced guide panels and their unused imports, helpers and derived
  state. Retained shared libraries that other views and tests still use.

## Verification

- TypeScript and all 1,095 automated tests pass.
- Production Next.js build and generated CSS validation pass. Existing internal
  Durable Object proxy warnings do not constitute deployed Worker verification.
- Browser checks covered desktop and 390px phone layouts: learning section tabs,
  Calendar filters, Vault loading, Progress, Graph selection/filter fallback,
  Feed cards, Practice question paging/all-questions mode, design choices and
  persistence into Live and Games, Social browsing/edit panels, and Chat menus.
- Verified the story composer opens on a phone and Escape closes it. Verified
  compact account/theme/notification controls in desktop light and dark mode.
- Browser testing caught and fixed hidden-parent story dialogs, mobile composer
  height, duplicate recipient/tools state, responsive quiz grid behavior and
  poor graph sizing for small collections. A stale local Turbopack cache was
  refreshed before the final responsive checks.
- Restored the original light theme, expanded sidebar and Confetti preference;
  reset the test viewport and closed the temporary tab. No messages, stories,
  invitations, live sessions or quiz submissions were sent during this pass.

## Boundaries

This pass changes presentation and client interactions; it does not establish
new external accounts, deploy migrations or add backend group membership.
Existing calendar activation and network/device call verification requirements
remain in the earlier reports. Visual designs are browser-local preferences.

## Icon-only branding follow-up

Removed the sidebar wordmark while preserving the accessible LEARN home label.
The shared SVG is now a blue folded-book tile with a mint accent. Sidebar/mobile
branding, browser favicons, Apple and installed-app icons use the same artwork;
the maskable icon retains an inset safe area. Verified the expanded sidebar in
light and dark mode, inspected the raster artwork, and passed TypeScript and all
1,095 tests. Existing OS installations may refresh their icon on a later update.
