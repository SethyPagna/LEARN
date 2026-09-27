"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { useAppearanceMode } from "@/components/use-appearance-mode"
import { Palette, Check, Maximize2 } from "lucide-react"
import styles from "./practice-design.module.css"

const designs = [
  { id: "confetti", name: "Confetti", colors: ["#8257d6", "#ef7199", "#edb24d"] },
  { id: "ocean", name: "Ocean", colors: ["#2876ba", "#26adad", "#80ced1"] },
  { id: "arcade", name: "Arcade", colors: ["#9454db", "#e34b96", "#51cda8"] },
  { id: "sunset", name: "Sunset", colors: ["#cb5841", "#da9d35", "#cb68a0"] },
  { id: "garden", name: "Garden", colors: ["#358264", "#95af52", "#e3ac72"] },
  { id: "mono", name: "Minimal", colors: ["#657187", "#98a2b4", "#c0c7d2"] },
] as const
type DesignId = typeof designs[number]["id"]

export function PracticeDesign({ children, allowFocus = true, toolbar }: { children: ReactNode; allowFocus?: boolean; toolbar?: ReactNode }) {
  const { mode, setMode } = useAppearanceMode()
  const [design, setDesign] = useState<DesignId>("confetti")
  const [focus, setFocus] = useState(false)
  const picker = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    function closePicker(event: PointerEvent) {
      if (picker.current && !picker.current.contains(event.target as Node)) picker.current.open = false
    }
    function dismissPicker(event: KeyboardEvent) {
      if (event.key !== "Escape" || !picker.current?.open) return
      picker.current.open = false
      picker.current.querySelector("summary")?.focus()
    }
    document.addEventListener("pointerdown", closePicker)
    document.addEventListener("keydown", dismissPicker)
    return () => { document.removeEventListener("pointerdown", closePicker); document.removeEventListener("keydown", dismissPicker) }
  }, [])
  useEffect(() => {
    try {
      const saved = localStorage.getItem("learn:practice:design")
      if (designs.some(item => item.id === saved)) setDesign(saved as DesignId)
    } catch { /* Appearance remains usable when browser storage is unavailable. */ }
  }, [])
  function chooseDesign(value: DesignId) {
    setDesign(value)
    if (picker.current) picker.current.open = false
    picker.current?.querySelector("summary")?.focus()
    try { localStorage.setItem("learn:practice:design", value) } catch { /* Keep the current session choice. */ }
  }
  return <div className={`practice-design ${styles.surface}`} data-design={design} data-focus={allowFocus && focus}>
    <div className="practice-design-toolbar">
      {toolbar}

      <details ref={picker} className="relative ml-auto"><summary className="editor-command" aria-label="Practice design" title="Color style"><Palette className="h-4 w-4" /></summary>
        <div className={`practice-design-picker ${styles.picker}`} role="group" aria-label="Practice designs"><p className="col-span-full px-1 pb-1 text-xs font-medium text-muted-foreground">Color style</p>{mode !== "color" && <button type="button" className="col-span-full" onClick={() => setMode("color")}>Use Color mode</button>}{designs.map(item => <button type="button" key={item.id} disabled={mode !== "color"} className="disabled:opacity-40 disabled:cursor-not-allowed" aria-pressed={design === item.id} onClick={() => chooseDesign(item.id)}>
          <span className="design-swatch" style={{ background: `linear-gradient(125deg, ${item.colors.join(",")})` }}>{design === item.id ? <Check className="h-4 w-4 text-white" /> : null}</span><span>{item.name}</span>
        </button>)}</div>
      </details>
      {allowFocus ? <button type="button" className="editor-command" aria-pressed={focus} onClick={() => setFocus(!focus)} aria-label={focus ? "Exit focus" : "Focus"} title={focus ? "Exit focus" : "Focus"}><Maximize2 className="h-4 w-4" /></button> : null}
    </div>
    {children}
  </div>
}
