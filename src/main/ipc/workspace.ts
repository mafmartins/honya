import { ipcMain } from "electron"
import { resolve } from "node:path"
import {
  isFrameSetting,
  isPreset,
  isProviderId,
  isRecord,
  isRule,
  isRuleList,
  isVariant,
} from "../../core/library/guards"
import type { Rule, Variant } from "../../core/library/types"
import type { Preset, ProviderId } from "../../core/pipeline/types"
import { modelOptions } from "../../core/providers/catalog"
import { sessionStats } from "../../core/session/stats"
import {
  PROVIDERS,
  workspaceChannel,
  type KeyTestResult,
  type LaunchInfo,
  type WorkspaceApi,
} from "../../shared/api"
import type { ModelStore } from "../modelStore"
import type { SecretStore } from "../secrets"
import type { AppSettings, SettingsStore } from "../settingsStore"
import type { AiService, WorkspaceEvent } from "../workspace/ai"
import type { ExportService } from "../workspace/export"
import type { Owner, ProjectPatch, ProjectService } from "../workspace/projects"
import type { WorkSessions } from "../workspace/sessions"
import { ASS_FILTER, VIDEO_FILTER, type FileFilter, type OpenFile } from "./files"

export interface WorkspaceIpcDeps {
  settings: SettingsStore
  secrets: Pick<SecretStore, "hasKey">
  models: Pick<ModelStore, "get">
  projects: ProjectService
  sessions: WorkSessions
  ai: AiService
  exporter: ExportService
  open: OpenFile
  // A save dialog; null when cancelled.
  saveFile(defaultPath: string, filters: FileFilter[]): Promise<string | null>
  testKey(provider: ProviderId, key: string, model: string): Promise<KeyTestResult>
  revealLog(): void
  reveal(path: string): void
  emit(event: WorkspaceEvent): void
}

type Handlers = Record<
  Exclude<keyof WorkspaceApi, "onWorkspaceEvent">,
  (args: readonly unknown[]) => unknown
>

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RECENT_SESSIONS = 10

export function registerWorkspaceIpc(deps: WorkspaceIpcDeps): void {
  for (const [name, run] of Object.entries(workspaceHandlers(deps))) {
    if (isWorkspaceMethod(name)) {
      ipcMain.handle(workspaceChannel(name), (_event, ...args: unknown[]) => run(args))
    }
  }
}

// Every workspace method, its arguments checked before they reach a service. A
// null reply stands for the API's void.
export function workspaceHandlers(deps: WorkspaceIpcDeps): Handlers {
  const { settings, projects, sessions, ai, exporter } = deps
  const nothing = (work: () => unknown): null => {
    work()
    return null
  }
  // The page may only write where main proposed (an export's default path) or where
  // the user chose in the save dialog, and only show the file it last exported.
  const offered = new Set<string>()
  let exported: string | null = null
  const offer = (path: string): void => {
    offered.add(resolve(path))
  }
  // Runs a change to the session and tells the page it was saved, also when the change
  // failed after saving the spend of its request.
  const notRunning = (id: string): void => {
    if (ai.activeId() === id) {
      throw new Error("Stop the AI run before changing the video.")
    }
  }
  const notify = (id: string): void => {
    deps.emit({ type: "session-changed", sessionId: id })
  }
  const saving = <T>(id: string, work: () => T): T => {
    try {
      return work()
    } finally {
      notify(id)
    }
  }
  const savingLater = async <T>(id: string, work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } finally {
      notify(id)
    }
  }
  return {
    getSettings: () => settings.get(),
    updateSettings: (args) => settings.update(settingsPatch(args[0])),
    testKey: (args) => {
      const id = provider(args, 0)
      return deps.testKey(id, text(args, 1), deps.models.get(id).cheap)
    },
    modelOptions: (args) => modelOptions(provider(args, 0)),
    revealLog: () =>
      nothing(() => {
        deps.revealLog()
      }),
    listProjects: () => projects.listProjects(),
    getProject: (args) => projects.getProject(text(args, 0)),
    getStyle: (args) => projects.getStyle(variant(args, 0)),
    createProject: (args) => projects.createProject(text(args, 0), variant(args, 1)),
    updateProject: (args) => projects.updateProject(text(args, 0), projectPatch(args[1])),
    // A project's sessions go with it; a running one has to be stopped first.
    deleteProject: (args) => {
      const id = text(args, 0)
      projects.getProject(id)
      const owned = sessions.list().filter((summary) => summary.projectId === id)
      const running = ai.activeId()
      if (owned.some((summary) => summary.id === running)) {
        throw new Error("Stop the AI run before deleting this project.")
      }
      for (const summary of owned) {
        sessions.remove(summary.id)
      }
      projects.deleteProject(id)
      return null
    },
    updateStyle: (args) => projects.updateStyle(variant(args, 0), stylePatch(args[1])),
    saveRules: (args) =>
      nothing(() => {
        projects.saveRules(owner(args[0]), rules(args[1]))
      }),
    addRule: (args) =>
      nothing(() => {
        projects.addRule(owner(args[0]), rule(args[1]))
      }),
    addReference: (args) =>
      nothing(() => {
        projects.addReference(owner(args[0]), text(args, 1), text(args, 2), styles(args[3]))
      }),
    launchInfo: (): LaunchInfo => ({
      setupDone: settings.get().setupDone || PROVIDERS.some((id) => deps.secrets.hasKey(id)),
      continueSession: sessions.latestUnfinished(),
      projects: projects.listProjects(),
    }),
    recentSessions: () => sessions.recent(RECENT_SESSIONS),
    // sessions.list() is already newest first.
    projectSessions: (args) => {
      const projectId = text(args, 0)
      return sessions.list().filter((summary) => summary.projectId === projectId)
    },
    newSession: (args) => sessions.create(text(args, 0)),
    openSession: (args) => sessions.view(sessionId(args, 0)),
    pickScriptForSession: async (args) => {
      const id = sessionId(args, 0)
      const path = await deps.open(ASS_FILTER)
      return path === null ? null : sessions.loadScript(id, path)
    },
    confirmStyles: (args) => sessions.confirmStyles(sessionId(args, 0), styles(args[1])),
    editLine: (args) => {
      const id = sessionId(args, 0)
      return saving(id, () => sessions.edit(id, lineIndex(args, 1), text(args, 2)))
    },
    acceptLine: (args) => {
      const id = sessionId(args, 0)
      return saving(id, () => sessions.accept(id, lineIndex(args, 1)))
    },
    setSessionOptions: (args) => {
      const id = sessionId(args, 0)
      return saving(id, () => sessions.setOptions(id, sessionPatch(args[1])))
    },
    // A different video makes the cached frames wrong, so they go with the old one. A
    // run grabs frames from the video, so it can't change under one.
    pickVideoForSession: async (args) => {
      const id = sessionId(args, 0)
      notRunning(id)
      const path = await deps.open(VIDEO_FILTER)
      if (path === null) {
        return null
      }
      notRunning(id)
      sessions.clearFrames(id)
      return sessions.attachVideo(id, path)
    },
    detachVideo: (args) => {
      const id = sessionId(args, 0)
      notRunning(id)
      sessions.clearFrames(id)
      return sessions.attachVideo(id, null)
    },
    setFinished: (args) => {
      const value = args[1]
      if (value !== null && typeof value !== "boolean") {
        throw new Error("Invalid choice.")
      }
      return sessions.setFinished(sessionId(args, 0), value)
    },
    runAi: async (args) => {
      await ai.run(sessionId(args, 0))
      return null
    },
    stopAi: () =>
      nothing(() => {
        ai.stop()
      }),
    aiActive: () => ai.activeId(),
    retranslate: (args) => {
      const id = sessionId(args, 0)
      return savingLater(id, () => ai.retranslate(id, lineIndex(args, 1), text(args, 2)))
    },
    draftRule: (args) => {
      const id = sessionId(args, 0)
      return savingLater(id, () => ai.draftRule(id, lineIndex(args, 1)))
    },
    lineFrame: (args) => ai.frame(sessionId(args, 0), lineIndex(args, 1)),
    // The suggestion request's spend is saved on the session.
    exportPreview: async (args) => {
      const id = sessionId(args, 0)
      const preview = await savingLater(id, () => exporter.preview(id))
      offer(preview.defaultPath)
      return preview
    },
    pickExportPath: async (args) => {
      const path = await deps.saveFile(text(args, 0), ASS_FILTER)
      if (path !== null) {
        offer(path)
      }
      return path
    },
    exportWrite: (args) => {
      const id = sessionId(args, 0)
      const target = text(args, 1)
      if (!offered.has(resolve(target))) {
        throw new Error("Choose where to save with Change…")
      }
      const { path } = saving(id, () => exporter.write(id, target, ownedRules(args[2])))
      exported = resolve(path)
      return { path }
    },
    revealPath: (args) => {
      const path = text(args, 0)
      if (exported === null || resolve(path) !== exported) {
        throw new Error("Honya can only show the file it exported.")
      }
      deps.reveal(path)
      return null
    },
    sessionStats: (args) => sessionStats(sessions.get(sessionId(args, 0))),
  }
}

function isWorkspaceMethod(name: string): name is keyof Handlers {
  return name !== "onWorkspaceEvent"
}

function settingsPatch(value: unknown): Partial<AppSettings> {
  if (!isRecord(value)) {
    throw new Error("Invalid settings.")
  }
  const patch: Partial<AppSettings> = {}
  if (value.setupDone !== undefined) {
    if (typeof value.setupDone !== "boolean") throw new Error("Invalid settings.")
    patch.setupDone = value.setupDone
  }
  if (value.defaultProvider !== undefined) {
    if (!isProviderId(value.defaultProvider)) throw new Error("Invalid provider.")
    patch.defaultProvider = value.defaultProvider
  }
  if (value.eurRate !== undefined) {
    if (typeof value.eurRate !== "number") throw new Error("Invalid euro rate.")
    patch.eurRate = value.eurRate
  }
  if (value.defaults !== undefined) {
    const defaults = value.defaults
    if (
      !isRecord(defaults) ||
      !isVariant(defaults.variant) ||
      !isPreset(defaults.preset) ||
      !isFrameSetting(defaults.frameSetting)
    ) {
      throw new Error("Invalid defaults.")
    }
    patch.defaults = {
      variant: defaults.variant,
      preset: defaults.preset,
      frameSetting: defaults.frameSetting,
    }
  }
  return patch
}

function projectPatch(value: unknown): ProjectPatch {
  if (!isRecord(value)) {
    throw new Error("Invalid project settings.")
  }
  const patch: ProjectPatch = {}
  if (value.name !== undefined) {
    if (typeof value.name !== "string") throw new Error("Invalid name.")
    patch.name = value.name
  }
  if (value.cpsLimit !== undefined) {
    if (value.cpsLimit !== null && typeof value.cpsLimit !== "number") {
      throw new Error("Invalid characters per second.")
    }
    patch.cpsLimit = value.cpsLimit
  }
  if (value.preset !== undefined) {
    if (!isPreset(value.preset)) throw new Error("Invalid preset.")
    patch.preset = value.preset
  }
  if (value.frameSetting !== undefined) {
    if (!isFrameSetting(value.frameSetting)) throw new Error("Invalid frame setting.")
    patch.frameSetting = value.frameSetting
  }
  if (value.variant !== undefined) {
    if (!isVariant(value.variant)) throw new Error("Invalid variant.")
    patch.variant = value.variant
  }
  return patch
}

function stylePatch(value: unknown): { cpsLimit?: number } {
  if (!isRecord(value)) {
    throw new Error("Invalid style settings.")
  }
  if (value.cpsLimit === undefined) {
    return {}
  }
  if (typeof value.cpsLimit !== "number") {
    throw new Error("Invalid characters per second.")
  }
  return { cpsLimit: value.cpsLimit }
}

function sessionPatch(value: unknown): { provider?: ProviderId; preset?: Preset } {
  if (!isRecord(value)) {
    throw new Error("Invalid session settings.")
  }
  const patch: { provider?: ProviderId; preset?: Preset } = {}
  if (value.provider !== undefined) {
    if (!isProviderId(value.provider)) throw new Error("Invalid provider.")
    patch.provider = value.provider
  }
  if (value.preset !== undefined) {
    if (!isPreset(value.preset)) throw new Error("Invalid preset.")
    patch.preset = value.preset
  }
  return patch
}

export function readOwner(value: unknown): Owner | null {
  if (!isRecord(value)) {
    return null
  }
  if (value.kind === "style" && isVariant(value.variant)) {
    return { kind: "style", variant: value.variant }
  }
  if (value.kind === "project" && typeof value.id === "string") {
    return { kind: "project", id: value.id }
  }
  return null
}

function owner(value: unknown): Owner {
  const parsed = readOwner(value)
  if (parsed === null) {
    throw new Error("Invalid rule owner.")
  }
  return parsed
}

function rules(value: unknown): Rule[] {
  if (!isRuleList(value)) {
    throw new Error("Invalid rules.")
  }
  return value
}

function rule(value: unknown): Rule {
  if (!isRule(value)) {
    throw new Error("Invalid rule.")
  }
  return value
}

function ownedRules(value: unknown): { owner: Owner; rule: Rule }[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid rules.")
  }
  return (value as readonly unknown[]).map((item) => {
    if (!isRecord(item)) {
      throw new Error("Invalid rules.")
    }
    return { owner: owner(item.owner), rule: rule(item.rule) }
  })
}

function styles(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((style) => typeof style === "string")) {
    throw new Error("Invalid styles.")
  }
  return value.filter((style) => typeof style === "string")
}

function provider(args: readonly unknown[], index: number): ProviderId {
  const value = args[index]
  if (!isProviderId(value)) {
    throw new Error("Invalid provider.")
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

function sessionId(args: readonly unknown[], index: number): string {
  const value = args[index]
  if (typeof value !== "string" || !SESSION_ID.test(value)) {
    throw new Error("Invalid session id.")
  }
  return value
}

function lineIndex(args: readonly unknown[], index: number): number {
  const value = args[index]
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("Invalid line number.")
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
