import { basename } from "node:path"
import { readAss, type DialogueCue } from "../../core/ass/script"
import type { StyleCard, Variant } from "../../core/library/types"
import { proposedOutputPath } from "../../core/pipeline/preflight"
import {
  type FrameProvider,
  resumeTranslation,
  runTranslation,
  totalBatches,
  type Completer,
  type LineResult,
  type RunEvent,
  type RunInput,
  type RunResult,
} from "../../core/pipeline/run"
import type { Preset, ProviderId } from "../../core/pipeline/types"
import { ProviderError, providerName } from "../../core/providers/errors"
import { fromSavedRun, toSavedRun, type SessionStore, type TranslateSession } from "./session"

export interface TranslateRequest {
  scriptPath: string
  variant: Variant
  seriesId: string
  provider: ProviderId
  preset: Preset
  frameSetting: "none" | "marked" | "every"
  videoPath: string | null
  dialogueStyles: string[]
}

export interface LiveLine {
  eventIndex: number
  english: string
  words: string
  note: string | null
}

export type TranslateEvent =
  | { type: "activity"; sessionId: string; text: string }
  | {
      type: "batch"
      sessionId: string
      index: number
      total: number
      linesDone: number
      lineTotal: number
      lines: LiveLine[]
    }
  | { type: "stopped"; sessionId: string }
  | { type: "failed"; sessionId: string; message: string }
  | { type: "finished"; sessionId: string; openFlags: number }

export interface RunnerDeps {
  sessions: SessionStore
  loadCard(variant: Variant, seriesId: string): { card: StyleCard; seriesName: string }
  hasKey(provider: ProviderId): boolean
  completerFor(
    provider: ProviderId,
    onRetry: (delayMs: number, error: ProviderError) => void,
  ): Completer
  grabFrames(
    cues: readonly DialogueCue[],
    videoPath: string,
    setting: "marked" | "every",
    progress: (done: number, total: number) => void,
  ): Promise<{ frames: Map<string, Uint8Array>; notes: string[] }>
  ffmpegReady(): boolean
  readScript(path: string): string
  now(): number
  newId(): string
  sleep(ms: number): Promise<void>
  emit(event: TranslateEvent): void
}

export interface Runner {
  start(request: TranslateRequest): Promise<string>
  resume(id: string): Promise<string>
  stop(): void
  activeId(): string | null
  idle(): Promise<void>
}

interface BatchDone {
  index: number
  total: number
  lines: LineResult[]
}

const NOTE = /\{note: ([^}]*)\}/
const VIDEO_MISSING_NOTE = "video missing on resume: continued without pictures"

export function createRunner(deps: RunnerDeps): Runner {
  let active: string | null = null
  let stopRequested = false
  let work: Promise<void> = Promise.resolve()

  const requireKey = (provider: ProviderId): void => {
    if (!deps.hasKey(provider)) {
      throw new Error(`No ${providerName(provider)} key saved. Add it on the start screen.`)
    }
  }

  const requireFfmpeg = (setting: string, videoPath: string | null): void => {
    if (setting !== "none" && videoPath !== null && !deps.ffmpegReady()) {
      throw new Error(
        "Honya's bundled ffmpeg is missing, so frames can't be grabbed. Set frames to none or reinstall Honya.",
      )
    }
  }

  const emit = (event: TranslateEvent): void => {
    try {
      deps.emit(event)
    } catch {
      // a failing listener must not break the run
    }
  }

  const begin = (session: TranslateSession, resuming: boolean): string => {
    active = session.id
    stopRequested = false
    work = execute(session, resuming)
      .catch(() => undefined)
      .finally(() => {
        active = null
      })
    return session.id
  }

  const execute = async (session: TranslateSession, resuming: boolean): Promise<void> => {
    try {
      await runSession(session, resuming)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      try {
        session.phase = "failed"
        session.error = message
        deps.sessions.save(session)
      } catch {
        // the failure is still reported below
      }
      emit({ type: "failed", sessionId: session.id, message })
    }
  }

  const activity = (session: TranslateSession, text: string): void => {
    emit({ type: "activity", sessionId: session.id, text })
  }

  const runSession = async (session: TranslateSession, resuming: boolean): Promise<void> => {
    const ass = session.scriptText
    const styles = new Set(session.dialogueStyles)
    const cues = readAss(ass).filter((cue) => styles.has(cue.style))
    const english = new Map(cues.map((cue) => [String(cue.index), cue.visible]))

    const frames = frameProvider(session, cues, resuming)
    const complete = deps.completerFor(session.provider, (delayMs, error) => {
      const seconds = Math.round(delayMs / 1000)
      const text =
        error.kind === "rate-limit"
          ? `Rate limited, retrying in ${String(seconds)} s`
          : `${providerName(error.provider)} didn't answer, retrying in ${String(seconds)} s`
      activity(session, text)
    })

    const batchDone: { value: BatchDone | null } = { value: null }
    const takeBatch = (): BatchDone | null => batchDone.value
    const resetBatch = (): void => {
      batchDone.value = null
    }
    const onEvent = (event: RunEvent): void => {
      switch (event.type) {
        case "brief":
          activity(session, "Reading the episode")
          break
        case "batch":
          activity(session, `Translating batch ${String(event.index)} of ${String(event.total)}`)
          break
        case "escalate":
          activity(session, `Asking the strong model about ${String(event.count)} lines`)
          break
        case "batch-done":
          batchDone.value = { index: event.index, total: event.total, lines: event.lines }
          break
      }
    }

    let completed = session.saved.completedBatches
    let needsBrief = completed === 0 && session.saved.brief === ""
    let tick = deps.now()
    for (;;) {
      resetBatch()
      const input: RunInput = {
        ass,
        dialogueStyles: styles,
        card: session.card,
        preset: session.preset,
        complete,
        sleep: (ms) => deps.sleep(ms),
        stopAfterBatches: completed + 1,
        frameSetting: session.frameSetting,
        frames,
        onEvent,
      }
      const result: RunResult = needsBrief
        ? await runTranslation(input)
        : await resumeTranslation(toSavedRun(session.saved), input)
      needsBrief = false
      const progressed = result.saved.completedBatches > completed
      completed = result.saved.completedBatches
      const now = deps.now()
      session.elapsedMs += now - tick
      tick = now
      session.saved = fromSavedRun(result.saved)
      session.phase = "running"
      deps.sessions.save(session)

      const done = takeBatch()
      if (done !== null) {
        emit({
          type: "batch",
          sessionId: session.id,
          index: done.index,
          total: done.total,
          linesDone: session.saved.results.length,
          lineTotal: session.dialogueLines,
          lines: done.lines.map((line) => liveLine(line, english)),
        })
      }

      if (completed >= session.totalBatches) {
        break
      }
      if (!progressed) {
        throw new Error("The translation made no progress.")
      }
      if (stopRequested) {
        session.phase = "stopped"
        deps.sessions.save(session)
        emit({ type: "stopped", sessionId: session.id })
        return
      }
    }

    session.phase = "review"
    session.error = null
    deps.sessions.save(session)
    emit({
      type: "finished",
      sessionId: session.id,
      openFlags: session.saved.results.filter(([, line]) => NOTE.test(line.words)).length,
    })
  }

  // Grabs the frames one request needs, when the pipeline asks for them, and keeps them
  // for the rest of the run so a retried or escalated request doesn't grab them again.
  const frameProvider = (
    session: TranslateSession,
    cues: readonly DialogueCue[],
    resuming: boolean,
  ): FrameProvider => {
    const kept = new Map<string, Uint8Array>()
    const cueById = new Map(cues.map((cue) => [String(cue.index), cue]))
    let videoMissing = false
    return async (ids) => {
      const videoPath = session.videoPath
      if (session.frameSetting === "none" || videoPath === null || videoMissing) {
        return kept
      }
      const missing = ids.flatMap((id) => {
        const cue = cueById.get(id)
        return cue === undefined || kept.has(id) ? [] : [cue]
      })
      if (missing.length > 0) {
        const counted = (done: number, total: number): void => {
          activity(session, `Grabbing frames · ${String(done)} of ${String(total)}`)
        }
        counted(0, missing.length)
        try {
          const grabbed = await deps.grabFrames(missing, videoPath, session.frameSetting, counted)
          for (const [id, bytes] of grabbed.frames) {
            kept.set(id, bytes)
          }
          session.frameNotes.push(...grabbed.notes)
        } catch (error) {
          if (!resuming) {
            throw error
          }
          videoMissing = true
          session.frameNotes.push(VIDEO_MISSING_NOTE)
        }
        session.framesUsed = kept.size
      }
      return kept
    }
  }

  const startRun = (request: TranslateRequest): string => {
    if (active !== null) {
      throw new Error("A translation is already running.")
    }
    requireKey(request.provider)
    const scriptText = deps.readScript(request.scriptPath)
    const { card, seriesName } = deps.loadCard(request.variant, request.seriesId)
    const styles = new Set(request.dialogueStyles)
    const dialogueLines = readAss(scriptText).filter((cue) => styles.has(cue.style)).length
    if (dialogueLines === 0) {
      throw new Error("This script has no dialogue lines in the chosen styles.")
    }
    requireFfmpeg(request.frameSetting, request.videoPath)
    const session: TranslateSession = {
      version: 2,
      id: deps.newId(),
      startedAt: new Date(deps.now()).toISOString(),
      phase: "running",
      scriptPath: request.scriptPath,
      scriptName: basename(request.scriptPath),
      scriptText,
      seriesId: request.seriesId,
      seriesName,
      variant: request.variant,
      provider: request.provider,
      preset: request.preset,
      frameSetting: request.frameSetting,
      videoPath: request.videoPath,
      outputPath: proposedOutputPath(request.scriptPath, request.variant),
      dialogueStyles: request.dialogueStyles,
      card,
      dialogueLines,
      totalBatches: totalBatches(dialogueLines),
      saved: {
        completedBatches: 0,
        results: [],
        glossary: [],
        brief: "",
        hardIds: [],
        frameIds: [],
        strongIds: [],
      },
      review: { edits: {}, accepted: [], rules: [] },
      frameNotes: [],
      framesUsed: 0,
      elapsedMs: 0,
      error: null,
    }
    deps.sessions.save(session)
    return begin(session, false)
  }

  const resumeRun = (id: string): string => {
    if (active !== null) {
      throw new Error("A translation is already running.")
    }
    const session = deps.sessions.load(id)
    if (session === null) {
      throw new Error("That translation no longer exists.")
    }
    if (session.phase === "done") {
      throw new Error("That translation is already finished.")
    }
    if (deps.readScript(session.scriptPath) !== session.scriptText) {
      throw new Error(`${session.scriptName} changed since this translation started.`)
    }
    if (session.phase === "review") {
      const openFlags = session.saved.results.filter(([, line]) => NOTE.test(line.words)).length
      active = id
      work = new Promise<void>((resolve) => {
        setTimeout(() => {
          emit({ type: "finished", sessionId: id, openFlags })
          active = null
          resolve()
        }, 0)
      })
      return id
    }
    requireKey(session.provider)
    requireFfmpeg(session.frameSetting, session.videoPath)
    session.error = null
    session.phase = "running"
    deps.sessions.save(session)
    return begin(session, true)
  }

  return {
    start(request) {
      return settle(() => startRun(request))
    },

    resume(id) {
      return settle(() => resumeRun(id))
    },

    stop() {
      if (active === null || stopRequested) {
        return
      }
      stopRequested = true
      emit({ type: "activity", sessionId: active, text: "Stopping after this batch…" })
    },

    activeId() {
      return active
    },

    async idle() {
      await work
    },
  }
}

function liveLine(line: LineResult, english: ReadonlyMap<string, string>): LiveLine {
  const match = NOTE.exec(line.words)
  const words = match === null ? line.words : line.words.replace(NOTE, "").trim()
  return {
    eventIndex: Number(line.id),
    english: english.get(line.id) ?? "",
    words,
    note: match?.[1] ?? null,
  }
}

function settle<T>(run: () => T): Promise<T> {
  try {
    return Promise.resolve(run())
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)))
  }
}
