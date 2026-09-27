import type { BuddyMood } from "@/lib/today"

const moodLabels: Record<BuddyMood, string> = {
  happy: "happy",
  excited: "excited",
  curious: "curious",
  sleepy: "sleepy",
  hello: "waving hello",
}

function Eyes({ mood }: { mood: BuddyMood }) {
  if (mood === "sleepy") {
    return <g><path className="buddy-line" strokeWidth="2.6" d="M19 31q4 3.2 8 0M37 31q4 3.2 8 0" /></g>
  }
  if (mood === "excited") {
    return <g className="buddy-eyes"><path className="buddy-line" strokeWidth="2.8" d="M19 32q4-5.5 8 0M37 32q4-5.5 8 0" /></g>
  }
  // Curious looks up at whatever you just picked out.
  const look = mood === "curious" ? { x: 1.4, y: -1.8 } : { x: 1, y: 1.5 }
  return (
    <g className="buddy-eyes">
      <ellipse className="buddy-white" cx="23" cy="30" rx="4.2" ry="5.6" />
      <ellipse className="buddy-white" cx="41" cy="30" rx="4.2" ry="5.6" />
      <circle className="buddy-ink" cx={23 + look.x} cy={30 + look.y} r="2.5" />
      <circle className="buddy-ink" cx={41 + look.x} cy={30 + look.y} r="2.5" />
      <circle className="buddy-white" cx={23.9 + look.x} cy={29 + look.y} r=".8" />
      <circle className="buddy-white" cx={41.9 + look.x} cy={29 + look.y} r=".8" />
    </g>
  )
}

function Mouth({ mood }: { mood: BuddyMood }) {
  if (mood === "excited") {
    return (
      <g>
        <path className="buddy-ink" d="M25 41h14c0 5.2-3.1 8.4-7 8.4S25 46.2 25 41Z" />
        <path className="buddy-cheek" style={{ opacity: 1 }} d="M28.4 46.6c2.2-1.6 5-1.6 7.2 0-1 1.2-2.2 1.8-3.6 1.8s-2.6-.6-3.6-1.8Z" />
      </g>
    )
  }
  if (mood === "curious") return <ellipse className="buddy-ink" cx="32" cy="44" rx="2.4" ry="2.8" />
  if (mood === "sleepy") return <path className="buddy-line" strokeWidth="2.4" d="M28.5 44.5q3.5 1.8 7 0" />
  return <path className="buddy-line" strokeWidth="2.6" d="M26 42c3.5 3.5 8.5 3.5 12 0" />
}

/**
 * The study buddy: a small violet blob with a face. Its mood follows the
 * learner's streak (see `buddyMood` in src/lib/today.ts), and it bobs, blinks
 * and waves unless the learner has asked for less motion.
 */
export function Buddy({
  mood = "happy",
  size = 56,
  animated = true,
  className = "",
  label,
}: {
  mood?: BuddyMood
  size?: number
  animated?: boolean
  className?: string
  /** Spoken name; pass an empty string when text next to it already says it. */
  label?: string
}) {
  const name = label ?? `Study buddy, ${moodLabels[mood]}`
  return (
    <svg
      className={`learn-buddy${className ? ` ${className}` : ""}`}
      data-mood={mood}
      data-animated={animated || undefined}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={name ? "img" : undefined}
      aria-label={name || undefined}
      aria-hidden={name ? undefined : true}
      focusable="false"
    >
      {mood === "excited" ? (
        <g>
          <path className="buddy-spark" d="M8 8l1.6 3.4L13 13l-3.4 1.6L8 18l-1.6-3.4L3 13l3.4-1.6Z" />
          <path className="buddy-spark" d="M56 4l1.2 2.6L60 8l-2.8 1.3L56 12l-1.2-2.7L52 8l2.8-1.4Z" />
          <path className="buddy-spark" d="M58 50l1 2.2 2.4 1-2.4 1.1L58 57l-1-2.7-2.4-1.1 2.4-1Z" />
        </g>
      ) : null}
      {mood === "sleepy" ? (
        <g className="buddy-zzz">
          <path className="buddy-line" strokeWidth="1.8" d="M49 7h6l-6 7h6" />
          <path className="buddy-line" strokeWidth="1.5" d="M57 1h4l-4 4.5h4" />
        </g>
      ) : null}
      <path className="buddy-tuft" d="M32 5c-1.5-3.2-5.6-3.6-7.4-.6" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path className="buddy-body" d="M32 4c15 0 27 10 27 26 0 17-11 30-27 30S5 47 5 30C5 14 17 4 32 4Z" />
      <path className="buddy-shade" d="M8.6 40c3.4 11.6 12.5 20 23.4 20s20-8.4 23.4-20c-4.6 7.4-13.3 12.2-23.4 12.2S13.2 47.4 8.6 40Z" />
      {mood === "hello" ? (
        <g className="buddy-wave">
          <ellipse className="buddy-hand" cx="54.5" cy="15.5" rx="4.4" ry="6" transform="rotate(32 54.5 15.5)" />
          <path className="buddy-line" strokeWidth="1.6" d="M60.5 6.5q2.4 2.2 2.2 5.4M57.8 3.6q1.6.9 2.4 2.2" />
        </g>
      ) : null}
      <Eyes mood={mood} />
      <ellipse className="buddy-cheek" cx="16" cy="41" rx="4" ry="2.5" />
      <ellipse className="buddy-cheek" cx="48" cy="41" rx="4" ry="2.5" />
      <Mouth mood={mood} />
    </svg>
  )
}
