/**
 * The sidebar has three states, and the one a person picks survives reloads.
 *
 *  - `expanded`: labels, section tabs and the account card (the default);
 *  - `rail`: icons only, so the page gets the width back;
 *  - `hidden`: no sidebar at all; the top bar offers a button to bring it back.
 *
 * The choice lives in a cookie rather than localStorage because the server
 * renders the shell: reading the cookie there means the first paint already
 * has the right width, with no flash and no inline bootstrap script.
 */

export const SIDEBAR_MODES = ["expanded", "rail", "hidden"] as const
export type SidebarMode = (typeof SIDEBAR_MODES)[number]

export const SIDEBAR_COOKIE = "learn_sidebar"
export const DEFAULT_SIDEBAR_MODE: SidebarMode = "expanded"

/** Pixel widths the layout reserves for each state on large screens. */
export const SIDEBAR_WIDTH: Record<SidebarMode, number> = {
  expanded: 264,
  rail: 76,
  hidden: 0,
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

export function isSidebarMode(value: unknown): value is SidebarMode {
  return typeof value === "string" && (SIDEBAR_MODES as readonly string[]).includes(value)
}

export function parseSidebarMode(value: unknown): SidebarMode {
  return isSidebarMode(value) ? value : DEFAULT_SIDEBAR_MODE
}

/** The keyboard shortcut steps through every state and wraps around. */
export function cycleSidebarMode(mode: SidebarMode): SidebarMode {
  const index = SIDEBAR_MODES.indexOf(mode)
  return SIDEBAR_MODES[(index + 1) % SIDEBAR_MODES.length]
}

/** The sidebar's own button only switches between labels and icons. */
export function toggleSidebarDensity(mode: SidebarMode): SidebarMode {
  return mode === "expanded" ? "rail" : "expanded"
}

/** A `document.cookie` assignment for the chosen state. */
export function sidebarModeCookie(mode: SidebarMode) {
  return `${SIDEBAR_COOKIE}=${mode}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`
}
