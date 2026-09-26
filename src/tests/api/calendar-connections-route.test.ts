import assert from "node:assert/strict"
import test from "node:test"
import { installDatabaseStub, primeDatabase, request, stubSessionLookup, TEST_USER_ROW, readJson } from "./harness"

test("calendar connection routes keep credentials server-side and enforce account ownership", async context => {
  const stub = installDatabaseStub()
  context.after(() => stub.restore())
  await primeDatabase(stub)
  const connections = await import("../../app/api/calendar/connections/route")
  const events = await import("../../app/api/calendar/connected-events/route")

  await context.test("connection listings omit encrypted credential material", async () => {
    stubSessionLookup(stub)
    stub.on(/FROM calendar_connections/, { rows: [{ id: "owned", user_id: TEST_USER_ROW.id, provider: "google", label: "Work", credentials: "encrypted-private-material" }] })
    const response = await connections.GET(request("/api/calendar/connections"))
    assert.equal(response.status, 200)
    const body = await response.text()
    assert.ok(body.includes("Work"))
    assert.ok(!body.includes("encrypted-private-material"))
    assert.deepEqual(stub.matching(/FROM calendar_connections/).at(-1)?.params, [TEST_USER_ROW.id])
  })

  await context.test("disconnect scopes deletion to the current user", async () => {
    const response = await connections.DELETE(request("/api/calendar/connections?id=someone-elses-connection", { method: "DELETE" }))
    assert.equal(response.status, 200)
    assert.deepEqual(stub.writesMatching(/DELETE FROM calendar_connections/).at(-1)?.params, ["someone-elses-connection", TEST_USER_ROW.id])
  })

  await context.test("event mutations reject a connection not owned by the caller before provider I/O", async () => {
    stub.on(/FROM calendar_connections/, { rows: [] })
    const response = await events.PUT(request("/api/calendar/connected-events", { method: "PUT", body: { connectionId: "not-owned", calendarId: "calendar", eventId: "event" } }))
    assert.equal(response.status, 400)
    assert.match((await readJson<{ error: string }>(response)).error, /not found/)
    assert.equal(stub.httpRequests.length, 0)
    assert.deepEqual(stub.matching(/FROM calendar_connections/).at(-1)?.params, ["not-owned", TEST_USER_ROW.id])
  })
})
