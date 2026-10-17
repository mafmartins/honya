import { resolve } from "node:path"
import { applyTranslations } from "../../core/ass/write"
import { readSuggestions, suggestionsRequest } from "../../core/library/suggest"
import type { Correction, Rule } from "../../core/library/types"
import { proposedOutputPath } from "../../core/pipeline/preflight"
import type { Completer, Completion } from "../../core/pipeline/run"
import type { ProviderId } from "../../core/pipeline/types"
import { addSpend } from "../../core/providers/prices"
import { correctionsOf, exportWords, learnableEdits } from "../../core/session/exportFile"
import type { Owner } from "./projects"
import type { WorkSessions } from "./sessions"

export interface ExportPreview {
  translated: number
  english: number
  openFlags: number
  defaultPath: string
  suggestions: { rule: Rule; lines: number[] }[]
}

export interface ExportDeps {
  sessions: Pick<WorkSessions, "get" | "save">
  completerFor(provider: ProviderId): Completer
  knownRules(projectId: string): Rule[]
  addCorrections(projectId: string, corrections: Correction[]): void
  addRule(owner: Owner, rule: Rule): void
  writeFile(path: string, text: string): void
  now(): number
}

export interface ExportService {
  preview(sessionId: string): Promise<ExportPreview>
  write(
    sessionId: string,
    path: string,
    rules: { owner: Owner; rule: Rule }[],
  ): { path: string; report: string[] }
}

export function createExportService(deps: ExportDeps): ExportService {
  return {
    async preview(sessionId) {
      const session = deps.sessions.get(sessionId)
      const translated = session.lines.filter((line) => line.words !== null)
      const result: ExportPreview = {
        translated: translated.length,
        english: session.lines.length - translated.length,
        openFlags: translated.filter((line) => line.flag !== null).length,
        defaultPath: proposedOutputPath(session.scriptPath, session.variant),
        suggestions: [],
      }
      const edits = learnableEdits(session)
      if (edits.length === 0) {
        return result
      }
      const known = deps.knownRules(session.projectId)
      const fingerprint = JSON.stringify(
        edits.map(({ index, en, draft, final }) => [index, en, draft, final]),
      )
      const saved = session.suggested
      if (saved?.edits === fingerprint && Array.isArray(saved.suggestions)) {
        // Read again against the current rules: one saved since then is not suggested.
        result.suggestions = readSuggestions(
          { suggestions: saved.suggestions.map(({ rule, lines }) => ({ ...rule, lines })) },
          known,
        )
        return result
      }
      let reply: Completion
      try {
        reply = await deps.completerFor(session.provider)({
          tier: "cheap",
          ...suggestionsRequest(edits, known),
        })
      } catch {
        // Suggestions are optional: a provider failure still lets the export go ahead.
        return result
      }
      if (!("refused" in reply)) {
        result.suggestions = readSuggestions(reply.value, known)
      }
      const spent = reply.spent
      const latest = deps.sessions.get(sessionId)
      deps.sessions.save({
        ...latest,
        spend:
          spent === undefined ? latest.spend : addSpend(latest.spend, spent.model, spent.usage),
        suggested: { edits: fingerprint, suggestions: result.suggestions },
      })
      return result
    },

    write(sessionId, path, rules) {
      const session = deps.sessions.get(sessionId)
      if (resolve(path) === resolve(session.scriptPath)) {
        throw new Error("Choose a different name: Honya never overwrites the original script.")
      }
      const { text, report } = applyTranslations(
        session.scriptText,
        new Set(session.dialogueStyles),
        exportWords(session),
      )
      // The file comes first, so a failed write saves no rules or corrections.
      deps.writeFile(path, text)
      for (const { owner, rule } of rules) {
        deps.addRule(owner, rule)
      }
      const corrections = correctionsOf(session)
      if (corrections.length > 0) {
        deps.addCorrections(session.projectId, corrections)
      }
      const latest = deps.sessions.get(sessionId)
      deps.sessions.save({ ...latest, exportedAt: new Date(deps.now()).toISOString() })
      return { path, report }
    },
  }
}
