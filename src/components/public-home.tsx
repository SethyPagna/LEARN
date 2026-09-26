import Link from "next/link"
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Layers3, Sparkles, Star } from "lucide-react"
import { PublicIntroControls } from "@/components/public-intro-controls"
import { ProductPreview } from "@/components/public-product-preview"
import styles from "./public-experience.module.css"

export function PublicHeader({ signedIn = false }: { signedIn?: boolean }) {
  return <header className={styles.header}>
    <Link href="/" className={styles.brand} aria-label="LEARN home"><img src="/icon.svg" width={34} height={34} alt="" loading="eager" /><span>LEARN<span className={styles.brandDot}>.</span></span></Link>
    <nav aria-label="Public navigation" className={styles.navigation}>
      <Link href="/showcase" className={styles.exploreLink}>Explore</Link>
      <PublicIntroControls signedIn={signedIn} />
    </nav>
  </header>
}

export function PublicFooter() {
  return <footer className={styles.footer}><span>A little more curious, every day.</span><div><Link href="/showcase">Explore LEARN<ArrowUpRight size={14} /></Link><Link href="/login">Sign in<ArrowUpRight size={14} /></Link></div></footer>
}

export function PublicHome() {
  return <main className={styles.surface}>
    <div className={styles.wrap}>
      <PublicHeader />
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}><span className={styles.smallStar}><Sparkles size={14} /></span>YOUR PERSONAL LEARNING STUDIO</div>
          <h1 id="home-title">Your ideas,<br />in <span className={styles.colorWord}>full color<svg viewBox="0 0 320 16" aria-hidden="true"><path d="M3 11 Q150 -4 315 8" /></svg></span><span className={styles.period}>.</span></h1>
          <p className={styles.lead}>Create something. Understand it.<br />Make it yours.</p>
          <div className={styles.heroActions}><Link href="/login?mode=request" className={styles.primary}>Get started<ArrowRight size={18} /></Link><Link href="/showcase" className={styles.textLink}>Take a look<ArrowUpRight size={17} /></Link></div>
          <div className={styles.formatRow} aria-label="Notes, canvases and a little structure"><span className={styles.formatIcon}><Layers3 size={15} /></span><span>Your notes. Your canvas. Your pace.</span></div>
        </div>
        <div className={styles.heroVisual}><ProductPreview /><span className={styles.previewCaption}>A few possibilities. All in one space.<ArrowUpRight size={15} /></span></div>
      </section>
      <section className={styles.paths} aria-labelledby="paths-title">
        <div className={styles.sectionTitle}><h2 id="paths-title">Follow your curiosity.</h2><span>There’s more than one way in.</span></div>
        <div className={styles.pathGrid}>
          <Link href="/showcase?view=studio" aria-label="Explore Studio" className={`${styles.pathCard} ${styles.pathCreate}`}>
            <div className={styles.pathArt} aria-hidden="true"><div className={styles.miniPage}><span /><strong>A bright<br />new idea.</strong><i /></div><div className={styles.miniSwatches}><i /><i /><i /></div></div>
            <div className={styles.pathLabel}><div><span>01 / CREATE</span><h3>Start with a spark.</h3></div><ArrowUpRight size={21} /></div>
          </Link>
          <Link href="/showcase?view=practice" aria-label="Explore Practice" className={`${styles.pathCard} ${styles.pathPractice}`}>
            <div className={styles.pathArt} aria-hidden="true"><div className={styles.miniQuiz}><Star size={26} /><strong>Aha!</strong><div><Check size={16} /><span>You’ve got this.</span></div></div><span className={styles.confettiOne} /><span className={styles.confettiTwo} /></div>
            <div className={styles.pathLabel}><div><span>02 / PRACTICE</span><h3>Make it click.</h3></div><ArrowUpRight size={21} /></div>
          </Link>
          <Link href="/showcase?view=calendar" aria-label="Explore Calendar" className={`${styles.pathCard} ${styles.pathPlan}`}>
            <div className={styles.pathArt} aria-hidden="true"><div className={styles.miniCalendar}><CalendarDays size={19} /><strong>A little<br />every day.</strong><div>{[0,1,2,3,4].map(day => <span key={day}>{day < 3 ? <Check size={13} /> : null}</span>)}</div></div></div>
            <div className={styles.pathLabel}><div><span>03 / GROW</span><h3>Find your rhythm.</h3></div><ArrowUpRight size={21} /></div>
          </Link>
        </div>
      </section>
      <section className={styles.closing}><span className={styles.closingStar} aria-hidden="true">✳</span><div><h2>A space that feels like you.</h2><p>One idea is a good place to start.</p></div><Link href="/login?mode=request" className={styles.primary}>Make it yours<ArrowRight size={18} /></Link></section>
      <PublicFooter />
    </div>
  </main>
}
