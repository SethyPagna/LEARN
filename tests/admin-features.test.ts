import assert from "node:assert/strict"
import test from "node:test"
import { adminPanelTabOptions, buildAdminOperationalPlan, buildAdminSummaryChips, extractAccessRequests, filterAdminList, summarizeAdminOperations } from "../lib/admin-features"

test("summarizeAdminOperations flags enabled providers missing keys or failing", () => {
  const summary = summarizeAdminOperations({
    adminData: {
      users: [{ id: "u1" }, { id: "u2" }],
      providers: [
        { id: "p1", name: "Groq", enabled: true, has_key: true, last_status: "ok", priority: 20 },
        { id: "p2", name: "Mistral", enabled: true, has_key: false, priority: 10 },
        { id: "p3", name: "Old", enabled: false, has_key: false, priority: 1 },
        { id: "p4", name: "Google", enabled: true, has_key: true, last_status: "error", priority: 30 },
      ],
      audit: [{ action: "login" }],
    },
    automationData: { jobs: [{ key: "daily", label: "Daily route" }] },
  })

  assert.equal(summary.systemTone, "watch")
  assert.equal(summary.cards.find((card) => card.id === "providers")?.value, "1/4")
  assert.deepEqual(summary.providerIssues.map((provider) => provider.name), ["Mistral", "Google"])
  assert.equal(summary.visibleAutomation.length, 1)
})

test("admin panel tab options match the operational sections", () => {
  assert.deepEqual(adminPanelTabOptions.map((option) => option.id), ["overview", "access", "users", "providers", "audit", "automation"])
  assert.deepEqual(adminPanelTabOptions.map((option) => option.label), ["Overview", "Access", "Users", "Providers", "Audit", "Automation"])
})

test("filterAdminList searches selected fields only", () => {
  const results = filterAdminList(
    [
      { name: "Ada", role: "admin", email: "ada@example.com" },
      { name: "Ben", role: "learner", email: "ben@example.com" },
    ],
    "admin",
    ["name", "role"],
  )

  assert.deepEqual(results.map((item) => item.name), ["Ada"])
  assert.equal(filterAdminList(results, "", ["name"]).length, 1)
})

test("buildAdminOperationalPlan points admins to the riskiest tab", () => {
  const providerPlan = buildAdminOperationalPlan(summarizeAdminOperations({
    adminData: {
      providers: [{ name: "Groq", enabled: true, has_key: false }],
      audit: [{ action: "login" }],
    },
    automationData: { jobs: [{ key: "daily", label: "Daily" }] },
  }))
  const auditPlan = buildAdminOperationalPlan(summarizeAdminOperations({
    adminData: { providers: [{ name: "Groq", enabled: true, has_key: true, last_status: "ok" }], audit: [] },
    automationData: { jobs: [{ key: "daily", label: "Daily" }] },
  }))
  const readyPlan = buildAdminOperationalPlan(summarizeAdminOperations({
    adminData: { providers: [{ name: "Groq", enabled: true, has_key: true, last_status: "ok" }], audit: [{ action: "update" }] },
    automationData: { jobs: [{ key: "daily", label: "Daily" }] },
  }))

  assert.equal(providerPlan.targetTab, "providers")
  assert.equal(providerPlan.riskCount, 1)
  assert.equal(auditPlan.targetTab, "audit")
  assert.equal(readyPlan.targetTab, "overview")
  assert.match(readyPlan.headline, /ready/i)
})

test("extractAccessRequests turns audit rows into invite-ready cards", () => {
  const requests = extractAccessRequests([
    {
      action: "request_access",
      created_at: "2026-05-17T00:00:00.000Z",
      details: JSON.stringify({
        email: " ADA@Example.COM ",
        goal: "Build a study vault.",
        name: "Ada Lovelace",
        role: "Teacher",
      }),
      id: "audit_1",
    },
    {
      action: "request_access",
      details: { email: "ada@example.com", goal: "Duplicate", name: "Ada", role: "Learner" },
      id: "audit_2",
    },
    { action: "login", details: "{}" },
  ])

  assert.deepEqual(requests, [
    {
      id: "audit_1",
      created_at: "2026-05-17T00:00:00.000Z",
      email: "ada@example.com",
      goal: "Build a study vault.",
      name: "Ada Lovelace",
      role: "Teacher",
      roleKey: "teacher",
    },
  ])
})

test("admin plan prioritizes access requests after provider health", () => {
  const summary = summarizeAdminOperations({
    adminData: {
      audit: [
        {
          action: "request_access",
          details: { email: "learner@example.com", name: "Learner", goal: "Use LEARN for finals.", role: "Learner" },
        },
      ],
      providers: [{ name: "Groq", enabled: true, has_key: true, last_status: "ok" }],
    },
    automationData: { jobs: [{ key: "daily", label: "Daily" }] },
  })

  assert.equal(summary.accessRequests.length, 1)
  assert.equal(summary.cards.find((card) => card.id === "access")?.tone, "watch")
  assert.equal(buildAdminOperationalPlan(summary).targetTab, "access")
})

test("buildAdminSummaryChips keeps risky admin states primary", () => {
  const summary = summarizeAdminOperations({
    adminData: {
      audit: [
        { action: "login" },
        { action: "request_access", details: { email: "learner@example.com", name: "Learner" } },
      ],
      providers: [
        { name: "Groq", enabled: true, has_key: true, last_status: "ok" },
        { name: "Mistral", enabled: true, has_key: false },
      ],
      users: [{ id: "u1" }],
    },
    automationData: { jobs: [] },
  })

  const chips = buildAdminSummaryChips(summary)
  const primaryIds = chips.filter((chip) => chip.priority === "primary").map((chip) => chip.id)

  assert.deepEqual(primaryIds, ["health", "providers", "access", "audit", "automation"])
  assert.equal(chips.find((chip) => chip.id === "health")?.targetTab, "providers")
  assert.equal(chips.find((chip) => chip.id === "access")?.targetTab, "access")
})
