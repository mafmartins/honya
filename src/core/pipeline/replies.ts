import type { LineResult } from "./types"

export type Term = { source: string; pt: string }

export interface LinesReply {
  lines: LineResult[]
  terms: Term[]
}

export interface BriefReply {
  summary: string
  terms: Term[]
  hard: string[]
  frames: string[]
}

// Reads a batch reply. Forgiving where a slip costs nothing: an unknown mark becomes a
// doubt (so the line gets a second look), a malformed term or note is dropped. A line
// without an id or text is left out, so it counts as missing and is asked again.
// Returns the reason when there is no usable line at all.
export function readLinesReply(value: unknown): LinesReply | string {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    return "the reply has no lines list"
  }
  const lines: LineResult[] = []
  for (const item of value.lines as readonly unknown[]) {
    const line = readLine(item)
    if (line !== undefined) {
      lines.push(line)
    }
  }
  if (lines.length === 0) {
    return "the reply has no usable line"
  }
  return { lines, terms: readTerms(value.terms) }
}

export function readBriefReply(value: unknown): BriefReply | string {
  if (!isRecord(value)) {
    return "the brief is not an object"
  }
  return {
    summary: typeof value.summary === "string" ? value.summary.trim() : "",
    terms: readTerms(value.terms),
    hard: readIds(value.hard),
    frames: readIds(value.frames),
  }
}

function readLine(value: unknown): LineResult | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  const id = readId(value.id)
  const text = typeof value.text === "string" ? value.text : value.words
  if (id === undefined || typeof text !== "string" || text.trim() === "") {
    return undefined
  }
  const line: LineResult = { id, words: text, mark: readMark(value.mark) }
  const note = typeof value.note === "string" ? value.note : value.reason
  if (typeof note === "string" && note.trim() !== "") {
    line.reason = note.trim()
  }
  return line
}

function readMark(value: unknown): LineResult["mark"] {
  if (value === "clean" || value === "doubt" || value === "hard-call" || value === "mild") {
    return value
  }
  return "doubt"
}

function readId(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim().replace(/^\[|\]$/g, "")
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return String(value)
  }
  return undefined
}

function readTerms(value: unknown): Term[] {
  if (!Array.isArray(value)) {
    return []
  }
  const terms: Term[] = []
  for (const item of value as readonly unknown[]) {
    if (!isRecord(item) || typeof item.source !== "string" || typeof item.pt !== "string") {
      continue
    }
    const source = item.source.trim()
    const pt = item.pt.trim()
    if (source !== "" && pt !== "") {
      terms.push({ source, pt })
    }
  }
  return terms
}

function readIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  const ids: string[] = []
  for (const item of value as readonly unknown[]) {
    const id = readId(item)
    if (id !== undefined && !ids.includes(id)) {
      ids.push(id)
    }
  }
  return ids
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
