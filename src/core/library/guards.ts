import type { BaseProfile, ExampleScript, Rule, SeriesProfile, Variant } from "./types"

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
  return { id: value.id, variant: value.variant, name: value.name, rules: value.rules }
}
