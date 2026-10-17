import { readAss, type DialogueCue } from "../../core/ass/script"
import { draftRuleRequest, readDraftedRule } from "../../core/library/suggest"
import type { Rule } from "../../core/library/types"
import {
  retranslateLine,
  translateMissing,
  type Completer,
  type FrameProvider,
  type RunEvent,
} from "../../core/pipeline/run"
import type { ProviderId, Usage } from "../../core/pipeline/types"
import { type ProviderError, providerName } from "../../core/providers/errors"
import { addSpend } from "../../core/providers/prices"
import {
  applyAiLines,
  applyRetranslation,
  untranslatedIndexes,
  type AiLine,
} from "../../core/session/lines"
import type { WorkSession } from "../../core/session/types"
import type { LineView, createWorkSessions } from "./sessions"

export type WorkspaceEvent =
  | {
      type: "run-progress"
      sessionId: string
      index: number
      total: number
      linesDone: number
      lineTotal: number
      activity: string
    }
  | { type: "lines"; sessionId: string; lines: LineView[] }
  | {
      type: "run-ended"
      sessionId: string
      outcome: "done" | "stopped" | "failed"
      message: string | null
    }

export interface AiServiceDeps {
  sessions: ReturnType<typeof createWorkSessions>
  completerFor(
    provider: ProviderId,
    onRetry: (delayMs: number, error: ProviderError) => void,
  ): Completer
  grabFrame(videoPath: string, cue: DialogueCue): Promise<Uint8Array | null>
  emit(event: WorkspaceEvent): void
  knownRules(projectId: string): Rule[]
  // Clock for the session's active time; Date.now when left out.
  now?(): number
}

export interface AiService {
  // Starts translating the session's untranslated lines and returns once it has
  // started; progress and the outcome arrive as events.
  run(sessionId: string): Promise<void>
  stop(): void
  activeId(): string | null
  idle(): Promise<void>
  retranslate(sessionId: string, index: number, hint: string): Promise<LineView>
  draftRule(sessionId: string, index: number): Promise<Rule>
  // The line's video frame as a PNG data URL, or null with no video or a failed grab.
  frame(sessionId: string, index: number): Promise<string | null>
}

// Thrown out of the frame provider when Stop is pressed while frames are being grabbed.
class StopRun extends Error {}

type Spent = { model: string; usage: Usage }

function dialogueCues(session: WorkSession): DialogueCue[] {
  return readAss(session.scriptText).filter((cue) => session.dialogueStyles.includes(cue.style))
}

function translatedCount(session: WorkSession): number {
  return session.lines.filter((line) => line.words !== null).length
}

export function createAiService(deps: AiServiceDeps): AiService {
  const now = (): number => (deps.now === undefined ? Date.now() : deps.now())
  let active: string | null = null
  let stopRequested = false
  let say: ((text: string) => void) | null = null
  let work: Promise<void> = Promise.resolve()

  const emit = (event: WorkspaceEvent): void => {
    try {
      deps.emit(event)
    } catch {
      // a failing listener must not break the run
    }
  }

  // Loads the session fresh, changes it and saves it with no await in between, so a
  // change saved elsewhere meanwhile (an edit during a run) is never lost.
  const update = (id: string, change: (session: WorkSession) => WorkSession): WorkSession => {
    const next = change(deps.sessions.get(id))
    deps.sessions.save(next)
    return next
  }

  // The provider's completer, keeping each reply's spend until `flush` adds it to a session.
  const spending = (
    provider: ProviderId,
    onRetry: (delayMs: number, error: ProviderError) => void,
  ): { complete: Completer; flush: (session: WorkSession) => WorkSession } => {
    const send = deps.completerFor(provider, onRetry)
    const pending: Spent[] = []
    return {
      complete: async (request) => {
        const reply = await send(request)
        if (reply.spent !== undefined) {
          pending.push(reply.spent)
        }
        return reply
      },
      flush: (session) => {
        let spend = session.spend
        for (const spent of pending.splice(0)) {
          spend = addSpend(spend, spent.model, spent.usage)
        }
        return { ...session, spend }
      },
    }
  }

  const cueOf = (session: WorkSession, index: number): DialogueCue => {
    const cue = dialogueCues(session).find((item) => item.index === index)
    if (cue === undefined || !session.lines.some((line) => line.index === index)) {
      throw new Error("This line is not in the session.")
    }
    return cue
  }

  // The cached frame for the line, else a fresh grab saved to the cache.
  const frameBytes = async (session: WorkSession, cue: DialogueCue): Promise<Uint8Array | null> => {
    const videoPath = session.videoPath
    if (videoPath === null) {
      return null
    }
    const key = String(cue.index)
    const cached = deps.sessions.readFrame(session.id, key)
    if (cached !== null) {
      return cached
    }
    let bytes: Uint8Array | null
    try {
      bytes = await deps.grabFrame(videoPath, cue)
    } catch {
      bytes = null
    }
    if (bytes === null) {
      return null
    }
    deps.sessions.writeFrame(session.id, key, bytes)
    update(session.id, (fresh) => ({ ...fresh, framesGrabbed: fresh.framesGrabbed + 1 }))
    return bytes
  }

  const execute = async (start: WorkSession): Promise<void> => {
    const id = start.id
    const cues = dialogueCues(start)
    const cueById = new Map(cues.map((cue) => [String(cue.index), cue]))
    const progress = {
      index: 0,
      total: 0,
      linesDone: translatedCount(start),
      lineTotal: start.lines.length,
      activity: "",
    }
    const report = (activity?: string): void => {
      if (activity !== undefined) {
        progress.activity = activity
      }
      emit({ type: "run-progress", sessionId: id, ...progress })
    }
    say = report

    const { complete, flush } = spending(start.provider, (delayMs, error) => {
      const seconds = Math.round(delayMs / 1000)
      report(
        error.kind === "rate-limit"
          ? `Rate limited, retrying in ${String(seconds)} s`
          : `${providerName(error.provider)} didn't answer, retrying in ${String(seconds)} s`,
      )
    })

    // Every save carries the spend and the active time since the last one.
    let tick = now()
    const save = (change: (session: WorkSession) => WorkSession): WorkSession => {
      const at = now()
      const elapsed = at - tick
      tick = at
      const next = update(id, (fresh) =>
        change(flush({ ...fresh, activeMs: fresh.activeMs + elapsed })),
      )
      progress.linesDone = translatedCount(next)
      progress.lineTotal = next.lines.length
      return next
    }

    const onEvent = (event: RunEvent): void => {
      switch (event.type) {
        case "brief":
          report("Reading the episode")
          break
        case "batch":
          progress.index = event.index
          progress.total = event.total
          report(`Translating batch ${String(event.index)} of ${String(event.total)}`)
          break
        case "escalate":
          report(`Asking the strong model about ${String(event.count)} lines`)
          break
        case "fix":
          report(`Fixing ${String(event.count)} lines that break a rule`)
          break
        default:
          break
      }
    }

    const frames: FrameProvider | undefined =
      start.frameSetting === "none" || start.videoPath === null
        ? undefined
        : async (ids) => {
            const out = new Map<string, Uint8Array>()
            const wanted = ids.flatMap((key) => {
              const cue = cueById.get(key)
              return cue === undefined ? [] : [cue]
            })
            const missing = wanted.filter(
              (cue) => deps.sessions.readFrame(id, String(cue.index)) === null,
            ).length
            let grabbed = 0
            for (const cue of wanted) {
              if (stopRequested) {
                throw new StopRun()
              }
              const cached = deps.sessions.readFrame(id, String(cue.index))
              if (cached === null) {
                report(`Grabbing frames · ${String(grabbed)} of ${String(missing)}`)
                grabbed += 1
              }
              const bytes = cached ?? (await frameBytes(start, cue))
              if (bytes !== null) {
                out.set(String(cue.index), bytes)
              }
            }
            return out
          }

    let outcome: "done" | "stopped" | "failed" = "done"
    let message: string | null = null
    try {
      if (untranslatedIndexes(start).length > 0) {
        const known = new Map<number, string>()
        const manual = new Set<number>()
        for (const line of start.lines) {
          if (line.words !== null) known.set(line.index, line.words)
          if (line.origin === "manual") manual.add(line.index)
        }
        outcome = await translateMissing({
          ass: start.scriptText,
          dialogueStyles: new Set(start.dialogueStyles),
          card: deps.sessions.card(start.projectId),
          preset: start.preset,
          complete,
          sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          frameSetting: start.frameSetting,
          ...(frames === undefined ? {} : { frames }),
          known,
          manual,
          brief: start.brief,
          glossary: start.glossary,
          shouldStop: () => stopRequested,
          onBrief: (brief, glossary) => {
            save((session) => ({ ...session, brief, glossary }))
          },
          onBatch: (event) => {
            // Applied to the freshly loaded session: lines edited meanwhile stay manual.
            const next = save((session) => ({
              ...applyAiLines(session, event.lines),
              glossary: event.glossary,
            }))
            progress.index = event.index
            progress.total = event.total
            emit({
              type: "lines",
              sessionId: id,
              lines: deps.sessions.lineViews(
                next,
                event.lines.map((line) => line.index),
              ),
            })
            report()
          },
          onEvent,
        })
      }
    } catch (error) {
      if (error instanceof StopRun) {
        outcome = "stopped"
      } else {
        outcome = "failed"
        message = error instanceof Error ? error.message : String(error)
      }
    }
    try {
      save((session) => session)
    } catch (error) {
      if (outcome !== "failed") {
        outcome = "failed"
        message = error instanceof Error ? error.message : String(error)
      }
    }
    emit({ type: "run-ended", sessionId: id, outcome, message })
  }

  return {
    run(sessionId) {
      try {
        if (active !== null) {
          throw new Error("Honya is already translating.")
        }
        const session = deps.sessions.get(sessionId)
        if (session.lines.length === 0) {
          throw new Error("This session has no script yet.")
        }
        active = sessionId
        stopRequested = false
        work = execute(session)
          .catch(() => undefined)
          .finally(() => {
            active = null
            say = null
          })
        return Promise.resolve()
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)))
      }
    },

    stop() {
      if (active === null || stopRequested) {
        return
      }
      stopRequested = true
      say?.("Stopping after this batch…")
    },

    activeId() {
      return active
    },

    async idle() {
      await work
    },

    async retranslate(sessionId, index, hint) {
      const session = deps.sessions.get(sessionId)
      const cue = cueOf(session, index)
      const { complete, flush } = spending(session.provider, () => undefined)
      const image = session.frameSetting === "none" ? null : await frameBytes(session, cue)
      const known = new Map<number, string>()
      for (const line of session.lines) {
        if (line.words !== null) known.set(line.index, line.words)
      }
      let result: AiLine | null = null
      let saved: WorkSession
      try {
        result = await retranslateLine({
          ass: session.scriptText,
          dialogueStyles: new Set(session.dialogueStyles),
          card: deps.sessions.card(session.projectId),
          complete,
          index,
          hint,
          known,
          brief: session.brief,
          glossary: session.glossary,
          ...(image === null ? {} : { image }),
        })
      } finally {
        const answer = result
        saved = update(sessionId, (fresh) =>
          answer === null ? flush(fresh) : applyRetranslation(flush(fresh), answer),
        )
      }
      if (result === null) {
        throw new Error("The model couldn't translate this line. Try again.")
      }
      const [view] = deps.sessions.lineViews(saved, [index])
      if (view === undefined) {
        throw new Error("This line is not in the session.")
      }
      return view
    },

    async draftRule(sessionId, index) {
      const session = deps.sessions.get(sessionId)
      const cue = cueOf(session, index)
      const line = session.lines.find((item) => item.index === index)
      if (line === undefined || line.words === null) {
        throw new Error("This line has no translation to learn from.")
      }
      const request = draftRuleRequest(
        { en: cue.visible, before: line.aiDraft, after: line.words },
        deps.knownRules(session.projectId),
      )
      const { complete, flush } = spending(session.provider, () => undefined)
      let rule: Rule | null
      try {
        const reply = await complete({ tier: "cheap", ...request })
        rule = "refused" in reply ? null : readDraftedRule(reply.value)
      } finally {
        update(sessionId, flush)
      }
      if (rule === null) {
        throw new Error("The model couldn't draft a rule. Try again.")
      }
      return rule
    },

    async frame(sessionId, index) {
      const session = deps.sessions.get(sessionId)
      const cue = dialogueCues(session).find((item) => item.index === index)
      if (cue === undefined) {
        return null
      }
      const bytes = await frameBytes(session, cue)
      return bytes === null
        ? null
        : `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`
    },
  }
}
