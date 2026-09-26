"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useTheme } from "next-themes"
import { ArrowRight, Moon, Sun } from "lucide-react"
import styles from "./public-experience.module.css"

export function PublicIntroControls({ signedIn }: { signedIn: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const isDark = mounted && resolvedTheme === "dark"
  const label = isDark ? "Light mode" : "Dark mode"
  const ThemeIcon = isDark ? Sun : Moon

  return <div className={styles.controls}>
    <button type="button" onClick={() => setTheme(isDark ? "light" : "dark")} className={styles.iconButton} aria-label={label} title={label}><ThemeIcon size={17} /></button>
    <Link href={signedIn ? "/dashboard" : "/login"} className={styles.signInLink}>{signedIn ? "Open workspace" : "Sign in"}<ArrowRight size={14} /></Link>
  </div>
}
