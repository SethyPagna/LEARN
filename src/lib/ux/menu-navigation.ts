/**
 * Keyboard resolution for the Create menu and the place guide.
 *
 * The rule that matters: a menu must never swallow a key while the user is
 * typing. The launcher's search box sits in the same sidebar as the Create
 * button, so a handler that listened on `window` would eat arrow keys and
 * Enter out from under a focused input. Resolution lives here as a pure
 * function so that rule is tested directly instead of asserted by eye.
 */

export type MenuKeyIntent =
  | { type: "ignore" }
  | { type: "close" }
  | { type: "focus"; index: number }
  | { type: "choose"; index: number }

export interface MenuKeyInput {
  key: string
  /** Number of entries currently visible in the menu. */
  count: number
  /** Highlighted entry, or `-1` when nothing is highlighted yet. */
  activeIndex: number
  /** True when the key event came from a text field the user is typing in. */
  targetIsEditable?: boolean
  open: boolean
}

function wrap(index: number, count: number) {
  return ((index % count) + count) % count
}

export function resolveMenuKey(input: MenuKeyInput): MenuKeyIntent {
  const { activeIndex, count, key, open, targetIsEditable } = input

  // Typing wins. Escape is exempt so a menu that already owns focus can close,
  // but arrow keys and Enter always belong to the focused field.
  if (targetIsEditable) return key === "Escape" ? { type: "close" } : { type: "ignore" }
  if (key === "Escape") return { type: "close" }
  if (!open || count < 1) return { type: "ignore" }

  if (key === "ArrowDown") return { type: "focus", index: wrap(activeIndex + 1, count) }
  if (key === "ArrowUp") return { type: "focus", index: wrap(activeIndex - 1, count) }
  if (key === "Enter") return { type: "choose", index: wrap(Math.max(activeIndex, 0), count) }
  return { type: "ignore" }
}
