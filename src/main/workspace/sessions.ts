import { randomUUID } from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { basename, join } from "node:path"
import { classifyScript } from "../../core/ass/classify"
import { charLimit } from "../../core/ass/fit"
import { readAss, type DialogueCue } from "../../core/ass/script"
import { isRecord } from "../../core/library/guards"
import type { FrameSetting, StyleCard, Variant } from "../../core/library/types"
import type { Preset, ProviderId } from "../../core/pipeline/types"
import { alreadyPortuguese } from "../../core/session/detect"
import { acceptLine, addActivity, editLine, emptyLines, isFinished } from "../../core/session/lines"
import { migrateV2 } from "../../core/session/migrate"
import { sessionStats, type SessionStats } from "../../core/session/stats"
import type { SessionLine, LineOrigin, WorkSession } from "../../core/session/types"
import type { ListedStyle } from "../ipc/files"
import type { AppSettings } from "../settingsStore"

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface SessionSummary {
  id: string
  projectId: string
  projectName: string
  scriptName: string
  translated: number
  total: number
  openFlags: number
  updatedAt: string
  finished: boolean
}

export interface LineView {
  index: number
  start: number
  end: number
  speaker: string
  // "" when englishMissing: the file already had this line in Portuguese.
  english: string
  englishMissing: boolean
  words: string | null
  origin: LineOrigin | null
  flag: string | null
  budget: number
}

export interface SessionView {
  id: string
  projectId: string
  projectName: string
  variant: Variant
  scriptName: string | null
  videoName: string | null
  provider: ProviderId
  preset: Preset
  lines: LineView[]
  needsStyles: ListedStyle[] | null
  stats: SessionStats
  finished: boolean
}

export interface WorkSessionDeps {
  now(): number
  newId(): string
  projectName(id: string): string
  // False once the project was deleted outside Honya: its sessions can't open.
  projectExists(id: string): boolean
  card(projectId: string): StyleCard
  readScript(path: string): string
  settings(): AppSettings
  project(id: string): { preset: Preset; frameSetting: FrameSetting; variant: Variant }
}

export interface WorkSessions {
  migrate(): { migrated: number; skipped: string[] }
  create(projectId: string): string
  loadScript(id: string, path: string): SessionView
  confirmStyles(id: string, dialogueStyles: string[]): SessionView
  view(id: string): SessionView
  get(id: string): WorkSession
  save(session: WorkSession): void
  // A session's lines as the renderer shows them, all or only the given indexes.
  lineViews(session: WorkSession, indexes?: readonly number[]): LineView[]
  card(projectId: string): StyleCard
  edit(id: string, index: number, words: string): LineView
  accept(id: string, index: number): LineView
  setOptions(id: string, patch: { provider?: ProviderId; preset?: Preset }): SessionView
  attachVideo(id: string, path: string | null): SessionView
  setFinished(id: string, value: boolean | null): SessionSummary
  remove(id: string): void
  list(): SessionSummary[]
  recent(limit: number): SessionSummary[]
  latestUnfinished(): SessionSummary | null
  countFor(projectId: string): { count: number; last: string | null }
  // Grabbed frames live in <dir>/<id>/frames/<line>.png.
  readFrame(id: string, line: string): Uint8Array | null
  writeFrame(id: string, line: string, png: Uint8Array): void
  clearFrames(id: string): void
}

export interface WorkSessionFileOps {
  writeFile(path: string, data: string): void
  rename(from: string, to: string): void
}

const DEFAULT_OPS: WorkSessionFileOps = {
  writeFile(path, data) {
    writeFileSync(path, data, "utf8")
  },
  rename(from, to) {
    renameSync(from, to)
  },
}

export function createWorkSessions(
  dir: string,
  deps: WorkSessionDeps,
  ops: WorkSessionFileOps = DEFAULT_OPS,
): WorkSessions {
  const pathFor = (id: string): string => {
    if (!SESSION_ID.test(id)) {
      throw new Error("Invalid session id.")
    }
    return join(dir, `${id}.json`)
  }

  const framesDir = (id: string): string => {
    pathFor(id)
    return join(dir, id, "frames")
  }

  const framePath = (id: string, line: string): string => {
    const folder = framesDir(id)
    if (!/^\d+$/.test(line)) {
      throw new Error("Invalid frame id.")
    }
    return join(folder, `${line}.png`)
  }

  const stamp = (): string => new Date(deps.now()).toISOString()

  const writeAtomic = (path: string, value: WorkSession): string => {
    mkdirSync(dir, { recursive: true })
    const temp = `${path}.${randomUUID()}.tmp`
    try {
      ops.writeFile(temp, JSON.stringify(value, null, 2))
    } catch (error) {
      rmSync(temp, { force: true })
      throw error
    }
    return temp
  }

  const save = (session: WorkSession): void => {
    const path = pathFor(session.id)
    const temp = writeAtomic(path, { ...session, updatedAt: stamp() })
    try {
      ops.rename(temp, path)
    } catch (error) {
      rmSync(temp, { force: true })
      throw error
    }
  }

  const readFile = (path: string): WorkSession | null => {
    const parsed = readJson(path)
    return isWorkSession(parsed) ? flattenNoEnglish(parsed) : null
  }

  const get = (id: string): WorkSession => {
    const path = pathFor(id)
    const session = existsSync(path) ? readFile(path) : null
    if (session === null || session.id !== id) {
      throw new Error("This session was not found.")
    }
    return session
  }

  const all = (): WorkSession[] => {
    if (!existsSync(dir)) {
      return []
    }
    const sessions: WorkSession[] = []
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json") || file.endsWith(".v2.json")) {
        continue
      }
      const session = readFile(join(dir, file))
      if (session !== null && `${session.id}.json` === file) {
        sessions.push(session)
      }
    }
    return sessions
  }

  // The sessions whose project still exists; the others can't open, so no list shows them.
  const openable = (): WorkSession[] =>
    all().filter((session) => deps.projectExists(session.projectId))

  const summaryOf = (session: WorkSession): SessionSummary => ({
    id: session.id,
    projectId: session.projectId,
    projectName: deps.projectName(session.projectId),
    scriptName: session.scriptName,
    translated: session.lines.filter((line) => line.words !== null).length,
    total: session.lines.length,
    openFlags: session.lines.filter((line) => line.flag !== null).length,
    updatedAt: session.updatedAt,
    finished: isFinished(session),
  })

  const newestFirst = (a: SessionSummary, b: SessionSummary): number =>
    a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0

  const cuesOf = (session: WorkSession): Map<number, DialogueCue> =>
    new Map(
      readAss(session.scriptText)
        .filter((cue) => session.dialogueStyles.includes(cue.style))
        .map((cue) => [cue.index, cue]),
    )

  const lineViews = (session: WorkSession, indexes?: readonly number[]): LineView[] => {
    const cues = cuesOf(session)
    const { cpsLimit } = deps.card(session.projectId)
    const wanted = indexes === undefined ? null : new Set(indexes)
    const lines =
      wanted === null ? session.lines : session.lines.filter((line) => wanted.has(line.index))
    return lines.map((line) => {
      const cue = cues.get(line.index)
      // For a line the file had in Portuguese, its own length stands in for the English.
      const source = cue?.visible ?? ""
      const missing = line.noEnglish === true
      return {
        index: line.index,
        start: cue?.startMs ?? 0,
        end: cue?.endMs ?? 0,
        speaker: cue?.name ?? "",
        english: missing ? "" : source,
        englishMissing: missing,
        words: line.words,
        origin: line.origin,
        flag: line.flag,
        budget: cue === undefined ? 0 : charLimit(source, cue.startMs, cue.endMs, cpsLimit),
      }
    })
  }

  const lineView = (session: WorkSession, index: number): LineView => {
    const found = lineViews(session, [index])[0]
    if (found === undefined) {
      throw new Error("This line is not in the session.")
    }
    return found
  }

  const stylesToAsk = (session: WorkSession): ListedStyle[] | null => {
    if (session.scriptText === "" || session.dialogueStyles.length > 0) {
      return null
    }
    return listStyles(session.scriptText)
  }

  const viewOf = (session: WorkSession): SessionView => ({
    id: session.id,
    projectId: session.projectId,
    projectName: deps.projectName(session.projectId),
    variant: session.variant,
    scriptName: session.scriptName === "" ? null : session.scriptName,
    videoName: session.videoPath === null ? null : basename(session.videoPath),
    provider: session.provider,
    preset: session.preset,
    lines: lineViews(session),
    needsStyles: stylesToAsk(session),
    stats: sessionStats(session),
    finished: isFinished(session),
  })

  const confirm = (session: WorkSession, styles: string[]): WorkSession => {
    const cues = readAss(session.scriptText).filter((cue) => styles.includes(cue.style))
    if (cues.length === 0) {
      throw new Error("This script has no dialogue lines in the chosen styles.")
    }
    // Lines the file already had in Portuguese count as the translator's own work.
    const translated = alreadyPortuguese(cues)
    const visible = new Map(cues.map((cue) => [cue.index, flatWords(cue.visible)]))
    const lines = emptyLines(cues).map((line): SessionLine => {
      const words = visible.get(line.index)
      return translated.has(line.index) && words !== undefined
        ? { ...line, words, origin: "manual", noEnglish: true }
        : line
    })
    return { ...session, dialogueStyles: styles, lines, edits: [] }
  }

  return {
    migrate() {
      let migrated = 0
      const skipped: string[] = []
      if (!existsSync(dir)) {
        return { migrated, skipped }
      }
      for (const file of readdirSync(dir)) {
        if (!file.endsWith(".json") || file.endsWith(".v2.json")) {
          continue
        }
        const path = join(dir, file)
        const parsed = readJson(path)
        if (parsed === null) {
          skipped.push(`${file}: not valid JSON`)
          continue
        }
        if (!isRecord(parsed) || parsed.version !== 2) {
          continue
        }
        const result = migrateV2(parsed)
        if (typeof result === "string") {
          skipped.push(`${file}: ${result}`)
          continue
        }
        if (!SESSION_ID.test(result.id) || `${result.id}.json` !== file) {
          skipped.push(`${file}: the session id does not match the file name`)
          continue
        }
        if (!deps.projectExists(result.projectId)) {
          skipped.push(`${file}: its project (${result.projectId}) no longer exists`)
          continue
        }
        const backup = join(dir, `${result.id}.v2.json`)
        let temp: string | null = null
        if (existsSync(backup)) {
          skipped.push(`${file}: a backup (${basename(backup)}) already exists`)
          continue
        }
        try {
          temp = writeAtomic(path, result)
          // The backup comes first and the swap is one atomic rename, so <id>.json is
          // always either the old or the new content.
          copyFileSync(path, backup)
          ops.rename(temp, path)
          migrated += 1
        } catch (error) {
          if (temp !== null) rmSync(temp, { force: true })
          rmSync(backup, { force: true })
          skipped.push(`${file}: ${error instanceof Error ? error.message : "could not be saved"}`)
        }
      }
      return { migrated, skipped }
    },
    create(projectId) {
      const id = deps.newId()
      const project = deps.project(projectId)
      const at = stamp()
      save({
        version: 3,
        id,
        projectId,
        variant: project.variant,
        createdAt: at,
        updatedAt: at,
        scriptPath: "",
        scriptName: "",
        scriptText: "",
        dialogueStyles: [],
        videoPath: null,
        provider: deps.settings().defaultProvider,
        preset: project.preset,
        frameSetting: project.frameSetting,
        brief: null,
        glossary: [],
        lines: [],
        edits: [],
        spend: [],
        activeMs: 0,
        framesGrabbed: 0,
        exportedAt: null,
        finishedOverride: null,
      })
      return id
    },
    loadScript(id, path) {
      const session = get(id)
      if (session.lines.length > 0) {
        throw new Error("This session already has a script.")
      }
      const scriptText = deps.readScript(path)
      const styles = listStyles(scriptText)
      const loaded: WorkSession = {
        ...session,
        scriptPath: path,
        scriptName: basename(path),
        scriptText,
        dialogueStyles: [],
        lines: [],
        edits: [],
      }
      const settled = styles.every((style) => style.guess !== "ambiguous")
        ? confirm(
            loaded,
            styles.filter((style) => style.guess === "dialogue").map((style) => style.name),
          )
        : loaded
      save(settled)
      return viewOf(settled)
    },
    confirmStyles(id, dialogueStyles) {
      const session = get(id)
      if (session.lines.length > 0 || stylesToAsk(session) === null) {
        throw new Error("This session already has a script.")
      }
      const confirmed = confirm(session, dialogueStyles)
      save(confirmed)
      return viewOf(confirmed)
    },
    view: (id) => viewOf(get(id)),
    get,
    save,
    lineViews,
    card: (projectId) => deps.card(projectId),
    edit(id, index, words) {
      const session = get(id)
      lineView(session, index)
      const next = addActivity(editLine(session, index, words), deps.now())
      save(next)
      return lineView(next, index)
    },
    accept(id, index) {
      const session = get(id)
      lineView(session, index)
      const next = addActivity(acceptLine(session, index), deps.now())
      save(next)
      return lineView(next, index)
    },
    setOptions(id, patch) {
      const session = get(id)
      const next: WorkSession = {
        ...session,
        provider: patch.provider ?? session.provider,
        preset: patch.preset ?? session.preset,
      }
      save(next)
      return viewOf(next)
    },
    attachVideo(id, path) {
      const next = { ...get(id), videoPath: path }
      save(next)
      return viewOf(next)
    },
    setFinished(id, value) {
      const next = { ...get(id), finishedOverride: value }
      save(next)
      return summaryOf(next)
    },
    remove(id) {
      rmSync(pathFor(id), { force: true })
      rmSync(join(dir, id), { recursive: true, force: true })
    },
    list: () => openable().map(summaryOf).sort(newestFirst),
    recent: (limit) => openable().map(summaryOf).sort(newestFirst).slice(0, limit),
    latestUnfinished: () =>
      openable()
        .map(summaryOf)
        .filter((summary) => !summary.finished)
        .sort(newestFirst)[0] ?? null,
    countFor(projectId) {
      const mine = all()
        .filter((session) => session.projectId === projectId)
        .map(summaryOf)
        .sort(newestFirst)
      return { count: mine.length, last: mine[0]?.updatedAt ?? null }
    },
    readFrame(id, line) {
      const path = framePath(id, line)
      return existsSync(path) ? new Uint8Array(readFileSync(path)) : null
    },
    writeFrame(id, line, png) {
      const path = framePath(id, line)
      mkdirSync(framesDir(id), { recursive: true })
      writeFileSync(path, png)
    },
    clearFrames(id) {
      rmSync(framesDir(id), { recursive: true, force: true })
    },
  }
}

function listStyles(scriptText: string): ListedStyle[] {
  const guesses = classifyScript(readAss(scriptText).map((cue) => cue.style))
  return [...guesses.entries()].map(([name, guess]) => ({ name, guess }))
}

function readJson(path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
    return parsed
  } catch {
    return null
  }
}

// Version 3 files are only ever written by this store, so the check covers what the
// store itself reads; the line and edit lists are trusted past their array shape.
function isWorkSession(value: unknown): value is WorkSession {
  return (
    isRecord(value) &&
    value.version === 3 &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.scriptText === "string" &&
    typeof value.scriptName === "string" &&
    Array.isArray(value.dialogueStyles) &&
    Array.isArray(value.lines) &&
    Array.isArray(value.edits) &&
    Array.isArray(value.spend)
  )
}

// The words of a line on one line, the way the AI writes them: export puts the
// script's \N breaks back.
function flatWords(text: string): string {
  return text
    .split("\\N")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .join(" ")
}

// Sessions saved before lines the file had in Portuguese were stored flat.
function flattenNoEnglish(session: WorkSession): WorkSession {
  if (!session.lines.some((line) => line.noEnglish === true && line.words?.includes("\\N"))) {
    return session
  }
  return {
    ...session,
    lines: session.lines.map((line) =>
      line.noEnglish === true && line.words !== null
        ? { ...line, words: flatWords(line.words) }
        : line,
    ),
  }
}
