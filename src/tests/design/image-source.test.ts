import assert from "node:assert/strict"
import test from "node:test"
import { screenImageSource } from "../../components/learn/design/design-renderer"
import { normalizeDesignPictureUrl } from "../../lib/design/image-source"

const origin = "https://learn.example"

test("same-site picture URLs become portable paths accepted by the renderer", () => {
  for (const source of ["/icon.svg", "icon.svg", "https://learn.example/icon.svg", "//learn.example/icon.svg"]) {
    const normalized = normalizeDesignPictureUrl(source, origin)
    assert.equal(normalized, "/icon.svg")
    assert.equal(screenImageSource(normalized!), normalized)
  }
  assert.equal(normalizeDesignPictureUrl(`${origin}/api/files/picture/download?version=2#preview`, origin), "/api/files/picture/download?version=2#preview")
  assert.equal(normalizeDesignPictureUrl("http://localhost:3000/icon.svg", "http://localhost:3000"), "/icon.svg")
})

test("external and unsupported picture URLs cannot enter the insertion flow", () => {
  for (const source of ["https://pictures.example/photo.png", "//pictures.example/photo.png", "http://learn.example/photo.png", "https://learn.example:444/photo.png", "https://name:password@learn.example/photo.png", "https://learn.example//pictures.example/photo.png", "javascript:alert(1)", "data:text/html;base64,SGVsbG8=", "", "/\\pictures.example/photo.png"]) {
    assert.equal(normalizeDesignPictureUrl(source, origin), null, source)
  }
})

test("supported data pictures stay inline and render without an external URL", () => {
  const source = "data:image/png;base64,iVBORw0KGgo="
  assert.equal(normalizeDesignPictureUrl(` ${source} `, origin), source)
  assert.equal(screenImageSource(source), source)
})
