import assert from "node:assert/strict"
import test from "node:test"
import { controlButtonClasses, menuSurfaceClasses, statusToneClasses, toneSurfaceClasses, toneTextClasses } from "../lib/design-system"

test("statusToneClasses returns readable semantic tone classes", () => {
  assert.match(statusToneClasses("critical"), /border-destructive\/40/)
  assert.match(statusToneClasses("steady"), /bg-success\/10/)
  assert.match(statusToneClasses("primary"), /text-primary/)
  assert.match(statusToneClasses("watch"), /text-warning/)
  assert.match(statusToneClasses(), /text-muted-foreground/)
})

test("controlButtonClasses keeps shared focus disabled and active states", () => {
  const regular = controlButtonClasses()
  const compactActive = controlButtonClasses({ active: true, size: "compact" })
  const destructive = controlButtonClasses({ destructive: true })

  assert.match(regular, /focus-visible:ring-2/)
  assert.match(regular, /disabled:pointer-events-none/)
  assert.match(compactActive, /h-9/)
  assert.match(compactActive, /bg-primary/)
  assert.match(destructive, /hover:bg-destructive/)
})

test("toneSurfaceClasses returns borderless icon surfaces", () => {
  assert.match(toneSurfaceClasses("critical"), /bg-destructive\/10/)
  assert.match(toneSurfaceClasses("steady"), /text-success/)
  assert.match(toneSurfaceClasses("primary"), /bg-primary\/10/)
  assert.match(toneSurfaceClasses("watch"), /bg-warning\/15/)
  assert.match(toneSurfaceClasses(), /bg-secondary/)
})

test("toneTextClasses keeps text-only semantic states reusable", () => {
  assert.equal(toneTextClasses("critical"), "text-destructive")
  assert.equal(toneTextClasses("steady"), "text-success")
  assert.match(toneTextClasses("watch"), /text-warning/)
  assert.equal(toneTextClasses(), "text-foreground")
})

test("menuSurfaceClasses uses shared popover contrast tokens", () => {
  const classes = menuSurfaceClasses()

  assert.match(classes, /bg-popover/)
  assert.match(classes, /text-popover-foreground/)
  assert.match(classes, /border-border/)
})
