import assert from "node:assert/strict"
import test from "node:test"
import NotePage from "../../app/notes/[id]/page"

test("/notes/<id> opens that note in the Studio instead of the project lobby", async () => {
  await assert.rejects(NotePage({ params: Promise.resolve({ id: "note_42" }) }), (error: { digest?: string }) => {
    assert.match(String(error.digest), /^NEXT_REDIRECT;replace;\/notes\?item=notes%3Anote_42;/)
    return true
  })
})
