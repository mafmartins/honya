import { contextBridge, ipcRenderer } from "electron"
import { readBaseProfile } from "../core/library/guards"
import type { HonyaApi } from "../shared/api"
import {
  ipcMessage,
  readBoolean,
  readCheckResult,
  readFinishResult,
  readCombined,
  readLearned,
  readLoadedBase,
  readModelPair,
  readNothing,
  readPickedExample,
  readPickedScript,
  readPickedVideo,
  readPreparedScript,
  readReviewView,
  readRules,
  readSeriesList,
  readSeriesSummary,
  readString,
  readTranslateEvent,
  readUnfinished,
} from "./readers"

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
  learnFromScript: (variant, seriesId, provider, portuguese, english) =>
    read(
      "honya:learn-from-script",
      [variant, seriesId, provider, portuguese, english],
      readLearned,
    ),
  combineLearned: (provider, learned) =>
    read("honya:combine-learned", [provider, learned], readCombined),
  prepareTranslation: (scriptPath, variant) =>
    read("honya:translate-prepare", [scriptPath, variant], readPreparedScript),
  startTranslation: (request) => read("honya:translate-start", [request], readString),
  resumeTranslation: (id) => read("honya:translate-resume", [id], readString),
  stopTranslation: () => read("honya:translate-stop", [], readNothing),
  latestUnfinished: () => picked("honya:translate-latest", [], readUnfinished),
  discardTranslation: (id) => read("honya:translate-discard", [id], readNothing),
  loadReview: (id) => read("honya:review-load", [id], readReviewView),
  acceptLine: (id, eventIndex, words) =>
    read("honya:review-accept", [id, eventIndex, words], readReviewView),
  checkEdit: (id, eventIndex, words) =>
    read("honya:review-check", [id, eventIndex, words], readCheckResult),
  confirmEdit: (id, eventIndex, words, proposal, applyOthers, ruleTarget) =>
    read(
      "honya:review-confirm",
      [id, eventIndex, words, proposal, applyOthers, ruleTarget],
      readReviewView,
    ),
  finishTranslation: (id) => read("honya:translate-finish", [id], readFinishResult),
  revealOutput: (id) => read("honya:translate-reveal", [id], readNothing),
  onTranslateEvent(listener) {
    const handler = (_event: unknown, value: unknown): void => {
      const event = readTranslateEvent(value)
      if (event !== null) {
        listener(event)
      }
    }
    ipcRenderer.on("honya:translate-event", handler)
    return () => {
      ipcRenderer.removeListener("honya:translate-event", handler)
    }
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
