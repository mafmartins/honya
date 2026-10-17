import { app, BrowserWindow, dialog, safeStorage, shell } from "electron"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { DialogueCue } from "../core/ass/script"
import { grabFrame } from "../core/frames/grab"
import { bundledFfmpegPath, devFfmpegPath } from "../core/frames/path"
import { compileCard } from "../core/library/card"
import { createFileStore } from "../core/library/fileStore"
import type { StyleCard } from "../core/library/types"
import type { Completer } from "../core/pipeline/run"
import type { ProviderId, Variant } from "../core/pipeline/types"
import { completeJson, completeText, type ChatInput } from "../core/providers/complete"
import { providerError } from "../core/providers/errors"
import { withRetry } from "../core/providers/retry"
import { createProfileHandlers, type ProfileHandlers } from "./ipc/profiles"
import { registerSetupIpc } from "./ipc/register"
import { registerTranslateIpc } from "./ipc/translate"
import { createModelStore, type ModelStore } from "./modelStore"
import { createSecretStore, type SecretStore } from "./secrets"
import { createLearner } from "./learn"
import { createReviewHandlers } from "./translate/review"
import { createRunner, type TranslateEvent } from "./translate/runner"
import { createSessionStore } from "./translate/session"
import { callEntry, problemEntry } from "./providerLog"

function boot(): void {
  const secrets = createSecretStore(safeStorage, { read: readKeyFile, write: writeKeyFile })
  const models = createModelStore({ read: readModelFile, write: writeModelFile })
  const store = createFileStore(join(app.getPath("userData"), "profiles"))
  const profiles = createProfileHandlers(store)
  const sessions = createSessionStore(join(app.getPath("userData"), "sessions"))
  const learner = createLearner({
    knownRules: (variant, seriesId) => [
      ...profiles.loadBase(variant).base.rules,
      ...profiles.loadSeriesRules(variant, seriesId),
    ],
    completerFor: (provider) =>
      withRetry(
        (request) => completeWithProvider(secrets, models, provider, request),
        sleep,
        () => undefined,
      ),
  })
  registerSetupIpc({ open: openFile, secrets, models, profiles, learner })
  const runner = createRunner({
    sessions,
    loadCard: (variant, seriesId) => loadCard(profiles, variant, seriesId),
    hasKey: (provider) => secrets.hasKey(provider),
    logProblem: (provider, problem) => {
      logLine(problemEntry({ time: new Date().toISOString(), provider, ...problem }))
    },
    completerFor: (provider, onRetry) =>
      withRetry(
        (request) => completeWithProvider(secrets, models, provider, request),
        sleep,
        onRetry,
      ),
    grabFrames,
    ffmpegReady,
    readScript: (path) => readFileSync(path, "utf8"),
    now: () => Date.now(),
    newId: () => randomUUID(),
    sleep,
    emit: emitToWindows,
  })
  const review = createReviewHandlers({
    sessions,
    profiles,
    ask: (provider) => (prompt) => askCheap(secrets, models, provider, prompt),
    writeFile: (path, text) => {
      writeFileSync(path, text, "utf8")
    },
    reveal: (path) => {
      shell.showItemInFolder(path)
    },
    now: () => Date.now(),
  })
  registerTranslateIpc({
    runner,
    review,
    sessions,
    readScript: (path) => readFileSync(path, "utf8"),
  })
  openWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openWindow()
    }
  })
}

function emitToWindows(event: TranslateEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send("honya:translate-event", event)
    }
  }
}

function loadCard(
  profiles: ProfileHandlers,
  variant: Variant,
  seriesId: string,
): { card: StyleCard; seriesName: string } {
  const found = profiles.listSeries(variant).series.find((item) => item.id === seriesId)
  if (found === undefined) {
    throw new Error("That series no longer exists.")
  }
  const { base } = profiles.loadBase(variant)
  const card = compileCard(base, profiles.loadSeries(variant, seriesId))
  return { card, seriesName: found.name }
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

async function completeWithProvider(
  secrets: SecretStore,
  models: ModelStore,
  provider: ProviderId,
  request: Parameters<Completer>[0],
): ReturnType<Completer> {
  const apiKey = secrets.getKey(provider)
  if (apiKey === null) {
    throw providerError(provider, 401, null)
  }
  const pair = models.get(provider)
  // The cheap model answers most lines, so it thinks little; the strong model only
  // sees the few flagged lines and gets a moderate amount.
  const chat: ChatInput = {
    provider,
    model: request.tier === "cheap" ? pair.cheap : pair.strong,
    apiKey,
    system: request.system,
    prompt: request.prompt,
    schema: request.schema,
    effort: request.tier === "cheap" ? "low" : "medium",
    fetch,
  }
  if (request.images !== undefined) {
    chat.images = request.images.map((image) => ({ id: image.id, png: image.bytes }))
  }
  const reply = await completeJson(chat)
  const call = {
    time: new Date().toISOString(),
    provider,
    model: chat.model,
    tier: request.tier,
    usage: reply.usage,
  }
  const spent = reply.usage === null ? {} : { spent: { model: chat.model, usage: reply.usage } }
  if ("refused" in reply) {
    logLine(callEntry({ ...call, problem: reply.reason, excerpt: reply.excerpt ?? "" }))
    return reply.excerpt === undefined
      ? { refused: true, reason: reply.reason, ...spent }
      : { refused: true, reason: reply.reason, excerpt: reply.excerpt, ...spent }
  }
  logLine(callEntry(call))
  return { value: reply.value, ...spent }
}

// Every provider request (with its token counts) and every unusable reply goes to
// <userData>/logs/providers.log, so a run's cost and any English fallback can be
// explained. Logging never breaks a translation.
function logLine(entry: string): void {
  try {
    const folder = join(app.getPath("userData"), "logs")
    mkdirSync(folder, { recursive: true })
    appendFileSync(join(folder, "providers.log"), `${entry}\n`, "utf8")
  } catch {
    // ignore: the log is only a diagnostic
  }
}

async function askCheap(
  secrets: SecretStore,
  models: ModelStore,
  provider: ProviderId,
  prompt: string,
): Promise<{ text: string } | { refused: true }> {
  const apiKey = secrets.getKey(provider)
  if (apiKey === null) {
    return { refused: true }
  }
  return completeText({
    provider,
    model: models.get(provider).cheap,
    apiKey,
    prompt,
    fetch,
    effort: "low",
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms)
  })
}

async function grabFrames(
  cues: readonly DialogueCue[],
  videoPath: string,
  _setting: "marked" | "every",
  progress: (done: number, total: number) => void,
  shouldStop: () => boolean,
): Promise<{ frames: Map<string, Uint8Array>; notes: string[] }> {
  const frames = new Map<string, Uint8Array>()
  const notes: string[] = []
  const ffmpegPath = ffmpegLocation()
  for (const cue of cues) {
    if (shouldStop()) {
      break
    }
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
    progress(frames.size + notes.length, cues.length)
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
  return existsSync(ffmpegLocation())
}

function ffmpegLocation(): string {
  return app.isPackaged
    ? bundledFfmpegPath(process.resourcesPath, process.platform)
    : devFfmpegPath(app.getAppPath(), process.platform)
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

void app.whenReady().then(boot)

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
