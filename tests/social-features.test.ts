import assert from "node:assert/strict"
import test from "node:test"
import { buildChatComposerPlan, buildChatDraftPayload, buildSocialActionKit, buildSocialActivityTimeline, buildSocialWorkspacePlan, filterChatThreads, filterSocialRecords, filterWorkspaceMembers, normalizeSocialInviteDraft, parseThreadTitle, summarizeChatWorkspace, summarizeSocialWorkspace, summarizeWorkspaceMembers } from "../lib/social-features"

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
  ]

  assert.equal(filterChatThreads(threads, { query: "react" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "questions" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "wins" }).length, 1)
  assert.equal(filterChatThreads(threads, { filter: "saved" }).length, 1)
})

test("summarizeChatWorkspace counts intent signals and channels", () => {
  const summary = summarizeChatWorkspace([
    { title: "#study-help - React", last_message: "[question] Can @alex check /studio notes?" },
    { title: "#wins - Streak", last_message: "[win] Finished reviews" },
    { title: "#general - Links", last_message: "[saved] bookmark this resource" },
  ])

  assert.equal(summary.total, 3)
  assert.equal(summary.questions, 1)
  assert.equal(summary.wins, 1)
  assert.equal(summary.saved, 1)
  assert.equal(summary.mentions, 1)
  assert.equal(summary.studioLinks, 1)
  assert.equal(summary.channels[0].count, 1)
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
