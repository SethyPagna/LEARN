"use client"

import { Moon, Palette, Sun } from "lucide-react"
import { useAppearanceMode } from "./use-appearance-mode"
import styles from "./theme-mode-switcher.module.css"

export const appearanceModes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "color", label: "Color", icon: Palette },
] as const

export function ThemeModeSwitcher({ compact = false, previews = false, className = "" }: {
  compact?: boolean
  previews?: boolean
  className?: string
}) {
  const { mode, setMode } = useAppearanceMode()
  const CurrentIcon = appearanceModes.find((item) => item.value === mode)!.icon

  if (compact) return <div className={`${styles.compact} ${className}`} title={`Appearance: ${mode}`}>
    <CurrentIcon size={18} aria-hidden="true" />
    <select aria-label="Appearance" value={mode} onChange={(event) => setMode(event.target.value)}>
      {appearanceModes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
    </select>
  </div>

  return <div className={`${previews ? styles.previews : styles.switcher} ${className}`} role="group" aria-label="Appearance">
    {appearanceModes.map(({ value, label, icon: Icon }) => <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}>
      {previews && <span className={styles.preview} data-mode={value} aria-hidden="true"><i /><span><b /><b /><b /></span></span>}
      <span className={styles.label}><Icon size={15} aria-hidden="true" />{label}</span>
    </button>)}
  </div>
}
