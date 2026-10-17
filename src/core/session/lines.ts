import { readAss, type DialogueCue } from "../ass/script"
import type { LineEdit, SessionLine, WorkSession } from "./types"

export interface AiLine {
  index: number
  words: string
  flag: string | null
  strong: boolean
}

export function emptyLines(cues: readonly DialogueCue[]): SessionLine[] {
  return cues.map((cue) => ({
    index: cue.index,
    words: null,
    origin: null,
    flag: null,
    resolution: null,
    aiDraft: null,
    strong: false,
    retranslated: 0,
  }))
}

function mapLine(
  session: WorkSession,
  index: number,
  change: (line: SessionLine) => SessionLine,
): WorkSession {
  return {
    ...session,
    lines: session.lines.map((line) => (line.index === index ? change(line) : line)),
  }
}

function englishOf(session: WorkSession, index: number): string {
  const cue = readAss(session.scriptText).find(
    (item) => item.index === index && session.dialogueStyles.includes(item.style),
  )
  return cue?.visible ?? ""
}

export function editLine(session: WorkSession, index: number, words: string): WorkSession {
  const line = session.lines.find((item) => item.index === index)
  if (line === undefined) return session
  const text = words.trim()
  if (text === "") {
    return mapLine(session, index, (item) => ({
      ...item,
      words: null,
      origin: null,
      flag: null,
    }))
  }
  const edit: LineEdit = {
    index,
    en: englishOf(session, index),
    draft: line.aiDraft,
    final: text,
  }
  const edited = mapLine(session, index, (item) => ({
    ...item,
    words: text,
    origin: "manual",
    flag: null,
    resolution: item.flag === null ? item.resolution : "edited",
  }))
  const exists = session.edits.some((item) => item.index === index)
  return {
    ...edited,
    edits: exists
      ? session.edits.map((item) => (item.index === index ? edit : item))
      : [...session.edits, edit],
  }
}

export function acceptLine(session: WorkSession, index: number): WorkSession {
  return mapLine(session, index, (line) => ({ ...line, flag: null, resolution: "accepted" }))
}

export function applyAiLines(session: WorkSession, results: readonly AiLine[]): WorkSession {
  const byIndex = new Map(results.map((result) => [result.index, result]))
  return {
    ...session,
    lines: session.lines.map((line) => {
      const result = byIndex.get(line.index)
      if (result === undefined || line.origin === "manual" || line.words !== null) return line
      return {
        ...line,
        words: result.words,
        origin: "ai",
        flag: result.flag,
        aiDraft: result.words,
        strong: result.strong,
      }
    }),
  }
}

export function applyRetranslation(session: WorkSession, result: AiLine): WorkSession {
  return mapLine(session, result.index, (line) => ({
    ...line,
    words: result.words,
    origin: "ai",
    flag: result.flag,
    aiDraft: result.words,
    strong: result.strong,
    retranslated: line.retranslated + 1,
    resolution: line.flag !== null && result.flag === null ? "retranslated" : line.resolution,
  }))
}

export function untranslatedIndexes(session: WorkSession): number[] {
  return session.lines.filter((line) => line.words === null).map((line) => line.index)
}

export function isFinished(session: WorkSession): boolean {
  return (
    session.finishedOverride ??
    (session.exportedAt !== null &&
      session.lines.every((line) => line.words !== null && line.flag === null))
  )
}
