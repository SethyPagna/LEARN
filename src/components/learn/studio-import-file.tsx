"use client"

/**
 * `studio-import-file` — the file picker the OOXML importers are reached through.
 *
 * It is a component rather than two inline inputs so the Studio editor gains one
 * line per place it can import instead of a duplicated picker, and so the
 * "read a file, replace the open document/sheet, say what happened" flow is
 * written once. All of the parsing lives in `@/lib/export/studio-import`; this
 * owns only the input, the note it reports, and the reset that lets the same
 * file be chosen twice in a row.
 */

import { useRef, useState } from "react"
import { UploadCloud } from "lucide-react"
import { describeImportFailure } from "@/lib/export/studio-import"

export interface StudioImportFileProps {
  /** File types the picker offers — extension and MIME type. */
  accept: string
  /** Button label, e.g. `Import DOCX`. */
  label: string
  /** The note to show under the picker; owned by the caller. */
  note: string
  /**
   * Import the file and return the note to show. Throwing is expected and
   * handled: the error's message becomes the note.
   */
  onFile: (file: File) => Promise<string>
  onNote: (value: string) => void
}

export function StudioImportFile({ accept, label, note, onFile, onNote }: StudioImportFileProps) {
  const [busy, setBusy] = useState(false)
  const importing = useRef(false)
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" aria-busy={busy}>
      <label className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3.5 text-xs font-semibold transition hover:bg-muted focus-within:ring-2 focus-within:ring-ring${busy ? " pointer-events-none opacity-60" : ""}`}>
        <UploadCloud className="h-4 w-4" aria-hidden="true" />
        {busy ? "Importing…" : label}
        <input
          type="file"
          accept={accept}
          className="sr-only"
          aria-label={label}
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0]
            // Cleared before the await, and before the guard: the picker must be
            // reusable for the same file even after a failed import.
            event.target.value = ""
            if (!file || importing.current) return
            importing.current = true
            setBusy(true)
            try {
              onNote(await onFile(file))
            } catch (error) {
              onNote(describeImportFailure(error))
            } finally {
              importing.current = false
              setBusy(false)
            }
          }}
        />
      </label>
      {note ? <p role="status" className="text-xs text-muted-foreground">{note}</p> : null}
    </div>
  )
}
