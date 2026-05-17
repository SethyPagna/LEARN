import assert from "node:assert/strict"
import test from "node:test"
import {
  buildAuthEntryPlan,
  buildForgotPasswordPlan,
  normalizeAccessRequest,
  normalizeInviteAcceptance,
  safeRedirectPath,
} from "../lib/auth-entry"

test("access request validation normalizes safe signup details", () => {
  const result = normalizeAccessRequest({
    email: " ADA@Example.COM ",
    goal: "  Build a study vault from notes and quizzes. ",
    name: " Ada   Lovelace ",
    role: "teacher",
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value, {
    email: "ada@example.com",
    goal: "Build a study vault from notes and quizzes.",
    name: "Ada Lovelace",
    role: "Teacher",
  })
})

test("access request validation blocks weak request details", () => {
  assert.equal(normalizeAccessRequest({ email: "bad", goal: "short", name: "A" }).ok, false)
  assert.equal(normalizeAccessRequest({ email: "user@example.com", goal: "short", name: "Ada" }).ok, false)
})

test("auth entry plan guides sign in and access request states", () => {
  assert.deepEqual(buildAuthEntryPlan({ identifier: "", mode: "signin", password: "" }), {
    label: "Credentials needed",
    nextAction: "Use your account or fill a demo account.",
    tone: "watch",
  })
  assert.deepEqual(buildAuthEntryPlan({ identifier: "admin", mode: "signin", password: "secret" }), {
    label: "Ready to sign in",
    nextAction: "Open your workspace.",
    tone: "good",
  })
  assert.equal(buildAuthEntryPlan({ accessRequestStatus: "success", mode: "request" }).label, "Request saved")
})

test("safe redirect paths only allow same-origin workspace paths", () => {
  assert.equal(safeRedirectPath("/studio?tab=notes"), "/studio?tab=notes")
  assert.equal(safeRedirectPath("https://evil.example/dashboard"), "/dashboard")
  assert.equal(safeRedirectPath("//evil.example"), "/dashboard")
  assert.equal(safeRedirectPath("/login"), "/dashboard")
})

test("forgot password plan is explicit until email reset is available", () => {
  assert.deepEqual(buildForgotPasswordPlan(""), {
    label: "Account identifier needed",
    nextAction: "Enter your username or email first.",
    tone: "watch",
  })
  assert.deepEqual(buildForgotPasswordPlan("admin"), {
    label: "Admin reset required",
    nextAction: "Ask an admin to verify your account and issue a fresh invite.",
    tone: "neutral",
  })
})

test("invite acceptance validation normalizes safe input", () => {
  const result = normalizeInviteAcceptance({
    email: " ADA@Example.COM ",
    name: " Ada   Lovelace ",
    password: "LongEnough123!",
    token: "  abc12345  ",
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.value, {
    email: "ada@example.com",
    name: "Ada Lovelace",
    password: "LongEnough123!",
    token: "abc12345",
  })

  assert.equal(normalizeInviteAcceptance({ email: "bad", name: "A", password: "short", token: "" }).ok, false)
})
