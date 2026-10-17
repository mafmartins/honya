import { randomUUID } from "node:crypto"
import { addCorrections, emptyBase, importExample } from "../../core/library/card"
import { exampleText } from "../../core/library/example"
import type { FileProfileStore } from "../../core/library/fileStore"
import type {
  BaseProfile,
  Correction,
  Rule,
  SeriesProfile,
  Variant,
} from "../../core/library/types"

export interface SeriesSummary {
  id: string
  name: string
  ruleCount: number
}

export interface SeriesList {
  series: SeriesSummary[]
  problems: string[]
}

export interface LoadedBase {
  base: BaseProfile
  problems: string[]
}

export interface ProfileHandlers {
  listSeries(variant: Variant): SeriesList
  createSeries(variant: Variant, name: string): SeriesSummary
  renameSeries(variant: Variant, id: string, name: string): SeriesSummary
  deleteSeries(variant: Variant, id: string): void
  loadSeriesRules(variant: Variant, id: string): Rule[]
  saveSeriesRules(variant: Variant, id: string, rules: Rule[]): void
  loadBase(variant: Variant): LoadedBase
  saveBase(base: BaseProfile): BaseProfile
  importExample(variant: Variant, name: string, text: string, dialogueStyles: string[]): BaseProfile
  loadSeries(variant: Variant, id: string): SeriesProfile
  addCorrections(variant: Variant, id: string, corrections: Correction[]): void
}

export function createProfileHandlers(
  store: FileProfileStore,
  newId: () => string = randomUUID,
): ProfileHandlers {
  const currentBase = (variant: Variant): BaseProfile =>
    store.loadBase(variant) ?? emptyBase(variant)

  const writeBase = (base: BaseProfile): BaseProfile => {
    const next = { ...base, cardRevision: currentBase(base.variant).cardRevision + 1 }
    store.saveBase(next)
    return next
  }

  const requireSeries = (variant: Variant, id: string): SeriesProfile => {
    const series = store.loadSeries(variant, id)
    if (series === null) {
      throw new Error("That series no longer exists.")
    }
    return series
  }

  const checkName = (variant: Variant, name: string, exceptId: string | null): string => {
    const trimmed = name.trim()
    if (trimmed === "") {
      throw new Error("Give the series a name.")
    }
    const key = trimmed.toLowerCase()
    const taken = store
      .listSeries(variant)
      .some((series) => series.id !== exceptId && series.name.trim().toLowerCase() === key)
    if (taken) {
      throw new Error(`A series called ${trimmed} already exists for ${variant}.`)
    }
    return trimmed
  }

  return {
    listSeries(variant) {
      const series = store.listSeries(variant).map(summary)
      return { series, problems: store.takeProblems() }
    },
    createSeries(variant, name) {
      const series = { id: newId(), variant, name: checkName(variant, name, null), rules: [] }
      store.saveSeries(series)
      return summary(series)
    },
    renameSeries(variant, id, name) {
      requireSeries(variant, id)
      const renamed = store.renameSeries(variant, id, checkName(variant, name, id))
      if (renamed === null) {
        throw new Error("That series no longer exists.")
      }
      return summary(renamed)
    },
    deleteSeries(variant, id) {
      store.deleteSeries(variant, id)
    },
    loadSeries(variant, id) {
      return requireSeries(variant, id)
    },
    addCorrections(variant, id, corrections) {
      const series = requireSeries(variant, id)
      const next = addCorrections(series, corrections)
      if (next !== series) {
        store.saveSeries(next)
      }
    },
    loadSeriesRules(variant, id) {
      return requireSeries(variant, id).rules
    },
    saveSeriesRules(variant, id, rules) {
      const series = requireSeries(variant, id)
      store.saveSeries({ ...series, rules })
      writeBase(currentBase(variant))
    },
    loadBase(variant) {
      const base = currentBase(variant)
      return { base, problems: store.takeProblems() }
    },
    saveBase(base) {
      if (!Number.isInteger(base.cpsLimit) || base.cpsLimit < 1 || base.cpsLimit > 60) {
        throw new Error("Characters per second must be a whole number from 1 to 60.")
      }
      return writeBase(base)
    },
    importExample(variant, name, text, dialogueStyles) {
      const body = exampleText(text, dialogueStyles)
      if (body === "") {
        throw new Error("None of the chosen styles has dialogue in this script.")
      }
      return writeBase(importExample(currentBase(variant), name, body))
    },
  }
}

function summary(series: SeriesProfile): SeriesSummary {
  return { id: series.id, name: series.name, ruleCount: series.rules.length }
}
