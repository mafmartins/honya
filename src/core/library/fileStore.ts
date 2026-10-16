import { randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { compileCard } from "./card"
import { readBaseProfile, readSeriesProfile } from "./guards"
import type { BaseProfile, ProfileStore, SeriesProfile, StyleCard, Variant } from "./types"

export interface FileProfileStore extends ProfileStore {
  renameSeries(variant: Variant, id: string, name: string): SeriesProfile | null
  deleteSeries(variant: Variant, id: string): boolean
  takeProblems(): string[]
}

export interface FileOps {
  writeFile(path: string, data: string): void
}

const SERIES_ID = /^[A-Za-z0-9-]+$/

const DEFAULT_OPS: FileOps = {
  writeFile(path, data) {
    writeFileSync(path, data, "utf8")
  },
}

export function createFileStore(dir: string, ops: FileOps = DEFAULT_OPS): FileProfileStore {
  let problems: string[] = []
  const cards = new Map<string, StyleCard>()

  const basePath = (variant: Variant): string => join(dir, `base-${variant}.json`)
  const seriesFolder = (variant: Variant): string => join(dir, "series", variant)
  const seriesPath = (variant: Variant, id: string): string => {
    if (!SERIES_ID.test(id)) {
      throw new Error("Invalid series id.")
    }
    return join(seriesFolder(variant), `${id}.json`)
  }

  const writeJson = (path: string, value: unknown): void => {
    mkdirSync(dirname(path), { recursive: true })
    const temp = `${path}.${randomUUID()}.tmp`
    try {
      ops.writeFile(temp, JSON.stringify(value, null, 2))
      renameSync(temp, path)
    } catch (error) {
      rmSync(temp, { force: true })
      throw error
    }
  }

  const loadBase = (variant: Variant): BaseProfile | null => {
    const path = basePath(variant)
    if (!existsSync(path)) {
      return null
    }
    const base = readBaseProfile(readJson(path))
    if (base === null || base.variant !== variant) {
      const name = `base-${variant}.json`
      renameSync(path, `${path}.bad`)
      problems.push(`${name} couldn't be read and was moved to ${name}.bad.`)
      return null
    }
    return base
  }

  const loadSeries = (variant: Variant, id: string): SeriesProfile | null => {
    const path = seriesPath(variant, id)
    if (!existsSync(path)) {
      return null
    }
    const series = readSeriesProfile(readJson(path))
    return series !== null && series.variant === variant && series.id === id ? series : null
  }

  const saveSeries = (series: SeriesProfile): void => {
    writeJson(seriesPath(series.variant, series.id), series)
  }

  return {
    saveBase(base) {
      writeJson(basePath(base.variant), base)
    },
    loadBase,
    saveSeries,
    loadSeries,
    listSeries(variant) {
      const folder = seriesFolder(variant)
      if (!existsSync(folder)) {
        return []
      }
      const found: SeriesProfile[] = []
      for (const file of readdirSync(folder)) {
        if (!file.endsWith(".json")) {
          continue
        }
        const id = file.slice(0, -".json".length)
        const series = SERIES_ID.test(id) ? loadSeries(variant, id) : null
        if (series === null) {
          problems.push(`Couldn't read series file ${file}.`)
          continue
        }
        found.push(series)
      }
      return found.sort((left, right) => left.name.localeCompare(right.name))
    },
    renameSeries(variant, id, name) {
      const series = loadSeries(variant, id)
      if (series === null) {
        return null
      }
      const renamed = { ...series, name }
      saveSeries(renamed)
      return renamed
    },
    deleteSeries(variant, id) {
      const path = seriesPath(variant, id)
      if (!existsSync(path)) {
        return false
      }
      rmSync(path)
      return true
    },
    loadCard(variant, seriesId) {
      const base = loadBase(variant)
      const series = loadSeries(variant, seriesId)
      if (base === null || series === null) {
        return null
      }
      const card = compileCard(base, series)
      cards.set(`${variant}:${seriesId}`, card)
      return card
    },
    cardIsStale(variant, seriesId) {
      const card = cards.get(`${variant}:${seriesId}`)
      return card?.revision !== loadBase(variant)?.cardRevision
    },
    takeProblems() {
      const taken = problems
      problems = []
      return taken
    },
  }
}

function readJson(path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
    return parsed
  } catch {
    return null
  }
}
