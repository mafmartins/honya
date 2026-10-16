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

export type { BaseProfile, ExampleScript, Rule, Variant } from "../core/library/types"
export type { Preset, ProviderId } from "../core/pipeline/types"
export type { ListedStyle, PickedExample, PickedScript, PickedVideo } from "../main/ipc/files"
export type { LoadedBase, SeriesList, SeriesSummary } from "../main/ipc/profiles"
export type { ModelPair } from "../main/modelStore"
export type { Proposal } from "../core/review/review"
export type { PreparedScript } from "../main/translate/prepare"
export type { CheckResult, FinishResult, ReviewLine, ReviewView } from "../main/translate/review"
export type { LiveLine, TranslateEvent, TranslateRequest } from "../main/translate/runner"
export type { SessionPhase } from "../main/translate/session"

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
  acceptLine(id: string, eventIndex: number, words: string | null): Promise<ReviewView>
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

export type HonyaApi = SetupApi & TranslateApi
