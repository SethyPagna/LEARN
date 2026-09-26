import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const VIEWS_ROOT = path.join(PROJECT_ROOT, "src", "components", "learn", "views")
const COMPONENT_ROOT = path.join(PROJECT_ROOT, "src", "components", "learn")

/**
 * Dictation coverage.
 *
 * Voice transcription is a server feature (`POST /api/ai/transcribe`) plus one
 * client control (`voice-input.tsx`). Both halves can sit there fully green
 * while the feature stays unreachable, because a control only counts when a
 * compose surface renders it — and a refactor that drops a call site fails
 * silently: nothing imports it, nothing breaks, users just lose the microphone.
 *
 * So the four surfaces that are supposed to offer dictation are pinned here by
 * reading the files. Each entry records the label that surface passes, which is
 * the human-visible promise on the button.
 */
const VOICE_SURFACES: Array<{ file: string; surface: string; label: string }> = [
  { file: "ai-view.tsx", surface: "AI prompt composer", label: "Dictate prompt" },
  { file: "studio-view.tsx", surface: "Studio document editor", label: "Dictate into document" },
  { file: "productivity-views.tsx", surface: "chat composer", label: "Dictate message" },
  { file: "ecosystem-views.tsx", surface: "Vault block content", label: "Dictate block" },
]

function readView(file: string) {
  return fs.readFileSync(path.join(VIEWS_ROOT, file), "utf8")
}

/** The JSX for one `<VoiceInput ... />` element, so props can be asserted on it. */
function voiceInputElement(source: string) {
  const start = source.indexOf("<VoiceInput")
  assert.notEqual(start, -1, "expected a <VoiceInput ...> element")
  const end = source.indexOf("/>", start)
  assert.notEqual(end, -1, "expected the <VoiceInput ...> element to be self-closing")
  return source.slice(start, end)
}

test("every intended surface imports the dictation control", () => {
  for (const { file, surface } of VOICE_SURFACES) {
    const source = readView(file)
    assert.match(
      source,
      /import\s*\{[^}]*\bVoiceInput\b[^}]*\}\s*from\s*"\.\.\/voice-input"/,
      `${surface} (${file}) must import VoiceInput from ../voice-input`,
    )
  }
})

test("every intended surface renders the dictation control with its label", () => {
  for (const { file, surface, label } of VOICE_SURFACES) {
    const element = voiceInputElement(readView(file))
    assert.match(element, /onTranscript=/, `${surface} (${file}) must pass onTranscript`)
    assert.ok(
      element.includes(`label="${label}"`),
      `${surface} (${file}) must label the control "${label}"`,
    )
  }
})

test("the chat composer appends the transcript to the draft and records draft activity", () => {
  const element = voiceInputElement(readView("productivity-views.tsx"))

  // Typing in this textarea calls setBody + handleDraftActivity together, so
  // dictation has to do the same or autosave, undo, and the typing signal
  // diverge between spoken and typed text.
  assert.match(element, /setBody\(/, "the chat composer must write the transcript into the draft body")
  assert.match(
    element,
    /handleDraftActivity\(/,
    "the chat composer must record draft activity for the transcript, like typing does",
  )
  assert.match(element, /prompt=\{/, "the chat composer must give the model thread context")
  assert.match(
    element,
    /body\s*&&\s*!\/\\s\$\/\.test\(body\)/,
    "the chat composer must only add a separator when the draft is non-empty and does not end in whitespace",
  )
})

test("the Vault block field appends the transcript instead of replacing it", () => {
  const element = voiceInputElement(readView("ecosystem-views.tsx"))

  assert.match(
    element,
    /setBlockContent\(\(current\)/,
    "the Vault block field must append to the current block content",
  )
  assert.match(
    element,
    /!\/\\s\$\/\.test\(current\)/,
    "the Vault block field must only add a separator when the field is non-empty and does not end in whitespace",
  )
})

test("the dictation halves exist: the control and the transcribe route it posts to", () => {
  const controlPath = path.join(COMPONENT_ROOT, "voice-input.tsx")
  assert.ok(fs.existsSync(controlPath), "voice-input.tsx must exist")

  const control = fs.readFileSync(controlPath, "utf8")
  assert.match(control, /export function VoiceInput\(/, "voice-input.tsx must export VoiceInput")
  assert.match(
    control,
    /\/api\/ai\/transcribe/,
    "the control must post audio to /api/ai/transcribe",
  )

  const routePath = path.join(PROJECT_ROOT, "src", "app", "api", "ai", "transcribe", "route.ts")
  assert.ok(fs.existsSync(routePath), "the route the control posts to must exist")
})
