import assert from "node:assert/strict"
import test from "node:test"
import { controlButtonClasses, menuSurfaceClasses, statusToneClasses } from "../lib/design-system"

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

test("menuSurfaceClasses uses shared popover contrast tokens", () => {
  const classes = menuSurfaceClasses()

  assert.match(classes, /bg-popover/)
  assert.match(classes, /text-popover-foreground/)
  assert.match(classes, /border-border/)
})
