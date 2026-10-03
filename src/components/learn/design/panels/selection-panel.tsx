"use client"

import type { CSSProperties } from "react"
import { withPageElements, pageUnit } from "@/lib/design/document"
import { growText, setElementStyle } from "@/lib/design/editing"
import { readTextStyle, TEXT_EFFECTS, type TextEffect } from "@/lib/design/style"
import { ColorButton, ColorPicker } from "../color-picker"
import type { DesignEditorApi } from "../editor-types"

const EFFECT_LABELS: Record<TextEffect, string> = { none: "None", shadow: "Drop", lift: "Lift", outline: "Outline", neon: "Neon", highlight: "Background" }
const EFFECT_SAMPLES: Record<TextEffect, CSSProperties> = {
  none: {}, shadow: { textShadow: "3px 4px 0 #9f8bcc" }, lift: { textShadow: "0 5px 6px #8f7dbb" },
  outline: { color: "transparent", WebkitTextStroke: "1.5px #8055ca" },
  neon: { color: "#fff", textShadow: "0 0 3px #8b5cf6, 0 0 9px #8b5cf6, 0 0 15px #8b5cf6" },
  highlight: { background: "#e4d7ff", borderRadius: 6, padding: "0 5px" },
}

export function SelectionPanel({ api, effects = false }: { api: DesignEditorApi; effects?: boolean }) {
  const selected = api.design.pages[api.pageIndex].elements.filter(element => api.selectedIds.includes(element.id) && element.type === "text")
  if (!selected.length) return null
  const style = readTextStyle(selected[0])
  const ids = new Set(selected.map(element => element.id))
  function change(patch: Record<string, unknown>, coalesce?: string) {
    api.update(doc => withPageElements(doc, api.pageIndex, doc.pages[api.pageIndex].elements.map(element => ids.has(element.id) && !element.locked ? growText(setElementStyle(element, patch), api.measure) : element)), { coalesce })
  }
  if (!effects) return <div className="selection-color-panel"><ColorPicker value={style.color} onChange={color => color && change({ color, colorRole: null })} theme={api.theme} design={api.design} /></div>
  return <div className="space-y-4">
    <div className="design-effect-grid" role="radiogroup" aria-label="Text effect">
      {TEXT_EFFECTS.map(effect => <button type="button" key={effect} role="radio" aria-checked={style.effect === effect} onMouseDown={event => event.preventDefault()} onClick={() => change({ effect })}>
        <span className="design-effect-sample" style={EFFECT_SAMPLES[effect]} aria-hidden="true">Ag</span><span>{EFFECT_LABELS[effect]}</span>
      </button>)}
    </div>
    {style.effect !== "none" && style.effect !== "lift" ? <div className="flex items-center justify-between text-xs"><span>Effect color</span><ColorButton label="Effect colour" value={style.effectColor} onChange={color => color && change({ effectColor: color })} theme={api.theme} design={api.design} /></div> : null}
    <div className="flex items-center justify-between text-xs"><span>Box color</span><ColorButton label="Text box background" value={style.background} allowNone onChange={color => change(color ? { backgroundColor: color, padding: style.padding || Math.round(16 * pageUnit(api.design)), borderRadius: style.radius || Math.round(12 * pageUnit(api.design)) } : { backgroundColor: null })} theme={api.theme} design={api.design} /></div>
    {style.background ? <label className="grid gap-2 text-xs">Padding<input aria-label="Box padding" type="range" min={0} max={Math.round(120 * pageUnit(api.design))} value={style.padding} onChange={event => change({ padding: Number(event.target.value) }, `padding:${[...ids].join(":")}`)} /></label> : null}
  </div>
}
