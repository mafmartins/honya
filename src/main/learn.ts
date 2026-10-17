import {
  dialogueOf,
  LEARN_SCHEMA,
  learnRequest,
  readLearned,
  type LearnScript,
  type Learned,
} from "../core/library/learn"
import type { Rule, Variant } from "../core/library/types"
import type { Completer } from "../core/pipeline/run"
import type { ProviderId } from "../core/pipeline/types"

export interface LearnDeps {
  // The series' and the base profile's rules, so proposals skip what is already there.
  knownRules(variant: Variant, seriesId: string): Rule[]
  completerFor(provider: ProviderId): Completer
}

export interface Learner {
  learn(
    variant: Variant,
    seriesId: string,
    provider: ProviderId,
    portuguese: LearnScript,
    english: LearnScript | null,
  ): Promise<Learned>
}

export function createLearner(deps: LearnDeps): Learner {
  return {
    async learn(variant, seriesId, provider, portuguese, english) {
      const pt = dialogueOf(portuguese)
      if (pt.length === 0) {
        throw new Error("None of the chosen styles has dialogue in the translated script.")
      }
      const en = english === null ? null : dialogueOf(english)
      if (en !== null && en.length === 0) {
        throw new Error("None of the chosen styles has dialogue in the English script.")
      }
      const known = deps.knownRules(variant, seriesId)
      const request = learnRequest(variant, pt, en, known)
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
  }
}
