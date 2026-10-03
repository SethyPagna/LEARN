"use client"

import { type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, Check, Play, Plus, Sparkles } from "lucide-react"
import { ThemeModeSwitcher } from "@/components/theme-mode-switcher"
import styles from "@/components/auth-surface.module.css"

export function AuthFrame({ children }: { children: ReactNode }) {
  return <main className={styles.surface}>
    <header className={styles.header}>
      <Link href="/" aria-label="LEARN home" className={styles.brand}><img loading="eager" src="/icon.svg" alt="" width={32} height={32} /><span>LEARN<span className={styles.brandDot}>.</span></span></Link>
      <div className={styles.headerControls}>
        <ThemeModeSwitcher />
      </div>
    </header>
    <div className={styles.layout}>
      <aside className={styles.artPanel} aria-label="A place for your ideas">
        <div className={styles.artCopy}><span className={styles.artEyebrow}><span />SPACE TO BECOME</span><p>Big ideas.<br /><span>Your next chapter.</span></p></div>
        <div className={styles.collage} aria-hidden="true">
          <div className={styles.orbit} />
          <div className={styles.spark}><Sparkles size={36} strokeWidth={1.6} /></div>
          <div className={styles.noteCard}><span className={styles.cardEyebrow}>MY NEXT BIG THING <ArrowUpRight size={14} /></span><strong>Small steps.<br />Real progress.</strong><div className={styles.noteLines}><span /><span /><span /></div><div className={styles.noteCheck}><Check size={13} /><span>Make a little room for curiosity.</span></div></div>
          <div className={styles.slideCard}><span className={styles.cardEyebrow}>STUDIO <Plus size={14} /></span><strong>Think it.<br />Make it yours.</strong><div className={styles.slideShapes}><i /><i /><i /></div><span className={styles.slideFooter}>01 / YOUR IDEAS <Play size={13} fill="currentColor" /></span></div>
          <div className={styles.quizCard}><span><Sparkles size={15} />A LITTLE EVERY DAY</span><div className={styles.quizProgress}>{[0, 1, 2, 3, 4].map((step) => <i key={step}>{step < 3 ? <Check size={13} /> : null}</i>)}</div></div>
          <div className={styles.cursor}><svg width="31" height="35" viewBox="0 0 31 35"><path d="M3 2L27 20L15 21L10 32Z" strokeWidth="2" strokeLinejoin="round" /></svg><span>You, in your element.</span></div>
        </div>
        <div className={styles.artFooter}><span>MAKE SOMETHING OF WHAT YOU KNOW.</span><ArrowUpRight size={20} aria-hidden="true" /></div>
      </aside>
      <div className={styles.formColumn}>{children}<Link href="/" className={styles.backLink}><ArrowLeft size={14} aria-hidden="true" />Back to explore</Link></div>
    </div>
  </main>
}
