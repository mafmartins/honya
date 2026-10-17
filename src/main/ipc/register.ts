import { ipcMain } from "electron"
import { isRecord, isRuleList } from "../../core/library/guards"
import type { ProviderId } from "../../core/pipeline/types"
import type { ModelStore } from "../modelStore"
import type { SecretStore } from "../secrets"
import { pickExample, type OpenFile } from "./files"
import type { Learner } from "../learn"
import { readOwner } from "./workspace"
import type { LearnScript, Learned } from "../../core/library/learn"

export interface SetupDeps {
  open: OpenFile
  secrets: SecretStore
  models: ModelStore
  learner: Learner
}

export function registerSetupIpc(deps: SetupDeps): void {
  const { open, secrets, models, learner } = deps
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
  handle("honya:learn-from-script", (args) => {
    const owner = readOwner(args[0])
    if (owner === null) {
      throw new Error("Invalid rule owner.")
    }
    const portuguese = learnScript(args[2])
    const english = args[3] === null ? null : learnScript(args[3])
    if (portuguese === undefined || portuguese === null || english === undefined) {
      throw new Error("Invalid script.")
    }
    return learner.learn(owner, provider(args, 1), portuguese, english)
  })
  handle("honya:combine-learned", (args) => {
    const learned = learnedList(args[1])
    if (learned === null) {
      throw new Error("Invalid suggestions.")
    }
    return learner.combine(provider(args, 0), learned)
  })
}

function learnedList(value: unknown): Learned[] | null {
  if (!Array.isArray(value)) {
    return null
  }
  const list: Learned[] = []
  for (const item of value as readonly unknown[]) {
    if (
      !isRecord(item) ||
      typeof item.pairs !== "number" ||
      !isRuleList(item.glossary) ||
      !isRuleList(item.rules)
    ) {
      return null
    }
    list.push({
      glossary: item.glossary.flatMap((rule) => (rule.kind === "glossary" ? [rule] : [])),
      rules: item.rules.flatMap((rule) => (rule.kind === "prose" ? [rule] : [])),
      pairs: item.pairs,
    })
  }
  return list
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

function text(args: readonly unknown[], index: number): string {
  const value = args[index]
  if (typeof value !== "string") {
    throw new Error("Invalid text argument.")
  }
  return value
}
