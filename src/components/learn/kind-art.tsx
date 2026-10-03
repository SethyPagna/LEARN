import type { ProjectKind } from "./studio-projects"

/** Every kind of work with a colour of its own: the five project kinds plus quizzes. */
export type ArtKind = ProjectKind | "quiz"

/**
 * A small drawing of a kind of work for covers with nothing to preview yet.
 * It takes the kind's colour from `--project-color`, which any ancestor with
 * `data-project-kind` sets.
 */
export function KindArt({ kind }: { kind: ArtKind }) {
  switch (kind) {
    case "notes": return <svg className="kind-art" viewBox="0 0 120 80" aria-hidden="true"><path className="kind-art-paper" d="M34 10h44l12 12v48H34Z" /><path className="kind-art-fold" d="M78 10v12h12" /><path className="kind-art-line" d="M43 32h34M43 42h38M43 52h26" /></svg>
    case "docs": return <svg className="kind-art" viewBox="0 0 120 80" aria-hidden="true"><rect className="kind-art-paper" x="32" y="8" width="56" height="64" rx="4" /><rect className="kind-art-block" x="40" y="17" width="28" height="6" rx="2" /><path className="kind-art-line" d="M40 33h40M40 42h40M40 51h32M40 60h36" /></svg>
    case "slides": return <svg className="kind-art" viewBox="0 0 120 80" aria-hidden="true"><rect className="kind-art-paper" x="18" y="14" width="84" height="52" rx="5" /><rect className="kind-art-block" x="28" y="24" width="36" height="7" rx="2" /><path className="kind-art-line" d="M28 40h30M28 49h22" /><circle className="kind-art-shape" cx="80" cy="46" r="11" /></svg>
    case "sheets": return <svg className="kind-art" viewBox="0 0 120 80" aria-hidden="true"><rect className="kind-art-paper" x="24" y="12" width="72" height="56" rx="4" /><path className="kind-art-grid" d="M24 26h72M24 40h72M24 54h72M48 12v56M72 12v56" /><rect className="kind-art-block" x="49" y="27" width="22" height="12" /></svg>
    case "quiz": return <svg className="kind-art" viewBox="0 0 120 80" aria-hidden="true"><rect className="kind-art-paper" x="26" y="8" width="68" height="64" rx="6" /><rect className="kind-art-block" x="35" y="17" width="34" height="6" rx="2" /><rect className="kind-art-grid" x="35" y="32" width="50" height="12" rx="4" /><rect className="kind-art-grid" x="35" y="51" width="50" height="12" rx="4" /><circle className="kind-art-shape" cx="78" cy="38" r="3.5" /></svg>
    default: return <svg className="kind-art" viewBox="0 0 120 80" aria-hidden="true"><circle className="kind-art-shape" cx="46" cy="38" r="18" /><rect className="kind-art-block" x="54" y="30" width="30" height="30" rx="4" transform="rotate(-8 69 45)" /><path className="kind-art-paper" d="M74 14l14 24H60Z" /></svg>
  }
}
