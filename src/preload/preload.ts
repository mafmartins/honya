import { contextBridge, ipcRenderer } from "electron"
import type { PreflightResult } from "../core/pipeline/preflight"
import type { ProviderId } from "../core/pipeline/types"
import type { Flag } from "../core/review/review"
import type {
  ExportRequest,
  ExportResponse,
  PreflightRequest,
  StartRequest,
  StartResponse,
} from "../main/main"

interface ModelPair {
  cheap: string
  strong: string
}

interface HonyaApi {
  hasKey(provider: ProviderId): Promise<boolean>
  setKey(provider: ProviderId, key: string): Promise<void>
  getModels(provider: ProviderId): Promise<ModelPair>
  preflight(input: PreflightRequest): Promise<PreflightResult>
  start(input: StartRequest): Promise<StartResponse>
  export(input: ExportRequest): Promise<ExportResponse>
}

const honya: HonyaApi = {
  hasKey(provider) {
    return read("honya:has-key", [provider], readBoolean)
  },
  setKey(provider, key) {
    return invoke("honya:set-key", [provider, key]).then(() => undefined)
  },
  getModels(provider) {
    return read("honya:get-models", [provider], readModelPair)
  },
  preflight(input) {
    return read("honya:preflight", [input], readPreflightResult)
  },
  start(input) {
    return read("honya:start", [input], readStartResponse)
  },
  export(input) {
    return read("honya:export", [input], readExportResponse)
  },
}

contextBridge.exposeInMainWorld("honya", honya)

declare global {
  interface Window {
    honya: HonyaApi
  }
}

function invoke(channel: string, args: readonly unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ipcRenderer.invoke(channel, ...args).then(
      (value: unknown) => {
        resolve(value)
      },
      (reason: unknown) => {
        reject(toError(reason))
      },
    )
  })
}

async function read<T>(
  channel: string,
  args: readonly unknown[],
  parse: (value: unknown) => T | null,
): Promise<T> {
  const value = await invoke(channel, args)
  const parsed = parse(value)
  if (parsed === null) {
    throw new Error(`invalid ${channel} response`)
  }
  return parsed
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

function readModelPair(value: unknown): ModelPair | null {
  if (!isRecord(value) || typeof value.cheap !== "string" || typeof value.strong !== "string") {
    return null
  }
  return { cheap: value.cheap, strong: value.strong }
}

function readPreflightResult(value: unknown): PreflightResult | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null
  }
  if (!value.ok) {
    return isPreflightReason(value.reason) ? { ok: false, reason: value.reason } : null
  }
  if (!isRecord(value.summary)) {
    return null
  }
  const summary = value.summary
  if (!isProviderId(summary.provider) || !isPreset(summary.preset)) {
    return null
  }
  if (!isFiniteNumber(summary.dialogueLineCount) || !isFiniteNumber(summary.frameCount)) {
    return null
  }
  if (typeof summary.outputPath !== "string") {
    return null
  }
  return {
    ok: true,
    summary: {
      provider: summary.provider,
      preset: summary.preset,
      dialogueLineCount: summary.dialogueLineCount,
      frameCount: summary.frameCount,
      outputPath: summary.outputPath,
    },
  }
}

function readStartResponse(value: unknown): StartResponse | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null
  }
  if (!value.ok) {
    if (value.reason === "write" && typeof value.sessionId === "string") {
      return { ok: false, reason: "write", sessionId: value.sessionId }
    }
    return isPreflightReason(value.reason) ? { ok: false, reason: value.reason } : null
  }
  if (value.mode === "autonomous") {
    if (
      typeof value.sessionId !== "string" ||
      typeof value.outputPath !== "string" ||
      typeof value.draft !== "string"
    ) {
      return null
    }
    return {
      ok: true,
      mode: "autonomous",
      sessionId: value.sessionId,
      outputPath: value.outputPath,
      draft: value.draft,
    }
  }
  if (
    value.mode !== "assisted" ||
    typeof value.sessionId !== "string" ||
    typeof value.draft !== "string"
  ) {
    return null
  }
  if (!isFlagList(value.flags)) {
    return null
  }
  return {
    ok: true,
    mode: "assisted",
    sessionId: value.sessionId,
    draft: value.draft,
    flags: value.flags,
  }
}

function readExportResponse(value: unknown): ExportResponse | null {
  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return null
  }
  if (value.ok) {
    return typeof value.outputPath === "string" ? { ok: true, outputPath: value.outputPath } : null
  }
  if (value.reason === "flags" || value.reason === "missing" || value.reason === "write") {
    return { ok: false, reason: value.reason }
  }
  return null
}

function isFlagList(value: unknown): value is Flag[] {
  return isUnknownArray(value) && value.every(isFlag)
}

function isFlag(value: unknown): value is Flag {
  return isRecord(value) && isFiniteNumber(value.eventIndex) && typeof value.open === "boolean"
}

function isPreflightReason(value: unknown): value is "styles" | "key" | "no-dialogue" | "ffmpeg" {
  return value === "styles" || value === "key" || value === "no-dialogue" || value === "ffmpeg"
}

function isProviderId(value: unknown): value is ProviderId {
  return value === "claude" || value === "gpt" || value === "gemini" || value === "mistral"
}

function isPreset(value: unknown): value is "save" | "balanced" | "best" {
  return value === "save" || value === "balanced" || value === "best"
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

function toError(reason: unknown): Error {
  if (reason instanceof Error) {
    return reason
  }
  return new Error("ipc failed")
}
