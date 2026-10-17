import { contextBridge, ipcRenderer } from "electron"
import { readBaseProfile } from "../core/library/guards"
import {
  BEFORE_CLOSE_CHANNEL,
  CLOSE_ANSWER_CHANNEL,
  WORKSPACE_EVENT_CHANNEL,
  workspaceChannel,
  type HonyaApi,
  type WorkspaceApi,
} from "../shared/api"
import {
  ipcMessage,
  readAppSettings,
  readExportPreview,
  readExportWritten,
  readKeyTest,
  readLaunchInfo,
  readLineView,
  readModelOptions,
  readOptionalString,
  readPickedSessionView,
  readProjectSummaries,
  readProjectSummary,
  readProjectView,
  readRule,
  readSessionStats,
  readSessionSummaries,
  readSessionSummary,
  readSessionView,
  readStyleView,
  readWorkspaceEvent,
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

const ws = workspaceChannel

const workspace: WorkspaceApi = {
  getSettings: () => read(ws("getSettings"), [], readAppSettings),
  updateSettings: (patch) => read(ws("updateSettings"), [patch], readAppSettings),
  testKey: (provider, key) => read(ws("testKey"), [provider, key], readKeyTest),
  modelOptions: (provider) => read(ws("modelOptions"), [provider], readModelOptions),
  revealLog: () => read(ws("revealLog"), [], readNothing),
  listProjects: () => read(ws("listProjects"), [], readProjectSummaries),
  getProject: (id) => read(ws("getProject"), [id], readProjectView),
  getStyle: (variant) => read(ws("getStyle"), [variant], readStyleView),
  createProject: (name, variant) => read(ws("createProject"), [name, variant], readProjectSummary),
  updateProject: (id, patch) => read(ws("updateProject"), [id, patch], readProjectView),
  deleteProject: (id) => read(ws("deleteProject"), [id], readNothing),
  updateStyle: (variant, patch) => read(ws("updateStyle"), [variant, patch], readStyleView),
  saveRules: (owner, rules) => read(ws("saveRules"), [owner, rules], readNothing),
  addRule: (owner, rule) => read(ws("addRule"), [owner, rule], readNothing),
  addReference: (owner, name, text, styles) =>
    read(ws("addReference"), [owner, name, text, styles], readNothing),
  launchInfo: () => read(ws("launchInfo"), [], readLaunchInfo),
  recentSessions: () => read(ws("recentSessions"), [], readSessionSummaries),
  projectSessions: (projectId) => read(ws("projectSessions"), [projectId], readSessionSummaries),
  newSession: (projectId) => read(ws("newSession"), [projectId], readString),
  openSession: (id) => read(ws("openSession"), [id], readSessionView),
  pickScriptForSession: (id) => picked(ws("pickScriptForSession"), [id], readPickedSessionView),
  confirmStyles: (id, styles) => read(ws("confirmStyles"), [id, styles], readSessionView),
  editLine: (id, index, words) => read(ws("editLine"), [id, index, words], readLineView),
  acceptLine: (id, index) => read(ws("acceptLine"), [id, index], readLineView),
  setSessionOptions: (id, patch) => read(ws("setSessionOptions"), [id, patch], readSessionView),
  pickVideoForSession: (id) => picked(ws("pickVideoForSession"), [id], readPickedSessionView),
  detachVideo: (id) => read(ws("detachVideo"), [id], readSessionView),
  setFinished: (id, value) => read(ws("setFinished"), [id, value], readSessionSummary),
  runAi: (id) => read(ws("runAi"), [id], readNothing),
  stopAi: () => read(ws("stopAi"), [], readNothing),
  aiActive: () => picked(ws("aiActive"), [], readOptionalString),
  retranslate: (id, index, hint) => read(ws("retranslate"), [id, index, hint], readLineView),
  draftRule: (id, index) => read(ws("draftRule"), [id, index], readRule),
  lineFrame: (id, index) => picked(ws("lineFrame"), [id, index], readOptionalString),
  exportPreview: (id) => read(ws("exportPreview"), [id], readExportPreview),
  pickExportPath: (defaultPath) => picked(ws("pickExportPath"), [defaultPath], readOptionalString),
  exportWrite: (id, path, rules) => read(ws("exportWrite"), [id, path, rules], readExportWritten),
  revealPath: (path) => read(ws("revealPath"), [path], readNothing),
  sessionStats: (id) => read(ws("sessionStats"), [id], readSessionStats),
  onWorkspaceEvent(listener) {
    const handler = (_event: unknown, value: unknown): void => {
      const event = readWorkspaceEvent(value)
      if (event !== null) {
        listener(event)
      }
    }
    ipcRenderer.on(WORKSPACE_EVENT_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(WORKSPACE_EVENT_CHANNEL, handler)
    }
  },
}

const honya: HonyaApi = {
  ...workspace,
  onBeforeClose(listener) {
    const handler = (): void => {
      listener()
    }
    ipcRenderer.on(BEFORE_CLOSE_CHANNEL, handler)
    return () => {
      ipcRenderer.removeListener(BEFORE_CLOSE_CHANNEL, handler)
    }
  },
  confirmClose(allow) {
    ipcRenderer.send(CLOSE_ANSWER_CHANNEL, allow)
  },
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
  acceptReviewLine: (id, eventIndex, words) =>
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
