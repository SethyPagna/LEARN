"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { addCalendarDays, daysInCalendarMonth, setCalendarDayKeyPart, shiftCalendarDayKey } from "@/lib/calendar-features"
import { Popover } from "../design/popover"

const arrowClass = "editor-command min-w-9 justify-center !px-1.5"
const partClass = "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-sm font-semibold hover:bg-secondary aria-expanded:bg-secondary sm:text-base"
const pickClass = "min-h-9 rounded-md px-2 text-sm hover:bg-secondary aria-pressed:bg-primary aria-pressed:font-semibold aria-pressed:text-primary-foreground"
const weekdayInitials = ["S", "M", "T", "W", "T", "F", "S"]

/**
 * The calendar's date bar, as the owner drew it: « ‹ Sep 28, 2026 › ».
 * The single arrows step a month (a week in the week view), the double
 * arrows a year, and the month, the day and the year each open a picker.
 */
export function CalendarDateBar({ dayKey, step, onChange }: { dayKey: string; step: "month" | "week"; onChange: (dayKey: string) => void }) {
  const [year, month, day] = dayKey.split("-").map(Number)
  const monthName = (value: number, width: "short" | "long") => new Date(2000, value - 1, 1).toLocaleDateString(undefined, { month: width })
  const move = (direction: number) => onChange(step === "week" ? addCalendarDays(dayKey, direction * 7) : shiftCalendarDayKey(dayKey, direction))
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const today = new Date()

  return <div className="flex items-center gap-1">
    <button type="button" className={arrowClass} aria-label="Previous year" title="Previous year" onClick={() => onChange(shiftCalendarDayKey(dayKey, -12))}><ChevronsLeft className="h-4 w-4" /></button>
    <button type="button" className={arrowClass} aria-label={step === "week" ? "Previous week" : "Previous month"} title={step === "week" ? "Previous week" : "Previous month"} onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></button>
    <span className="flex items-center whitespace-nowrap">
      <DatePart label={`Month: ${monthName(month, "long")}`} text={monthName(month, "short")} width={240}>{(done) =>
        <div className="grid grid-cols-[repeat(3,4rem)] gap-1">{Array.from({ length: 12 }, (_, index) => index + 1).map((value) =>
          <button key={value} type="button" className={pickClass} aria-pressed={value === month} onClick={() => { onChange(setCalendarDayKeyPart(dayKey, { month: value })); done() }}>{monthName(value, "short")}</button>)}
        </div>}
      </DatePart>
      <DatePart label={`Day: ${day}`} text={String(day)} width={300}>{(done) =>
        <div className="grid grid-cols-[repeat(7,2.25rem)] gap-1 text-center">
          {weekdayInitials.map((initial, index) => <span key={index} aria-hidden="true" className="text-xs text-muted-foreground">{initial}</span>)}
          {Array.from({ length: firstWeekday }, (_, index) => <span key={`gap-${index}`} />)}
          {Array.from({ length: daysInCalendarMonth(year, month) }, (_, index) => index + 1).map((value) => {
            const isToday = year === today.getFullYear() && month === today.getMonth() + 1 && value === today.getDate()
            return <button key={value} type="button" className={`${pickClass} !px-0 ${isToday ? "text-primary" : ""}`} aria-pressed={value === day} aria-label={new Date(year, month - 1, value).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })} onClick={() => { onChange(setCalendarDayKeyPart(dayKey, { day: value })); done() }}>{value}</button>
          })}
        </div>}
      </DatePart>
      <span aria-hidden="true" className="-ml-1.5 mr-0.5 text-sm font-semibold sm:text-base">,</span>
      <DatePart label={`Year: ${year}`} text={String(year)} width={240}>{(done) => <YearPicker year={year} onPick={(value) => { onChange(setCalendarDayKeyPart(dayKey, { year: value })); done() }} />}</DatePart>
    </span>
    <button type="button" className={arrowClass} aria-label={step === "week" ? "Next week" : "Next month"} title={step === "week" ? "Next week" : "Next month"} onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></button>
    <button type="button" className={arrowClass} aria-label="Next year" title="Next year" onClick={() => onChange(shiftCalendarDayKey(dayKey, 12))}><ChevronsRight className="h-4 w-4" /></button>
  </div>
}

/** One part of the date (month, day or year) and the picker it opens. */
function DatePart({ label, text, width, children }: { label: string; text: string; width: number; children: (done: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    // Once the panel is placed, keyboard users land on the current choice.
    const frame = window.requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("[aria-pressed='true']")?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])
  const done = () => {
    setOpen(false)
    anchor.current?.focus()
  }
  return <>
    <button ref={anchor} type="button" className={partClass} aria-label={label} title={label} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{text}</button>
    <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} label={label} width={width}><div ref={panel}>{children(done)}</div></Popover>
  </>
}

function YearPicker({ year, onPick }: { year: number; onPick: (year: number) => void }) {
  const [start, setStart] = useState(year - 5)
  return <div className="grid gap-2">
    <div className="flex items-center justify-between">
      <button type="button" className={arrowClass} aria-label="Earlier years" title="Earlier years" onClick={() => setStart((current) => current - 12)}><ChevronLeft className="h-4 w-4" /></button>
      <span className="text-xs text-muted-foreground">{start} – {start + 11}</span>
      <button type="button" className={arrowClass} aria-label="Later years" title="Later years" onClick={() => setStart((current) => current + 12)}><ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="grid grid-cols-[repeat(3,4rem)] gap-1">{Array.from({ length: 12 }, (_, index) => start + index).map((value) =>
      <button key={value} type="button" className={pickClass} aria-pressed={value === year} onClick={() => onPick(value)}>{value}</button>)}
    </div>
  </div>
}
