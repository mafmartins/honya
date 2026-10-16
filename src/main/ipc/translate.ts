import { ipcMain } from "electron"
import { isRecord, isVariant } from "../../core/library/guards"
import type { Variant } from "../../core/library/types"
import type { Preset, ProviderId } from "../../core/pipeline/types"
import { isEventIndex, readProposal } from "../../core/review/proposal"
import type { Proposal } from "../../core/review/review"
import { prepareTranslation } from "../translate/prepare"
import type { ReviewHandlers } from "../translate/review"
import type { Runner, TranslateRequest } from "../translate/runner"
import type { SessionStore } from "../translate/session"
import type { UnfinishedSession } from "../../shared/api"

export interface TranslateIpcDeps {
  runner: Runner
  review: ReviewHandlers
  sessions: SessionStore
  readScript: (path: string) => string
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NOTE = /\{note: [^}]*\}/

export function registerTranslateIpc(deps: TranslateIpcDeps): void {
  const { runner, review, sessions } = deps
  handle("honya:translate-prepare", (args) =>
    prepareTranslation(text(args, 0), variant(args, 1), deps.readScript),
  )
  handle("honya:translate-start", (args) => runner.start(request(args[0])))
  handle("honya:translate-resume", (args) => runner.resume(sessionId(args, 0)))
  handle("honya:translate-stop", () => {
    runner.stop()
    return null
  })
  handle("honya:translate-latest", () => latestUnfinished(sessions))
  handle("honya:translate-discard", (args) => {
    review.discard(sessionId(args, 0))
    return null
  })
  handle("honya:translate-finish", (args) => review.finish(sessionId(args, 0)))
  handle("honya:translate-reveal", (args) => {
    review.reveal(sessionId(args, 0))
    return null
  })
  handle("honya:review-load", (args) => review.load(sessionId(args, 0)))
  handle("honya:review-accept", (args) => {
    const words = args[2]
    if (words !== null && typeof words !== "string") {
      throw new Error("Invalid text argument.")
    }
    return review.accept(sessionId(args, 0), eventIndex(args, 1), words)
  })
  handle("honya:review-check", (args) =>
    review.check(sessionId(args, 0), eventIndex(args, 1), text(args, 2)),
  )
  handle("honya:review-confirm", (args) => {
    const proposal: Proposal | null = readProposal(args[3])
    if (proposal === null) {
      throw new Error("Invalid proposal.")
    }
    const apply = args[4]
    if (typeof apply !== "boolean") {
      throw new Error("Invalid choice.")
    }
    return review.confirm(
      sessionId(args, 0),
      eventIndex(args, 1),
      text(args, 2),
      proposal,
      apply,
      ruleTarget(args[5]),
    )
  })
}

export function latestUnfinished(sessions: SessionStore): UnfinishedSession | null {
  const session = sessions.latestUnfinished()
  if (session === null) {
    return null
  }
  const accepted = new Set(session.review.accepted)
  let openFlags = 0
  for (const [id, line] of session.saved.results) {
    if (NOTE.test(line.words) && !accepted.has(Number(id))) {
      openFlags += 1
    }
  }
  return {
    id: session.id,
    scriptName: session.scriptName,
    seriesName: session.seriesName,
    phase: session.phase,
    completedBatches: session.saved.completedBatches,
    totalBatches: session.totalBatches,
    openFlags,
  }
}

function request(value: unknown): TranslateRequest {
  if (
    !isRecord(value) ||
    typeof value.scriptPath !== "string" ||
    !isVariant(value.variant) ||
    typeof value.seriesId !== "string" ||
    !isProvider(value.provider) ||
    !isPreset(value.preset) ||
    !isFrameSetting(value.frameSetting) ||
    !(value.videoPath === null || typeof value.videoPath === "string") ||
    !Array.isArray(value.dialogueStyles) ||
    !value.dialogueStyles.every((style) => typeof style === "string")
  ) {
    throw new Error("Invalid translation request.")
  }
  return {
    scriptPath: value.scriptPath,
    variant: value.variant,
    seriesId: value.seriesId,
    provider: value.provider,
    preset: value.preset,
    frameSetting: value.frameSetting,
    videoPath: value.videoPath,
    dialogueStyles: value.dialogueStyles.filter((style) => typeof style === "string"),
  }
}

function ruleTarget(value: unknown): "series" | "base" | null {
  if (value === null || value === "series" || value === "base") {
    return value
  }
  throw new Error("Invalid rule target.")
}

function isProvider(value: unknown): value is ProviderId {
  return value === "claude" || value === "gpt" || value === "gemini" || value === "mistral"
}

function isPreset(value: unknown): value is Preset {
  return value === "save" || value === "balanced" || value === "best"
}

function isFrameSetting(value: unknown): value is TranslateRequest["frameSetting"] {
  return value === "none" || value === "marked" || value === "every"
}

function handle(channel: string, run: (args: readonly unknown[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]) => run(args))
}

function sessionId(args: readonly unknown[], index: number): string {
  const value = args[index]
  if (typeof value !== "string" || !SESSION_ID.test(value)) {
    throw new Error("Invalid session id.")
  }
  return value
}

function eventIndex(args: readonly unknown[], index: number): number {
  const value = args[index]
  if (!isEventIndex(value)) {
    throw new Error("Invalid line number.")
  }
  return value
}

function variant(args: readonly unknown[], index: number): Variant {
  const value = args[index]
  if (!isVariant(value)) {
    throw new Error("Invalid variant.")
  }
  return value
}

function text(args: readonly unknown[], index: number): string {
  const value = args[index]
  if (typeof value !== "string") {
    throw new Error("Invalid text argument.")
  }
  return value
}
