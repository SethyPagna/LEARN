import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { designFonts } from "../../lib/design/fonts"

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8")

test("every font the design editor offers is loaded, so none silently falls back", () => {
  const loaders = read("components/learn/design/design-fonts.ts") + read("app/layout.tsx")
  for (const font of designFonts) {
    assert.ok(loaders.includes(`variable: "${font.cssVar}"`), `${font.label} (${font.cssVar}) is never loaded`)
  }
})
