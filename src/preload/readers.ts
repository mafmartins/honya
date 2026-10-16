import { isRecord, isRuleList, isVariant, readBaseProfile } from "../core/library/guards"
import { readProposal } from "../core/review/proposal"
import type {
  CheckResult,
  FinishResult,
  LiveLine,
  LoadedBase,
  ModelPair,
  PickedExample,
  PickedScript,
  PickedVideo,
  PreparedScript,
  ReviewLine,
  ReviewView,
  Rule,
  SeriesList,
  SeriesSummary,
  SessionPhase,
  TranslateEvent,
  UnfinishedSession,
} from "../shared/api"

const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

export function ipcMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message.replace(IPC_PREFIX, "")
  }
  return "Something went wrong."
}

export function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

export function readNothing(value: unknown): undefined | null {
  return value === null || value === undefined ? undefined : null
}

export function readModelPair(value: unknown): ModelPair | null {
  if (!isRecord(value) || typeof value.cheap !== "string" || typeof value.strong !== "string") {
    return null
  }
  return { cheap: value.cheap, strong: value.strong }
}

export function readPickedScript(value: unknown): { value: PickedScript | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.name !== "string" ||
    typeof value.text !== "string"
  ) {
    return null
  }
  return { value: { path: value.path, name: value.name, text: value.text } }
}

export function readPickedVideo(value: unknown): { value: PickedVideo | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.name !== "string") {
    return null
  }
  return { value: { path: value.path, name: value.name } }
}

export function readPickedExample(value: unknown): { value: PickedExample | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.text !== "string") {
    return null
  }
  const styles = value.styles
  if (!Array.isArray(styles)) {
    return null
  }
  const listed: PickedExample["styles"] = []
  for (const style of styles) {
    if (!isRecord(style) || typeof style.name !== "string") {
      return null
    }
    const guess = style.guess
    if (guess !== "dialogue" && guess !== "skip" && guess !== "ambiguous") {
      return null
    }
    listed.push({ name: style.name, guess })
  }
  return { value: { name: value.name, text: value.text, styles: listed } }
}

export function readSeriesSummary(value: unknown): SeriesSummary | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null
  }
  const ruleCount = value.ruleCount
  if (typeof ruleCount !== "number" || !Number.isInteger(ruleCount)) {
    return null
  }
  return { id: value.id, name: value.name, ruleCount }
}

export function readSeriesList(value: unknown): SeriesList | null {
  if (!isRecord(value) || !Array.isArray(value.series) || !isStringList(value.problems)) {
    return null
  }
  const series: SeriesSummary[] = []
  for (const item of value.series) {
    const summary = readSeriesSummary(item)
    if (summary === null) {
      return null
    }
    series.push(summary)
  }
  return { series, problems: value.problems }
}

export function readRules(value: unknown): Rule[] | null {
  return isRuleList(value) ? value : null
}

export function readLoadedBase(value: unknown): LoadedBase | null {
  if (!isRecord(value) || !isStringList(value.problems)) {
    return null
  }
  const base = readBaseProfile(value.base)
  return base === null ? null : { base, problems: value.problems }
}

export function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export function readPreparedScript(value: unknown): PreparedScript | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.styles) ||
    typeof value.outputPath !== "string" ||
    typeof value.scriptName !== "string"
  ) {
    return null
  }
  const styles: PreparedScript["styles"] = []
  for (const style of value.styles) {
    if (!isRecord(style) || typeof style.name !== "string") {
      return null
    }
    const guess = style.guess
    if (guess !== "dialogue" && guess !== "skip" && guess !== "ambiguous") {
      return null
    }
    styles.push({ name: style.name, guess })
  }
  return { styles, outputPath: value.outputPath, scriptName: value.scriptName }
}

function readLiveLine(value: unknown): LiveLine | null {
  if (
    !isRecord(value) ||
    !isCount(value.eventIndex) ||
    typeof value.english !== "string" ||
    typeof value.words !== "string" ||
    !(value.note === null || typeof value.note === "string")
  ) {
    return null
  }
  return {
    eventIndex: value.eventIndex,
    english: value.english,
    words: value.words,
    note: value.note,
  }
}

export function readTranslateEvent(value: unknown): TranslateEvent | null {
  if (!isRecord(value) || typeof value.sessionId !== "string") {
    return null
  }
  const sessionId = value.sessionId
  switch (value.type) {
    case "activity":
      return typeof value.text === "string"
        ? { type: "activity", sessionId, text: value.text }
        : null
    case "stopped":
      return { type: "stopped", sessionId }
    case "failed":
      return typeof value.message === "string"
        ? { type: "failed", sessionId, message: value.message }
        : null
    case "finished":
      return isCount(value.openFlags)
        ? { type: "finished", sessionId, openFlags: value.openFlags }
        : null
    case "batch": {
      if (
        !isCount(value.index) ||
        !isCount(value.total) ||
        !isCount(value.linesDone) ||
        !isCount(value.lineTotal) ||
        !Array.isArray(value.lines)
      ) {
        return null
      }
      const lines: LiveLine[] = []
      for (const item of value.lines) {
        const line = readLiveLine(item)
        if (line === null) {
          return null
        }
        lines.push(line)
      }
      return {
        type: "batch",
        sessionId,
        index: value.index,
        total: value.total,
        linesDone: value.linesDone,
        lineTotal: value.lineTotal,
        lines,
      }
    }
    default:
      return null
  }
}

function readReviewLine(value: unknown): ReviewLine | null {
  if (
    !isRecord(value) ||
    !isCount(value.eventIndex) ||
    typeof value.english !== "string" ||
    typeof value.words !== "string" ||
    !(value.note === null || typeof value.note === "string") ||
    typeof value.edited !== "boolean" ||
    typeof value.flagged !== "boolean" ||
    typeof value.accepted !== "boolean"
  ) {
    return null
  }
  return {
    eventIndex: value.eventIndex,
    english: value.english,
    words: value.words,
    note: value.note,
    edited: value.edited,
    flagged: value.flagged,
    accepted: value.accepted,
  }
}

export function readReviewView(value: unknown): ReviewView | null {
  if (
    !isRecord(value) ||
    typeof value.sessionId !== "string" ||
    typeof value.scriptName !== "string" ||
    typeof value.seriesName !== "string" ||
    !isVariant(value.variant) ||
    !isPreset(value.preset) ||
    typeof value.outputPath !== "string" ||
    !isCount(value.openFlags) ||
    !Array.isArray(value.lines)
  ) {
    return null
  }
  const lines: ReviewLine[] = []
  for (const item of value.lines) {
    const line = readReviewLine(item)
    if (line === null) {
      return null
    }
    lines.push(line)
  }
  return {
    sessionId: value.sessionId,
    scriptName: value.scriptName,
    seriesName: value.seriesName,
    variant: value.variant,
    preset: value.preset,
    outputPath: value.outputPath,
    lines,
    openFlags: value.openFlags,
  }
}

export function readCheckResult(value: unknown): CheckResult | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.status === "none") {
    return { status: "none" }
  }
  if (value.status === "failed") {
    return { status: "failed" }
  }
  if (value.status === "proposal") {
    const proposal = readProposal(value.proposal)
    return proposal === null ? null : { status: "proposal", proposal }
  }
  return null
}

const PHASES: readonly SessionPhase[] = ["running", "stopped", "failed", "review", "done"]

export function readUnfinished(value: unknown): { value: UnfinishedSession | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.scriptName !== "string" ||
    typeof value.seriesName !== "string" ||
    !isCount(value.completedBatches) ||
    !isCount(value.totalBatches) ||
    !isCount(value.openFlags)
  ) {
    return null
  }
  const phase = PHASES.find((candidate) => candidate === value.phase)
  if (phase === undefined) {
    return null
  }
  return {
    value: {
      id: value.id,
      scriptName: value.scriptName,
      seriesName: value.seriesName,
      phase,
      completedBatches: value.completedBatches,
      totalBatches: value.totalBatches,
      openFlags: value.openFlags,
    },
  }
}

export function readFinishResult(value: unknown): FinishResult | null {
  if (!isRecord(value) || typeof value.outputPath !== "string" || !isRecord(value.report)) {
    return null
  }
  const report = value.report
  const counts = [
    report.dialogueLines,
    report.translated,
    report.strongModel,
    report.leftInEnglish,
    report.overLimit,
    report.flags,
    report.editedFlags,
    report.acceptedAsIs,
    report.framesUsed,
    report.frameFailures,
    report.unchanged,
    report.elapsedMs,
  ]
  const rules = report.rulesSaved
  if (
    !counts.every(isCount) ||
    typeof report.outputPath !== "string" ||
    !isRecord(rules) ||
    !isCount(rules.series) ||
    !isCount(rules.base)
  ) {
    return null
  }
  return {
    outputPath: value.outputPath,
    report: {
      dialogueLines: Number(report.dialogueLines),
      translated: Number(report.translated),
      strongModel: Number(report.strongModel),
      leftInEnglish: Number(report.leftInEnglish),
      overLimit: Number(report.overLimit),
      flags: Number(report.flags),
      editedFlags: Number(report.editedFlags),
      acceptedAsIs: Number(report.acceptedAsIs),
      rulesSaved: { series: rules.series, base: rules.base },
      framesUsed: Number(report.framesUsed),
      frameFailures: Number(report.frameFailures),
      unchanged: Number(report.unchanged),
      elapsedMs: Number(report.elapsedMs),
      outputPath: report.outputPath,
    },
  }
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isPreset(value: unknown): value is ReviewView["preset"] {
  return value === "save" || value === "balanced" || value === "best"
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}
