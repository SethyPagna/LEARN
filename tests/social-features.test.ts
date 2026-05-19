import assert from "node:assert/strict"
import test from "node:test"
import { buildChatComposerActions, buildChatComposerPlan, buildChatDraftPayload, buildChatThreadActions, buildChatThreadStatus, buildConnectablePeoplePage, buildConnectionActions, buildConnectionsPage, buildSocialActionKit, buildSocialActionReadiness, buildSocialActionsPage, buildSocialActivityTimeline, buildSocialCommandPrimaryAction, buildSocialCommandRunActions, buildSocialCommandSummary, buildSocialFlowCards, buildSocialInviteReadiness, buildSocialRecordCard, buildSocialRecordEmptyState, buildSocialRecordFilterSummary, buildSocialRecordsPage, buildSocialRecordSelectionMessage, buildSocialWorkspacePlan, buildWorkspaceMembersPage, filterChatThreads, filterConnectableMembers, filterSocialRecords, filterWorkspaceMembers, findRecommendedSocialRecord, formatSocialAction, normalizeSocialInviteDraft, parseThreadTitle, summarizeChatWorkspace, summarizeConnections, summarizeSocialActions, summarizeSocialWorkspace, summarizeWorkspaceMembers } from "../lib/social-features"

test("chat draft payload normalizes channel intent and metadata", () => {
  const payload = buildChatDraftPayload({
    body: "Can @alex review /studio notes?",
    channel: "study-help",
    title: "Database review",
    intent: "question",
  })

  assert.equal(payload.title, "#study-help - Database review")
  assert.equal(payload.body, "[question] Can @alex review /studio notes?")
  assert.equal(payload.metadata.hasMention, true)
  assert.equal(payload.metadata.hasStudioLink, true)
  assert.equal(buildChatDraftPayload({ body: "Reply", channel: "#general", title: "Thread", intent: "update", threadId: " thread_1 " }).threadId, "thread_1")
  assert.equal(buildChatDraftPayload({ body: "New", channel: "#general", title: "Thread", intent: "update", threadId: " " }).threadId, undefined)
})

test("chat thread title parsing keeps channel and readable title", () => {
  assert.deepEqual(parseThreadTitle("#wins - Weekly review"), { channel: "#wins", title: "Weekly review" })
  assert.deepEqual(parseThreadTitle("Plain thread"), { channel: "#general", title: "Plain thread" })
})

test("chat thread filtering supports query questions wins and saved", () => {
  const threads = [
    { title: "#study-help - React", last_message: "[question] Why hooks?" },
    { title: "#wins - Streak", last_message: "[win] Finished reviews" },
    { title: "#general - Links", last_message: "[saved] bookmark this resource" },
    { title: "#general - Saved later", last_message: "Plain update", saved: true },
  ]

  assert.equal(filterChatThreads(threads, { query: "react" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "questions" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "wins" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "saved" }).length, 2)
})

test("summarizeChatWorkspace counts intent signals and channels", () => {
  const summary = summarizeChatWorkspace([
    { title: "#study-help - React", last_message: "[question] Can @alex check /studio notes?" },
    { title: "#wins - Streak", last_message: "[win] Finished reviews" },
    { title: "#general - Links", last_message: "[saved] bookmark this resource" },
    { title: "#general - Later", last_message: "Plain update", saved: true },
  ])

  assert.equal(summary.total, 4)
  assert.equal(summary.questions, 1)
  assert.equal(summary.wins, 1)
  assert.equal(summary.saved, 2)
  assert.equal(summary.mentions, 1)
  assert.equal(summary.studioLinks, 1)
  assert.equal(summary.channels[0].count, 2)
})

test("buildChatComposerPlan recommends draft and thread next actions", () => {
  const empty = summarizeChatWorkspace([])
  const questions = summarizeChatWorkspace([
    { title: "#study-help - React", last_message: "[question] Why hooks?" },
    { title: "#study-help - SQL", last_message: "[question] Index order?" },
  ])

  assert.equal(buildChatComposerPlan(empty).nextAction, "Create the first group update")
  assert.equal(buildChatComposerPlan(questions).recommendedIntent, "question")
  assert.equal(buildChatComposerPlan(questions, "Did anyone review this?").headline, "Finish the current draft")
})

test("buildChatComposerActions gates send clear and suggestions", () => {
  const emptyActions = buildChatComposerActions({ hasDraft: false, hasSuggestion: true })
  const readyActions = buildChatComposerActions({ hasDraft: true, hasSuggestion: true })
  const busyActions = buildChatComposerActions({ busyAction: "send", hasDraft: true, hasSuggestion: true })

  assert.equal(emptyActions.find((action) => action.id === "send")?.disabled, true)
  assert.equal(emptyActions.find((action) => action.id === "use-suggestion")?.disabled, false)
  assert.equal(readyActions.find((action) => action.id === "clear-draft")?.disabled, false)
  assert.equal(busyActions.find((action) => action.id === "send")?.busy, true)
  assert.equal(busyActions.every((action) => action.disabled), true)
})

test("buildChatThreadActions gates helpful save and reply actions", () => {
  const missingActions = buildChatThreadActions({ hasThread: false })
  const readyActions = buildChatThreadActions({ hasThread: true, helpful: true, saved: true })
  const busyActions = buildChatThreadActions({ hasThread: true, busyAction: "save" })

  assert.equal(missingActions.every((action) => action.disabled), true)
  assert.equal(readyActions.find((action) => action.id === "helpful")?.active, true)
  assert.equal(readyActions.find((action) => action.id === "save")?.label, "Saved")
  assert.equal(readyActions.find((action) => action.id === "reply")?.helper, "Prepare a reply draft.")
  assert.equal(busyActions.find((action) => action.id === "save")?.busy, true)
  assert.equal(busyActions.every((action) => action.disabled), true)
})

test("buildChatThreadStatus prioritizes saved helpful questions and recency", () => {
  const now = Date.parse("2026-05-19T12:00:00.000Z")

  assert.deepEqual(buildChatThreadStatus({ saved: true, last_message: "[question] Help?" }, now), { label: "saved", tone: "success" })
  assert.deepEqual(buildChatThreadStatus({ helpful: true, last_message: "Plain" }, now), { label: "helpful", tone: "accent" })
  assert.deepEqual(buildChatThreadStatus({ last_message: "[question] Help?" }, now), { label: "needs reply", tone: "warning" })
  assert.deepEqual(buildChatThreadStatus({ last_message: "[win] Done" }, now), { label: "win", tone: "success" })
  assert.deepEqual(buildChatThreadStatus({ last_message: "Fresh", updated_at: "2026-05-19T01:00:00.000Z" }, now), { label: "new", tone: "accent" })
  assert.deepEqual(buildChatThreadStatus({ last_message: "Old", updated_at: "2026-05-17T01:00:00.000Z" }, now), { label: "read", tone: "muted" })
})

test("summarizeSocialWorkspace creates kind-specific operational signals", () => {
  const spaces = summarizeSocialWorkspace("spaces", [
    { name: "Private circle", visibility: "private" },
    { name: "Open math", visibility: "public" },
  ])
  const rooms = summarizeSocialWorkspace("rooms", [
    { name: "Focus", status: "open", mode: "focus" },
    { name: "Stage", status: "closed", mode: "stage" },
  ])
  const battles = summarizeSocialWorkspace("battles", [
    { title: "Solo sprint", status: "completed", mode: "solo" },
    { title: "Team round", status: "waiting", mode: "team" },
  ])

  assert.equal(spaces.primaryLabel, "Public")
  assert.equal(spaces.primaryCount, 1)
  assert.equal(rooms.primaryLabel, "Open")
  assert.equal(rooms.primaryCount, 1)
  assert.equal(battles.secondaryLabel, "Team")
  assert.equal(battles.secondaryCount, 1)
})

test("buildSocialWorkspacePlan recommends kind-specific next moves", () => {
  const emptySpaces = buildSocialWorkspacePlan("spaces", summarizeSocialWorkspace("spaces", []))
  const activeRooms = buildSocialWorkspacePlan("rooms", summarizeSocialWorkspace("rooms", [
    { name: "Focus", status: "open", mode: "focus" },
  ]))
  const teamBattles = buildSocialWorkspacePlan("battles", summarizeSocialWorkspace("battles", [
    { title: "Team round", status: "waiting", mode: "team" },
  ]))

  assert.equal(emptySpaces.primaryAction, "Create private space")
  assert.equal(activeRooms.primaryAction, "Join active room")
  assert.equal(teamBattles.primaryAction, "Run team round")
  assert.match(emptySpaces.safetyCue, /opt-in/)
})

test("buildSocialActionKit creates compact next-step actions per social surface", () => {
  const spaceKit = buildSocialActionKit("spaces", { title: "Algebra circle", saved: false, visibility: "private", topic: "algebra" })
  const roomKit = buildSocialActionKit("rooms", { title: "Focus block", saved: true, status: "open", mode: "focus" })
  const battleKit = buildSocialActionKit("battles", { title: "Index sprint", saved: true, status: "waiting", mode: "team", topic: "databases" })

  assert.equal(spaceKit.chips[0], "Save first")
  assert.equal(spaceKit.actions[0].id, "invite")
  assert.match(spaceKit.inviteText, /Algebra circle/)
  assert.deepEqual(roomKit.actions.map((action) => action.id), ["invite", "chat", "calendar", "files"])
  assert.deepEqual(battleKit.actions.map((action) => action.id), ["invite", "practice", "chat", "calendar"])
})

test("buildSocialActionReadiness keeps draft actions clear and disabled", () => {
  const inviteAction = buildSocialActionKit("spaces", { title: "Algebra circle", saved: false }).actions[0]
  const draftAction = buildSocialActionReadiness("spaces", inviteAction, false)
  const savedAction = buildSocialActionReadiness("spaces", inviteAction, true)

  assert.equal(draftAction.enabled, false)
  assert.equal(draftAction.label, "Save first")
  assert.match(draftAction.detail, /Save this space/)
  assert.equal(savedAction.enabled, true)
  assert.equal(savedAction.label, "Invite")
})

test("normalizeSocialInviteDraft validates email and role for secure invites", () => {
  assert.deepEqual(normalizeSocialInviteDraft({ email: " New.User@Example.COM ", role: "admin" }), {
    ok: true,
    value: { email: "new.user@example.com", role: "admin" },
  })
  assert.deepEqual(normalizeSocialInviteDraft({ email: "learner@example.com", role: "owner" }), {
    ok: true,
    value: { email: "learner@example.com", role: "learner" },
  })
  assert.equal(normalizeSocialInviteDraft({ email: "bad" }).ok, false)
})

test("buildSocialInviteReadiness blocks unsaved and invalid secure invites", () => {
  const unsaved = buildSocialInviteReadiness({ kind: "rooms", saved: false, email: "learner@example.com" })
  const invalid = buildSocialInviteReadiness({ kind: "rooms", saved: true, email: "bad" })
  const ready = buildSocialInviteReadiness({ kind: "rooms", saved: true, email: "learner@example.com" })
  const created = buildSocialInviteReadiness({ kind: "rooms", saved: true, email: "learner@example.com", linkReady: true })

  assert.equal(unsaved.enabled, false)
  assert.equal(unsaved.label, "Save first")
  assert.match(unsaved.message, /Save this room/)
  assert.equal(invalid.enabled, false)
  assert.equal(invalid.label, "Enter email")
  assert.equal(ready.enabled, true)
  assert.equal(ready.label, "Create link")
  assert.equal(created.label, "Refresh link")
})

test("workspace member helpers summarize and filter people context", () => {
  const members = [
    { name: "Admin User", email: "admin@example.com", role: "admin", status: "active", created_at: "2026-05-17T00:00:00.000Z" },
    { name: "Learner One", email: "learner@example.com", role: "learner", status: "active", created_at: "2026-05-18T00:00:00.000Z" },
    { name: "Pending Friend", email: "pending@example.com", role: "learner", status: "pending", created_at: "2026-05-19T00:00:00.000Z" },
  ]
  const summary = summarizeWorkspaceMembers(members)

  assert.equal(summary.total, 3)
  assert.equal(summary.admins, 1)
  assert.equal(summary.learners, 2)
  assert.equal(summary.active, 2)
  assert.equal(summary.pending, 1)
  assert.equal(summary.newest?.name, "Pending Friend")
  assert.deepEqual(filterWorkspaceMembers(members, "admin").map((member) => member.email), ["admin@example.com"])
})

test("workspace members page keeps people drawers expandable", () => {
  const members = [
    { id: "u1", name: "Alex", role: "admin" },
    { id: "u2", name: "Mina", role: "learner" },
    { id: "u3", name: "Sam", role: "learner" },
  ]
  const page = buildWorkspaceMembersPage(members, "", 2)

  assert.deepEqual(page.items.map((member) => member.id), ["u1", "u2"])
  assert.equal(page.total, 3)
  assert.equal(page.hiddenCount, 1)
  assert.equal(page.emptyAction, "invite")
  assert.equal(buildWorkspaceMembersPage(members, "missing").emptyAction, "clear-search")
})

test("connection helpers find connectable people and summarize social setup", () => {
  const members = [
    { id: "me", name: "Me" },
    { id: "u1", name: "Alex", email: "alex@example.com" },
    { id: "u2", name: "Mina", email: "mina@example.com" },
  ]
  const connections = [
    { target_user_id: "u1", connection_type: "friend", status: "accepted" },
    { target_user_id: "u3", connection_type: "follow", status: "pending" },
  ]

  assert.deepEqual(filterConnectableMembers(members, connections, "me").map((member) => member.id), ["u2"])
  assert.deepEqual(summarizeConnections(connections), { total: 2, friends: 1, follows: 1, pending: 1, blocked: 0 })
  assert.equal(buildSocialCommandSummary({ memberCount: 3, connectionCount: 2, threadCount: 0, spaceCount: 1, roomCount: 0, battleCount: 1 }).headline, "Social is ready")
})

test("buildSocialCommandPrimaryAction guides non-technical next steps", () => {
  const invite = buildSocialCommandPrimaryAction({ memberCount: 1, connectionCount: 0, threadCount: 0, spaceCount: 0, roomCount: 0, battleCount: 0 })
  const find = buildSocialCommandPrimaryAction({ memberCount: 3, connectionCount: 0, threadCount: 0, spaceCount: 0, roomCount: 0, battleCount: 0 })
  const group = buildSocialCommandPrimaryAction({ memberCount: 3, connectionCount: 1, threadCount: 1, spaceCount: 0, roomCount: 0, battleCount: 0 })
  const live = buildSocialCommandPrimaryAction({ memberCount: 3, connectionCount: 1, threadCount: 1, spaceCount: 1, roomCount: 1, battleCount: 1 })

  assert.equal(invite.id, "invite")
  assert.equal(find.id, "find")
  assert.equal(group.id, "spaces")
  assert.equal(live.id, "rooms")
})

test("connectable people page exposes visible and hidden counts", () => {
  const members = [
    { id: "me", name: "Me" },
    { id: "u1", name: "Alex" },
    { id: "u2", name: "Mina" },
    { id: "u3", name: "Sam" },
  ]
  const page = buildConnectablePeoplePage({ members, connections: [], currentUserId: "me", limit: 2 })

  assert.deepEqual(page.items.map((member) => member.id), ["u1", "u2"])
  assert.equal(page.total, 3)
  assert.equal(page.hiddenCount, 1)
  assert.equal(page.emptyAction, "search")
  assert.equal(buildConnectablePeoplePage({ members, connections: [], currentUserId: "me", query: "missing" }).emptyAction, "invite")
})

test("connections page preserves summary while paging visible records", () => {
  const connections = [
    { target_user_id: "u1", connection_type: "friend", status: "accepted" },
    { target_user_id: "u2", connection_type: "follow", status: "accepted" },
    { target_user_id: "u3", connection_type: "friend", status: "pending" },
  ]
  const page = buildConnectionsPage(connections, 2)

  assert.deepEqual(page.items.map((connection) => connection.target_user_id), ["u1", "u2"])
  assert.equal(page.hiddenCount, 1)
  assert.deepEqual(page.summary, { total: 3, friends: 2, follows: 1, pending: 1, blocked: 0 })
})

test("connection actions gate add follow and remove states", () => {
  const connectActions = buildConnectionActions({ targetId: "u1" })
  const removeActions = buildConnectionActions({ connected: true, targetId: "u1" })
  const busyActions = buildConnectionActions({ busyAction: "follow", busyTargetId: "u1", targetId: "u1" })

  assert.equal(connectActions.find((action) => action.id === "friend")?.disabled, false)
  assert.equal(connectActions.find((action) => action.id === "remove")?.disabled, true)
  assert.equal(removeActions.find((action) => action.id === "friend")?.disabled, true)
  assert.equal(removeActions.find((action) => action.id === "remove")?.disabled, false)
  assert.equal(busyActions.find((action) => action.id === "follow")?.busy, true)
  assert.equal(busyActions.every((action) => action.disabled), true)
})

test("social command run actions gate posting inviting and busy flows", () => {
  const emptyActions = buildSocialCommandRunActions({ hasPostDraft: false, inviteReady: false })
  const readyActions = buildSocialCommandRunActions({ hasPostDraft: true, inviteReady: true })
  const busyActions = buildSocialCommandRunActions({ busyAction: "spaces", hasPostDraft: true, inviteReady: true })

  assert.equal(emptyActions.find((action) => action.id === "post")?.disabled, true)
  assert.equal(emptyActions.find((action) => action.id === "invite")?.disabled, true)
  assert.equal(readyActions.find((action) => action.id === "post")?.disabled, false)
  assert.equal(readyActions.find((action) => action.id === "invite")?.disabled, false)
  assert.equal(busyActions.find((action) => action.id === "spaces")?.busy, true)
  assert.equal(busyActions.every((action) => action.disabled), true)
})

test("social flow cards keep the combined Social entry simple", () => {
  const cards = buildSocialFlowCards({ threadCount: 0, spaceCount: 2, roomCount: 0, battleCount: 1 })

  assert.deepEqual(cards.map((card) => card.label), ["Chat", "Groups", "Live", "Battles"])
  assert.equal(cards[0].action, "Post first update")
  assert.equal(cards[0].createAction, "Post update")
  assert.equal(cards[1].action, "Open groups")
  assert.equal(cards[1].createAction, "New group")
  assert.equal(cards[1].ready, true)
  assert.equal(cards[2].action, "Start room")
  assert.equal(cards[2].createAction, "Start room")
  assert.equal(cards[3].createAction, "New battle")
  assert.equal(cards[3].count, 1)
})

test("buildSocialActivityTimeline turns workspace state into compact next steps", () => {
  const timeline = buildSocialActivityTimeline({
    kind: "rooms",
    title: "Focus room",
    saved: false,
    inviteLinkReady: true,
    memberSummary: { total: 3, admins: 1, learners: 2, active: 2, pending: 1 },
    suggestedAction: "Run the next focus block",
  })

  assert.equal(timeline[0].label, "Room draft")
  assert.equal(timeline[0].tone, "draft")
  assert.equal(timeline[1].label, "Secure invite ready")
  assert.equal(timeline[2].detail, "2 active, 1 pending, 1 admin.")
  assert.equal(timeline.at(-1)?.detail, "Run the next focus block")
})

test("social action helpers summarize and format recent activity", () => {
  const actions = [
    { actor_name: "Mina", action_type: "comment", target_type: "learning_space", body: "Great resource", created_at: "2026-05-18T00:00:00.000Z" },
    { actor_name: "Alex", action_type: "save", target_type: "study_battle", created_at: "2026-05-19T00:00:00.000Z" },
  ]
  const summary = summarizeSocialActions(actions)

  assert.equal(summary.total, 2)
  assert.equal(summary.comments, 1)
  assert.equal(summary.saves, 1)
  assert.equal(summary.newest?.actor_name, "Alex")
  assert.deepEqual(formatSocialAction(actions[0]), { label: "Mina comment", detail: "Great resource" })
  assert.deepEqual(formatSocialAction(actions[1]), { label: "Alex save", detail: "Updated study battle." })
})

test("social actions page keeps activity drawers expandable", () => {
  const actions = [
    { id: "a1", actor_name: "Mina" },
    { id: "a2", actor_name: "Alex" },
    { id: "a3", actor_name: "Sam" },
  ]
  const page = buildSocialActionsPage(actions, 2)

  assert.deepEqual(page.items.map((action) => action.id), ["a1", "a2"])
  assert.equal(page.total, 3)
  assert.equal(page.hiddenCount, 1)
})

test("filterSocialRecords combines text search with workspace filters", () => {
  const records = [
    { name: "Private algebra", visibility: "private", mode: "focus" },
    { name: "Public biology", visibility: "public", mode: "discussion" },
    { title: "Team calculus", status: "waiting", mode: "team", topic: "math" },
  ]

  assert.deepEqual(filterSocialRecords(records, { query: "bio" }).map((record) => record.name), ["Public biology"])
  assert.equal(filterSocialRecords(records, { filter: "private" }).length, 1)
  assert.equal(filterSocialRecords(records, { filter: "team" }).length, 1)
  assert.equal(filterSocialRecords(records, { query: "math", filter: "active" }).length, 1)
})

test("findRecommendedSocialRecord matches the Social primary action intent", () => {
  const spaces = [
    { id: "s1", name: "Private", visibility: "private" },
    { id: "s2", name: "Public", visibility: "public" },
  ]
  const rooms = [
    { id: "r1", name: "Closed", status: "closed" },
    { id: "r2", name: "Open", status: "open" },
  ]
  const battles = [
    { id: "b1", title: "Solo", mode: "solo", status: "waiting" },
    { id: "b2", title: "Team", mode: "team", status: "completed" },
  ]

  assert.equal(findRecommendedSocialRecord("spaces", spaces)?.id, "s2")
  assert.equal(findRecommendedSocialRecord("rooms", rooms)?.id, "r2")
  assert.equal(findRecommendedSocialRecord("battles", battles)?.id, "b2")
  assert.equal(findRecommendedSocialRecord("spaces", [])?.id, undefined)
})

test("buildSocialRecordCard creates compact card chips", () => {
  const spaceCard = buildSocialRecordCard("spaces", { id: "s1", name: "Algebra", visibility: "public", member_count: 3 }, "s1")
  const roomCard = buildSocialRecordCard("rooms", { id: "r1", name: "Focus", status: "open", mode: "focus", pomodoro_minutes: 30 })
  const battleCard = buildSocialRecordCard("battles", { id: "b1", title: "Index sprint", status: "waiting", mode: "team", topic: "databases" })
  const completedBattleCard = buildSocialRecordCard("battles", { id: "b2", title: "Index replay", status: "completed", mode: "team", topic: "databases" })

  assert.equal(spaceCard.recommended, true)
  assert.equal(spaceCard.action, "Review")
  assert.deepEqual(spaceCard.meta, ["public", "3 members"])
  assert.equal(roomCard.action, "Join")
  assert.deepEqual(roomCard.meta, ["focus", "30 min"])
  assert.equal(battleCard.action, "Play")
  assert.deepEqual(battleCard.meta, ["team", "databases"])
  assert.equal(battleCard.status, "waiting")
  assert.equal(completedBattleCard.action, "Review")
})

test("buildSocialRecordSelectionMessage gives clear next steps", () => {
  assert.match(buildSocialRecordSelectionMessage("spaces", { name: "Algebra" }), /Invite, chat/)
  assert.match(buildSocialRecordSelectionMessage("rooms", { name: "Focus" }), /Join, schedule/)
  assert.match(buildSocialRecordSelectionMessage("battles", { title: "Index sprint" }), /Play, recap/)
})

test("buildSocialRecordEmptyState separates empty records from filtered records", () => {
  const empty = buildSocialRecordEmptyState({ emptyHint: "Create one.", filter: "all", title: "Study Rooms", total: 0, visible: 0 })
  const filtered = buildSocialRecordEmptyState({ emptyHint: "Create one.", filter: "focus", query: "biology", title: "Study Rooms", total: 3, visible: 0 })

  assert.equal(empty.action, "create")
  assert.equal(empty.title, "No study rooms yet")
  assert.equal(filtered.action, "clear")
  assert.equal(filtered.title, "No matching records")
  assert.match(filtered.body, /biology/)
})

test("buildSocialRecordFilterSummary reports active search and filters", () => {
  const idle = buildSocialRecordFilterSummary({ filter: "all", total: 8, visible: 8 })
  const filtered = buildSocialRecordFilterSummary({ filter: "focus", query: "biology", total: 8, visible: 2 })

  assert.equal(idle.active, false)
  assert.equal(idle.label, "8/8 visible")
  assert.equal(filtered.active, true)
  assert.equal(filtered.label, 'Filtered: "biology" + focus (2/8)')
})

test("social records page keeps filtered lists compact", () => {
  const records = [
    { name: "Room 1", status: "open", mode: "focus" },
    { name: "Room 2", status: "open", mode: "focus" },
    { name: "Team battle", status: "waiting", mode: "team" },
  ]
  const page = buildSocialRecordsPage(records, { filter: "active", limit: 2 })

  assert.deepEqual(page.items.map((record) => record.name), ["Room 1", "Room 2"])
  assert.equal(page.total, 3)
  assert.equal(page.hiddenCount, 1)
})
