import assert from "node:assert/strict"
import test from "node:test"
import { generatedQuizQuestions, generatedReviewCards } from "../../lib/ai/assessment-output"

test("AI review pair IDs survive repeated insertion, reordering, and title changes", () => {
  const pairs = [{ prompt: "Boundary?", answer: "Membrane" }, { front: "Control?", back: "Nucleus" }]
  const first = generatedReviewCards(pairs, "Cells")
  const repeated = generatedReviewCards([{ prompt: " Boundary? ", answer: " Membrane " }, pairs[1]], "Updated note title")
  const reversed = generatedReviewCards([...pairs].reverse(), "Cells")
  assert.deepEqual(first.map((card) => card.sourceId), repeated.map((card) => card.sourceId))
  assert.deepEqual(first.map((card) => card.sourceId), reversed.map((card) => card.sourceId).reverse())
  assert.notEqual(first[0].sourceId, first[1].sourceId)
  assert.notEqual(first[0].sourceId, generatedReviewCards([{ prompt: "Boundary?", answer: "Cell wall" }], "Cells")[0].sourceId)
})

test("AI card identity uses the persisted pair and distinguishes pair boundaries", () => {
  const prompt = "q".repeat(4000)
  const answer = "a".repeat(2000)
  const truncated = generatedReviewCards([{ prompt: `${prompt} discarded`, answer: `${answer} discarded` }], "Long card")[0]
  const stored = generatedReviewCards([{ prompt, answer }], "Long card")[0]
  assert.equal(truncated.sourceId, stored.sourceId)
  assert.equal(truncated.prompt, prompt)
  assert.equal(truncated.answer, answer)
  const shortenedPrompt = "q".repeat(3999)
  assert.equal(generatedReviewCards([{ prompt: `${shortenedPrompt} tail`, answer }], "Long card")[0].sourceId,
    generatedReviewCards([{ prompt: shortenedPrompt, answer }], "Long card")[0].sourceId)
  const framed = generatedReviewCards([{ prompt: "a\nb", answer: "c" }, { prompt: "a", answer: "b\nc" }], "Pairs")
  assert.notEqual(framed[0].sourceId, framed[1].sourceId)
})

test("generated review card batches are bounded without truncating valid cards", () => {
  const cards = Array.from({ length: 40 }, (_, index) => ({ prompt: `Question ${index}`, answer: `Answer ${index}` }))
  assert.equal(generatedReviewCards(cards, "Cards").length, 40)
  assert.throws(() => generatedReviewCards([...cards, cards[0]], "Cards"), /1–40/)
  assert.throws(() => generatedReviewCards([{ prompt: "One valid", answer: "Answer" }, { prompt: "No answer" }], "Cards"), /Card 2 needs both/)
})

test("quiz choices must remain distinct after normalization and storage truncation", () => {
  for (const choices of [
    [{ id: "a", text: "Same" }, { id: "b", text: "Same" }],
    [{ id: "a", text: "Cell   wall" }, { id: "b", text: " cell wall " }],
    [{ id: "a", text: "Same" }, { id: "b", text: "Ｓａｍｅ" }],
    [{ id: "a", text: `${"x".repeat(2000)}first` }, { id: "b", text: `${"x".repeat(2000)}second` }],
  ]) {
    assert.throws(() => generatedQuizQuestions([{ question: "Choose", choices, correct_answer_id: "a" }]), /distinct choices/)
  }
  assert.deepEqual(generatedQuizQuestions([{ question: "True or false?", choices: ["True", "False"], answer: true }])[0].choices,
    [{ id: "a", text: "True" }, { id: "b", text: "False" }])
  const longAnswer = `${"x".repeat(2000)}tail`
  const accepted = generatedQuizQuestions([{ question: "Choose", choices: [longAnswer, "Distinct"], answer: longAnswer }])[0]
  assert.equal(accepted.correct_answer_id, "a")
  assert.equal(accepted.choices[0].text.length, 2000)
})
