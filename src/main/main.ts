import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readAss, type DialogueCue } from "../core/ass/script"
import { createFileStore } from "../core/library/fileStore"
import { grabFrame } from "../core/frames/grab"
import { bundledFfmpegPath } from "../core/frames/path"
import type { Rule, StyleCard } from "../core/library/types"
import {
  preflight,
  type PreflightFailureReason,
  type PreflightResult,
} from "../core/pipeline/preflight"
import {
  resumeTranslation,
  runTranslation,
  type Completer,
  type RunInput,
  type RunResult,
  type SavedRun,
} from "../core/pipeline/run"
import type { LineResult, Preset, ProviderId, Variant } from "../core/pipeline/types"
import { completeChat, type ChatInput } from "../core/providers/complete"
import { canExport, openFlags, type DraftLine, type Flag } from "../core/review/review"
import { createProfileHandlers } from "./ipc/profiles"
import { registerSetupIpc } from "./ipc/register"
import { createModelStore, type ModelStore } from "./modelStore"
import { createSecretStore, type SecretStore } from "./secrets"

export interface PreflightRequest {
  styleListAccepted: boolean
  dialogueStyleCount: number
  framesRequested: boolean
  provider: ProviderId
  preset: Preset
  dialogueLineCount: number
  frameCount: number
  sourcePath: string
  variant: Variant
}

export interface StartRequest {
  mode: "autonomous" | "assisted"
  ass: string
  dialogueStyles: string[]
  card: StyleCard
  preset: Preset
  provider: ProviderId
  variant: Variant
  sourcePath: string
  styleListAccepted: boolean
  frameSetting: "none" | "marked" | "every"
  videoPath: string | null
  outputPath: string | null
}

export interface ExportRequest {
  sessionId: string
}

export type StartResponse =
  | { ok: false; reason: PreflightFailureReason }
  | { ok: false; reason: "write"; sessionId: string }
  | { ok: true; mode: "autonomous"; sessionId: string; outputPath: string; draft: string }
  | { ok: true; mode: "assisted"; sessionId: string; draft: string; flags: Flag[] }

export type ExportResponse =
  { ok: true; outputPath: string } | { ok: false; reason: "flags" | "missing" | "write" }

interface StoredSavedRun {
  completedBatches: number
  results: [string, LineResult][]
  glossary: { source: string; pt: string }[]
  brief: string
  hardIds: string[]
  frameIds: string[]
  strongIds: string[]
}

interface StoredSession {
  mode: "autonomous" | "assisted"
  sourcePath: string
  outputPath: string
  draft: string
  flags: Flag[]
  report: string[]
  saved: StoredSavedRun
}

type FrameSetting = StartRequest["frameSetting"]

const PROVIDERS = ["claude", "gpt", "gemini", "mistral"] as const
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOTE = /\{note: ([^}]*)\}/

function boot(): void {
  const secrets = createSecretStore(safeStorage, { read: readKeyFile, write: writeKeyFile })
  const models = createModelStore({ read: readModelFile, write: writeModelFile })
  const store = createFileStore(join(app.getPath("userData"), "profiles"))
  registerSetupIpc({ open: openFile, secrets, models, profiles: createProfileHandlers(store) })
  registerIpc(secrets, models)
  openWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openWindow()
    }
  })
}

async function openFile(filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  const options = { properties: ["openFile" as const], filters }
  const parent = BrowserWindow.getFocusedWindow()
  const result = await (parent === null
    ? dialog.showOpenDialog(options)
    : dialog.showOpenDialog(parent, options))
  if (result.canceled) {
    return null
  }
  return result.filePaths[0] ?? null
}

function modelPath(): string {
  return join(app.getPath("userData"), "models.json")
}

function readModelFile(): string | null {
  const file = modelPath()
  return existsSync(file) ? readFileSync(file, "utf8") : null
}

function writeModelFile(text: string): void {
  const file = modelPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text, "utf8")
}

function registerIpc(secrets: SecretStore, models: ModelStore): void {
  onInvoke("honya:preflight", (args) => {
    const request = readPreflightRequest(argument(args, 0))
    if (request === null) {
      throw new Error("invalid preflight")
    }
    return runPreflight(secrets, request)
  })
  onInvoke("honya:start", (args) => {
    const request = readStartRequest(argument(args, 0))
    if (request === null) {
      throw new Error("invalid start")
    }
    return startTranslation(secrets, models, request)
  })
  onInvoke("honya:export", (args) => {
    const request = readExportRequest(argument(args, 0))
    if (request === null) {
      throw new Error("invalid export")
    }
    return exportSession(request.sessionId)
  })
}

function onInvoke(channel: string, handle: (args: readonly unknown[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]) => handle(args))
}

function openWindow(): void {
  const rendererPath = join(app.getAppPath(), "dist", "renderer", "index.html")
  const window = new BrowserWindow({
    width: 1100,
    height: 820,
    minWidth: 760,
    minHeight: 720,
    title: "Honya",
    webPreferences: {
      preload: join(app.getAppPath(), "dist", "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.webContents.on("will-navigate", (event, url) => {
    if (!isRendererUrl(url, rendererPath)) {
      event.preventDefault()
    }
  })
  window.webContents.on("will-redirect", (event, url) => {
    if (!isRendererUrl(url, rendererPath)) {
      event.preventDefault()
    }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  void window.loadFile(rendererPath)
}

function isRendererUrl(url: string, rendererPath: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "file:" || parsed.search !== "" || parsed.hash !== "") {
    return false
  }
  let target: string
  try {
    target = fileURLToPath(parsed)
  } catch {
    return false
  }
  return resolve(target) === resolve(rendererPath)
}

function runPreflight(secrets: SecretStore, request: PreflightRequest): PreflightResult {
  return preflight({
    styleListAccepted: request.styleListAccepted,
    dialogueStyleCount: request.dialogueStyleCount,
    hasKey: secrets.hasKey(request.provider),
    framesRequested: request.framesRequested,
    ffmpegPresent: request.framesRequested ? ffmpegReady() : true,
    provider: request.provider,
    preset: request.preset,
    dialogueLineCount: request.dialogueLineCount,
    frameCount: request.frameCount,
    sourcePath: request.sourcePath,
    variant: request.variant,
  })
}

async function startTranslation(
  secrets: SecretStore,
  models: ModelStore,
  request: StartRequest,
): Promise<StartResponse> {
  const dialogueStyles = new Set(request.dialogueStyles)
  const cues = readAss(request.ass).filter((cue) => dialogueStyles.has(cue.style))
  const framesRequested = request.frameSetting !== "none"
  const gate = preflight({
    styleListAccepted: request.styleListAccepted,
    dialogueStyleCount: dialogueStyles.size,
    hasKey: secrets.hasKey(request.provider),
    framesRequested,
    ffmpegPresent: framesRequested ? ffmpegReady() : true,
    provider: request.provider,
    preset: request.preset,
    dialogueLineCount: cues.length,
    frameCount: request.frameSetting === "every" ? cues.length : 0,
    sourcePath: request.sourcePath,
    variant: request.variant,
  })
  if (!gate.ok) {
    return { ok: false, reason: gate.reason }
  }

  const outputPath = request.outputPath ?? gate.summary.outputPath
  const grabbed = await grabFrames(cues, request.videoPath, request.frameSetting)
  const base = translationInput(request, dialogueStyles, grabbed.frames, secrets, models)
  const sessionId = randomUUID()
  let previous = 0
  let saved: SavedRun | null = null
  let result = await runBatch(base, saved, previous + 1)
  for (;;) {
    writeSession(
      sessionId,
      sessionRecord(request, outputPath, dialogueStyles, result, grabbed.notes),
    )
    if (result.saved.completedBatches <= previous) {
      break
    }
    previous = result.saved.completedBatches
    saved = result.saved
    const next = await runBatch(base, saved, previous + 1)
    if (next.saved.completedBatches <= previous) {
      break
    }
    result = next
  }

  const flags = openFlags(reviewLines(request.ass, dialogueStyles, result.saved))
  if (request.mode === "assisted") {
    return { ok: true, mode: "assisted", sessionId, draft: result.ass, flags }
  }
  if (result.ass.length > 0) {
    if (writesSource(outputPath, request.sourcePath)) {
      return { ok: false, reason: "write", sessionId }
    }
    try {
      writeFileSync(outputPath, result.ass, "utf8")
    } catch {
      return { ok: false, reason: "write", sessionId }
    }
  }
  return { ok: true, mode: "autonomous", sessionId, outputPath, draft: result.ass }
}

function runBatch(
  base: RunInput,
  saved: SavedRun | null,
  stopAfterBatches: number,
): Promise<RunResult> {
  const input: RunInput = { ...base, stopAfterBatches }
  if (saved === null) {
    return runTranslation(input)
  }
  return resumeTranslation(saved, input)
}

function translationInput(
  request: StartRequest,
  dialogueStyles: ReadonlySet<string>,
  frames: ReadonlyMap<string, Uint8Array>,
  secrets: SecretStore,
  models: ModelStore,
): RunInput {
  const input: RunInput = {
    ass: request.ass,
    dialogueStyles,
    card: request.card,
    preset: request.preset,
    complete: (chat) => completeWithProvider(secrets, models, request.provider, chat),
    sleep,
  }
  if (request.frameSetting !== "none") {
    input.frameSetting = request.frameSetting
  }
  if (frames.size > 0) {
    input.frames = frames
  }
  return input
}

async function completeWithProvider(
  secrets: SecretStore,
  models: ModelStore,
  provider: ProviderId,
  request: Parameters<Completer>[0],
): Promise<{ lines: LineResult[] } | { refused: true }> {
  const apiKey = secrets.getKey(provider)
  if (apiKey === null) {
    return { refused: true }
  }
  const pair = models.get(provider)
  const chat: ChatInput = {
    provider,
    model: request.tier === "cheap" ? pair.cheap : pair.strong,
    apiKey,
    prompt: request.prompt,
    fetch,
  }
  if (request.images !== undefined) {
    chat.images = request.images.map((image) => ({ id: image.id, png: image.bytes }))
  }
  return completeChat(chat)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms)
  })
}

async function grabFrames(
  cues: readonly DialogueCue[],
  videoPath: string | null,
  frameSetting: FrameSetting,
): Promise<{ frames: Map<string, Uint8Array>; notes: string[] }> {
  const frames = new Map<string, Uint8Array>()
  const notes: string[] = []
  if (frameSetting === "none" || videoPath === null) {
    return { frames, notes }
  }
  const ffmpegPath = bundledFfmpegPath(process.resourcesPath, process.platform)
  for (const cue of cues) {
    try {
      const bytes = await grabFrame({
        ffmpegPath,
        videoPath,
        startMs: cue.startMs,
        endMs: cue.endMs,
        run: runFfmpeg,
      })
      frames.set(String(cue.index), bytes)
    } catch {
      notes.push(`event ${String(cue.index)}: frame grab failed`)
    }
  }
  return { frames, notes }
}

function runFfmpeg(command: string, args: string[]): Promise<{ code: number; stdout: Uint8Array }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] })
    const chunks: Buffer[] = []
    let settled = false
    child.stdout.on("data", (chunk: unknown) => {
      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk))
        return
      }
      if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk))
      }
    })
    const finish = (code: number): void => {
      if (settled) {
        return
      }
      settled = true
      resolvePromise({ code, stdout: Buffer.concat(chunks) })
    }
    const fail = (): void => {
      if (settled) {
        return
      }
      settled = true
      reject(new Error("frame grab failed"))
    }
    child.on("error", fail)
    child.on("close", (code) => {
      finish(typeof code === "number" ? code : 1)
    })
  })
}

function ffmpegReady(): boolean {
  return existsSync(bundledFfmpegPath(process.resourcesPath, process.platform))
}

function sessionRecord(
  request: StartRequest,
  outputPath: string,
  dialogueStyles: ReadonlySet<string>,
  result: RunResult,
  frameNotes: readonly string[],
): StoredSession {
  return {
    mode: request.mode,
    sourcePath: request.sourcePath,
    outputPath,
    draft: result.ass,
    flags: openFlags(reviewLines(request.ass, dialogueStyles, result.saved)),
    report: [...frameNotes, ...result.report],
    saved: storedSaved(result.saved),
  }
}

function storedSaved(saved: SavedRun): StoredSavedRun {
  return {
    completedBatches: saved.completedBatches,
    results: [...saved.results],
    glossary: saved.glossary,
    brief: saved.brief,
    hardIds: saved.hardIds,
    frameIds: saved.frameIds,
    strongIds: saved.strongIds,
  }
}

function reviewLines(ass: string, styles: ReadonlySet<string>, saved: SavedRun): DraftLine[] {
  const english = new Map<string, string>()
  for (const cue of readAss(ass)) {
    if (!styles.has(cue.style)) {
      continue
    }
    english.set(String(cue.index), cue.visible)
  }
  const lines: DraftLine[] = []
  for (const [id, line] of saved.results) {
    const eventIndex = Number(id)
    if (!Number.isInteger(eventIndex)) {
      continue
    }
    const source = english.get(id)
    lines.push({
      eventIndex,
      words: line.words,
      note: noteOf(line.words),
      english: source ?? "",
    })
  }
  lines.sort((left, right) => left.eventIndex - right.eventIndex)
  return lines
}

function noteOf(words: string): string | null {
  const match = NOTE.exec(words)
  if (match === null) {
    return null
  }
  const reason = match[1]
  return reason === undefined ? null : reason
}

function writeSession(sessionId: string, session: StoredSession): void {
  const file = sessionFile(sessionId)
  if (file === null) {
    throw new Error("invalid session")
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(session))
}

function exportSession(sessionId: string): ExportResponse {
  const session = readSession(sessionId)
  if (session === null) {
    return { ok: false, reason: "missing" }
  }
  if (!canExport(session.flags)) {
    return { ok: false, reason: "flags" }
  }
  if (writesSource(session.outputPath, session.sourcePath)) {
    return { ok: false, reason: "write" }
  }
  try {
    writeFileSync(session.outputPath, session.draft, "utf8")
  } catch {
    return { ok: false, reason: "write" }
  }
  return { ok: true, outputPath: session.outputPath }
}

function readSession(sessionId: string): StoredSession | null {
  const file = sessionFile(sessionId)
  if (file === null || !existsSync(file)) {
    return null
  }
  return readStoredSession(readJson(file))
}

function writesSource(outputPath: string, sourcePath: string): boolean {
  return resolve(outputPath) === resolve(sourcePath)
}

function sessionFile(sessionId: string): string | null {
  if (!SESSION_ID.test(sessionId)) {
    return null
  }
  return join(app.getPath("userData"), "sessions", `${sessionId}.json`)
}

function keyPath(): string {
  return join(app.getPath("userData"), "keys.bin")
}

function readKeyFile(): Buffer | null {
  const file = keyPath()
  if (!existsSync(file)) {
    return null
  }
  return readFileSync(file)
}

function writeKeyFile(value: Buffer): void {
  const file = keyPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, value)
}

function readJson(file: string): unknown {
  let text: string
  try {
    text = readFileSync(file, "utf8")
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  return parsed
}

function readStoredSession(value: unknown): StoredSession | null {
  if (!isRecord(value)) {
    return null
  }
  const saved = readStoredSaved(value.saved)
  if (
    saved === null ||
    !isMode(value.mode) ||
    typeof value.sourcePath !== "string" ||
    typeof value.outputPath !== "string" ||
    typeof value.draft !== "string"
  ) {
    return null
  }
  if (!isFlagList(value.flags) || !isStringList(value.report)) {
    return null
  }
  return {
    mode: value.mode,
    sourcePath: value.sourcePath,
    outputPath: value.outputPath,
    draft: value.draft,
    flags: value.flags,
    report: value.report,
    saved,
  }
}

function readStoredSaved(value: unknown): StoredSavedRun | null {
  if (!isRecord(value) || !isFiniteNumber(value.completedBatches)) {
    return null
  }
  if (!isResultEntries(value.results) || !isGlossary(value.glossary)) {
    return null
  }
  if (
    typeof value.brief !== "string" ||
    !isStringList(value.hardIds) ||
    !isStringList(value.frameIds)
  ) {
    return null
  }
  return {
    completedBatches: value.completedBatches,
    results: value.results,
    glossary: value.glossary,
    brief: value.brief,
    hardIds: value.hardIds,
    frameIds: value.frameIds,
    strongIds: isStringList(value.strongIds) ? value.strongIds : [],
  }
}

function readPreflightRequest(value: unknown): PreflightRequest | null {
  if (!isRecord(value)) {
    return null
  }
  if (typeof value.styleListAccepted !== "boolean" || !isFiniteNumber(value.dialogueStyleCount)) {
    return null
  }
  if (
    typeof value.framesRequested !== "boolean" ||
    !isProviderId(value.provider) ||
    !isPreset(value.preset)
  ) {
    return null
  }
  if (!isFiniteNumber(value.dialogueLineCount) || !isFiniteNumber(value.frameCount)) {
    return null
  }
  if (typeof value.sourcePath !== "string" || !isVariant(value.variant)) {
    return null
  }
  return {
    styleListAccepted: value.styleListAccepted,
    dialogueStyleCount: value.dialogueStyleCount,
    framesRequested: value.framesRequested,
    provider: value.provider,
    preset: value.preset,
    dialogueLineCount: value.dialogueLineCount,
    frameCount: value.frameCount,
    sourcePath: value.sourcePath,
    variant: value.variant,
  }
}

function readStartRequest(value: unknown): StartRequest | null {
  if (
    !isRecord(value) ||
    !isMode(value.mode) ||
    typeof value.ass !== "string" ||
    !isStringList(value.dialogueStyles)
  ) {
    return null
  }
  if (
    !isStyleCard(value.card) ||
    !isPreset(value.preset) ||
    !isProviderId(value.provider) ||
    !isVariant(value.variant)
  ) {
    return null
  }
  if (typeof value.sourcePath !== "string" || typeof value.styleListAccepted !== "boolean") {
    return null
  }
  if (!isFrameSetting(value.frameSetting)) {
    return null
  }
  const videoPath = readNullableString(value.videoPath)
  const outputPath = readNullableString(value.outputPath)
  if (videoPath === undefined || outputPath === undefined) {
    return null
  }
  return {
    mode: value.mode,
    ass: value.ass,
    dialogueStyles: value.dialogueStyles,
    card: value.card,
    preset: value.preset,
    provider: value.provider,
    variant: value.variant,
    sourcePath: value.sourcePath,
    styleListAccepted: value.styleListAccepted,
    frameSetting: value.frameSetting,
    videoPath,
    outputPath,
  }
}

function readExportRequest(value: unknown): ExportRequest | null {
  if (!isRecord(value) || typeof value.sessionId !== "string") {
    return null
  }
  return { sessionId: value.sessionId }
}

function readNullableString(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return null
  }
  if (typeof value === "string") {
    return value
  }
  return undefined
}

function isStyleCard(value: unknown): value is StyleCard {
  if (!isRecord(value) || !isVariant(value.variant) || typeof value.seriesId !== "string") {
    return false
  }
  if (
    !isFiniteNumber(value.revision) ||
    !isFiniteNumber(value.cpsLimit) ||
    typeof value.voice !== "string"
  ) {
    return false
  }
  return isRuleList(value.rules)
}

function isRuleList(value: unknown): value is Rule[] {
  return isUnknownArray(value) && value.every(isRule)
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
  if (!isUnknownArray(value) || value.length !== 2) {
    return false
  }
  const id = value[0]
  const line = value[1]
  return typeof id === "string" && isLineResult(line)
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

function isGlossary(value: unknown): value is { source: string; pt: string }[] {
  return isUnknownArray(value) && value.every(isGlossaryEntry)
}

function isGlossaryEntry(value: unknown): value is { source: string; pt: string } {
  return isRecord(value) && typeof value.source === "string" && typeof value.pt === "string"
}

function isMark(value: unknown): value is LineResult["mark"] {
  return value === "clean" || value === "doubt" || value === "hard-call" || value === "mild"
}

function isFlagList(value: unknown): value is Flag[] {
  return isUnknownArray(value) && value.every(isFlag)
}

function isFlag(value: unknown): value is Flag {
  return isRecord(value) && isFiniteNumber(value.eventIndex) && typeof value.open === "boolean"
}

function isStringList(value: unknown): value is string[] {
  return isUnknownArray(value) && value.every((item) => typeof item === "string")
}

function isFrameSetting(value: unknown): value is FrameSetting {
  return value === "none" || value === "marked" || value === "every"
}

function isMode(value: unknown): value is StartRequest["mode"] {
  return value === "autonomous" || value === "assisted"
}

function isPreset(value: unknown): value is Preset {
  return value === "save" || value === "balanced" || value === "best"
}

function isVariant(value: unknown): value is Variant {
  return value === "pt-pt" || value === "pt-br"
}

function isProviderId(value: unknown): value is ProviderId {
  return PROVIDERS.some((provider) => provider === value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}

function argument(args: readonly unknown[], index: number): unknown {
  if (index < 0 || index >= args.length) {
    return undefined
  }
  return args[index]
}

void app.whenReady().then(boot)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
