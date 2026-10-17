import { readAss } from "../ass/script"
import { isRecord, isVariant } from "../library/guards"
import type { FrameSetting } from "../library/types"
import type { ModelSpend, Preset, ProviderId } from "../pipeline/types"
import { emptyLines } from "./lines"
import type { LineEdit, SessionBrief, SessionLine, WorkSession } from "./types"

const PROVIDERS: readonly ProviderId[] = ["claude", "gpt", "gemini", "mistral"]
const PRESETS: readonly Preset[] = ["save", "balanced", "best"]
const FRAME_SETTINGS: readonly FrameSetting[] = ["none", "marked", "every"]
const NOTE = /\s*\{note: ([^}]*)\}$/
// v2 kept the English with this note when a line couldn't be translated.
const FAILED_NOTE = "tradução falhou"

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.some((option) => option === value)
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function isGlossary(value: unknown): value is { source: string; pt: string }[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) && typeof entry.source === "string" && typeof entry.pt === "string",
    )
  )
}

function isSpend(value: unknown): value is ModelSpend[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.model === "string" &&
        typeof entry.requests === "number" &&
        typeof entry.input === "number" &&
        typeof entry.output === "number" &&
        typeof entry.cached === "number",
    )
  )
}

function splitNote(text: string): { words: string; flag: string | null } {
  const match = NOTE.exec(text)
  if (match === null) return { words: text, flag: null }
  return { words: text.slice(0, match.index), flag: match[1] ?? null }
}

// Reads a saved version 2 session and returns the version 3 session, or the reason it can't.
export function migrateV2(value: unknown): WorkSession | string {
  if (!isRecord(value) || value.version !== 2) return "not a version 2 session"
  const { saved, review } = value
  if (!isRecord(saved)) return "the session has no saved run (saved)"
  if (!isRecord(review)) return "the session has no review state (review)"
  if (
    typeof value.id !== "string" ||
    typeof value.startedAt !== "string" ||
    typeof value.scriptPath !== "string" ||
    typeof value.scriptName !== "string" ||
    typeof value.scriptText !== "string" ||
    typeof value.seriesId !== "string" ||
    !isVariant(value.variant) ||
    !isOneOf(value.provider, PROVIDERS) ||
    !isOneOf(value.preset, PRESETS) ||
    !isOneOf(value.frameSetting, FRAME_SETTINGS) ||
    !(value.videoPath === null || typeof value.videoPath === "string") ||
    !isStringList(value.dialogueStyles) ||
    typeof value.elapsedMs !== "number" ||
    typeof value.framesUsed !== "number"
  ) {
    return "the session is missing basic fields"
  }
  if (
    !Array.isArray(saved.results) ||
    typeof saved.brief !== "string" ||
    !isGlossary(saved.glossary) ||
    !isStringList(saved.hardIds) ||
    !isStringList(saved.frameIds) ||
    !isStringList(saved.strongIds)
  ) {
    return "the saved run is damaged (saved)"
  }
  if (
    !isRecord(review.edits) ||
    !Array.isArray(review.accepted) ||
    !review.accepted.every((item) => typeof item === "number")
  ) {
    return "the review state is damaged (review)"
  }
  const spend = value.spend === undefined ? [] : value.spend
  if (!isSpend(spend)) return "the spend list is damaged"

  const styles = value.dialogueStyles
  const cues = readAss(value.scriptText).filter((cue) => styles.includes(cue.style))
  const lines = emptyLines(cues)
  const byIndex = new Map<number, SessionLine>(lines.map((line) => [line.index, line]))
  const strong = new Set(saved.strongIds)
  const accepted = new Set<number>(review.accepted)

  for (const entry of saved.results) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !isRecord(entry[1])) continue
    const text = entry[1].words
    const line = byIndex.get(Number(entry[0]))
    if (line === undefined || typeof text !== "string") continue
    const { words, flag } = splitNote(text)
    if (flag === FAILED_NOTE) continue
    line.words = words
    line.origin = "ai"
    line.aiDraft = words
    line.strong = strong.has(entry[0])
    if (flag !== null) {
      if (accepted.has(line.index)) line.resolution = "accepted"
      else line.flag = flag
    }
  }

  const edits: LineEdit[] = []
  for (const [key, final] of Object.entries(review.edits)) {
    const line = byIndex.get(Number(key))
    const cue = cues.find((item) => item.index === Number(key))
    if (line === undefined || cue === undefined || typeof final !== "string") continue
    // An emptied line is untranslated, as clearing a line is now.
    if (final.trim() === "") {
      line.words = null
      line.origin = null
      line.flag = null
      continue
    }
    edits.push({ index: line.index, en: cue.visible, draft: line.aiDraft, final })
    if (line.flag !== null) line.resolution = "edited"
    line.words = final
    line.origin = "manual"
    line.flag = null
  }
  edits.sort((a, b) => a.index - b.index)

  const unavailable = saved.brief === "" || saved.brief === "brief unavailable"
  const brief: SessionBrief | null = unavailable
    ? null
    : { summary: saved.brief, hardIds: saved.hardIds, frameIds: saved.frameIds }

  return {
    version: 3,
    id: value.id,
    projectId: value.seriesId,
    variant: value.variant,
    createdAt: value.startedAt,
    updatedAt: value.startedAt,
    scriptPath: value.scriptPath,
    scriptName: value.scriptName,
    scriptText: value.scriptText,
    dialogueStyles: styles,
    videoPath: value.videoPath,
    provider: value.provider,
    preset: value.preset,
    frameSetting: value.frameSetting,
    brief,
    glossary: saved.glossary,
    lines,
    edits,
    spend,
    activeMs: value.elapsedMs,
    framesGrabbed: value.framesUsed,
    exportedAt: value.phase === "done" ? value.startedAt : null,
    finishedOverride: null,
  }
}
