"use client"

import { BookOpen, Check, ChevronRight, Target } from "lucide-react"
import { supportedLocales } from "@/lib/i18n/vocabulary"
import type { Quiz, User } from "../types"
import { Panel } from "../ui"

export function ProgressView({ dashboard, quizzes }: { dashboard: any; quizzes: Quiz[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[
        ["Goals", `${dashboard?.snapshot?.goalCompletion ?? 0}%`, Target],
        ["Quiz banks", quizzes.length, BookOpen],
        ["Focus topics", dashboard?.snapshot?.recommendedFocus?.length || 0, Check],
      ].map(([label, value, Icon]) => (
        <Panel key={String(label)} className="p-4">
          <Icon className="h-5 w-5 text-[#2c7a64]" />
          <p className="mt-4 text-3xl font-semibold text-[#17202a]">{String(value)}</p>
          <p className="mt-1 text-sm text-[#697586]">{String(label)}</p>
        </Panel>
      ))}
    </div>
  )
}

export function CalendarView() {
  return (
    <Panel className="p-4">
      <h2 className="text-2xl font-semibold text-[#17202a]">Study calendar</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-7">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day, index) => (
          <div key={day} className="min-h-32 rounded-lg bg-[#f2f5f8] p-3">
            <p className="text-sm font-semibold text-[#17202a]">{day}</p>
            {index < 4 ? <p className="mt-4 rounded-md bg-white p-3 text-xs text-[#5e6a78]">45 min focus block</p> : null}
          </div>
        ))}
      </div>
    </Panel>
  )
}

export function SettingsView({ user, automationData }: { user: User | null; automationData: any }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
      <Panel className="p-4">
        <h2 className="text-2xl font-semibold text-[#17202a]">Settings</h2>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Info label="Name" value={user?.name} />
          <Info label="Email" value={user?.email} />
          <Info label="Role" value={user?.role} />
          <Info label="Daily goal" value={`${user?.preferences?.dailyGoalMinutes || 45} minutes`} />
        </div>
      </Panel>
      <Panel className="p-4">
        <h3 className="text-lg font-semibold text-[#17202a]">Languages and automation</h3>
        <p className="mt-2 text-sm leading-6 text-[#5e6a78]">{supportedLocales.length} vocabularies are available for reusable UI labels.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {supportedLocales.map((locale) => (
            <span key={locale} className="rounded-md bg-[#f2f5f8] px-3 py-1 text-xs font-medium text-[#4d5a68]">{locale}</span>
          ))}
        </div>
        <div className="mt-5 space-y-2">
          {(automationData?.jobs || []).slice(0, 4).map((job: any) => (
            <div key={job.key} className="rounded-md bg-[#f7f9fb] p-3">
              <p className="text-sm font-semibold text-[#17202a]">{job.label}</p>
              <p className="mt-1 text-xs leading-5 text-[#5e6a78]">{job.description}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}

export function AdminView({ user, adminData, automationData }: { user: User | null; adminData: any; automationData: any }) {
  if (user?.role !== "admin") return <Panel className="p-4">Admin access required.</Panel>
  return (
    <Panel className="p-4">
      <h2 className="text-2xl font-semibold text-[#17202a]">Admin control center</h2>
      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        <AdminList title="Users" items={adminData?.users || []} />
        <AdminList title="AI providers" items={adminData?.providers || []} />
        <AdminList title="Audit" items={adminData?.audit || []} />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <AdminList title="Automation jobs" items={automationData?.jobs || []} />
        <AdminList title="AI prompt contracts" items={automationData?.prompts || []} />
      </div>
    </Panel>
  )
}

function Info({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="rounded-lg bg-[#f7f9fb] p-4">
      <p className="text-xs font-semibold uppercase text-[#697586]">{label}</p>
      <p className="mt-2 font-medium text-[#17202a]">{String(value || "Not set")}</p>
    </div>
  )
}

function AdminList({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-lg bg-[#f7f9fb] p-4">
      <p className="font-semibold text-[#17202a]">{title}</p>
      <div className="mt-3 space-y-2">
        {items.slice(0, 8).map((item, index) => (
          <div key={item.id || index} className="flex items-center justify-between gap-2 rounded-md bg-white p-3 text-sm">
            <span className="truncate text-[#17202a]">{item.name || item.username || item.action || item.provider || item.id}</span>
            <ChevronRight className="h-4 w-4 text-[#697586]" />
          </div>
        ))}
      </div>
    </div>
  )
}
