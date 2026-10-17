import { modelOptions } from "../../src/core/providers/catalog"
import type {
  AppSettings,
  ExampleScript,
  FrameSetting,
  LineView,
  ModelPair,
  HonyaApi,
  Owner,
  Preset,
  ProjectSummary,
  ProjectView,
  ProviderId,
  Rule,
  SessionStats,
  SessionSummary,
  SessionView,
  StyleView,
  Variant,
  WorkspaceApi,
  WorkspaceEvent,
} from "../../src/shared/api"

export type FakeApi = HonyaApi & {
  // Sends a workspace event to every onWorkspaceEvent listener.
  emitWorkspace(event: WorkspaceEvent): void
  // Main's question when the window is closed during a run.
  emitBeforeClose(): void
  // Every confirmClose answer, in order.
  closeAnswers: boolean[]
}

export function fakeApi(overrides: Partial<HonyaApi> = {}): FakeApi {
  const keys = new Set<ProviderId>()
  const models = new Map<ProviderId, ModelPair>()
  const workspace = fakeWorkspace(keys)
  const closeListeners = new Set<() => void>()
  const closeAnswers: boolean[] = []
  const api: HonyaApi = {
    ...workspace.api,
    onBeforeClose: (listener) => {
      closeListeners.add(listener)
      return () => {
        closeListeners.delete(listener)
      }
    },
    confirmClose: (allow) => {
      closeAnswers.push(allow)
    },
    pickExample: () => Promise.resolve(null),
    hasKey: (provider) => Promise.resolve(keys.has(provider)),
    setKey: (provider) => {
      keys.add(provider)
      return Promise.resolve()
    },
    removeKey: (provider) => {
      keys.delete(provider)
      return Promise.resolve()
    },
    getModels: (provider) =>
      Promise.resolve(
        models.get(provider) ?? { cheap: `${provider}-cheap`, strong: `${provider}-strong` },
      ),
    setModels: (provider, pair) => {
      models.set(provider, pair)
      return Promise.resolve(pair)
    },
    resetModels: (provider) => {
      models.delete(provider)
      return Promise.resolve({ cheap: `${provider}-cheap`, strong: `${provider}-strong` })
    },
    learnFromScript: () =>
      Promise.resolve({
        glossary: [{ kind: "glossary", source: "Hashira", pt: "Pilar" }],
        rules: [{ kind: "prose", text: "Keep -san and -sama." }],
        pairs: 250,
      }),
    combineLearned: (_provider, learned) =>
      Promise.resolve({
        suggestions: [
          {
            rule: { kind: "glossary", source: "Hashira", pt: "Pilar" },
            episodes: learned.length,
            alternatives: ["Hashira"],
          },
          { rule: { kind: "prose", text: "Keep -san and -sama." }, episodes: 1, alternatives: [] },
        ],
        episodes: learned.length,
        pairs: learned.reduce((sum, item) => sum + item.pairs, 0),
      }),
  }
  const emitBeforeClose = (): void => {
    for (const listener of [...closeListeners]) {
      listener()
    }
  }
  return {
    ...api,
    ...overrides,
    emitWorkspace: workspace.emit,
    emitBeforeClose,
    closeAnswers,
  }
}

// The script every fake session loads: four dialogue lines.
export const FAKE_SCRIPT: readonly {
  start: number
  end: number
  speaker: string
  english: string
}[] = [
  { start: 1000, end: 2120, speaker: "Tanjiro", english: "Hello." },
  { start: 3000, end: 4500, speaker: "Nezuko", english: "Where are we going?" },
  { start: 5000, end: 6000, speaker: "Tanjiro", english: "Damn it!" },
  { start: 7000, end: 7800, speaker: "", english: "Run!" },
]
export const FAKE_SCRIPT_NAME = "ep01.ass"
export const FAKE_SCRIPT_PATH = "/videos/ep01.ass"
// The line the fake AI flags when it translates it.
export const FAKE_FLAGGED_LINE = 2

interface FakeProject {
  id: string
  name: string
  variant: Variant
  rules: Rule[]
  cpsLimit: number | null
  preset: Preset | null
  frameSetting: FrameSetting | null
  references: ExampleScript[]
}

interface FakeStyle {
  rules: Rule[]
  cpsLimit: number
  references: ExampleScript[]
}

interface FakeSession {
  id: string
  projectId: string
  scriptName: string | null
  scriptPath: string
  videoName: string | null
  provider: ProviderId
  preset: Preset
  lines: (LineView & { resolution: "accepted" | "edited" | "retranslated" | null })[]
  finishedOverride: boolean | null
  updatedAt: string
  usd: number
  requests: number
  exportedTo: string | null
}

// The workspace half of the fake: projects, styles and sessions held in memory, an
// AI run that fills the untranslated lines and an export that refuses the script path.
function fakeWorkspace(keys: Set<ProviderId>): {
  api: WorkspaceApi
  emit: (event: WorkspaceEvent) => void
} {
  const listeners = new Set<(event: WorkspaceEvent) => void>()
  const emit = (event: WorkspaceEvent): void => {
    for (const listener of [...listeners]) {
      listener(event)
    }
  }
  let settings: AppSettings = {
    setupDone: false,
    defaultProvider: "claude",
    defaults: { variant: "pt-pt", preset: "save", frameSetting: "none" },
    eurRate: 0.92,
  }
  const projects = new Map<string, FakeProject>()
  const styles = new Map<Variant, FakeStyle>([
    ["pt-pt", { rules: [], cpsLimit: 17, references: [] }],
    ["pt-br", { rules: [], cpsLimit: 17, references: [] }],
  ])
  const sessions = new Map<string, FakeSession>()
  let ids = 0
  let clock = Date.parse("2026-10-17T10:00:00.000Z")
  let active: string | null = null
  let stopRequested = false

  const fail = <T>(message: string): Promise<T> => Promise.reject(new Error(message))
  const stamp = (): string => {
    clock += 1000
    return new Date(clock).toISOString()
  }
  const styleOf = (variant: Variant): FakeStyle => {
    const style = styles.get(variant)
    if (style === undefined) {
      throw new Error("Unknown style.")
    }
    return style
  }
  const project = (id: string): FakeProject => {
    const found = projects.get(id)
    if (found === undefined) {
      throw new Error("That project no longer exists.")
    }
    return found
  }
  const session = (id: string): FakeSession => {
    const found = sessions.get(id)
    if (found === undefined) {
      throw new Error("This session was not found.")
    }
    return found
  }
  const line = (item: FakeSession, index: number): FakeSession["lines"][number] => {
    const found = item.lines.find((entry) => entry.index === index)
    if (found === undefined) {
      throw new Error("This line is not in the session.")
    }
    return found
  }
  const touch = (item: FakeSession): void => {
    item.updatedAt = stamp()
  }
  const lineView = (item: FakeSession["lines"][number]): LineView => ({
    index: item.index,
    start: item.start,
    end: item.end,
    speaker: item.speaker,
    english: item.english,
    words: item.words,
    origin: item.origin,
    flag: item.flag,
    budget: item.budget,
  })
  const isFinished = (item: FakeSession): boolean =>
    item.finishedOverride ??
    (item.lines.length > 0 &&
      item.lines.every((entry) => entry.words !== null && entry.flag === null))
  const sessionsOf = (projectId: string): FakeSession[] =>
    [...sessions.values()].filter((item) => item.projectId === projectId)
  const newestFirst = (a: SessionSummary, b: SessionSummary): number =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0

  const projectSummary = (item: FakeProject): ProjectSummary => {
    const mine = sessionsOf(item.id)
      .map((entry) => entry.updatedAt)
      .sort()
    return {
      id: item.id,
      name: item.name,
      variant: item.variant,
      sessions: mine.length,
      lastActivity: mine.at(-1) ?? null,
    }
  }
  const projectView = (item: FakeProject): ProjectView => {
    const summary = projectSummary(item)
    const style = styleOf(item.variant)
    return {
      summary,
      rules: { own: [...item.rules], inherited: [...style.rules] },
      cpsLimit: item.cpsLimit,
      styleCps: style.cpsLimit,
      preset: item.preset ?? settings.defaults.preset,
      frameSetting: item.frameSetting ?? settings.defaults.frameSetting,
      references: [...item.references],
      languageLocked: summary.sessions > 0,
    }
  }
  const styleView = (variant: Variant): StyleView => {
    const style = styleOf(variant)
    return {
      variant,
      rules: [...style.rules],
      cpsLimit: style.cpsLimit,
      references: [...style.references],
      usedBy: [...projects.values()]
        .filter((item) => item.variant === variant)
        .map((item) => item.name),
    }
  }
  const stats = (item: FakeSession): SessionStats => {
    const count = (test: (entry: FakeSession["lines"][number]) => boolean): number =>
      item.lines.filter(test).length
    return {
      lines: {
        ai: count((entry) => entry.words !== null && entry.origin === "ai"),
        manual: count((entry) => entry.words !== null && entry.origin === "manual"),
        untranslated: count((entry) => entry.words === null),
        total: item.lines.length,
      },
      flags: {
        open: count((entry) => entry.flag !== null),
        accepted: count((entry) => entry.resolution === "accepted"),
        edited: count((entry) => entry.resolution === "edited"),
        retranslated: count((entry) => entry.resolution === "retranslated"),
      },
      strongLines: 0,
      retranslatedLines: count((entry) => entry.resolution === "retranslated"),
      cost: {
        usd: item.requests === 0 ? null : item.usd,
        unpriced: [],
        input: item.requests * 1000,
        output: item.requests * 500,
        requests: item.requests,
      },
      models:
        item.requests === 0
          ? []
          : [
              {
                model: "claude-haiku-5-5",
                requests: item.requests,
                input: item.requests * 1000,
                output: item.requests * 500,
                usd: item.usd,
              },
            ],
      activeMs: item.requests * 30000,
      framesGrabbed: 0,
    }
  }
  const summaryOf = (item: FakeSession): SessionSummary => ({
    id: item.id,
    projectId: item.projectId,
    projectName: projects.get(item.projectId)?.name ?? "Deleted project",
    scriptName: item.scriptName ?? "",
    translated: item.lines.filter((entry) => entry.words !== null).length,
    total: item.lines.length,
    openFlags: item.lines.filter((entry) => entry.flag !== null).length,
    updatedAt: item.updatedAt,
    finished: isFinished(item),
  })
  const view = (item: FakeSession): SessionView => ({
    id: item.id,
    projectId: item.projectId,
    projectName: projects.get(item.projectId)?.name ?? "Deleted project",
    variant: project(item.projectId).variant,
    scriptName: item.scriptName,
    videoName: item.videoName,
    provider: item.provider,
    preset: item.preset,
    lines: item.lines.map(lineView),
    needsStyles: null,
    stats: stats(item),
    finished: isFinished(item),
  })
  const checkName = (variant: Variant, name: string, exceptId: string | null): string => {
    const trimmed = name.trim()
    if (trimmed === "") {
      throw new Error("Give the project a name.")
    }
    const taken = [...projects.values()].some(
      (item) =>
        item.id !== exceptId &&
        item.variant === variant &&
        item.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (taken) {
      throw new Error(`A project called ${trimmed} already exists for ${variant}.`)
    }
    return trimmed
  }
  const rulesOf = (owner: Owner): Rule[] =>
    owner.kind === "style" ? styleOf(owner.variant).rules : project(owner.id).rules
  const referencesOf = (owner: Owner): ExampleScript[] =>
    owner.kind === "style" ? styleOf(owner.variant).references : project(owner.id).references
  const attempt = <T>(work: () => T): Promise<T> => {
    try {
      return Promise.resolve(work())
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
  }

  // The run ends on a later tick, so a Stop pressed right after Run is still in time.
  const finishRun = (id: string): void => {
    const item = sessions.get(id)
    active = null
    if (item === undefined) {
      return
    }
    if (stopRequested) {
      emit({ type: "run-ended", sessionId: id, outcome: "stopped", message: null })
      return
    }
    const filled: LineView[] = []
    for (const entry of item.lines) {
      if (entry.words === null) {
        entry.words = `pt: ${entry.english}`
        entry.origin = "ai"
        entry.flag = entry.index === FAKE_FLAGGED_LINE ? "Check the tone." : null
        filled.push(lineView(entry))
      }
    }
    item.usd += 0.01
    item.requests += 1
    touch(item)
    const done = item.lines.filter((entry) => entry.words !== null).length
    emit({
      type: "run-progress",
      sessionId: id,
      index: 1,
      total: 1,
      linesDone: done,
      lineTotal: item.lines.length,
      activity: "Translating batch 1 of 1",
      indexes: [],
    })
    emit({ type: "lines", sessionId: id, lines: filled })
    emit({ type: "run-ended", sessionId: id, outcome: "done", message: null })
  }

  const api: WorkspaceApi = {
    getSettings: () => Promise.resolve({ ...settings, defaults: { ...settings.defaults } }),
    updateSettings: (patch) => {
      const next = { ...settings, ...patch }
      if (!Number.isFinite(next.eurRate) || next.eurRate <= 0) {
        return fail("The euro rate must be a number above zero.")
      }
      settings = next
      return Promise.resolve({ ...settings })
    },
    testKey: (_provider, key) =>
      Promise.resolve(
        key.trim() === "" || key.includes("bad")
          ? { ok: false, message: "The key was rejected." }
          : { ok: true },
      ),
    modelOptions: (provider) => Promise.resolve(modelOptions(provider)),
    revealLog: () => Promise.resolve(),
    listProjects: () =>
      Promise.resolve(
        [...projects.values()]
          .map(projectSummary)
          .sort((left, right) => left.name.localeCompare(right.name)),
      ),
    getProject: (id) => attempt(() => projectView(project(id))),
    getStyle: (variant) => attempt(() => styleView(variant)),
    createProject: (name, variant) =>
      attempt(() => {
        ids += 1
        const item: FakeProject = {
          id: `project-${String(ids)}`,
          name: checkName(variant, name, null),
          variant,
          rules: [],
          cpsLimit: null,
          preset: null,
          frameSetting: null,
          references: [],
        }
        projects.set(item.id, item)
        return projectSummary(item)
      }),
    updateProject: (id, patch) =>
      attempt(() => {
        const item = project(id)
        if (patch.variant !== undefined && patch.variant !== item.variant) {
          if (sessionsOf(id).length > 0) {
            throw new Error("The language can't change once the project has sessions.")
          }
          item.variant = patch.variant
        }
        if (patch.name !== undefined) {
          item.name = checkName(item.variant, patch.name, id)
        }
        if (patch.cpsLimit !== undefined) {
          item.cpsLimit = patch.cpsLimit
        }
        if (patch.preset !== undefined) {
          item.preset = patch.preset
        }
        if (patch.frameSetting !== undefined) {
          item.frameSetting = patch.frameSetting
        }
        return projectView(item)
      }),
    deleteProject: (id) =>
      attempt(() => {
        project(id)
        const owned = sessionsOf(id)
        if (owned.some((item) => item.id === active)) {
          throw new Error("Stop the AI run before deleting this project.")
        }
        for (const item of owned) {
          sessions.delete(item.id)
        }
        projects.delete(id)
      }),
    updateStyle: (variant, patch) =>
      attempt(() => {
        if (patch.cpsLimit !== undefined) {
          styleOf(variant).cpsLimit = patch.cpsLimit
        }
        return styleView(variant)
      }),
    saveRules: (owner, rules) =>
      attempt(() => {
        rulesOf(owner).splice(0, Infinity, ...rules)
      }),
    addRule: (owner, rule) =>
      attempt(() => {
        rulesOf(owner).push(rule)
      }),
    addReference: (owner, name, text) =>
      attempt(() => {
        referencesOf(owner).push({ name, text })
      }),
    launchInfo: () =>
      Promise.resolve({
        setupDone: settings.setupDone || keys.size > 0,
        continueSession:
          [...sessions.values()]
            .map(summaryOf)
            .filter((summary) => !summary.finished)
            .sort(newestFirst)[0] ?? null,
        projects: [...projects.values()].map(projectSummary),
      }),
    recentSessions: () =>
      Promise.resolve([...sessions.values()].map(summaryOf).sort(newestFirst).slice(0, 10)),
    projectSessions: (projectId) =>
      Promise.resolve(sessionsOf(projectId).map(summaryOf).sort(newestFirst)),
    newSession: (projectId) =>
      attempt(() => {
        const owner = project(projectId)
        ids += 1
        const id = `00000000-0000-4000-8000-${String(ids).padStart(12, "0")}`
        sessions.set(id, {
          id,
          projectId,
          scriptName: null,
          scriptPath: "",
          videoName: null,
          provider: settings.defaultProvider,
          preset: owner.preset ?? settings.defaults.preset,
          lines: [],
          finishedOverride: null,
          updatedAt: stamp(),
          usd: 0,
          requests: 0,
          exportedTo: null,
        })
        return id
      }),
    openSession: (id) => attempt(() => view(session(id))),
    pickScriptForSession: (id) =>
      attempt(() => {
        const item = session(id)
        if (item.lines.length > 0) {
          throw new Error("This session already has a script.")
        }
        item.scriptName = FAKE_SCRIPT_NAME
        item.scriptPath = FAKE_SCRIPT_PATH
        item.lines = FAKE_SCRIPT.map((entry, index) => ({
          index,
          start: entry.start,
          end: entry.end,
          speaker: entry.speaker,
          english: entry.english,
          words: null,
          origin: null,
          flag: null,
          budget: 20,
          resolution: null,
        }))
        touch(item)
        return view(item)
      }),
    confirmStyles: (id) => attempt(() => view(session(id))),
    editLine: (id, index, words) =>
      attempt(() => {
        const item = session(id)
        const entry = line(item, index)
        if (words.trim() === "") {
          entry.words = null
          entry.origin = null
          entry.flag = null
        } else {
          if (entry.flag !== null) {
            entry.resolution = "edited"
          }
          entry.words = words.trim()
          entry.origin = "manual"
          entry.flag = null
        }
        touch(item)
        return lineView(entry)
      }),
    acceptLine: (id, index) =>
      attempt(() => {
        const item = session(id)
        const entry = line(item, index)
        if (entry.flag !== null) {
          entry.flag = null
          entry.resolution = "accepted"
        }
        touch(item)
        return lineView(entry)
      }),
    setSessionOptions: (id, patch) =>
      attempt(() => {
        const item = session(id)
        item.provider = patch.provider ?? item.provider
        item.preset = patch.preset ?? item.preset
        touch(item)
        return view(item)
      }),
    pickVideoForSession: (id) =>
      attempt(() => {
        const item = session(id)
        item.videoName = "ep01.mkv"
        touch(item)
        return view(item)
      }),
    detachVideo: (id) =>
      attempt(() => {
        const item = session(id)
        item.videoName = null
        touch(item)
        return view(item)
      }),
    setFinished: (id, value) =>
      attempt(() => {
        const item = session(id)
        item.finishedOverride = value
        touch(item)
        return summaryOf(item)
      }),
    runAi: (id) =>
      attempt(() => {
        if (active !== null) {
          throw new Error("Honya is already translating.")
        }
        if (session(id).lines.length === 0) {
          throw new Error("This session has no script yet.")
        }
        active = id
        stopRequested = false
        setTimeout(() => {
          finishRun(id)
        }, 0)
      }),
    stopAi: () => {
      if (active !== null) {
        stopRequested = true
      }
      return Promise.resolve()
    },
    aiActive: () => Promise.resolve(active),
    retranslate: (id, index, hint) =>
      attempt(() => {
        const item = session(id)
        const entry = line(item, index)
        if (entry.flag !== null) {
          entry.resolution = "retranslated"
        }
        entry.words = hint.trim() === "" ? `pt: ${entry.english}` : `pt: ${entry.english} (${hint})`
        entry.origin = "ai"
        entry.flag = null
        item.usd += 0.001
        item.requests += 1
        touch(item)
        return { line: lineView(entry), keptEdit: false }
      }),
    draftRule: (id, index) =>
      attempt((): Rule => {
        const entry = line(session(id), index)
        if (entry.words === null) {
          throw new Error("This line has no translation to learn from.")
        }
        return { kind: "prose", text: `Translate "${entry.english}" as "${entry.words}".` }
      }),
    lineFrame: (id) =>
      attempt(() => (session(id).videoName === null ? null : "data:image/png;base64,iVBORw0KGgo=")),
    exportPreview: (id) =>
      attempt(() => {
        const item = session(id)
        const translated = item.lines.filter((entry) => entry.words !== null)
        const manual = item.lines
          .filter((entry) => entry.origin === "manual")
          .map((entry) => entry.index)
        const variant = project(item.projectId).variant
        return {
          translated: translated.length,
          english: item.lines.length - translated.length,
          openFlags: translated.filter((entry) => entry.flag !== null).length,
          defaultPath: item.scriptPath.replace(/\.ass$/, `.${variant}.ass`),
          suggestions:
            manual.length === 0
              ? []
              : [
                  {
                    rule: { kind: "prose", text: "Keep the translator's wording." },
                    lines: manual,
                  },
                ],
        }
      }),
    pickExportPath: (defaultPath) => Promise.resolve(defaultPath),
    exportWrite: (id, path, rules) =>
      attempt(() => {
        const item = session(id)
        if (path === item.scriptPath) {
          throw new Error("Choose a different name: Honya never overwrites the original script.")
        }
        for (const { owner, rule } of rules) {
          rulesOf(owner).push(rule)
        }
        item.exportedTo = path
        touch(item)
        return { path }
      }),
    revealPath: () => Promise.resolve(),
    sessionStats: (id) => attempt(() => stats(session(id))),
    onWorkspaceEvent: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return { api, emit }
}
