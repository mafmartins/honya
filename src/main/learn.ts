import {
  combineGlossary,
  combineRulesExactly,
  dialogueOf,
  LEARN_SCHEMA,
  learnRequest,
  MERGE_SCHEMA,
  mergeRequest,
  rankSuggestions,
  readLearned,
  readMerged,
  type Combined,
  type LearnScript,
  type Learned,
} from "../core/library/learn"
import type { Rule, Variant } from "../core/library/types"
import type { Completer } from "../core/pipeline/run"
import type { ProviderId } from "../core/pipeline/types"
import type { Owner } from "./workspace/projects"

export interface LearnDeps {
  // The rules the owner already has (a project's include its style's), so proposals
  // skip what is already there.
  knownRules(owner: Owner): Rule[]
  // The language the owner's references are in.
  variantOf(owner: Owner): Variant
  completerFor(provider: ProviderId): Completer
}

export interface Learner {
  learn(
    owner: Owner,
    provider: ProviderId,
    portuguese: LearnScript,
    english: LearnScript | null,
  ): Promise<Learned>
  // Combines what several episodes taught, counting how many support each suggestion.
  combine(provider: ProviderId, learned: Learned[]): Promise<Combined>
}

export function createLearner(deps: LearnDeps): Learner {
  return {
    async learn(owner, provider, portuguese, english) {
      const pt = dialogueOf(portuguese)
      if (pt.length === 0) {
        throw new Error("None of the chosen styles has dialogue in the translated script.")
      }
      const en = english === null ? null : dialogueOf(english)
      if (en !== null && en.length === 0) {
        throw new Error("None of the chosen styles has dialogue in the English script.")
      }
      const known = deps.knownRules(owner)
      const request = learnRequest(deps.variantOf(owner), pt, en, known)
      if (en !== null && request.pairs === 0) {
        throw new Error(
          "The English and translated scripts have no lines at the same times. Check that they are the same episode.",
        )
      }
      // A one-off read of a whole episode: worth the strong model.
      const reply = await deps.completerFor(provider)({
        tier: "strong",
        system: request.system,
        prompt: request.prompt,
        schema: LEARN_SCHEMA,
      })
      if ("refused" in reply) {
        throw new Error(
          `The model's reply couldn't be used (${reply.reason ?? "refused"}). Try again.`,
        )
      }
      const learned = readLearned(reply.value, known, request.pairs)
      if (typeof learned === "string") {
        throw new Error(`The model's reply couldn't be used (${learned}). Try again.`)
      }
      return learned
    },
    async combine(provider, learned) {
      const glossary = combineGlossary(learned)
      const pairs = learned.reduce((sum, episode) => sum + episode.pairs, 0)
      let rules = combineRulesExactly(learned)
      // Rules in different words only need merging when there are several episodes.
      if (learned.length > 1 && rules.length > 1) {
        const request = mergeRequest(learned)
        try {
          const reply = await deps.completerFor(provider)({
            tier: "cheap",
            system: request.system,
            prompt: request.prompt,
            schema: MERGE_SCHEMA,
          })
          const merged = "refused" in reply ? null : readMerged(reply.value, learned.length)
          if (Array.isArray(merged) && merged.length > 0) {
            rules = merged
          }
        } catch {
          // Keep the exact merge: the suggestions are still right, just less tidy.
        }
      }
      return {
        suggestions: rankSuggestions([...glossary, ...rules]),
        episodes: learned.length,
        pairs,
      }
    },
  }
}
