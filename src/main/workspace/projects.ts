import { randomUUID } from "node:crypto"
import { emptyBase } from "../../core/library/card"
import { exampleText } from "../../core/library/example"
import type { FileProfileStore } from "../../core/library/fileStore"
import type {
  BaseProfile,
  ExampleScript,
  FrameSetting,
  Rule,
  SeriesProfile,
  Variant,
} from "../../core/library/types"
import type { Preset } from "../../core/pipeline/types"
import type { AppSettings } from "../settingsStore"

export type Owner = { kind: "style"; variant: Variant } | { kind: "project"; id: string }

export interface ProjectSummary {
  id: string
  name: string
  variant: Variant
  sessions: number
  lastActivity: string | null
}

export interface RulesView {
  own: Rule[]
  inherited: Rule[]
}

export interface ProjectView {
  summary: ProjectSummary
  rules: RulesView
  cpsLimit: number | null
  styleCps: number
  preset: Preset
  frameSetting: FrameSetting
  references: ExampleScript[]
  languageLocked: boolean
}

export interface StyleView {
  variant: Variant
  rules: Rule[]
  cpsLimit: number
  references: ExampleScript[]
  usedBy: string[]
}

export interface ProjectPatch {
  name?: string
  cpsLimit?: number | null
  preset?: Preset
  frameSetting?: FrameSetting
  variant?: Variant
}

export interface ProjectService {
  listProjects(): ProjectSummary[]
  getProject(id: string): ProjectView
  getStyle(variant: Variant): StyleView
  createProject(name: string, variant: Variant): ProjectSummary
  updateProject(id: string, patch: ProjectPatch): ProjectView
  deleteProject(id: string): void
  updateStyle(variant: Variant, patch: { cpsLimit?: number }): StyleView
  saveRules(owner: Owner, rules: Rule[]): void
  addRule(owner: Owner, rule: Rule): void
  addReference(owner: Owner, name: string, text: string, dialogueStyles: string[]): void
  knownRules(owner: Owner): Rule[]
}

const VARIANTS: Variant[] = ["pt-pt", "pt-br"]

export function createProjectService(
  store: FileProfileStore,
  sessionsFor: (projectId: string) => { count: number; last: string | null },
  settings: () => AppSettings,
  newId: () => string = randomUUID,
): ProjectService {
  const base = (variant: Variant): BaseProfile => store.loadBase(variant) ?? emptyBase(variant)

  // Saving a base bumps its revision so cards compiled from older rules are stale.
  const writeBase = (next: BaseProfile): void => {
    store.saveBase({ ...next, cardRevision: base(next.variant).cardRevision + 1 })
  }

  const find = (id: string): SeriesProfile => {
    for (const variant of VARIANTS) {
      const found = store.listSeries(variant).find((series) => series.id === id)
      if (found !== undefined) {
        return found
      }
    }
    throw new Error("That project no longer exists.")
  }

  const saveSeries = (series: SeriesProfile): void => {
    store.saveSeries(series)
    writeBase(base(series.variant))
  }

  const summary = (series: SeriesProfile): ProjectSummary => {
    const { count, last } = sessionsFor(series.id)
    return {
      id: series.id,
      name: series.name,
      variant: series.variant,
      sessions: count,
      lastActivity: last,
    }
  }

  const checkName = (variant: Variant, name: string, exceptId: string | null): string => {
    const trimmed = name.trim()
    if (trimmed === "") {
      throw new Error("Give the project a name.")
    }
    const key = trimmed.toLowerCase()
    const taken = store
      .listSeries(variant)
      .some((series) => series.id !== exceptId && series.name.trim().toLowerCase() === key)
    if (taken) {
      throw new Error(`A project called ${trimmed} already exists for ${variant}.`)
    }
    return trimmed
  }

  const checkCps = (cps: number): number => {
    if (!Number.isInteger(cps) || cps < 1 || cps > 60) {
      throw new Error("Characters per second must be a whole number from 1 to 60.")
    }
    return cps
  }

  const view = (series: SeriesProfile): ProjectView => {
    const sum = summary(series)
    const style = base(series.variant)
    return {
      summary: sum,
      rules: { own: series.rules, inherited: style.rules },
      cpsLimit: series.cpsLimit ?? null,
      styleCps: style.cpsLimit,
      preset: series.preset ?? settings().defaults.preset,
      frameSetting: series.frameSetting ?? settings().defaults.frameSetting,
      references: series.examples ?? [],
      languageLocked: sum.sessions > 0,
    }
  }

  const styleView = (variant: Variant): StyleView => {
    const style = base(variant)
    return {
      variant,
      rules: style.rules,
      cpsLimit: style.cpsLimit,
      references: style.examples,
      usedBy: store.listSeries(variant).map((series) => series.name),
    }
  }

  const referenceBody = (text: string, dialogueStyles: string[]): string => {
    const body = exampleText(text, dialogueStyles)
    if (body === "") {
      throw new Error("None of the chosen styles has dialogue in this script.")
    }
    return body
  }

  return {
    listProjects() {
      return VARIANTS.flatMap((variant) => store.listSeries(variant).map(summary)).sort(
        (left, right) => left.name.localeCompare(right.name),
      )
    },
    getProject: (id) => view(find(id)),
    getStyle: styleView,
    // The project keeps the defaults it was made with: changing Settings later
    // doesn't change existing projects.
    createProject(name, variant) {
      const { defaults } = settings()
      const series: SeriesProfile = {
        id: newId(),
        variant,
        name: checkName(variant, name, null),
        rules: [],
        preset: defaults.preset,
        frameSetting: defaults.frameSetting,
      }
      store.saveSeries(series)
      return summary(series)
    },
    updateProject(id, patch) {
      const current = find(id)
      const next: SeriesProfile = { ...current }
      if (patch.variant !== undefined && patch.variant !== current.variant) {
        if (sessionsFor(id).count > 0) {
          throw new Error("The language can't change once the project has sessions.")
        }
        next.variant = patch.variant
      }
      if (patch.name !== undefined || next.variant !== current.variant) {
        next.name = checkName(next.variant, patch.name ?? current.name, id)
      }
      if (patch.cpsLimit === null) {
        delete next.cpsLimit
      } else if (patch.cpsLimit !== undefined) {
        next.cpsLimit = checkCps(patch.cpsLimit)
      }
      if (patch.preset !== undefined) {
        next.preset = patch.preset
      }
      if (patch.frameSetting !== undefined) {
        next.frameSetting = patch.frameSetting
      }
      const settingsChanged =
        patch.cpsLimit !== undefined ||
        patch.preset !== undefined ||
        patch.frameSetting !== undefined
      if (settingsChanged || next.variant !== current.variant) {
        saveSeries(next)
      } else {
        store.saveSeries(next)
      }
      // The old file goes only once the new one is saved, so a failed move loses nothing.
      if (next.variant !== current.variant) {
        store.deleteSeries(current.variant, id)
      }
      return view(next)
    },
    deleteProject(id) {
      const series = find(id)
      store.deleteSeries(series.variant, id)
    },
    updateStyle(variant, patch) {
      if (patch.cpsLimit !== undefined) {
        writeBase({ ...base(variant), cpsLimit: checkCps(patch.cpsLimit) })
      }
      return styleView(variant)
    },
    saveRules(owner, rules) {
      if (owner.kind === "style") {
        writeBase({ ...base(owner.variant), rules })
      } else {
        saveSeries({ ...find(owner.id), rules })
      }
    },
    addRule(owner, rule) {
      if (owner.kind === "style") {
        const style = base(owner.variant)
        writeBase({ ...style, rules: [...style.rules, rule] })
      } else {
        const series = find(owner.id)
        saveSeries({ ...series, rules: [...series.rules, rule] })
      }
    },
    addReference(owner, name, text, dialogueStyles) {
      const body = referenceBody(text, dialogueStyles)
      if (owner.kind === "style") {
        const style = base(owner.variant)
        writeBase({ ...style, examples: [...style.examples, { name, text: body }] })
      } else {
        const series = find(owner.id)
        saveSeries({ ...series, examples: [...(series.examples ?? []), { name, text: body }] })
      }
    },
    knownRules(owner) {
      if (owner.kind === "style") {
        return base(owner.variant).rules
      }
      const series = find(owner.id)
      return [...base(series.variant).rules, ...series.rules]
    },
  }
}
