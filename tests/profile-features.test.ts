import assert from "node:assert/strict"
import test from "node:test"
import { buildProfileActionPlan } from "../lib/profile-features"

test("buildProfileActionPlan sends incomplete portraits to settings", () => {
  const plan = buildProfileActionPlan({
    profile: {
      bio: "",
      metrics: { streak: 0, xp: 0 },
      artifacts: [],
    },
    achievements: [],
  })

  assert.equal(plan.target, "settings")
  assert.equal(plan.privacyLabel, "Nothing shared")
  assert.equal(plan.stats.find((stat) => stat.id === "artifacts")?.tone, "watch")
})

test("buildProfileActionPlan encourages Studio before social sharing", () => {
  const plan = buildProfileActionPlan({
    profile: {
      bio: "Learning operating systems and writing notes.",
      metrics: { streak: 3, xp: 240 },
      artifacts: [],
    },
    achievements: [{ unlocked: true }],
  })

  assert.equal(plan.target, "studio")
  assert.equal(plan.stats.find((stat) => stat.id === "streak")?.tone, "good")
})

test("buildProfileActionPlan summarizes sharing and achievement progress", () => {
  const plan = buildProfileActionPlan({
    profile: {
      bio: "A public learning portrait.",
      metrics: { reputation: 18, streak: 12, xp: 900 },
      artifacts: [
        { visibility: "public", mastery: 0.8 },
        { visibility: "private", mastery: 0.4 },
      ],
    },
    achievements: [{ unlocked: true }, { unlocked: false }],
  })

  assert.equal(plan.target, "reviews")
  assert.equal(plan.privacyLabel, "1 public")
  assert.equal(plan.masteryLabel, "60% average mastery")
  assert.equal(plan.stats.find((stat) => stat.id === "achievements")?.value, "1/2")
})

test("buildProfileActionPlan sends complete shared portraits to social groups", () => {
  const plan = buildProfileActionPlan({
    profile: {
      bio: "Sharing useful study systems.",
      metrics: { reputation: 20, streak: 14, xp: 1100 },
      artifacts: [{ visibility: "connections", mastery: 0.7 }],
    },
    achievements: [{ unlocked: true }],
  })

  assert.equal(plan.target, "social")
  assert.equal(plan.nextAction, "Open social groups")
})
