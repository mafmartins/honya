import type { BaseProfile, Rule, Variant } from "../core/library/types"
import type { Preset, ProviderId } from "../core/pipeline/types"
import type { PickedExample, PickedScript, PickedVideo } from "../main/ipc/files"
import type { LoadedBase, SeriesList, SeriesSummary } from "../main/ipc/profiles"
import type { ModelPair } from "../main/modelStore"
import type { CheckResult, FinishResult, ReviewView } from "../main/translate/review"
import type { PreparedScript } from "../main/translate/prepare"
import type { TranslateEvent, TranslateRequest } from "../main/translate/runner"
import type { SessionPhase } from "../main/translate/session"
import type { Proposal } from "../core/review/review"
import type { Combined, LearnScript, Learned } from "../core/library/learn"
import type { ModelOption } from "../core/providers/catalog"
import type { SessionStats } from "../core/session/stats"
import type { AppSettings } from "../main/settingsStore"
import type { WorkspaceEvent } from "../main/workspace/ai"
import type { ExportPreview } from "../main/workspace/export"
import type {
  Owner,
  ProjectPatch,
  ProjectSummary,
  ProjectView,
  StyleView,
} from "../main/workspace/projects"
import type { LineView, SessionSummary, SessionView } from "../main/workspace/sessions"

export type { BaseProfile, ExampleScript, Rule, Variant } from "../core/library/types"
export type { Preset, ProviderId } from "../core/pipeline/types"
export type { ListedStyle, PickedExample, PickedScript, PickedVideo } from "../main/ipc/files"
export type { LoadedBase, SeriesList, SeriesSummary } from "../main/ipc/profiles"
export type { ModelPair } from "../main/modelStore"
export type { Proposal } from "../core/review/review"
export type { Combined, LearnScript, Learned, Suggestion } from "../core/library/learn"
export type { PreparedScript } from "../main/translate/prepare"
export type { CheckResult, FinishResult, ReviewLine, ReviewView } from "../main/translate/review"
export type { LiveLine, TranslateEvent, TranslateRequest } from "../main/translate/runner"
export type { SessionPhase } from "../main/translate/session"
export type { FrameSetting } from "../core/library/types"
export type { ModelOption } from "../core/providers/catalog"
export type { Cost } from "../core/providers/prices"
export type { LineOrigin } from "../core/session/types"
export type { ModelCost, SessionStats } from "../core/session/stats"
export type { AppSettings } from "../main/settingsStore"
export type { WorkspaceEvent } from "../main/workspace/ai"
export type { ExportPreview } from "../main/workspace/export"
export type {
  Owner,
  ProjectPatch,
  ProjectSummary,
  ProjectView,
  RulesView,
  StyleView,
} from "../main/workspace/projects"
export type { LineView, SessionSummary, SessionView } from "../main/workspace/sessions"

export const PROVIDERS: readonly ProviderId[] = ["claude", "gpt", "gemini", "mistral"]
export const VARIANTS: readonly Variant[] = ["pt-pt", "pt-br"]
export const PRESETS: readonly Preset[] = ["save", "balanced", "best"]

export interface SetupApi {
  pickScript(): Promise<PickedScript | null>
  pickVideo(): Promise<PickedVideo | null>
  pickExample(): Promise<PickedExample | null>
  hasKey(provider: ProviderId): Promise<boolean>
  setKey(provider: ProviderId, key: string): Promise<void>
  removeKey(provider: ProviderId): Promise<void>
  getModels(provider: ProviderId): Promise<ModelPair>
  setModels(provider: ProviderId, pair: ModelPair): Promise<ModelPair>
  resetModels(provider: ProviderId): Promise<ModelPair>
  listSeries(variant: Variant): Promise<SeriesList>
  createSeries(variant: Variant, name: string): Promise<SeriesSummary>
  renameSeries(variant: Variant, id: string, name: string): Promise<SeriesSummary>
  deleteSeries(variant: Variant, id: string): Promise<void>
  loadSeriesRules(variant: Variant, id: string): Promise<Rule[]>
  saveSeriesRules(variant: Variant, id: string, rules: Rule[]): Promise<void>
  loadBase(variant: Variant): Promise<LoadedBase>
  saveBase(base: BaseProfile): Promise<BaseProfile>
  importExample(
    variant: Variant,
    name: string,
    text: string,
    dialogueStyles: string[],
  ): Promise<BaseProfile>
  // Reads an episode the translator already did and proposes glossary entries and rules
  // for a project or a language style; nothing is saved.
  learnFromScript(
    owner: Owner,
    provider: ProviderId,
    portuguese: LearnScript,
    english: LearnScript | null,
  ): Promise<Learned>
  // Combines several episodes' results, counting how many episodes support each one.
  combineLearned(provider: ProviderId, learned: Learned[]): Promise<Combined>
}

export interface UnfinishedSession {
  id: string
  scriptName: string
  seriesName: string
  phase: SessionPhase
  completedBatches: number
  totalBatches: number
  openFlags: number
}

export interface TranslateApi {
  prepareTranslation(scriptPath: string, variant: Variant): Promise<PreparedScript>
  startTranslation(request: TranslateRequest): Promise<string>
  resumeTranslation(id: string): Promise<string>
  stopTranslation(): Promise<void>
  latestUnfinished(): Promise<UnfinishedSession | null>
  discardTranslation(id: string): Promise<void>
  loadReview(id: string): Promise<ReviewView>
  // Renamed from acceptLine so the workspace's acceptLine can take the name.
  acceptReviewLine(id: string, eventIndex: number, words: string | null): Promise<ReviewView>
  checkEdit(id: string, eventIndex: number, words: string): Promise<CheckResult>
  confirmEdit(
    id: string,
    eventIndex: number,
    words: string,
    proposal: Proposal,
    applyOthers: boolean,
    ruleTarget: "series" | "base" | null,
  ): Promise<ReviewView>
  finishTranslation(id: string): Promise<FinishResult>
  revealOutput(id: string): Promise<void>
  onTranslateEvent(listener: (event: TranslateEvent) => void): () => void
}

export type KeyTestResult = { ok: true } | { ok: false; message: string }

export interface LaunchInfo {
  setupDone: boolean
  continueSession: SessionSummary | null
  projects: ProjectSummary[]
}

export interface WorkspaceApi {
  getSettings(): Promise<AppSettings>
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  testKey(provider: ProviderId, key: string): Promise<KeyTestResult>
  modelOptions(provider: ProviderId): Promise<{ cheap: ModelOption[]; strong: ModelOption[] }>
  revealLog(): Promise<void>
  listProjects(): Promise<ProjectSummary[]>
  getProject(id: string): Promise<ProjectView>
  getStyle(variant: Variant): Promise<StyleView>
  createProject(name: string, variant: Variant): Promise<ProjectSummary>
  updateProject(id: string, patch: ProjectPatch): Promise<ProjectView>
  deleteProject(id: string): Promise<void>
  updateStyle(variant: Variant, patch: { cpsLimit?: number }): Promise<StyleView>
  saveRules(owner: Owner, rules: Rule[]): Promise<void>
  addRule(owner: Owner, rule: Rule): Promise<void>
  addReference(owner: Owner, name: string, text: string, dialogueStyles: string[]): Promise<void>
  launchInfo(): Promise<LaunchInfo>
  recentSessions(): Promise<SessionSummary[]>
  projectSessions(projectId: string): Promise<SessionSummary[]>
  newSession(projectId: string): Promise<string>
  openSession(id: string): Promise<SessionView>
  pickScriptForSession(id: string): Promise<SessionView | null>
  confirmStyles(id: string, styles: string[]): Promise<SessionView>
  editLine(id: string, index: number, words: string): Promise<LineView>
  acceptLine(id: string, index: number): Promise<LineView>
  setSessionOptions(
    id: string,
    patch: { provider?: ProviderId; preset?: Preset },
  ): Promise<SessionView>
  pickVideoForSession(id: string): Promise<SessionView | null>
  detachVideo(id: string): Promise<SessionView>
  setFinished(id: string, value: boolean | null): Promise<SessionSummary>
  runAi(id: string): Promise<void>
  stopAi(): Promise<void>
  aiActive(): Promise<string | null>
  retranslate(id: string, index: number, hint: string): Promise<LineView>
  draftRule(id: string, index: number): Promise<Rule>
  lineFrame(id: string, index: number): Promise<string | null>
  exportPreview(id: string): Promise<ExportPreview>
  pickExportPath(defaultPath: string): Promise<string | null>
  exportWrite(
    id: string,
    path: string,
    rules: { owner: Owner; rule: Rule }[],
  ): Promise<{ path: string }>
  revealPath(path: string): Promise<void>
  sessionStats(id: string): Promise<SessionStats>
  onWorkspaceEvent(listener: (event: WorkspaceEvent) => void): () => void
}

// Closing the window during an AI run: main asks, the page answers once the user chose.
export interface WindowApi {
  onBeforeClose(listener: () => void): () => void
  confirmClose(allow: boolean): void
}

export type HonyaApi = SetupApi & TranslateApi & WorkspaceApi & WindowApi

// The IPC channel of a workspace method: honya:ws-<kebab-case name>.
export function workspaceChannel(name: keyof WorkspaceApi): string {
  return `honya:ws-${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
}

export const WORKSPACE_EVENT_CHANNEL = "honya:ws-event"
export const BEFORE_CLOSE_CHANNEL = "honya:ws-before-close"
export const CLOSE_ANSWER_CHANNEL = "honya:ws-close-answer"
