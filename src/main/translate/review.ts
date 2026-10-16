import { appendNote } from "../../core/ass/notes"
import { applyTranslations } from "../../core/ass/write"
import { readAss } from "../../core/ass/script"
import type { Variant } from "../../core/library/types"
import { buildReport, type TranslateReport } from "../../core/pipeline/report"
import type { Preset, ProviderId } from "../../core/pipeline/types"
import { proposeStructural, type DraftLine, type Proposal } from "../../core/review/review"
import type { ProfileHandlers } from "../ipc/profiles"
import type { SessionStore, TranslateSession } from "./session"

const MISSING = "That translation no longer exists."
const NOTE = /\s*\{note: ([^}]*)\}/

export interface ReviewLine {
  eventIndex: number
  english: string
  words: string
  note: string | null
  edited: boolean
  flagged: boolean
  accepted: boolean
}

export interface ReviewView {
  sessionId: string
  scriptName: string
  seriesName: string
  variant: Variant
  preset: Preset
  outputPath: string
  lines: ReviewLine[]
  openFlags: number
}

export type CheckResult =
  { status: "none" } | { status: "proposal"; proposal: Proposal } | { status: "failed" }

export interface FinishResult {
  outputPath: string
  report: TranslateReport
}

export interface ReviewDeps {
  sessions: SessionStore
  profiles: ProfileHandlers
  ask(provider: ProviderId): (prompt: string) => Promise<{ text: string } | { refused: true }>
  writeFile(path: string, text: string): void
  reveal(path: string): void
  now(): number
}

export interface ReviewHandlers {
  load(id: string): ReviewView
  accept(id: string, eventIndex: number, words: string | null): ReviewView
  check(id: string, eventIndex: number, words: string): Promise<CheckResult>
  confirm(
    id: string,
    eventIndex: number,
    words: string,
    proposal: Proposal,
    applyOthers: boolean,
    ruleTarget: "series" | "base" | null,
  ): ReviewView
  finish(id: string): FinishResult
  reveal(id: string): void
  discard(id: string): void
}

interface Line {
  eventIndex: number
  english: string
  stored: string
  note: string | null
  words: string
  edited: boolean
}

export function createReviewHandlers(deps: ReviewDeps): ReviewHandlers {
  const requireSession = (id: string): TranslateSession => {
    const session = deps.sessions.load(id)
    if (session === null) {
      throw new Error(MISSING)
    }
    return session
  }

  const build = (session: TranslateSession): Line[] => {
    const styles = new Set(session.dialogueStyles)
    const results = new Map(session.saved.results)
    return readAss(session.scriptText)
      .filter((cue) => styles.has(cue.style))
      .map((cue) => {
        const key = String(cue.index)
        const result = results.get(key)
        const split =
          result === undefined ? { words: cue.visible, note: null } : splitNote(result.words)
        const edit = session.review.edits[key]
        return {
          eventIndex: cue.index,
          english: cue.visible,
          stored: split.words,
          note: split.note,
          words: edit ?? split.words,
          edited: edit !== undefined,
        }
      })
  }

  const view = (session: TranslateSession): ReviewView => {
    const accepted = new Set(session.review.accepted)
    const lines = build(session).map((line) => ({
      eventIndex: line.eventIndex,
      english: line.english,
      words: line.words,
      note: line.note,
      edited: line.edited,
      flagged: line.note !== null,
      accepted: accepted.has(line.eventIndex),
    }))
    return {
      sessionId: session.id,
      scriptName: session.scriptName,
      seriesName: session.seriesName,
      variant: session.variant,
      preset: session.preset,
      outputPath: session.outputPath,
      lines,
      openFlags: lines.filter((line) => line.flagged && !line.accepted).length,
    }
  }

  const withEdit = (
    session: TranslateSession,
    line: Line | undefined,
    eventIndex: number,
    words: string,
  ): void => {
    const current = line?.words
    if (current !== words) {
      session.review.edits[String(eventIndex)] = words
    }
  }

  const closeFlag = (
    session: TranslateSession,
    line: Line | undefined,
    eventIndex: number,
  ): void => {
    if (line !== undefined && line.note !== null && !session.review.accepted.includes(eventIndex)) {
      session.review.accepted.push(eventIndex)
    }
  }

  const find = (session: TranslateSession, eventIndex: number): Line | undefined =>
    build(session).find((line) => line.eventIndex === eventIndex)

  return {
    load(id) {
      return view(requireSession(id))
    },
    accept(id, eventIndex, words) {
      const session = requireSession(id)
      const line = find(session, eventIndex)
      if (words !== null) {
        withEdit(session, line, eventIndex, words)
      }
      closeFlag(session, line, eventIndex)
      deps.sessions.save(session)
      return view(session)
    },
    async check(id, eventIndex, words) {
      const session = requireSession(id)
      const lines = build(session)
      const before = lines.find((line) => line.eventIndex === eventIndex)?.words ?? ""
      const drafts: DraftLine[] = lines.map((line) => ({
        eventIndex: line.eventIndex,
        words: line.words,
        note: line.note,
        english: line.english,
      }))
      const proposal = await proposeStructural(
        { eventIndex, before, after: words },
        drafts,
        deps.ask(session.provider),
      )
      if (proposal === null) {
        return { status: "failed" }
      }
      if (proposal.siblings.length === 0 && proposal.rule === null) {
        return { status: "none" }
      }
      return { status: "proposal", proposal }
    },
    confirm(id, eventIndex, words, proposal, applyOthers, ruleTarget) {
      const session = requireSession(id)
      const line = find(session, eventIndex)
      withEdit(session, line, eventIndex, words)
      if (applyOthers) {
        for (const sibling of proposal.siblings) {
          session.review.edits[String(sibling.eventIndex)] = sibling.words
        }
      }
      if (ruleTarget !== null && proposal.rule !== null) {
        const rule = proposal.rule
        if (ruleTarget === "series") {
          const rules = deps.profiles.loadSeriesRules(session.variant, session.seriesId)
          deps.profiles.saveSeriesRules(session.variant, session.seriesId, [...rules, rule])
        } else {
          const { base } = deps.profiles.loadBase(session.variant)
          deps.profiles.saveBase({ ...base, rules: [...base.rules, rule] })
        }
        session.review.rules.push({ target: ruleTarget, rule })
      }
      closeFlag(session, line, eventIndex)
      deps.sessions.save(session)
      return view(session)
    },
    finish(id) {
      const session = requireSession(id)
      const lines = build(session)
      const accepted = new Set(session.review.accepted)
      if (lines.some((line) => line.note !== null && !accepted.has(line.eventIndex))) {
        throw new Error("Accept every flagged line before finishing.")
      }
      const finalWords = new Map<number, string>()
      for (const line of lines) {
        const hasResult =
          line.edited || session.saved.results.some(([key]) => key === String(line.eventIndex))
        if (!hasResult) {
          continue
        }
        finalWords.set(
          line.eventIndex,
          line.note === null ? line.words : appendNote(line.words, line.note),
        )
      }
      const styles = new Set(session.dialogueStyles)
      const written = applyTranslations(session.scriptText, styles, finalWords)
      try {
        deps.writeFile(session.outputPath, written.text)
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`Couldn't write ${session.outputPath}: ${reason}`, { cause: error })
      }
      const flagged = lines.filter((line) => line.note !== null).map((line) => line.eventIndex)
      const report = buildReport({
        ass: session.scriptText,
        dialogueStyles: styles,
        finalWords,
        results: new Map(session.saved.results),
        strongIds: session.saved.strongIds,
        cpsLimit: session.card.cpsLimit,
        flagged,
        edited: lines.filter((line) => line.edited).map((line) => line.eventIndex),
        rules: session.review.rules,
        framesUsed: session.framesUsed,
        frameNotes: session.frameNotes,
        writeReport: written.report,
        elapsedMs: session.elapsedMs,
        outputPath: session.outputPath,
      })
      session.phase = "done"
      deps.sessions.save(session)
      deps.reveal(session.outputPath)
      return { outputPath: session.outputPath, report }
    },
    reveal(id) {
      deps.reveal(requireSession(id).outputPath)
    },
    discard(id) {
      deps.sessions.remove(id)
    },
  }
}

function splitNote(stored: string): { words: string; note: string | null } {
  const match = NOTE.exec(stored)
  if (match === null) {
    return { words: stored, note: null }
  }
  return { words: stored.replace(NOTE, ""), note: match[1] ?? "" }
}
