import type { Preset } from "../pipeline/types"

export type Variant = "pt-pt" | "pt-br"

export interface ProseRule {
  kind: "prose"
  text: string
}

export interface GlossaryRule {
  kind: "glossary"
  source: string
  pt: string
}

export type Rule = ProseRule | GlossaryRule

export interface ExampleScript {
  name: string
  text: string
}

export interface BaseProfile {
  variant: Variant
  cpsLimit: number
  examples: ExampleScript[]
  rules: Rule[]
  cardRevision: number
}

// A line the translator changed in review: the English, the model's draft and their
// version. Kept per series and shown to the model on later episodes.
export interface Correction {
  en: string
  draft: string
  final: string
}

// Which frames of the video go to the model: none, only marked lines, or every line.
export type FrameSetting = "none" | "marked" | "every"

// A project. Its optional settings override the language style's.
export interface SeriesProfile {
  id: string
  variant: Variant
  name: string
  rules: Rule[]
  corrections?: Correction[]
  cpsLimit?: number
  preset?: Preset
  frameSetting?: FrameSetting
  examples?: ExampleScript[]
}

export interface StyleCard {
  variant: Variant
  seriesId: string
  revision: number
  cpsLimit: number
  voice: string
  rules: Rule[]
  corrections?: Correction[]
}

export interface ProfileStore {
  saveBase(base: BaseProfile): void
  loadBase(variant: Variant): BaseProfile | null
  saveSeries(series: SeriesProfile): void
  loadSeries(variant: Variant, id: string): SeriesProfile | null
  listSeries(variant: Variant): SeriesProfile[]
  loadCard(variant: Variant, seriesId: string): StyleCard | null
  cardIsStale(variant: Variant, seriesId: string): boolean
}
