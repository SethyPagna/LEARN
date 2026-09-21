import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"

/**
 * Text-contrast guard for the A1 axis of the design system.
 *
 * It reads the real token values out of `src/app/globals.css`, converts them to sRGB
 * and checks the WCAG 2.1 contrast ratio of every foreground token against every
 * surface that token is actually painted on. It is pure: no browser, no dependencies.
 *
 * Why a guard: the tokens are the single place where contrast is decided, so a
 * one-digit lightness tweak in globals.css used to be invisible until someone
 * re-measured the running app by hand. This test makes that tweak fail loudly.
 */

// WCAG 2.1 success criterion 1.4.3 (AA) and 1.4.6 (AAA).
const WCAG_AA_NORMAL_TEXT = 4.5
const WCAG_AA_LARGE_TEXT = 3
const WCAG_AAA_NORMAL_TEXT = 7
const WCAG_AAA_LARGE_TEXT = 4.5

type Rgb = { r: number; g: number; b: number }

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// --- sRGB <-> WCAG ---------------------------------------------------------

/**
 * WCAG 2.1 relative luminance: undo the sRGB transfer function per channel, then
 * weight by human sensitivity to each primary (green dominates).
 */
function relativeLuminance({ r, g, b }: Rgb): number {
  const linear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/**
 * WCAG 2.1 contrast ratio: `(L_lighter + 0.05) / (L_darker + 0.05)`, in the range
 * 1:1 (identical) to 21:1 (black on white). The 0.05 offset models flare on a
 * real display, so the scale is not linear.
 */
function contrastRatio(a: Rgb, b: Rgb): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

// --- CSS colour parsing ----------------------------------------------------

/** oklab -> linear sRGB, then gamma-encoded sRGB (Björn Ottosson's Oklab matrices). */
function oklabToRgb(l: number, a: number, b: number): Rgb {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b
  const s_ = l - 0.0894841775 * a - 1.291485548 * b
  const lc = l_ ** 3
  const mc = m_ ** 3
  const sc = s_ ** 3
  const encode = (channel: number) =>
    clamp01(channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055)
  return {
    r: encode(4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc),
    g: encode(-1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc),
    b: encode(-0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc),
  }
}

/** CIE Lab (D65) -> XYZ -> linear sRGB -> sRGB. */
function labToRgb(l: number, a: number, b: number): Rgb {
  const [xn, yn, zn] = [0.95047, 1, 1.08883]
  const fy = (l + 16) / 116
  const fx = fy + a / 500
  const fz = fy - b / 200
  const finv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / 903.3)
  const [x, y, z] = [xn * finv(fx), yn * finv(fy), zn * finv(fz)]
  const encode = (channel: number) =>
    clamp01(channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055)
  return {
    r: encode(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    g: encode(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    b: encode(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
  }
}

/** Parse `oklch()`, `oklab()`, `lab()`, `#rgb`, `#rrggbb` or `rgb()` into sRGB 0..1. */
function parseCssColor(value: string): Rgb {
  const text = value.trim().toLowerCase()
  const numbers = (input: string) => input.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/g)?.map(Number) ?? []

  if (text.startsWith("oklch(")) {
    const [l, c, h] = numbers(text)
    const radians = (h * Math.PI) / 180
    return oklabToRgb(l, c * Math.cos(radians), c * Math.sin(radians))
  }
  if (text.startsWith("oklab(")) {
    const [l, a, b] = numbers(text)
    return oklabToRgb(l, a, b)
  }
  if (text.startsWith("lab(")) {
    const [l, a, b] = numbers(text)
    return labToRgb(l, a, b)
  }
  if (text.startsWith("rgb(")) {
    const [r, g, b] = numbers(text)
    return { r: r / 255, g: g / 255, b: b / 255 }
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(text)
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((d) => d + d).join("") : hex[1]
    return {
      r: parseInt(digits.slice(0, 2), 16) / 255,
      g: parseInt(digits.slice(2, 4), 16) / 255,
      b: parseInt(digits.slice(4, 6), 16) / 255,
    }
  }
  throw new Error(`Unsupported colour value in globals.css: ${value}`)
}

// --- globals.css token extraction -----------------------------------------

const globalsCss = fs.readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8")

/** Read the declarations of one theme block, e.g. selector ":root" or ".dark". */
function readTokenBlock(selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const block = new RegExp(`^${escaped}\\s*\\{([\\s\\S]*?)^\\}`, "m").exec(globalsCss)
  if (!block) throw new Error(`globals.css no longer declares a "${selector}" block`)

  const tokens: Record<string, string> = {}
  for (const line of block[1].split("\n")) {
    const declaration = /^\s*(--[\w-]+)\s*:\s*([^;]+);/.exec(line)
    if (declaration) tokens[declaration[1]] = declaration[2].trim()
  }
  return tokens
}

const lightTheme = readTokenBlock(":root")
const darkTheme = readTokenBlock(".dark")
const themes: Array<[string, Record<string, string>]> = [
  ["light", lightTheme],
  ["dark", darkTheme],
]

function token(tokens: Record<string, string>, name: string, theme: string): string {
  const value = tokens[name]
  if (!value) throw new Error(`globals.css "${theme}" block no longer declares ${name}`)
  return value
}

// Surfaces each foreground token is actually painted on (card is the default
// container, background the page, muted the tinted well, popover the menus).
const SURFACE_TOKENS = ["--background", "--card", "--muted", "--popover"] as const

// --- the conversion itself is trustworthy ----------------------------------

test("contrast math matches the WCAG reference values", () => {
  const black = parseCssColor("#000000")
  const white = parseCssColor("#ffffff")

  assert.equal(relativeLuminance(black), 0)
  assert.equal(relativeLuminance(white), 1)
  assert.equal(contrastRatio(black, white), 21)
  // #767676 on white is the canonical "just passes AA" grey (4.54:1).
  assert.ok(Math.abs(contrastRatio(parseCssColor("#767676"), white) - 4.54) < 0.01)
  // Same colour through the oklch() parser must land on the same sRGB values.
  assert.ok(Math.abs(contrastRatio(parseCssColor("oklch(1 0 0)"), black) - 21) < 0.05)
})

test("AA and AAA thresholds are the published WCAG constants", () => {
  assert.equal(WCAG_AA_NORMAL_TEXT, 4.5)
  assert.equal(WCAG_AA_LARGE_TEXT, 3)
  assert.equal(WCAG_AAA_NORMAL_TEXT, 7)
  assert.equal(WCAG_AAA_LARGE_TEXT, 4.5)
})

// --- the guard -------------------------------------------------------------

for (const [theme, tokens] of themes) {
  test(`${theme} theme: muted-foreground text clears WCAG AA on every surface`, () => {
    const foreground = parseCssColor(token(tokens, "--muted-foreground", theme))
    for (const surface of SURFACE_TOKENS) {
      const ratio = contrastRatio(foreground, parseCssColor(token(tokens, surface, theme)))
      assert.ok(
        ratio >= WCAG_AA_NORMAL_TEXT,
        `${theme}: --muted-foreground on ${surface} is ${ratio.toFixed(2)}:1, needs ${WCAG_AA_NORMAL_TEXT}:1`,
      )
    }
  })

  test(`${theme} theme: success foreground/background pair clears WCAG AA`, () => {
    const background = parseCssColor(token(tokens, "--success", theme))
    const foreground = parseCssColor(token(tokens, "--success-foreground", theme))
    const pairRatio = contrastRatio(foreground, background)
    assert.ok(
      pairRatio >= WCAG_AA_NORMAL_TEXT,
      `${theme}: --success-foreground on --success is ${pairRatio.toFixed(2)}:1, needs ${WCAG_AA_NORMAL_TEXT}:1`,
    )
    // The same token is also used as text (`text-success`) on page surfaces.
    for (const surface of SURFACE_TOKENS) {
      const ratio = contrastRatio(background, parseCssColor(token(tokens, surface, theme)))
      assert.ok(
        ratio >= WCAG_AA_NORMAL_TEXT,
        `${theme}: --success as text on ${surface} is ${ratio.toFixed(2)}:1, needs ${WCAG_AA_NORMAL_TEXT}:1`,
      )
    }
  })

  test(`${theme} theme: destructive foreground/background pair clears WCAG AA`, () => {
    const background = parseCssColor(token(tokens, "--destructive", theme))
    const foreground = parseCssColor(token(tokens, "--destructive-foreground", theme))
    const pairRatio = contrastRatio(foreground, background)
    assert.ok(
      pairRatio >= WCAG_AA_NORMAL_TEXT,
      `${theme}: --destructive-foreground on --destructive is ${pairRatio.toFixed(2)}:1, needs ${WCAG_AA_NORMAL_TEXT}:1`,
    )
    // `text-destructive` labels (menus, file actions) sit on page surfaces.
    for (const surface of SURFACE_TOKENS) {
      const ratio = contrastRatio(background, parseCssColor(token(tokens, surface, theme)))
      assert.ok(
        ratio >= WCAG_AA_NORMAL_TEXT,
        `${theme}: --destructive as text on ${surface} is ${ratio.toFixed(2)}:1, needs ${WCAG_AA_NORMAL_TEXT}:1`,
      )
    }
  })

  test(`${theme} theme: body foreground clears WCAG AAA on every surface`, () => {
    const foreground = parseCssColor(token(tokens, "--foreground", theme))
    for (const surface of SURFACE_TOKENS) {
      const ratio = contrastRatio(foreground, parseCssColor(token(tokens, surface, theme)))
      assert.ok(
        ratio >= WCAG_AAA_NORMAL_TEXT,
        `${theme}: --foreground on ${surface} is ${ratio.toFixed(2)}:1, needs ${WCAG_AAA_NORMAL_TEXT}:1`,
      )
    }
  })
}
