import type { Rule } from "../shared/api"

export function formatRule(rule: Rule): string {
  return rule.kind === "prose" ? rule.text : `${rule.source} → ${rule.pt}`
}
