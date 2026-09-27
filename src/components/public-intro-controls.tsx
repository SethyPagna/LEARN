"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { ThemeModeSwitcher } from "@/components/theme-mode-switcher"
import styles from "./public-experience.module.css"

export function PublicIntroControls({ signedIn }: { signedIn: boolean }) {
  return <div className={styles.controls}>
    <ThemeModeSwitcher className={styles.modeSwitcher} />
    <Link href={signedIn ? "/dashboard" : "/login"} className={styles.signInLink}>{signedIn ? "Open workspace" : "Sign in"}<ArrowRight size={14} /></Link>
  </div>
}
