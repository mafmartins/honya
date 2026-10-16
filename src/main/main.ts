import { app, BrowserWindow, dialog, safeStorage, shell } from "electron"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { DialogueCue } from "../core/ass/script"
import { grabFrame } from "../core/frames/grab"
import { bundledFfmpegPath } from "../core/frames/path"
import { compileCard } from "../core/library/card"
import { createFileStore } from "../core/library/fileStore"
import type { StyleCard } from "../core/library/types"
import type { Completer } from "../core/pipeline/run"
import type { ProviderId, Variant } from "../core/pipeline/types"
import { completeChat, completeText, type ChatInput } from "../core/providers/complete"
import { providerError } from "../core/providers/errors"
import { withRetry } from "../core/providers/retry"
import { createProfileHandlers, type ProfileHandlers } from "./ipc/profiles"
import { registerSetupIpc } from "./ipc/register"
import { registerTranslateIpc } from "./ipc/translate"
import { createModelStore, type ModelStore } from "./modelStore"
import { createSecretStore, type SecretStore } from "./secrets"
import { createReviewHandlers } from "./translate/review"
import { createRunner, type TranslateEvent } from "./translate/runner"
import { createSessionStore } from "./translate/session"

function boot(): void {
  const secrets = createSecretStore(safeStorage, { read: readKeyFile, write: writeKeyFile })
  const models = createModelStore({ read: readModelFile, write: writeModelFile })
  const store = createFileStore(join(app.getPath("userData"), "profiles"))
  const profiles = createProfileHandlers(store)
  const sessions = createSessionStore(join(app.getPath("userData"), "sessions"))
  registerSetupIpc({ open: openFile, secrets, models, profiles })
  const runner = createRunner({
    sessions,
    loadCard: (variant, seriesId) => loadCard(profiles, variant, seriesId),
    hasKey: (provider) => secrets.hasKey(provider),
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
  const rules = profiles.loadSeriesRules(variant, seriesId)
  const card = compileCard(base, { id: seriesId, variant, name: found.name, rules })
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
  const chat: ChatInput = {
    provider,
    model: request.tier === "cheap" ? pair.cheap : pair.strong,
    apiKey,
    prompt: request.prompt,
    fetch,
  }
  if (request.tier === "cheap") {
    chat.effort = "low"
  }
  if (request.images !== undefined) {
    chat.images = request.images.map((image) => ({ id: image.id, png: image.bytes }))
  }
  return completeChat(chat)
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
): Promise<{ frames: Map<string, Uint8Array>; notes: string[] }> {
  const frames = new Map<string, Uint8Array>()
  const notes: string[] = []
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
