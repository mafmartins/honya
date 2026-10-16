import { emptyBase } from "../../src/core/library/card"
import type {
  BaseProfile,
  ModelPair,
  ProviderId,
  Rule,
  SeriesSummary,
  SetupApi,
  Variant,
} from "../../src/shared/api"

export function fakeApi(overrides: Partial<SetupApi> = {}): SetupApi {
  const keys = new Set<ProviderId>()
  const models = new Map<ProviderId, ModelPair>()
  const series = new Map<Variant, (SeriesSummary & { rules: Rule[] })[]>([
    ["pt-pt", []],
    ["pt-br", []],
  ])
  const bases = new Map<Variant, BaseProfile>([
    ["pt-pt", emptyBase("pt-pt")],
    ["pt-br", emptyBase("pt-br")],
  ])
  let next = 0
  const listOf = (variant: Variant): (SeriesSummary & { rules: Rule[] })[] =>
    series.get(variant) ?? []
  const summary = (item: SeriesSummary & { rules: Rule[] }): SeriesSummary => ({
    id: item.id,
    name: item.name,
    ruleCount: item.rules.length,
  })
  const find = (variant: Variant, id: string): SeriesSummary & { rules: Rule[] } => {
    const item = listOf(variant).find((entry) => entry.id === id)
    if (item === undefined) {
      throw new Error("That series no longer exists.")
    }
    return item
  }
  const api: SetupApi = {
    pickScript: () => Promise.resolve(null),
    pickVideo: () => Promise.resolve(null),
    pickExample: () => Promise.resolve(null),
    hasKey: (provider) => Promise.resolve(keys.has(provider)),
    setKey: (provider) => {
      keys.add(provider)
      return Promise.resolve()
    },
    removeKey: (provider) => {
      keys.delete(provider)
      return Promise.resolve()
    },
    getModels: (provider) =>
      Promise.resolve(
        models.get(provider) ?? { cheap: `${provider}-cheap`, strong: `${provider}-strong` },
      ),
    setModels: (provider, pair) => {
      models.set(provider, pair)
      return Promise.resolve(pair)
    },
    resetModels: (provider) => {
      models.delete(provider)
      return Promise.resolve({ cheap: `${provider}-cheap`, strong: `${provider}-strong` })
    },
    listSeries: (variant) =>
      Promise.resolve({ series: listOf(variant).map(summary), problems: [] }),
    createSeries: (variant, name) => {
      next += 1
      const item = { id: `id-${String(next)}`, name: name.trim(), ruleCount: 0, rules: [] }
      listOf(variant).push(item)
      return Promise.resolve(summary(item))
    },
    renameSeries: (variant, id, name) => {
      const item = find(variant, id)
      item.name = name
      return Promise.resolve(summary(item))
    },
    deleteSeries: (variant, id) => {
      series.set(
        variant,
        listOf(variant).filter((item) => item.id !== id),
      )
      return Promise.resolve()
    },
    loadSeriesRules: (variant, id) => Promise.resolve(find(variant, id).rules),
    saveSeriesRules: (variant, id, rules) => {
      find(variant, id).rules = rules
      return Promise.resolve()
    },
    loadBase: (variant) =>
      Promise.resolve({ base: bases.get(variant) ?? emptyBase(variant), problems: [] }),
    saveBase: (base) => {
      bases.set(base.variant, base)
      return Promise.resolve(base)
    },
    importExample: (variant, name, text) => {
      const base = bases.get(variant) ?? emptyBase(variant)
      const saved = { ...base, examples: [...base.examples, { name, text }] }
      bases.set(variant, saved)
      return Promise.resolve(saved)
    },
  }
  return { ...api, ...overrides }
}
