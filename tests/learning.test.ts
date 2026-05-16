import assert from "node:assert/strict"
import test from "node:test"
import { buildLearnRoutePlan } from "../lib/learn-route-features"
import { buildLearningSnapshot, rankWeakTopics } from "../lib/learning"

test("rankWeakTopics prioritizes topics with lower accuracy and more attempts", () => {
  const weakTopics = rankWeakTopics([
    { topic: "React", isCorrect: true },
    { topic: "React", isCorrect: false },
    { topic: "Databases", isCorrect: false },
    { topic: "Databases", isCorrect: false },
    { topic: "Algorithms", isCorrect: true },
  ])

  assert.deepEqual(weakTopics.map((topic) => topic.topic), ["Databases", "React"])
  assert.equal(weakTopics[0].accuracy, 0)
  assert.equal(weakTopics[1].accuracy, 50)
})

test("buildLearningSnapshot creates dashboard-ready personalization metrics", () => {
  const snapshot = buildLearningSnapshot({
    goals: [
      { title: "Study React", completed: true },
      { title: "Practice databases", completed: false },
    ],
    notes: [
      { id: "n1", title: "Hooks", updatedAt: "2026-05-13T01:00:00.000Z" },
      { id: "n2", title: "SQL", updatedAt: "2026-05-13T03:00:00.000Z" },
    ],
    answers: [
      { topic: "React", isCorrect: false },
      { topic: "React", isCorrect: true },
      { topic: "Databases", isCorrect: false },
    ],
  })

  assert.equal(snapshot.goalCompletion, 50)
  assert.equal(snapshot.recentNotes[0].title, "SQL")
  assert.equal(snapshot.recommendedFocus[0], "Databases")
})

test("buildLearnRoutePlan prioritizes weak-topic repair", () => {
  const plan = buildLearnRoutePlan({
    goalCompletion: 38,
    recommendedFocus: ["Databases"],
    weakTopics: [{ topic: "Indexes", accuracy: 40 }],
    quizCount: 2,
  })

  assert.equal(plan.headline, "Repair Indexes")
  assert.equal(plan.primaryAction.id, "review")
  assert.deepEqual(plan.signals.map((signal) => signal.value), ["38%", "2", "1", "1"])
})

test("buildLearnRoutePlan makes Studio primary when the route is empty", () => {
  const plan = buildLearnRoutePlan({ goalCompletion: 140, quizCount: -3 })

  assert.equal(plan.headline, "Build today's learning route")
  assert.equal(plan.primaryAction.id, "create")
  assert.equal(plan.signals[0].value, "100%")
})
