import type {
  BaseProfile,
  Correction,
  ExampleScript,
  FrameSetting,
  Rule,
  SeriesProfile,
  Variant,
} from "./types"
import type { Preset, ProviderId } from "../pipeline/types"

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isVariant(value: unknown): value is Variant {
  return value === "pt-pt" || value === "pt-br"
}

export function isRule(value: unknown): value is Rule {
  if (!isRecord(value)) {
    return false
  }
  if (value.kind === "prose") {
    return typeof value.text === "string"
  }
  if (value.kind === "glossary") {
    return typeof value.source === "string" && typeof value.pt === "string"
  }
  return false
}

export function isRuleList(value: unknown): value is Rule[] {
  return Array.isArray(value) && value.every(isRule)
}

function isExample(value: unknown): value is ExampleScript {
  return isRecord(value) && typeof value.name === "string" && typeof value.text === "string"
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function readBaseProfile(value: unknown): BaseProfile | null {
  if (!isRecord(value) || !isVariant(value.variant)) {
    return null
  }
  if (!isFiniteNumber(value.cpsLimit) || !isFiniteNumber(value.cardRevision)) {
    return null
  }
  const examples = value.examples
  const rules = value.rules
  if (!Array.isArray(examples) || !examples.every(isExample) || !isRuleList(rules)) {
    return null
  }
  return {
    variant: value.variant,
    cpsLimit: value.cpsLimit,
    examples: examples.map((example) => ({ name: example.name, text: example.text })),
    rules,
    cardRevision: value.cardRevision,
  }
}

export function readSeriesProfile(value: unknown): SeriesProfile | null {
  if (!isRecord(value) || !isVariant(value.variant)) {
    return null
  }
  if (typeof value.id !== "string" || typeof value.name !== "string" || !isRuleList(value.rules)) {
    return null
  }
  const series: SeriesProfile = {
    id: value.id,
    variant: value.variant,
    name: value.name,
    rules: value.rules,
  }
  if (value.corrections !== undefined) {
    if (!Array.isArray(value.corrections) || !value.corrections.every(isCorrection)) {
      return null
    }
    series.corrections = value.corrections.map((c) => ({
      en: c.en,
      draft: c.draft,
      final: c.final,
    }))
  }
  if (
    typeof value.cpsLimit === "number" &&
    Number.isInteger(value.cpsLimit) &&
    value.cpsLimit >= 1 &&
    value.cpsLimit <= 60
  ) {
    series.cpsLimit = value.cpsLimit
  }
  if (isPreset(value.preset)) {
    series.preset = value.preset
  }
  if (isFrameSetting(value.frameSetting)) {
    series.frameSetting = value.frameSetting
  }
  if (value.examples !== undefined) {
    if (!Array.isArray(value.examples) || !value.examples.every(isExample)) {
      return null
    }
    series.examples = value.examples.map((example) => ({ name: example.name, text: example.text }))
  }
  return series
}

export function isPreset(value: unknown): value is Preset {
  return value === "save" || value === "balanced" || value === "best"
}

export function isFrameSetting(value: unknown): value is FrameSetting {
  return value === "none" || value === "marked" || value === "every"
}

export function isProviderId(value: unknown): value is ProviderId {
  return value === "claude" || value === "gpt" || value === "gemini" || value === "mistral"
}

function isCorrection(value: unknown): value is Correction {
  return (
    isRecord(value) &&
    typeof value.en === "string" &&
    typeof value.draft === "string" &&
    typeof value.final === "string"
  )
}
