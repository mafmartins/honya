import { appendNote } from "../ass/notes"
import type { Correction } from "../library/types"
import type { LineEdit, WorkSession } from "./types"

// The words each translated line gets in the exported script. Open flags go out as a
// note after the words; untranslated lines are left out so the writer keeps the English.
export function exportWords(session: WorkSession): Map<number, string> {
  const words = new Map<number, string>()
  for (const line of session.lines) {
    if (line.words === null) {
      continue
    }
    words.set(line.index, line.flag === null ? line.words : appendNote(line.words, line.flag))
  }
  return words
}

// Edits worth learning from: the AI wrote a draft and the translator's version still
// stands on a manual line (not cleared, not retranslated since).
export function learnableEdits(session: WorkSession): (LineEdit & { draft: string })[] {
  const out: (LineEdit & { draft: string })[] = []
  for (const edit of session.edits) {
    if (edit.draft === null) {
      continue
    }
    const line = session.lines.find((item) => item.index === edit.index)
    if (line !== undefined && line.origin === "manual" && line.words === edit.final) {
      out.push({ ...edit, draft: edit.draft })
    }
  }
  return out
}

export function correctionsOf(session: WorkSession): Correction[] {
  return learnableEdits(session).map(({ en, draft, final }) => ({ en, draft, final }))
}
