// Browser UX audit — the repeatable, real-browser check behind `pnpm audit:ux`.
//
// Why it exists: the unit suite can prove what the engine computes, but not what
// Chrome actually paints. This drives an already-running Chrome over the
// DevTools Protocol (`ops/scripts/test/lib/cdp.mjs`, Node's built-in WebSocket +
// fetch) and measures, per route and viewport:
//
//   * document-level horizontal overflow            -> failure
//   * console errors / uncaught exceptions          -> failure
//   * a missing heading                             -> failure
//   * content past the right edge that is *clipped* -> failure
//     Measured in three steps, so the count means something: an element past the
//     edge only counts if it is actually visible to a user (`checkVisibility`,
//     which excludes closed dropdowns and off-canvas drawers), and only if no
//     ancestor is an `overflow-x: auto|scroll` strip that can scroll to it
//     (those are counted as `scrollable` and reported, not failed). Of what
//     remains, only the deepest leaf in a chain is reported, so one unreachable
//     chip is one finding instead of the twenty boxes that contain it.
//   * touch targets whose *effective hit area* (probed with elementFromPoint,
//     so transparent padding and ::after hit boxes count) is under 24x24 CSS px
//     -> failure, per WCAG 2.2 "Target Size (Minimum)"; under 44x44 is reported
//     as advisory
//   * the canvas resize/rotate handles, selected first through the layer row so
//     they are actually in the DOM, measured the same way -> failure under 24x24
//
// It does not start anything for you. Bring up the two dependencies first:
//
//   node node_modules/next/dist/bin/next dev --port 3111   # or ops\run\start-local.bat + the port
//   chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<temp> about:blank
//
// then: `pnpm audit:ux`
//
// Report: ops/docs/audits/browser-ux-audit.json (override with AUDIT_REPORT).
// Exit codes: 0 = clean, 1 = audit failures, 2 = environment/preflight problem.

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { browserVersion, cdpHost, connect, delay, evaluate, firstPageTarget, goto } from "./lib/cdp.mjs"

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const BASE_URL = process.env.AUDIT_BASE_URL || "http://localhost:3111"
const REPORT_PATH = path.resolve(REPO_ROOT, process.env.AUDIT_REPORT || "ops/docs/audits/browser-ux-audit.json")
const LOGIN_USER = process.env.AUDIT_USER || "admin"
const LOGIN_PASSWORD = process.env.AUDIT_PASSWORD || "Admin123456!"
const SHOT_DIR = process.env.AUDIT_SHOTS ? path.resolve(process.env.AUDIT_SHOTS) : null

const ROUTES = ["/dashboard", "/canvas", "/notes", "/practice", "/social", "/calendar", "/settings", "/ai", "/live"]
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, mobile: true, touch: true },
  { name: "laptop", width: 1440, height: 900, mobile: false, touch: false },
]

/** Fails with the command the owner has to type, not a stack trace. */
function preflight(message) {
  console.error(`browser-ux-audit: ${message}`)
  process.exit(2)
}

/**
 * Runs inside the page. Self-contained on purpose (it is stringified), so it
 * must not reference anything from this module.
 */
function measurePage() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const overflow = document.documentElement.scrollWidth - vw

  // The document can read 0 while content is still cut off, because an ancestor
  // clips it with `overflow-x: hidden`. This is that hidden amount — the reason
  // a route can have zero document overflow and still lose content.
  let maskedOverflow = 0
  for (const el of document.querySelectorAll("body *")) {
    const style = getComputedStyle(el)
    if (style.overflowX !== "hidden") continue
    const hidden = el.scrollWidth - el.clientWidth
    if (hidden > maskedOverflow) maskedOverflow = hidden
  }

  const describe = (el) => {
    const id = el.id ? "#" + el.id : ""
    const cls = String(el.className || "").trim().replace(/\s+/g, ".").slice(0, 40)
    return el.tagName.toLowerCase() + id + (cls ? "." + cls : "")
  }

  const isSvgPart = (el) => el.namespaceURI === "http://www.w3.org/2000/svg" || Boolean(el.closest("svg"))

  // The same test a sighted user passes: display/visibility/opacity, including
  // ancestors, and closed <details> content. Without it every closed dropdown
  // and off-canvas drawer counts as "clipped content", which is noise.
  const isVisible = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })

  // An element past the edge is only a defect if nothing above it scrolls.
  const scrollerFor = (el) => {
    let node = el.parentElement
    while (node && node !== document.documentElement) {
      const style = getComputedStyle(node)
      const overflowX = style.overflowX
      if ((overflowX === "auto" || overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1) {
        return describe(node)
      }
      node = node.parentElement
    }
    return null
  }

  const REPLACED = new Set(["img", "svg", "canvas", "video", "iframe", "input", "select", "textarea", "table"])
  const isLeafContent = (el) => REPLACED.has(el.tagName.toLowerCase()) || !el.firstElementChild

  const pastEdge = []
  for (const el of document.querySelectorAll("body *")) {
    if (isSvgPart(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    if (getComputedStyle(el).position === "fixed") continue
    if (rect.right <= vw + 2 && rect.left >= -2) continue
    if (!isVisible(el)) continue
    pastEdge.push(el)
  }

  // Only the deepest offender in a chain is reported: an outer box that is wide
  // because one chip inside it is unreachable is one defect, not twenty.
  const deepest = (el) => !pastEdge.some((other) => other !== el && el.contains(other))

  const offenders = { total: pastEdge.length, scrollable: 0, unreachable: 0, clipped: 0, scrollableSamples: [], clippedSamples: [] }
  for (const el of pastEdge) {
    const scroller = scrollerFor(el)
    if (scroller) {
      offenders.scrollable += 1
      if (offenders.scrollableSamples.length < 4) offenders.scrollableSamples.push({ el: describe(el), inside: scroller })
      continue
    }
    offenders.unreachable += 1
    if (!deepest(el) || !isLeafContent(el)) continue
    const rect = el.getBoundingClientRect()
    const toTheRight = rect.right > vw
    offenders.clipped += 1
    if (offenders.clippedSamples.length < 6) {
      offenders.clippedSamples.push({
        el: describe(el),
        side: toTheRight ? "right" : "left",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        overshoot: Math.round(toTheRight ? rect.right - vw : -rect.left),
        text: (el.textContent || "").trim().slice(0, 30),
      })
    }
  }

  const owns = (el, node) => Boolean(node) && (node === el || el.contains(node))

  // Hit area, not painted size: does the interactive surface reach `size` in both
  // axes, centred on the element? That is the target's bounding box, which is
  // what the 24x24 rule is about — a 24px round dot counts, a 24px-long sliver
  // does not, because the mid-edge probes need real area. Points are sampled
  // just inside the edge, so the answer is a strict lower bound: a 23.5px surface
  // can never pass a 24px check, and a transparent padding box or ::after hit
  // target (a pseudo-element belongs to its originating element) is measured
  // exactly as a finger would find it.
  const coversTarget = (el, size) => {
    const rect = el.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const edge = size / 2 - 0.5
    const mid = edge / 2
    const points = [[edge, 0], [-edge, 0], [0, edge], [0, -edge], [mid, mid], [-mid, mid], [mid, -mid], [-mid, -mid]]
    for (const [dx, dy] of points) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0.5 || y < 0.5 || x > vw - 0.5 || y > vh - 0.5) return false
      if (!owns(el, document.elementFromPoint(x, y))) return false
    }
    return true
  }

  const HIT_LADDER = [44, 32, 24]
  const hitArea = (el) => {
    const rect = el.getBoundingClientRect()
    const visual = [Math.round(rect.width), Math.round(rect.height)]
    // A box that already reaches the size needs no probing: its own area is the
    // target. Only the small ones raise the real question — does padding or a
    // pseudo-element grow the surface a finger has to find? — which is exactly
    // where a probe can answer it and where an artifact cannot hide a failure.
    if (rect.width >= 24 && rect.height >= 24) {
      return { measurable: true, atLeast: HIT_LADDER.find((size) => rect.width >= size && rect.height >= size) ?? 24, visual }
    }
    const centred = owns(el, document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2))
    // Off-screen or covered by something else: nothing can be concluded about
    // this element's hit area here, so it is not counted either way.
    if (!centred) return { measurable: false, atLeast: 0, visual }
    return { measurable: true, atLeast: HIT_LADDER.find((size) => coversTarget(el, size)) ?? 0, visual }
  }

  const TARGET_SELECTOR = "button, a[href], [role=button], input[type=button], input[type=submit], summary"
  const HANDLE_SELECTOR = "[data-resize-handle], [data-rotate-handle]"
  const targets = []
  for (const el of document.querySelectorAll(TARGET_SELECTOR)) {
    if (isSvgPart(el)) continue
    if (el.closest(HANDLE_SELECTOR)) continue // canvas handles are measured on their own below
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    const style = getComputedStyle(el)
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") continue
    if (rect.width >= 44 && rect.height >= 44) continue

    const hit = hitArea(el)
    if (hit.atLeast >= 44) continue
    targets.push({
      el: describe(el),
      text: (el.textContent || "").trim().slice(0, 24),
      label: el.getAttribute("aria-label") || "",
      visual: hit.visual,
      hitAtLeast: hit.atLeast,
      measurable: hit.measurable,
      subMinimum: hit.measurable && hit.atLeast < 24,
    })
  }

  // The canvas resize/rotate handles get their own measurement: they are only in
  // the DOM once something is selected, they are deliberately small to look at,
  // and their hit area is what a finger has to find.
  const handles = []
  for (const el of document.querySelectorAll(HANDLE_SELECTOR)) {
    const rect = el.getBoundingClientRect()
    if (rect.width < 2 || rect.height < 2) continue
    if (!isVisible(el)) continue
    const hit = hitArea(el)
    handles.push({
      handle: el.getAttribute("data-resize-handle") || "rotate",
      visual: hit.visual,
      hitAtLeast: hit.atLeast,
      measurable: hit.measurable,
      subMinimum: hit.measurable && hit.atLeast < 24,
    })
  }

  return {
    vw,
    vh,
    overflow,
    maskedOverflow,
    offenders,
    targets: {
      below44: targets.filter((target) => target.hitAtLeast < 44).length,
      below24: targets.filter((target) => target.subMinimum).length,
      unmeasurable: targets.filter((target) => !target.measurable).length,
      // Failures first: a sample list that leads with near-misses would hide the
      // targets that actually have to be fixed.
      samples: [...targets.filter((target) => target.subMinimum), ...targets.filter((target) => !target.subMinimum)].slice(0, 6),
    },
    handles: {
      count: handles.length,
      measurable: handles.filter((handle) => handle.measurable).length,
      below24: handles.filter((handle) => handle.subMinimum).length,
      atLeast: handles.map((handle) => handle.hitAtLeast),
      samples: handles,
    },
    heading: (document.querySelector("h1, h2")?.textContent || "").trim().slice(0, 50),
    bodyText: (document.body.innerText || "").length,
  }
}

function loginPage(user, password) {
  const set = (el, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")
    descriptor.set.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  }
  const inputs = [...document.querySelectorAll("input")]
  const userField = inputs.find((input) => input.type === "text") || inputs[0]
  const passwordField = inputs.find((input) => input.type === "password")
  if (!userField || !passwordField) return false
  set(userField, user)
  set(passwordField, password)
  const form = passwordField.closest("form")
  if (!form) return false
  form.requestSubmit()
  return true
}

function logFailures(rows) {
  for (const row of rows.filter((r) => r.failures.length)) {
    console.log(`FAIL ${row.viewport} ${row.route}: ${row.failures.join("; ")}`)
    for (const sample of row.offenders.clippedSamples) {
      console.log(`  clipped ${sample.el} [${sample.left}..${sample.right}] +${sample.overshoot}px past the ${sample.side} edge "${sample.text}"`)
    }
    for (const sample of row.targets.samples.filter((t) => t.subMinimum)) {
      console.log(`  target ${sample.el} visual ${sample.visual[0]}x${sample.visual[1]} hit area <24px "${sample.label || sample.text}"`)
    }
    for (const handle of row.handles.samples.filter((h) => h.subMinimum)) {
      console.log(`  handle ${handle.handle} visual ${handle.visual[0]}x${handle.visual[1]} hit area <24px (measured ${handle.hitAtLeast}px)`)
    }
    for (const error of row.consoleErrors.slice(0, 3)) console.log(`  console ${error}`)
  }
}

async function main() {
  try {
    const version = await browserVersion()
    console.log(`Chrome ${version.Browser} via ${cdpHost()}`)
  } catch (error) {
    preflight(`no browser on ${cdpHost()} (${error.message}). Start Chrome with --remote-debugging-port=9222 first, e.g. chrome --headless=new --remote-debugging-port=9222 --user-data-dir=<temp> about:blank`)
  }

  let appReachable = false
  let appError = ""
  for (let attempt = 1; attempt <= 3 && !appReachable; attempt += 1) {
    try {
      const probe = await fetch(`${BASE_URL}/login`)
      if (!probe.ok) throw new Error(`/login responded ${probe.status}`)
      appReachable = true
    } catch (error) {
      appError = error.message
      // A dev server that is recompiling refuses connections for a moment.
      await delay(1500)
    }
  }
  if (!appReachable) {
    preflight(`no app on ${BASE_URL} (${appError}). Start the dev server on :3111 first, e.g. ops\\run\\bin\\pnpm.cmd exec next dev --port 3111`)
  }

  const target = await firstPageTarget()
  const cdp = await connect(target.webSocketDebuggerUrl)
  await cdp.send("Page.enable")
  await cdp.send("Runtime.enable")
  await cdp.send("Log.enable")

  let consoleErrors = []
  let networkErrors = []
  cdp.on((message) => {
    if (message.method === "Runtime.exceptionThrown") {
      consoleErrors.push("exception: " + String(message.params.exceptionDetails?.exception?.description || "").slice(0, 140))
    }
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const args = (message.params.args || []).map((arg) => String(arg.value ?? arg.description ?? "")).join(" ")
      consoleErrors.push("console.error: " + args.slice(0, 140))
    }
    // Advisory only: a failed subresource is worth reporting, not worth failing the run.
    if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      networkErrors.push(`${message.params.entry.source}: ${String(message.params.entry.text).slice(0, 120)}`)
    }
  })

  await goto(cdp, `${BASE_URL}/login`, 2000)
  const submitted = await evaluate(cdp, `(${loginPage.toString()})(${JSON.stringify(LOGIN_USER)}, ${JSON.stringify(LOGIN_PASSWORD)})`)
  if (!submitted) {
    cdp.close()
    preflight(`${BASE_URL}/login has no username/password form — set AUDIT_USER and AUDIT_PASSWORD for this deployment`)
  }
  await delay(6000)
  const landing = await evaluate(cdp, `location.pathname`)
  if (landing.includes("login")) {
    cdp.close()
    preflight(`login as "${LOGIN_USER}" did not take (still on ${landing}). Seed the local admin user or set AUDIT_USER/AUDIT_PASSWORD`)
  }

  const rows = []
  for (const viewport of VIEWPORTS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.mobile,
    })
    // Without this `@media (pointer: coarse)` never matches, so the phone row
    // would measure the desktop hit areas.
    await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: viewport.touch, maxTouchPoints: viewport.touch ? 5 : 1 })
    await cdp.send("Emulation.setEmitTouchEventsForMouse", { enabled: viewport.touch, configuration: viewport.touch ? "mobile" : "desktop" }).catch(() => {})

    for (const route of ROUTES) {
      consoleErrors = []
      networkErrors = []
      await goto(cdp, `${BASE_URL}${route}`, 3000)
      // The resize/rotate handles only exist while something is selected, so the
      // canvas check selects an element through the layer row — the same control
      // a user clicks. Deliberately no scrolling: the page is measured as it is
      // found, and a handle that is off-screen is reported as unmeasurable rather
      // than silently missing.
      if (route === "/canvas") {
        await evaluate(cdp, `(() => { const row = document.querySelector(".canvas-layer button"); if (row) row.click(); return Boolean(row) })()`)
        await delay(500)
      }
      const measured = await evaluate(cdp, `(${measurePage.toString()})()`)

      const failures = []
      if (measured.overflow > 2) failures.push(`document overflow ${measured.overflow}px`)
      if (measured.offenders.clipped > 0) failures.push(`${measured.offenders.clipped} clipped element(s)`)
      if (measured.targets.below24 > 0) failures.push(`${measured.targets.below24} target(s) below 24x24`)
      if (measured.handles.below24 > 0) failures.push(`${measured.handles.below24}/${measured.handles.measurable} canvas handle(s) below 24x24`)
      if (consoleErrors.length) failures.push(`${consoleErrors.length} console error(s)`)
      if (!measured.heading) failures.push("no h1/h2 heading")

      rows.push({
        route,
        viewport: viewport.name,
        overflow: measured.overflow,
        maskedOverflow: measured.maskedOverflow,
        offenders: measured.offenders,
        targets: measured.targets,
        handles: measured.handles,
        heading: measured.heading,
        bodyText: measured.bodyText,
        consoleErrors,
        networkErrors,
        failures,
      })

      const status = failures.length ? "FAIL" : "ok"
      const handleCell = measured.handles.count ? `${measured.handles.below24}/${measured.handles.measurable}` : "-"
      console.log(
        `${status.padEnd(4)} ${viewport.name.padEnd(6)} ${route.padEnd(11)} overflow ${String(measured.overflow).padStart(4)}  ` +
          `hidden ${String(measured.maskedOverflow).padStart(4)}  offscreen ${String(measured.offenders.total).padStart(3)}  ` +
          `scrollable ${String(measured.offenders.scrollable).padStart(3)}  clipped ${String(measured.offenders.clipped).padStart(2)}  ` +
          `targets<24 ${String(measured.targets.below24).padStart(2)}  targets<44 ${String(measured.targets.below44).padStart(3)}  ` +
          `handles<24 ${handleCell.padStart(3)}  errors ${consoleErrors.length}  "${measured.heading}"`,
      )

      if (SHOT_DIR) {
        fs.mkdirSync(SHOT_DIR, { recursive: true })
        const { shot } = await import("./lib/cdp.mjs")
        await shot(cdp, path.join(SHOT_DIR, `${viewport.name}${route.replace(/\//g, "-")}.png`))
      }
    }
  }

  cdp.close()

  const failed = rows.filter((row) => row.failures.length)
  console.log("")
  logFailures(rows)

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    routes: ROUTES,
    viewports: VIEWPORTS.map((viewport) => ({ name: viewport.name, width: viewport.width, height: viewport.height })),
    limits: { hitAreaMinimum: 24, hitAreaAdvisory: 44 },
    summary: {
      checks: rows.length,
      overflow: rows.filter((row) => row.overflow > 2).length,
      maxMaskedOverflow: rows.reduce((max, row) => Math.max(max, row.maskedOverflow), 0),
      clipped: rows.reduce((total, row) => total + row.offenders.clipped, 0),
      unreachable: rows.reduce((total, row) => total + row.offenders.unreachable, 0),
      scrollable: rows.reduce((total, row) => total + row.offenders.scrollable, 0),
      offscreen: rows.reduce((total, row) => total + row.offenders.total, 0),
      targetsBelow24: rows.reduce((total, row) => total + row.targets.below24, 0),
      targetsBelow44: rows.reduce((total, row) => total + row.targets.below44, 0),
      handlesMeasured: rows.reduce((total, row) => total + row.handles.count, 0),
      handlesBelow24: rows.reduce((total, row) => total + row.handles.below24, 0),
      consoleErrors: rows.reduce((total, row) => total + row.consoleErrors.length, 0),
      failedChecks: failed.length,
    },
    results: rows,
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n")
  console.log(`report: ${path.relative(REPO_ROOT, REPORT_PATH).split(path.sep).join("/")}`)
  console.log(
    `summary: ${report.summary.checks} checks, ${report.summary.failedChecks} failed — ` +
      `overflow ${report.summary.overflow}, clipped ${report.summary.clipped}, scrollable ${report.summary.scrollable}, ` +
      `targets<24 ${report.summary.targetsBelow24}, targets<44 ${report.summary.targetsBelow44}, ` +
      `canvas handles<24 ${report.summary.handlesBelow24}/${report.summary.handlesMeasured}, console errors ${report.summary.consoleErrors}`,
  )
  console.log(failed.length ? `browser-ux-audit: FAILED (${failed.length} check(s))` : "browser-ux-audit: passed")
  process.exit(failed.length ? 1 : 0)
}

main().catch((error) => {
  console.error(`browser-ux-audit: ${error.message}`)
  process.exit(2)
})
