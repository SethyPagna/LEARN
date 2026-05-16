import assert from "node:assert/strict"
import test from "node:test"
import { buildProgressCommandPlan, summarizeLearningProgress } from "../lib/progress-features"

test("summarizeLearningProgress ranks weak topics and builds next actions", () => {
  const summary = summarizeLearningProgress({
    quizCount: 3,
    snapshot: {
      goalCompletion: 64,
      recentNotes: [{ title: "Hooks" }, { title: "SQL" }],
      recommendedFocus: ["React", "Databases", "React"],
      weakTopics: [
        { topic: "React", attempts: 4, accuracy: 55 },
        { topic: "Databases", attempts: 2, accuracy: 20 },
      ],
    },
  })

  assert.equal(summary.goalCompletion, 64)
  assert.equal(summary.momentumLabel, "building")
  assert.deepEqual(summary.focusTopics, ["React", "Databases"])
  assert.deepEqual(summary.weakTopics.map((topic) => topic.topic), ["Databases", "React"])
  assert.equal(summary.reviewCount, 2)
  assert.equal(summary.metrics[2].value, "3")
  assert.equal(summary.nextActions[0].target, "reviews")
  assert.equal(summary.nextActions[0].urgency, "high")
  assert.equal(summary.nextActions[1].target, "quizzes")
  const plan = buildProgressCommandPlan(summary)
  assert.equal(plan.headline, "Repair Databases")
  assert.equal(plan.target, "quizzes")
  assert.equal(plan.targetTopic, "Databases")
})

test("summarizeLearningProgress handles empty and out-of-range data", () => {
  const summary = summarizeLearningProgress({
    quizCount: -5,
    snapshot: {
      goalCompletion: 140,
      recommendedFocus: ["  ", "Graph"],
      weakTopics: [{ topic: "  ", accuracy: Number.NaN }],
    },
  })

  assert.equal(summary.goalCompletion, 100)
  assert.equal(summary.quizCount, 0)
  assert.equal(summary.reviewCount, 1)
  assert.deepEqual(summary.focusTopics, ["Graph"])
  assert.equal(summary.nextActions[1].target, "ai")
  assert.equal(summary.nextActions[2].target, "studio")
})

test("buildProgressCommandPlan prioritizes critical repair and route seeds", () => {
  const critical = summarizeLearningProgress({
    quizCount: 2,
    snapshot: {
      goalCompletion: 42,
      weakTopics: [{ topic: "Queues", accuracy: 28, attempts: 5 }],
    },
  })
  const empty = summarizeLearningProgress({ quizCount: 0, snapshot: { goalCompletion: 35 } })
  const ready = summarizeLearningProgress({
    quizCount: 0,
    snapshot: {
      goalCompletion: 82,
      recentNotes: [{ title: "FSRS" }],
    },
  })

  assert.equal(buildProgressCommandPlan(critical).target, "quizzes")
  assert.equal(buildProgressCommandPlan(critical).targetTopic, "Queues")
  assert.equal(buildProgressCommandPlan(empty).target, "calendar")
  assert.equal(buildProgressCommandPlan(ready).target, "ai")
})
