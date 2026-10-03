"use client"

import type { baseVocabulary } from "@/lib/i18n/vocabulary"
import { placeTabForView, placeTabsForView, resolveNavigationTarget, viewLabelKeys } from "@/lib/navigation"
import { viewIcons } from "./nav-icons"
import type { View } from "./types"

type Text = typeof baseVocabulary

/**
 * The tab row of the place a page belongs to: one row for Today, Create,
 * Practice, Friends and Me alike, so no page draws its own. Icons wear their
 * meaning (globals.css), never their position. The shell leaves the row out on
 * an open editor and on someone else's profile.
 */
export function PageSections({ isAdmin, setView, text, view }: { isAdmin: boolean; setView: (view: View) => void; text: Text; view: View }) {
  const current = placeTabForView(view)
  const tabs = placeTabsForView(view, isAdmin)
  if (!current || tabs.length < 2) return null
  const place = resolveNavigationTarget(view).groupLabel

  return (
    <nav aria-label={`${place} sections`} className="page-sections" data-sections={place.toLowerCase()}>
      {tabs.map((tab) => {
        const Icon = viewIcons[tab]
        return (
          <button key={tab} type="button" data-section={tab} aria-current={current === tab ? "page" : undefined} onClick={() => setView(tab)}>
            <Icon aria-hidden="true" className="h-4 w-4" />
            <span>{text[viewLabelKeys[tab]]}</span>
          </button>
        )
      })}
    </nav>
  )
}
