import type { Preset } from "../pipeline/types"
import type {
  BaseProfile,
  Correction,
  FrameSetting,
  Rule,
  SeriesProfile,
  StyleCard,
  Variant,
} from "./types"

const BASE_CPS_LIMIT = 17

export function emptyBase(variant: Variant): BaseProfile {
  return {
    variant,
    cpsLimit: BASE_CPS_LIMIT,
    examples: [],
    rules: [],
    cardRevision: 0,
  }
}

export function importExample(base: BaseProfile, name: string, text: string): BaseProfile {
  return {
    variant: base.variant,
    cpsLimit: base.cpsLimit,
    examples: [...base.examples, { name, text }],
    rules: base.rules,
    cardRevision: base.cardRevision + 1,
  }
}

export function saveRule(
  base: BaseProfile,
  series: SeriesProfile,
  rule: Rule,
  target: "base" | "series",
): { base: BaseProfile; series: SeriesProfile } {
  return {
    base: {
      variant: base.variant,
      cpsLimit: base.cpsLimit,
      examples: base.examples,
      rules: target === "base" ? [...base.rules, rule] : base.rules,
      cardRevision: base.cardRevision + 1,
    },
    series: {
      ...series,
      rules: target === "series" ? [...series.rules, rule] : series.rules,
    },
  }
}

// How many of the series' latest corrections go into each run.
export const CARD_CORRECTIONS = 20
// How many a series keeps.
export const KEPT_CORRECTIONS = 60

// Adds review corrections to a series, newest last; a later correction of the same
// English line replaces the earlier one.
export function addCorrections(series: SeriesProfile, added: readonly Correction[]): SeriesProfile {
  const fresh = added.filter((c) => c.final.trim() !== "" && c.final !== c.draft)
  if (fresh.length === 0) {
    return series
  }
  const replaced = new Set(fresh.map((c) => c.en))
  const kept = (series.corrections ?? []).filter((c) => !replaced.has(c.en))
  return { ...series, corrections: [...kept, ...fresh].slice(-KEPT_CORRECTIONS) }
}

export function compileCard(base: BaseProfile, series: SeriesProfile): StyleCard {
  if (base.variant !== series.variant) {
    throw new Error("base and series variants differ")
  }
  // A project's glossary entry for a term replaces the style's entry for it.
  const overridden = new Set(
    series.rules.flatMap((rule) => (rule.kind === "glossary" ? [rule.source.toLowerCase()] : [])),
  )
  const baseRules = base.rules.filter(
    (rule) => rule.kind !== "glossary" || !overridden.has(rule.source.toLowerCase()),
  )
  const card: StyleCard = {
    variant: base.variant,
    seriesId: series.id,
    revision: base.cardRevision,
    cpsLimit: series.cpsLimit ?? base.cpsLimit,
    voice: [...base.examples, ...(series.examples ?? [])].map((example) => example.text).join("\n"),
    rules: [...baseRules, ...series.rules],
  }
  const corrections = (series.corrections ?? []).slice(-CARD_CORRECTIONS)
  if (corrections.length > 0) {
    card.corrections = corrections
  }
  return card
}

export function projectPreset(series: SeriesProfile, fallback: Preset): Preset {
  return series.preset ?? fallback
}

export function projectFrames(series: SeriesProfile, fallback: FrameSetting): FrameSetting {
  return series.frameSetting ?? fallback
}
