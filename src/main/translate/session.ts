import { randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { isRecord, isRuleList, isVariant } from "../../core/library/guards"
import type { Rule, StyleCard, Variant } from "../../core/library/types"
import type { LineResult, SavedRun } from "../../core/pipeline/run"
import type { Preset, ProviderId } from "../../core/pipeline/types"

export const SESSION_VERSION = 2

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROVIDERS: readonly ProviderId[] = ["claude", "gpt", "gemini", "mistral"]
const PRESETS: readonly Preset[] = ["save", "balanced", "best"]
const PHASES: readonly SessionPhase[] = ["running", "stopped", "failed", "review", "done"]
const FRAME_SETTINGS: readonly TranslateSession["frameSetting"][] = ["none", "marked", "every"]

export type SessionPhase = "running" | "stopped" | "failed" | "review" | "done"

export interface StoredRun {
  completedBatches: number
  results: [string, LineResult][]
  glossary: { source: string; pt: string }[]
  brief: string
  hardIds: string[]
  frameIds: string[]
  strongIds: string[]
}

export interface ReviewState {
  edits: Record<string, string>
  accepted: number[]
  rules: { target: "series" | "base"; rule: Rule }[]
}

export interface TranslateSession {
  version: 2
  id: string
  startedAt: string
  phase: SessionPhase
  scriptPath: string
  scriptName: string
  scriptText: string
  seriesId: string
  seriesName: string
  variant: Variant
  provider: ProviderId
  preset: Preset
  frameSetting: "none" | "marked" | "every"
  videoPath: string | null
  outputPath: string
  dialogueStyles: string[]
  card: StyleCard
  dialogueLines: number
  totalBatches: number
  saved: StoredRun
  review: ReviewState
  frameNotes: string[]
  framesUsed: number
  elapsedMs: number
  error: string | null
}

export interface SessionStore {
  save(session: TranslateSession): void
  load(id: string): TranslateSession | null
  latestUnfinished(): TranslateSession | null
  remove(id: string): void
}

export interface SessionFileOps {
  writeFile(path: string, data: string): void
}

const DEFAULT_OPS: SessionFileOps = {
  writeFile(path, data) {
    writeFileSync(path, data, "utf8")
  },
}

export function createSessionStore(dir: string, ops: SessionFileOps = DEFAULT_OPS): SessionStore {
  const pathFor = (id: string): string => {
    if (!SESSION_ID.test(id)) {
      throw new Error("Invalid session id.")
    }
    return join(dir, `${id}.json`)
  }

  const readSession = (path: string): TranslateSession | null => {
    const parsed = readJson(path)
    return isTranslateSession(parsed) ? parsed : null
  }

  return {
    save(session) {
      const path = pathFor(session.id)
      mkdirSync(dir, { recursive: true })
      const temp = `${path}.${randomUUID()}.tmp`
      try {
        ops.writeFile(temp, JSON.stringify(session, null, 2))
        renameSync(temp, path)
      } catch (error) {
        rmSync(temp, { force: true })
        throw error
      }
    },
    load(id) {
      const path = pathFor(id)
      if (!existsSync(path)) {
        return null
      }
      const session = readSession(path)
      return session !== null && session.id === id ? session : null
    },
    latestUnfinished() {
      if (!existsSync(dir)) {
        return null
      }
      let newest: TranslateSession | null = null
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json")) {
          continue
        }
        const session = readSession(join(dir, file))
        if (session === null || session.phase === "done" || session.id !== file.slice(0, -5)) {
          continue
        }
        if (newest === null || session.startedAt > newest.startedAt) {
          newest = session
        }
      }
      return newest
    },
    remove(id) {
      rmSync(pathFor(id), { force: true })
    },
  }
}

export function toSavedRun(stored: StoredRun): SavedRun {
  return {
    completedBatches: stored.completedBatches,
    results: new Map(stored.results),
    glossary: stored.glossary,
    brief: stored.brief,
    hardIds: stored.hardIds,
    frameIds: stored.frameIds,
    strongIds: stored.strongIds,
  }
}

export function fromSavedRun(saved: SavedRun): StoredRun {
  return {
    completedBatches: saved.completedBatches,
    results: [...saved.results.entries()],
    glossary: saved.glossary,
    brief: saved.brief,
    hardIds: saved.hardIds,
    frameIds: saved.frameIds,
    strongIds: saved.strongIds,
  }
}

function readJson(path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
    return parsed
  } catch {
    return null
  }
}

function isTranslateSession(value: unknown): value is TranslateSession {
  return (
    isRecord(value) &&
    value.version === SESSION_VERSION &&
    typeof value.id === "string" &&
    typeof value.startedAt === "string" &&
    isOneOf(value.phase, PHASES) &&
    typeof value.scriptPath === "string" &&
    typeof value.scriptName === "string" &&
    typeof value.scriptText === "string" &&
    typeof value.seriesId === "string" &&
    typeof value.seriesName === "string" &&
    isVariant(value.variant) &&
    isOneOf(value.provider, PROVIDERS) &&
    isOneOf(value.preset, PRESETS) &&
    isOneOf(value.frameSetting, FRAME_SETTINGS) &&
    (value.videoPath === null || typeof value.videoPath === "string") &&
    typeof value.outputPath === "string" &&
    isStringList(value.dialogueStyles) &&
    isStyleCard(value.card) &&
    isFiniteNumber(value.dialogueLines) &&
    isFiniteNumber(value.totalBatches) &&
    isStoredRun(value.saved) &&
    isReviewState(value.review) &&
    isStringList(value.frameNotes) &&
    isFiniteNumber(value.framesUsed) &&
    isFiniteNumber(value.elapsedMs) &&
    (value.error === null || typeof value.error === "string")
  )
}

function isStyleCard(value: unknown): value is StyleCard {
  return (
    isRecord(value) &&
    isVariant(value.variant) &&
    typeof value.seriesId === "string" &&
    isFiniteNumber(value.revision) &&
    isFiniteNumber(value.cpsLimit) &&
    typeof value.voice === "string" &&
    isRuleList(value.rules)
  )
}

function isStoredRun(value: unknown): value is StoredRun {
  return (
    isRecord(value) &&
    isFiniteNumber(value.completedBatches) &&
    isResultEntries(value.results) &&
    isGlossary(value.glossary) &&
    typeof value.brief === "string" &&
    isStringList(value.hardIds) &&
    isStringList(value.frameIds) &&
    isStringList(value.strongIds)
  )
}

function isReviewState(value: unknown): value is ReviewState {
  return (
    isRecord(value) &&
    isRecord(value.edits) &&
    Object.values(value.edits).every((edit) => typeof edit === "string") &&
    isUnknownArray(value.accepted) &&
    value.accepted.every(isFiniteNumber) &&
    isUnknownArray(value.rules) &&
    value.rules.every(isReviewRule)
  )
}

function isReviewRule(value: unknown): value is ReviewState["rules"][number] {
  return (
    isRecord(value) && (value.target === "series" || value.target === "base") && isRule(value.rule)
  )
}

function isRule(value: unknown): value is Rule {
  if (!isRecord(value)) {
    return false
  }
  if (value.kind === "prose") {
    return typeof value.text === "string"
  }
  if (value.kind === "glossary") {
    return typeof value.source === "string" && typeof value.pt === "string"
  }
  return false
}

function isResultEntries(value: unknown): value is [string, LineResult][] {
  return isUnknownArray(value) && value.every(isResultEntry)
}

function isResultEntry(value: unknown): value is [string, LineResult] {
  return (
    isUnknownArray(value) &&
    value.length === 2 &&
    typeof value[0] === "string" &&
    isLineResult(value[1])
  )
}

function isLineResult(value: unknown): value is LineResult {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.words !== "string" ||
    !isMark(value.mark)
  ) {
    return false
  }
  if (value.reason !== undefined && typeof value.reason !== "string") {
    return false
  }
  if (value.glossary !== undefined && !isGlossary(value.glossary)) {
    return false
  }
  if (value.hardIds !== undefined && !isStringList(value.hardIds)) {
    return false
  }
  return value.frameIds === undefined || isStringList(value.frameIds)
}

function isMark(value: unknown): value is LineResult["mark"] {
  return value === "clean" || value === "doubt" || value === "hard-call" || value === "mild"
}

function isGlossary(value: unknown): value is { source: string; pt: string }[] {
  return (
    isUnknownArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) && typeof entry.source === "string" && typeof entry.pt === "string",
    )
  )
}

function isStringList(value: unknown): value is string[] {
  return isUnknownArray(value) && value.every((item) => typeof item === "string")
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && options.some((option) => option === value)
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}
