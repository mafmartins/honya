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

export interface SeriesProfile {
  id: string
  variant: Variant
  name: string
  rules: Rule[]
}

export interface StyleCard {
  variant: Variant
  seriesId: string
  revision: number
  cpsLimit: number
  voice: string
  rules: Rule[]
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
