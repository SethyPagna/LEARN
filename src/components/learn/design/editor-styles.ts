export const CANVAS_PRESET_CSS = `
.learn-canvas-soft {
  --canvas-radius: 16px;
  --canvas-radius-sm: 12px;
  --canvas-shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 18px 40px -28px rgba(15, 23, 42, 0.35);
  --canvas-shadow-soft: 0 12px 28px -22px rgba(15, 23, 42, 0.4);
  --canvas-gap: 14px;
}
.learn-canvas-soft .canvas-panel {
  border: 0;
  border-radius: var(--canvas-radius);
  box-shadow: var(--canvas-shadow);
}
.learn-canvas-soft .canvas-sheet {
  border: 0;
  border-radius: var(--canvas-radius);
  box-shadow: var(--canvas-shadow);
}
.learn-canvas-soft .canvas-tool {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--card-foreground);
  font-size: 0.78rem;
  font-weight: 500;
  letter-spacing: 0.01em;
  transition: background 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}
.learn-canvas-soft .canvas-tool:hover:not(:disabled) {
  background: var(--accent);
  color: var(--accent-foreground);
  box-shadow: none;
}
.learn-canvas-soft .canvas-tool:disabled {
  opacity: 0.5;
}
.learn-canvas-soft .canvas-tool[data-active="true"] {
  background: var(--accent);
  color: var(--accent-foreground);
}
.learn-canvas-soft .canvas-element {
  border-radius: var(--canvas-radius-sm);
  transition: box-shadow 180ms ease;
}
.learn-canvas-soft .canvas-element[data-static="false"]:hover {
  box-shadow: var(--canvas-shadow-soft);
}
.learn-canvas-soft .canvas-handle {
  border: 0;
  border-radius: 999px;
  background: var(--card);
  box-shadow: 0 0 0 1.5px var(--primary), 0 2px 6px rgba(15, 23, 42, 0.25);
}
/**
 * The dot stays 10px so the selection chrome stays quiet, but the *hit area* is
 * the 24px box below: a transparent ::after centred on the dot, which the
 * engine's hit test (target.closest("[data-resize-handle]")) resolves to this
 * same button because a pseudo-element belongs to its originating element.
 * Geometry, drag maths and the painted dot are untouched — only the surface a
 * finger or pointer has to find gets bigger. Coarse pointers get 32px, and
 * touch-action: none so a drag is not swallowed by the sheet's scrolling.
 */
.learn-canvas-soft .canvas-handle::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;
  height: 24px;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  background: transparent;
}
/**
 * The rotate handle hangs 28px above the top edge, so on a coarse pointer its
 * enlarged box would lose the strip nearest the "n" resize handle — whichever
 * handle is painted last wins the overlap. Rotate is painted first, so it goes
 * on top: the dot a finger aims at is the dot that receives the gesture, and the
 * engine's own hit test (closest on data-resize-handle) sees no change.
 */
.learn-canvas-soft [data-rotate-handle] {
  z-index: 1;
}
@media (pointer: coarse) {
  .learn-canvas-soft .canvas-handle {
    touch-action: none;
  }
  .learn-canvas-soft .canvas-handle::after {
    width: 32px;
    height: 32px;
  }
}
.learn-canvas-soft .canvas-layer {
  border: 0;
  border-radius: var(--canvas-radius-sm);
  transition: background 160ms ease;
}
.learn-canvas-soft .canvas-layer[data-selected="true"] {
  background: var(--accent);
  color: var(--accent-foreground);
}
.learn-canvas-soft .canvas-layer[data-drop="true"] {
  box-shadow: inset 0 0 0 1.5px var(--primary);
}
`
