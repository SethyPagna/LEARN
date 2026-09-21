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
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <label className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        <UploadCloud className="h-3.5 w-3.5" />
        {label}
        <input
          type="file"
          accept={accept}
          className="text-xs font-normal normal-case tracking-normal text-foreground"
          onChange={async (event) => {
            const file = event.target.files?.[0]
            // Cleared before the await, and before the guard: the picker must be
            // reusable for the same file even after a failed import.
            event.target.value = ""
            if (!file) return
            try {
              onNote(await onFile(file))
            } catch (error) {
              onNote(describeImportFailure(error))
            }
          }}
        />
      </label>
      {note ? <p className="mt-1 text-xs font-semibold text-muted-foreground">{note}</p> : null}
    </div>
  )
}
