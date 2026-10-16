import type { BaseProfile, Rule, SeriesProfile, StyleCard, Variant } from "./types"

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
      id: series.id,
      variant: series.variant,
      name: series.name,
      rules: target === "series" ? [...series.rules, rule] : series.rules,
    },
  }
}

export function compileCard(base: BaseProfile, series: SeriesProfile): StyleCard {
  if (base.variant !== series.variant) {
    throw new Error("base and series variants differ")
  }
  return {
    variant: base.variant,
    seriesId: series.id,
    revision: base.cardRevision,
    cpsLimit: base.cpsLimit,
    voice: base.examples.map((example) => example.text).join("\n"),
    rules: [...base.rules, ...series.rules],
  }
}
