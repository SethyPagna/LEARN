import Link from "next/link"
import { ArrowRight, ArrowUpRight, CalendarDays, Check, Layers3, MousePointer2, Sparkles, Star, Type } from "lucide-react"
import { PublicIntroControls } from "@/components/public-intro-controls"
import { ProductPreview } from "@/components/public-product-preview"
import styles from "./public-experience.module.css"
import home from "./public-home.module.css"

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
  return <main className={`${styles.surface} ${home.surface}`}>
    <div className={home.wrap}>
      <PublicHeader />
      <section className={home.hero} aria-labelledby="home-title">
        <span className={home.heroOrbit} aria-hidden="true" />
        <span className={home.heroFlower} aria-hidden="true">✳</span>
        <div className={home.eyebrow}><span />YOUR PERSONAL LEARNING STUDIO</div>
        <h1 id="home-title" aria-label="Learn it. Make it yours.">Learn it.<br /><span>Make it <span className={home.yours}>yours<svg viewBox="0 0 280 18" aria-hidden="true"><path d="M4 12 Q136 1 276 9" /></svg></span>.</span></h1>
        <p>A space for your notes, your ideas, your next aha.</p>
        <div className={home.actions}><Link href="/login?mode=request" className={home.primary}>Get started<ArrowRight size={18} /></Link><Link href="/showcase" className={home.secondary}>Take a look<ArrowUpRight size={17} /></Link></div>
        <span className={home.heroSpark} aria-hidden="true">✦</span>
      </section>
      <section className={home.workspace} aria-label="Try the workspace">
        <div className={home.workspaceCaption}><span>FROM “WHAT IF” TO “I MADE THIS.”</span><span>Go on. Try it.<ArrowRight size={15} /></span></div>
        <div className={home.stage}>
          <div className={home.ideaCard} aria-hidden="true"><span><Sparkles size={15} /> IDEA NO. 01</span><strong>What if?</strong><i /><i /><div><span /><span /><span /></div></div>
          <span className={home.stageFlower} aria-hidden="true">✳</span>
          <div className={home.preview}><ProductPreview /></div>
          <div className={home.toolsSticker} aria-hidden="true"><MousePointer2 size={18} /><Type size={20} /><Layers3 size={19} /></div>
          <div className={home.ahaSticker} aria-hidden="true"><Star size={25} /><span>THAT AHA<br />FEELING.</span></div>
          <span className={home.stageLoop} aria-hidden="true" />
        </div>
      </section>
      <section className={home.paths} aria-labelledby="paths-title">
        <div className={home.sectionHeading}><span>YOUR NEXT CHAPTER</span><h2>Follow your curiosity.</h2></div>
        <div className={home.pathGrid}>
          <Link href="/showcase?view=studio" aria-label="Explore Studio" className={`${home.pathCard} ${home.create}`}>
            <div className={home.pathTop}><span><Layers3 size={17} /> Create</span><ArrowUpRight size={20} /></div>
            <div className={home.createArt} aria-hidden="true"><div /><div /><div><span>an idea,<br />unfolding.</span><i>✳</i></div><span className={home.cursor}><MousePointer2 size={24} /></span></div>
            <h3>Give it a shape.</h3>
          </Link>
          <Link href="/showcase?view=practice" aria-label="Explore Practice" className={`${home.pathCard} ${home.practice}`}>
            <div className={home.pathTop}><span><Star size={17} /> Practice</span><ArrowUpRight size={20} /></div>
            <div className={home.practiceArt} aria-hidden="true"><span className={home.practiceBurst}>✳</span><div><span>01 / 03</span><strong>You’ve got this.</strong><div><i>A</i><span /></div><div><i><Check size={13} /></i><span /></div></div><span className={home.correctSticker}><Check size={27} /></span></div>
            <h3>Make it click.</h3>
          </Link>
          <Link href="/showcase?view=calendar" aria-label="Explore Calendar" className={`${home.pathCard} ${home.plan}`}>
            <div className={home.pathTop}><span><CalendarDays size={17} /> Plan</span><ArrowUpRight size={20} /></div>
            <div className={home.planArt} aria-hidden="true"><div><span>A LITTLE EVERY DAY</span><div>{["M", "T", "W", "T", "F"].map((day, index) => <span key={index}><small>{day}</small><strong>{12 + index}</strong></span>)}</div><i /><i /></div><span className={home.clock}><i /><i /></span></div>
            <h3>Find your rhythm.</h3>
          </Link>
        </div>
      </section>
      <section className={home.closing}><div><span>SMALL STARTS. GOOD THINGS.</span><h2>One idea is enough.</h2></div><Link href="/login?mode=request" className={home.primary}>Make it yours<ArrowRight size={18} /></Link><span className={home.closingFlower} aria-hidden="true">✳</span></section>
      <PublicFooter />
    </div>
  </main>
}
