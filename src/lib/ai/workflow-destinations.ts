function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`The generated ${label} is missing. Ask AI to repair the output before saving.`)
  return value.trim().slice(0, maxLength)
}

export function generatedStudyActivity(parsed: Record<string, unknown> | null) {
  const title = requiredText(parsed?.title, "activity title", 160)
  const notes = requiredText(parsed?.notes ?? parsed?.instructions, "activity instructions", 16_000)
  const startsAt = requiredText(parsed?.startsAt, "start time (ISO date with timezone)", 60)
  const endsAt = requiredText(parsed?.endsAt, "end time (ISO date with timezone)", 60)
  const hasOffset = /T.*(?:Z|[+-]\d{2}:\d{2})$/i
  if (!hasOffset.test(startsAt) || !hasOffset.test(endsAt) || !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt)) || Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error("Choose valid start and end times with timezone offsets; the activity must end after it starts.")
  }
  const timezone = typeof parsed?.timezone === "string" ? parsed.timezone : "UTC"
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }) }
  catch { throw new Error("The activity timezone is invalid.") }
  return { title, notes, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), timezone, eventType: "study", reminderMinutes: 0 }
}

export function generatedDiscussionSpace(parsed: Record<string, unknown> | null) {
  const name = requiredText(parsed?.title ?? parsed?.name, "discussion title", 160)
  const description = requiredText(parsed?.description ?? parsed?.protocol, "discussion protocol", 16_000)
  return { name, description, visibility: "private", settings: { purpose: "discussion", source: "ai" }, topicTags: [] }
}

export function workflowOutputInstruction(target: string): string {
  if (target === "study-activity") return 'Return JSON only: {"title":"Activity title","notes":"Full activity instructions, tasks and reflection questions","startsAt":"ISO date/time with timezone offset","endsAt":"ISO date/time with timezone offset","timezone":"IANA timezone"}. Use the time requested by the learner; if no time is specified, ask them for it instead of inventing a schedule.'
  if (target === "discussion-space") return 'Return JSON only: {"title":"Discussion title","description":"Full discussion protocol: opening question, evidence prompts, turn-taking, reflection and next steps"}. This creates a private learning space for later collaboration, not a chat message.'
  return ""
}
