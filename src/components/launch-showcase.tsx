"use client"

import Link from "next/link"
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react"
import { PublicFooter, PublicHeader } from "@/components/public-home"
import { ProductPreview, previewSections, usePreviewQuery } from "@/components/public-product-preview"
import styles from "./public-experience.module.css"

const tourSections = previewSections.map(section => section.id)

export function LaunchShowcase({ signedIn }: { signedIn: boolean }) {
  const { section, setSection } = usePreviewQuery()
  const current = previewSections.find(item => item.id === section)!
  return <main className={styles.surface}>
    <div className={styles.wrap}>
      <PublicHeader signedIn={signedIn} />
      <section className={styles.tour} aria-labelledby="tour-title">
        <div className={styles.tourIntro}><Link href="/" className={styles.backLink}><ArrowLeft size={15} />Home</Link><div className={styles.eyebrow}><Sparkles size={14} />A LITTLE LOOK AROUND</div><h1 id="tour-title">Find your <span>flow.</span></h1><p>Different ways to learn. One space to be you.</p></div>
        <ProductPreview section={section} onSectionChange={setSection} sections={tourSections} />
        <div className={styles.tourCaption} aria-live="polite"><div><h2>{current.title}</h2><p>{current.description}</p></div><Link href={signedIn ? "/dashboard" : "/login?mode=request"} className={styles.primary}>{signedIn ? "Open workspace" : "Get started"}<ArrowRight size={17} /></Link></div>
      </section>
      <PublicFooter />
    </div>
  </main>
}
