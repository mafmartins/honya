import { isRecord } from "../library/guards"
import type { Proposal } from "./review"

export function isEventIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

export function readProposal(value: unknown): Proposal | null {
  if (!isRecord(value) || !Array.isArray(value.siblings)) {
    return null
  }
  const siblings: Proposal["siblings"] = []
  for (const item of value.siblings) {
    if (!isRecord(item) || !isEventIndex(item.eventIndex) || typeof item.words !== "string") {
      return null
    }
    siblings.push({ eventIndex: item.eventIndex, words: item.words })
  }
  const rule = value.rule
  if (rule === null) {
    return { siblings, rule: null }
  }
  if (!isRecord(rule)) {
    return null
  }
  if (rule.kind === "prose" && typeof rule.text === "string") {
    return { siblings, rule: { kind: "prose", text: rule.text } }
  }
  if (rule.kind === "glossary" && typeof rule.source === "string" && typeof rule.pt === "string") {
    return { siblings, rule: { kind: "glossary", source: rule.source, pt: rule.pt } }
  }
  return null
}
