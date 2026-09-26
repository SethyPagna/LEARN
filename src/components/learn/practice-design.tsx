"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Palette, Check, Maximize2 } from "lucide-react"

const designs = [
  { id: "confetti", name: "Confetti", colors: ["#8257d6", "#ef7199", "#edb24d"] },
  { id: "ocean", name: "Ocean", colors: ["#2876ba", "#26adad", "#80ced1"] },
  { id: "arcade", name: "Arcade", colors: ["#9454db", "#e34b96", "#51cda8"] },
  { id: "sunset", name: "Sunset", colors: ["#cb5841", "#da9d35", "#cb68a0"] },
  { id: "garden", name: "Garden", colors: ["#358264", "#95af52", "#e3ac72"] },
  { id: "mono", name: "Minimal", colors: ["#657187", "#98a2b4", "#c0c7d2"] },
] as const
type DesignId = typeof designs[number]["id"]

export function PracticeDesign({ children, allowFocus = true }: { children: ReactNode; allowFocus?: boolean }) {
  const [design, setDesign] = useState<DesignId>("confetti")
  const [focus, setFocus] = useState(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("learn:practice:design")
      if (designs.some(item => item.id === saved)) setDesign(saved as DesignId)
    } catch { /* Appearance remains usable when browser storage is unavailable. */ }
  }, [])
  function chooseDesign(value: DesignId) {
    setDesign(value)
    try { localStorage.setItem("learn:practice:design", value) } catch { /* Keep the current session choice. */ }
  }
  return <div className="practice-design" data-design={design} data-focus={focus}>
    <div className="practice-design-toolbar">

      <details className="relative ml-auto"><summary className="editor-command" aria-label="Practice design" title="Practice design"><Palette className="h-4 w-4" /></summary>
        <div className="practice-design-picker" role="group" aria-label="Practice designs">{designs.map(item => <button type="button" key={item.id} aria-pressed={design === item.id} onClick={() => chooseDesign(item.id)}>
          <span className="design-swatch" style={{ background: `linear-gradient(125deg, ${item.colors.join(",")})` }}>{design === item.id ? <Check className="h-4 w-4 text-white" /> : null}</span><span>{item.name}</span>
        </button>)}</div>
      </details>
      {allowFocus ? <button type="button" className="editor-command" aria-pressed={focus} onClick={() => setFocus(!focus)} aria-label={focus ? "Exit focus" : "Focus"} title={focus ? "Exit focus" : "Focus"}><Maximize2 className="h-4 w-4" /></button> : null}
    </div>
    {children}
  </div>
}
