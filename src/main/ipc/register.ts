import { ipcMain } from "electron"
import { isRecord, isRuleList, isVariant, readBaseProfile } from "../../core/library/guards"
import type { ProviderId } from "../../core/pipeline/types"
import type { ModelStore } from "../modelStore"
import type { SecretStore } from "../secrets"
import { pickExample, pickScript, pickVideo, type OpenFile } from "./files"
import type { ProfileHandlers } from "./profiles"
import type { Learner } from "../learn"
import type { LearnScript } from "../../core/library/learn"

export interface SetupDeps {
  open: OpenFile
  secrets: SecretStore
  models: ModelStore
  profiles: ProfileHandlers
  learner: Learner
}

export function registerSetupIpc(deps: SetupDeps): void {
  const { open, secrets, models, profiles, learner } = deps
  handle("honya:pick-script", () => pickScript(open))
  handle("honya:pick-video", () => pickVideo(open))
  handle("honya:pick-example", () => pickExample(open))
  handle("honya:has-key", (args) => secrets.hasKey(provider(args, 0)))
  handle("honya:set-key", (args) => {
    secrets.setKey(provider(args, 0), text(args, 1))
    return null
  })
  handle("honya:remove-key", (args) => {
    secrets.removeKey(provider(args, 0))
    return null
  })
  handle("honya:get-models", (args) => models.get(provider(args, 0)))
  handle("honya:set-models", (args) => {
    const pair = args[1]
    if (!isRecord(pair) || typeof pair.cheap !== "string" || typeof pair.strong !== "string") {
      throw new Error("Invalid model ids.")
    }
    return models.set(provider(args, 0), { cheap: pair.cheap, strong: pair.strong })
  })
  handle("honya:reset-models", (args) => models.reset(provider(args, 0)))
  handle("honya:list-series", (args) => profiles.listSeries(variant(args, 0)))
  handle("honya:create-series", (args) => profiles.createSeries(variant(args, 0), text(args, 1)))
  handle("honya:rename-series", (args) =>
    profiles.renameSeries(variant(args, 0), text(args, 1), text(args, 2)),
  )
  handle("honya:delete-series", (args) => {
    profiles.deleteSeries(variant(args, 0), text(args, 1))
    return null
  })
  handle("honya:load-series-rules", (args) =>
    profiles.loadSeriesRules(variant(args, 0), text(args, 1)),
  )
  handle("honya:save-series-rules", (args) => {
    const rules = args[2]
    if (!isRuleList(rules)) {
      throw new Error("Invalid rules.")
    }
    profiles.saveSeriesRules(variant(args, 0), text(args, 1), rules)
    return null
  })
  handle("honya:load-base", (args) => profiles.loadBase(variant(args, 0)))
  handle("honya:save-base", (args) => {
    const base = readBaseProfile(args[0])
    if (base === null) {
      throw new Error("Invalid base profile.")
    }
    return profiles.saveBase(base)
  })
  handle("honya:import-example", (args) => {
    const styles = args[3]
    if (!Array.isArray(styles) || !styles.every((style) => typeof style === "string")) {
      throw new Error("Invalid styles.")
    }
    return profiles.importExample(variant(args, 0), text(args, 1), text(args, 2), styles)
  })
  handle("honya:learn-from-script", (args) => {
    const portuguese = learnScript(args[3])
    const english = args[4] === null ? null : learnScript(args[4])
    if (portuguese === undefined || portuguese === null || english === undefined) {
      throw new Error("Invalid script.")
    }
    return learner.learn(variant(args, 0), text(args, 1), provider(args, 2), portuguese, english)
  })
}

// undefined when the value isn't a script; null is kept for "no English".
function learnScript(value: unknown): LearnScript | null | undefined {
  if (
    !isRecord(value) ||
    typeof value.text !== "string" ||
    !Array.isArray(value.dialogueStyles) ||
    !value.dialogueStyles.every((style) => typeof style === "string")
  ) {
    return undefined
  }
  return { text: value.text, dialogueStyles: value.dialogueStyles }
}

function handle(channel: string, run: (args: readonly unknown[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]) => run(args))
}

function provider(args: readonly unknown[], index: number): ProviderId {
  const value = args[index]
  if (value === "claude" || value === "gpt" || value === "gemini" || value === "mistral") {
    return value
  }
  throw new Error("Invalid provider.")
}

function variant(args: readonly unknown[], index: number): "pt-pt" | "pt-br" {
  const value = args[index]
  if (!isVariant(value)) {
    throw new Error("Invalid variant.")
  }
  return value
}

function text(args: readonly unknown[], index: number): string {
  const value = args[index]
  if (typeof value !== "string") {
    throw new Error("Invalid text argument.")
  }
  return value
}
