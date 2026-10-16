import { contextBridge, ipcRenderer } from "electron"
import type { PreflightResult } from "../core/pipeline/preflight"
import { readBaseProfile } from "../core/library/guards"
import type { ProviderId } from "../core/pipeline/types"
import type { Flag } from "../core/review/review"
import type {
  ExportRequest,
  ExportResponse,
  PreflightRequest,
  StartRequest,
  StartResponse,
} from "../main/main"
import type { SetupApi } from "../shared/api"
import {
  ipcMessage,
  readBoolean,
  readLoadedBase,
  readModelPair,
  readNothing,
  readPickedExample,
  readPickedScript,
  readPickedVideo,
  readRules,
  readSeriesList,
  readSeriesSummary,
} from "./readers"

interface HonyaApi extends SetupApi {
  preflight(input: PreflightRequest): Promise<PreflightResult>
  start(input: StartRequest): Promise<StartResponse>
  export(input: ExportRequest): Promise<ExportResponse>
}

const honya: HonyaApi = {
  pickScript: () => picked("honya:pick-script", [], readPickedScript),
  pickVideo: () => picked("honya:pick-video", [], readPickedVideo),
  pickExample: () => picked("honya:pick-example", [], readPickedExample),
  hasKey: (provider) => read("honya:has-key", [provider], readBoolean),
  setKey: (provider, key) => read("honya:set-key", [provider, key], readNothing),
  removeKey: (provider) => read("honya:remove-key", [provider], readNothing),
  getModels: (provider) => read("honya:get-models", [provider], readModelPair),
  setModels: (provider, pair) => read("honya:set-models", [provider, pair], readModelPair),
  resetModels: (provider) => read("honya:reset-models", [provider], readModelPair),
  listSeries: (variant) => read("honya:list-series", [variant], readSeriesList),
  createSeries: (variant, name) => read("honya:create-series", [variant, name], readSeriesSummary),
  renameSeries: (variant, id, name) =>
    read("honya:rename-series", [variant, id, name], readSeriesSummary),
  deleteSeries: (variant, id) => read("honya:delete-series", [variant, id], readNothing),
  loadSeriesRules: (variant, id) => read("honya:load-series-rules", [variant, id], readRules),
  saveSeriesRules: (variant, id, rules) =>
    read("honya:save-series-rules", [variant, id, rules], readNothing),
  loadBase: (variant) => read("honya:load-base", [variant], readLoadedBase),
  saveBase: (base) => read("honya:save-base", [base], readBaseProfile),
  importExample: (variant, name, text, styles) =>
    read("honya:import-example", [variant, name, text, styles], readBaseProfile),
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
        reject(new Error(ipcMessage(reason)))
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

async function picked<T>(
  channel: string,
  args: readonly unknown[],
  parse: (value: unknown) => { value: T | null } | null,
): Promise<T | null> {
  const result = await read(channel, args, parse)
  return result.value
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
