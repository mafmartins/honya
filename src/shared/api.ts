import type { BaseProfile, Rule, Variant } from "../core/library/types"
import type { Preset, ProviderId } from "../core/pipeline/types"
import type { PickedExample, PickedScript, PickedVideo } from "../main/ipc/files"
import type { LoadedBase, SeriesList, SeriesSummary } from "../main/ipc/profiles"
import type { ModelPair } from "../main/modelStore"

export type { BaseProfile, ExampleScript, Rule, Variant } from "../core/library/types"
export type { Preset, ProviderId } from "../core/pipeline/types"
export type { ListedStyle, PickedExample, PickedScript, PickedVideo } from "../main/ipc/files"
export type { LoadedBase, SeriesList, SeriesSummary } from "../main/ipc/profiles"
export type { ModelPair } from "../main/modelStore"

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
