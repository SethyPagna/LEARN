import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { viewFromPath } from "../../lib/navigation"

test("saved review cards land on reveal-and-grade Reviews rather than the quiz fallback", () => {
  assert.equal(viewFromPath("/reviews"), "reviews")
  const shell = readFileSync("src/components/learn/learn-shell.tsx", "utf8")
  assert.match(shell, /view === "reviews" \? <ReviewsView/)
  assert.match(shell, /view !== "live" && view !== "reviews" && practiceViews\.includes/)
  const route = readFileSync("src/app/reviews/page.tsx", "utf8")
  assert.match(route, /initialView="reviews"/)
  assert.doesNotMatch(route, /redirect\(/)
  const ecosystem = readFileSync("src/components/learn/views/ecosystem-views.tsx", "utf8")
  const review = ecosystem.slice(ecosystem.indexOf("export function ReviewsView("), ecosystem.indexOf("export function FeedView("))
  assert.match(review, /useResource<ReviewPayload>\("\/api\/reviews"\)/)
  assert.match(review, /if \(!revealed\.has\(item\.id\)\)/)
  assert.match(review, /JSON\.stringify\(\{ id: item\.id, rating \}\)/)
})
