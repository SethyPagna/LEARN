import assert from "node:assert/strict"
import test from "node:test"
import { filterAdminList, summarizeAdminOperations } from "../lib/admin-features"

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
