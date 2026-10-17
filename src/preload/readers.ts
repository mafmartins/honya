import {
  isFrameSetting,
  isProviderId,
  isRecord,
  isRule,
  isRuleList,
  isVariant,
} from "../core/library/guards"
import type {
  AppSettings,
  Cost,
  Preset,
  ExportPreview,
  KeyTestResult,
  LaunchInfo,
  LineOrigin,
  LineView,
  Retranslated,
  ListedStyle,
  ModelOption,
  ProjectSummary,
  ProjectView,
  SessionStats,
  SessionSummary,
  SessionView,
  StyleView,
  WorkspaceEvent,
  Combined,
  Learned,
  ModelPair,
  PickedExample,
  Rule,
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

export function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function readCost(value: unknown): Cost | null {
  if (
    !isRecord(value) ||
    !(value.usd === null || isCount(value.usd)) ||
    !Array.isArray(value.unpriced) ||
    !isCount(value.input) ||
    !isCount(value.output) ||
    !isCount(value.requests)
  ) {
    return null
  }
  const unpriced: string[] = []
  for (const model of value.unpriced as readonly unknown[]) {
    if (typeof model !== "string") {
      return null
    }
    unpriced.push(model)
  }
  return {
    usd: value.usd,
    unpriced,
    input: value.input,
    output: value.output,
    requests: value.requests,
  }
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isPreset(value: unknown): value is Preset {
  return value === "save" || value === "balanced" || value === "best"
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

export function readLearned(value: unknown): Learned | null {
  if (!isRecord(value) || !isCount(value.pairs)) {
    return null
  }
  const glossary: Learned["glossary"] = []
  for (const item of Array.isArray(value.glossary) ? (value.glossary as readonly unknown[]) : []) {
    if (!isRecord(item) || typeof item.source !== "string" || typeof item.pt !== "string") {
      return null
    }
    glossary.push({ kind: "glossary", source: item.source, pt: item.pt })
  }
  const rules: Learned["rules"] = []
  for (const item of Array.isArray(value.rules) ? (value.rules as readonly unknown[]) : []) {
    if (!isRecord(item) || typeof item.text !== "string") {
      return null
    }
    rules.push({ kind: "prose", text: item.text })
  }
  return { glossary, rules, pairs: value.pairs }
}

export function readCombined(value: unknown): Combined | null {
  if (
    !isRecord(value) ||
    !isCount(value.episodes) ||
    !isCount(value.pairs) ||
    !Array.isArray(value.suggestions)
  ) {
    return null
  }
  const suggestions: Combined["suggestions"] = []
  for (const item of value.suggestions as readonly unknown[]) {
    if (!isRecord(item) || !isCount(item.episodes) || !Array.isArray(item.alternatives)) {
      return null
    }
    const alternatives: string[] = []
    for (const alt of item.alternatives as readonly unknown[]) {
      if (typeof alt !== "string") {
        return null
      }
      alternatives.push(alt)
    }
    const rule: unknown = item.rule
    if (!isRecord(rule)) {
      return null
    }
    if (
      rule.kind === "glossary" &&
      typeof rule.source === "string" &&
      typeof rule.pt === "string"
    ) {
      suggestions.push({
        rule: { kind: "glossary", source: rule.source, pt: rule.pt },
        episodes: item.episodes,
        alternatives,
      })
    } else if (rule.kind === "prose" && typeof rule.text === "string") {
      suggestions.push({
        rule: { kind: "prose", text: rule.text },
        episodes: item.episodes,
        alternatives,
      })
    } else {
      return null
    }
  }
  return { suggestions, episodes: value.episodes, pairs: value.pairs }
}

// Workspace replies.

export function readAppSettings(value: unknown): AppSettings | null {
  if (
    !isRecord(value) ||
    typeof value.setupDone !== "boolean" ||
    !isProviderId(value.defaultProvider) ||
    !isCount(value.eurRate) ||
    !isRecord(value.defaults)
  ) {
    return null
  }
  const defaults = value.defaults
  if (
    !isVariant(defaults.variant) ||
    !isPreset(defaults.preset) ||
    !isFrameSetting(defaults.frameSetting)
  ) {
    return null
  }
  return {
    setupDone: value.setupDone,
    defaultProvider: value.defaultProvider,
    defaults: {
      variant: defaults.variant,
      preset: defaults.preset,
      frameSetting: defaults.frameSetting,
    },
    eurRate: value.eurRate,
  }
}

export function readKeyTest(value: unknown): KeyTestResult | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.ok === true) {
    return { ok: true }
  }
  return value.ok === false && typeof value.message === "string"
    ? { ok: false, message: value.message }
    : null
}

function readModelOptionList(value: unknown): ModelOption[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const options: ModelOption[] = []
  for (const item of value as readonly unknown[]) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.label !== "string" ||
      typeof item.recommended !== "boolean"
    ) {
      return null
    }
    options.push({ id: item.id, label: item.label, recommended: item.recommended })
  }
  return options
}

export function readModelOptions(
  value: unknown,
): { cheap: ModelOption[]; strong: ModelOption[] } | null {
  if (!isRecord(value)) {
    return null
  }
  const cheap = readModelOptionList(value.cheap)
  const strong = readModelOptionList(value.strong)
  return cheap === null || strong === null ? null : { cheap, strong }
}

export function readProjectSummary(value: unknown): ProjectSummary | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isVariant(value.variant) ||
    !isCount(value.sessions) ||
    !(value.lastActivity === null || typeof value.lastActivity === "string")
  ) {
    return null
  }
  return {
    id: value.id,
    name: value.name,
    variant: value.variant,
    sessions: value.sessions,
    lastActivity: value.lastActivity,
  }
}

export function readProjectSummaries(value: unknown): ProjectSummary[] | null {
  return readList(value, readProjectSummary)
}

function readReferences(value: unknown): ProjectView["references"] | null {
  return readList(value, (item) =>
    isRecord(item) && typeof item.name === "string" && typeof item.text === "string"
      ? { name: item.name, text: item.text }
      : null,
  )
}

export function readProjectView(value: unknown): ProjectView | null {
  if (
    !isRecord(value) ||
    !isRecord(value.rules) ||
    !isRuleList(value.rules.own) ||
    !isRuleList(value.rules.inherited) ||
    !(value.cpsLimit === null || isCount(value.cpsLimit)) ||
    !isCount(value.styleCps) ||
    !isPreset(value.preset) ||
    !isFrameSetting(value.frameSetting) ||
    typeof value.languageLocked !== "boolean"
  ) {
    return null
  }
  const summary = readProjectSummary(value.summary)
  const references = readReferences(value.references)
  if (summary === null || references === null) {
    return null
  }
  return {
    summary,
    rules: { own: value.rules.own, inherited: value.rules.inherited },
    cpsLimit: value.cpsLimit,
    styleCps: value.styleCps,
    preset: value.preset,
    frameSetting: value.frameSetting,
    references,
    languageLocked: value.languageLocked,
  }
}

export function readStyleView(value: unknown): StyleView | null {
  if (
    !isRecord(value) ||
    !isVariant(value.variant) ||
    !isRuleList(value.rules) ||
    !isCount(value.cpsLimit) ||
    !isStringList(value.usedBy)
  ) {
    return null
  }
  const references = readReferences(value.references)
  if (references === null) {
    return null
  }
  return {
    variant: value.variant,
    rules: value.rules,
    cpsLimit: value.cpsLimit,
    references,
    usedBy: value.usedBy,
  }
}

export function readRule(value: unknown): Rule | null {
  if (!isRule(value)) {
    return null
  }
  return value.kind === "prose"
    ? { kind: "prose", text: value.text }
    : { kind: "glossary", source: value.source, pt: value.pt }
}

export function readSessionSummary(value: unknown): SessionSummary | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.projectName !== "string" ||
    typeof value.scriptName !== "string" ||
    !isCount(value.translated) ||
    !isCount(value.total) ||
    !isCount(value.openFlags) ||
    typeof value.updatedAt !== "string" ||
    typeof value.finished !== "boolean"
  ) {
    return null
  }
  return {
    id: value.id,
    projectId: value.projectId,
    projectName: value.projectName,
    scriptName: value.scriptName,
    translated: value.translated,
    total: value.total,
    openFlags: value.openFlags,
    updatedAt: value.updatedAt,
    finished: value.finished,
  }
}

export function readSessionSummaries(value: unknown): SessionSummary[] | null {
  return readList(value, readSessionSummary)
}

export function readLaunchInfo(value: unknown): LaunchInfo | null {
  if (!isRecord(value) || typeof value.setupDone !== "boolean") {
    return null
  }
  const continueSession =
    value.continueSession === null ? null : readSessionSummary(value.continueSession)
  const projects = readProjectSummaries(value.projects)
  if ((value.continueSession !== null && continueSession === null) || projects === null) {
    return null
  }
  return { setupDone: value.setupDone, continueSession, projects }
}

function isOrigin(value: unknown): value is LineOrigin | null {
  return value === null || value === "ai" || value === "manual"
}

export function readLineView(value: unknown): LineView | null {
  if (
    !isRecord(value) ||
    !isCount(value.index) ||
    !isCount(value.start) ||
    !isCount(value.end) ||
    typeof value.speaker !== "string" ||
    typeof value.english !== "string" ||
    !(value.words === null || typeof value.words === "string") ||
    !isOrigin(value.origin) ||
    !(value.flag === null || typeof value.flag === "string") ||
    !isCount(value.budget)
  ) {
    return null
  }
  return {
    index: value.index,
    start: value.start,
    end: value.end,
    speaker: value.speaker,
    english: value.english,
    words: value.words,
    origin: value.origin,
    flag: value.flag,
    budget: value.budget,
  }
}

export function readRetranslated(value: unknown): Retranslated | null {
  if (!isRecord(value) || typeof value.keptEdit !== "boolean") {
    return null
  }
  const line = readLineView(value.line)
  return line === null ? null : { line, keptEdit: value.keptEdit }
}

export function readSessionStats(value: unknown): SessionStats | null {
  if (!isRecord(value) || !isRecord(value.lines) || !isRecord(value.flags)) {
    return null
  }
  const { lines, flags } = value
  const cost = readCost(value.cost)
  const models = readModelCosts(value.models)
  if (
    cost === null ||
    models === null ||
    !isCount(lines.ai) ||
    !isCount(lines.manual) ||
    !isCount(lines.untranslated) ||
    !isCount(lines.total) ||
    !isCount(flags.open) ||
    !isCount(flags.accepted) ||
    !isCount(flags.edited) ||
    !isCount(flags.retranslated) ||
    !isCount(value.strongLines) ||
    !isCount(value.retranslatedLines) ||
    !isCount(value.activeMs) ||
    !isCount(value.framesGrabbed)
  ) {
    return null
  }
  return {
    lines: {
      ai: lines.ai,
      manual: lines.manual,
      untranslated: lines.untranslated,
      total: lines.total,
    },
    flags: {
      open: flags.open,
      accepted: flags.accepted,
      edited: flags.edited,
      retranslated: flags.retranslated,
    },
    strongLines: value.strongLines,
    retranslatedLines: value.retranslatedLines,
    cost,
    models,
    activeMs: value.activeMs,
    framesGrabbed: value.framesGrabbed,
  }
}

function readModelCosts(value: unknown): SessionStats["models"] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const models: SessionStats["models"] = []
  for (const item of value as readonly unknown[]) {
    if (
      !isRecord(item) ||
      typeof item.model !== "string" ||
      !isCount(item.requests) ||
      !isCount(item.input) ||
      !isCount(item.output) ||
      !(item.usd === null || isCount(item.usd))
    ) {
      return null
    }
    models.push({
      model: item.model,
      requests: item.requests,
      input: item.input,
      output: item.output,
      usd: item.usd,
    })
  }
  return models
}

function readListedStyle(value: unknown): ListedStyle | null {
  if (!isRecord(value) || typeof value.name !== "string") {
    return null
  }
  const guess = value.guess
  return guess === "dialogue" || guess === "skip" || guess === "ambiguous"
    ? { name: value.name, guess }
    : null
}

export function readSessionView(value: unknown): SessionView | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.projectId !== "string" ||
    typeof value.projectName !== "string" ||
    !isVariant(value.variant) ||
    !(value.scriptName === null || typeof value.scriptName === "string") ||
    !(value.videoName === null || typeof value.videoName === "string") ||
    !isProviderId(value.provider) ||
    !isPreset(value.preset) ||
    typeof value.finished !== "boolean"
  ) {
    return null
  }
  const lines = readList(value.lines, readLineView)
  const needsStyles =
    value.needsStyles === null ? null : readList(value.needsStyles, readListedStyle)
  const stats = readSessionStats(value.stats)
  if (lines === null || (value.needsStyles !== null && needsStyles === null) || stats === null) {
    return null
  }
  return {
    id: value.id,
    projectId: value.projectId,
    projectName: value.projectName,
    variant: value.variant,
    scriptName: value.scriptName,
    videoName: value.videoName,
    provider: value.provider,
    preset: value.preset,
    lines,
    needsStyles,
    stats,
    finished: value.finished,
  }
}

export function readPickedSessionView(value: unknown): { value: SessionView | null } | null {
  if (value === null) {
    return { value: null }
  }
  const view = readSessionView(value)
  return view === null ? null : { value: view }
}

// A string or null (a cancelled dialog, no frame, no active run).
export function readOptionalString(value: unknown): { value: string | null } | null {
  if (value === null) {
    return { value: null }
  }
  return typeof value === "string" ? { value } : null
}

export function readExportPreview(value: unknown): ExportPreview | null {
  if (
    !isRecord(value) ||
    !isCount(value.translated) ||
    !isCount(value.english) ||
    !isCount(value.openFlags) ||
    typeof value.defaultPath !== "string"
  ) {
    return null
  }
  const suggestions = readList(value.suggestions, (item) => {
    if (!isRecord(item) || !Array.isArray(item.lines) || !item.lines.every(isCount)) {
      return null
    }
    const rule = readRule(item.rule)
    return rule === null ? null : { rule, lines: item.lines.filter(isCount) }
  })
  if (suggestions === null) {
    return null
  }
  return {
    translated: value.translated,
    english: value.english,
    openFlags: value.openFlags,
    defaultPath: value.defaultPath,
    suggestions,
  }
}

export function readExportWritten(value: unknown): { path: string } | null {
  return isRecord(value) && typeof value.path === "string" ? { path: value.path } : null
}

export function readWorkspaceEvent(value: unknown): WorkspaceEvent | null {
  if (!isRecord(value) || typeof value.sessionId !== "string") {
    return null
  }
  const sessionId = value.sessionId
  switch (value.type) {
    case "run-progress": {
      const indexes = readList(value.indexes, (item) => (isCount(item) ? item : null))
      return isCount(value.index) &&
        isCount(value.total) &&
        isCount(value.linesDone) &&
        isCount(value.lineTotal) &&
        typeof value.activity === "string" &&
        indexes !== null
        ? {
            type: "run-progress",
            sessionId,
            index: value.index,
            total: value.total,
            linesDone: value.linesDone,
            lineTotal: value.lineTotal,
            activity: value.activity,
            indexes,
          }
        : null
    }
    case "lines": {
      const lines = readList(value.lines, readLineView)
      return lines === null ? null : { type: "lines", sessionId, lines }
    }
    case "run-ended": {
      const outcome = value.outcome
      if (
        (outcome !== "done" && outcome !== "stopped" && outcome !== "failed") ||
        !(value.message === null || typeof value.message === "string")
      ) {
        return null
      }
      return { type: "run-ended", sessionId, outcome, message: value.message }
    }
    case "session-changed":
      return { type: "session-changed", sessionId }
    default:
      return null
  }
}

function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const list: T[] = []
  for (const item of value as readonly unknown[]) {
    const parsed = read(item)
    if (parsed === null) {
      return null
    }
    list.push(parsed)
  }
  return list
}
