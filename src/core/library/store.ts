import { compileCard } from "./card"
import type { BaseProfile, ProfileStore, SeriesProfile, StyleCard, Variant } from "./types"

function seriesKey(variant: Variant, id: string): string {
  return `${variant}:${id}`
}

export function createMemoryStore(): ProfileStore {
  const bases = new Map<Variant, BaseProfile>()
  const seriesByKey = new Map<string, SeriesProfile>()
  const cards = new Map<string, StyleCard>()

  return {
    saveBase(base) {
      bases.set(base.variant, base)
    },
    loadBase(variant) {
      return bases.get(variant) ?? null
    },
    saveSeries(series) {
      seriesByKey.set(seriesKey(series.variant, series.id), series)
    },
    loadSeries(variant, id) {
      return seriesByKey.get(seriesKey(variant, id)) ?? null
    },
    listSeries(variant) {
      return [...seriesByKey.values()].filter((series) => series.variant === variant)
    },
    loadCard(variant, seriesId) {
      const base = bases.get(variant)
      const series = seriesByKey.get(seriesKey(variant, seriesId))
      if (base === undefined || series === undefined) {
        return null
      }
      const card = compileCard(base, series)
      cards.set(seriesKey(variant, seriesId), card)
      return card
    },
    cardIsStale(variant, seriesId) {
      const base = bases.get(variant)
      const card = cards.get(seriesKey(variant, seriesId))
      const storedRevision = card?.revision
      const baseRevision = base?.cardRevision
      return storedRevision !== baseRevision
    },
  }
}
