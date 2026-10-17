import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { readAss, type DialogueCue } from "../../../src/core/ass/script"
import type { Rule, StyleCard } from "../../../src/core/library/types"
import type { Completer, CompletionRequest } from "../../../src/core/pipeline/run"
import { emptyLines } from "../../../src/core/session/lines"
import type { WorkSession } from "../../../src/core/session/types"
import { createSettingsStore } from "../../../src/main/settingsStore"
import { createAiService, type WorkspaceEvent } from "../../../src/main/workspace/ai"
import { createWorkSessions } from "../../../src/main/workspace/sessions"
import { echo, isBrief, requestedIds } from "../../support/fakeModel"

const ID = "00000000-0000-4000-8000-000000000001"
const SPENT = { model: "gemini-2.5-flash", usage: { input: 10, output: 5, cached: 0 } }

const CARD: StyleCard = {
  variant: "pt-pt",
  seriesId: "p1",
  revision: 1,
  cpsLimit: 17,
  voice: "",
  rules: [],
}

function script(count: number): string {
  const events = Array.from({ length: count }, (_, i) => {
    const second = String(i).padStart(2, "0")
    return `Dialogue: 0,0:00:${second}.00,0:00:${second}.90,Default,Tanjiro,0,0,0,,Line ${String(i)}.`
  }).join("\n")
  return `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`
}

function session(count: number, patch: Partial<WorkSession> = {}): WorkSession {
  const text = script(count)
  return {
    version: 3,
    id: ID,
    projectId: "p1",
    variant: "pt-pt",
    createdAt: "2026-10-17T10:00:00.000Z",
    updatedAt: "2026-10-17T10:00:00.000Z",
    scriptPath: "/a/ep01.ass",
    scriptName: "ep01.ass",
    scriptText: text,
    dialogueStyles: ["Default"],
    videoPath: null,
    provider: "gemini",
    preset: "save",
    frameSetting: "none",
    brief: null,
    glossary: [],
    lines: emptyLines(readAss(text)),
    edits: [],
    spend: [],
    activeMs: 0,
    framesGrabbed: 0,
    exportedAt: null,
    finishedOverride: null,
    ...patch,
  }
}

interface Setup {
  model?: Completer
  grab?: (videoPath: string, cue: DialogueCue) => Promise<Uint8Array | null>
  rules?: Rule[]
  // Replaces the completer factory, e.g. to make it throw.
  completerFor?: () => Completer
}

function setup(start: WorkSession, options: Setup = {}) {
  const dir = mkdtempSync(join(tmpdir(), "honya-ai-"))
  const settings = createSettingsStore({ read: () => null, write: () => {} })
  let clock = Date.parse("2026-10-17T10:00:00Z")
  const sessions = createWorkSessions(dir, {
    now: () => (clock += 1000),
    newId: () => ID,
    projectName: () => "Project",
    card: () => CARD,
    readScript: () => "",
    settings: () => settings.get(),
    project: () => ({ preset: "save", frameSetting: "none", variant: "pt-pt" }),
  })
  sessions.save(start)
  const events: WorkspaceEvent[] = []
  const requests: CompletionRequest[] = []
  const grabs: number[] = []
  const model = options.model ?? echo
  const problems: { provider: string; problem: { tier: string; problem: string } }[] = []
  const ai = createAiService({
    sessions,
    completerFor:
      options.completerFor ??
      (() => async (request) => {
        requests.push(request)
        return { ...(await model(request)), spent: SPENT }
      }),
    logProblem: (provider, problem) => problems.push({ provider, problem }),
    grabFrame: (videoPath, cue) => {
      grabs.push(cue.index)
      return options.grab === undefined
        ? Promise.resolve(new Uint8Array([1, 2, 3]))
        : options.grab(videoPath, cue)
    },
    emit: (event) => events.push(event),
    knownRules: () => options.rules ?? [],
    now: () => (clock += 50),
  })
  return { ai, sessions, events, requests, grabs, problems }
}

function ended(events: WorkspaceEvent[]): WorkspaceEvent | undefined {
  return events.find((event) => event.type === "run-ended")
}

describe("AI service", () => {
  it("translates only untranslated lines and saves after each batch", async () => {
    const start = session(30)
    start.lines = start.lines.map((line) =>
      line.index === 0
        ? { ...line, words: "feito à mão", origin: "manual" }
        : line.index === 5
          ? { ...line, words: "já feito", origin: "ai", aiDraft: "já feito" }
          : line,
    )
    const translatedAtRequest: number[] = []
    const holder: { sessions?: ReturnType<typeof createWorkSessions> } = {}
    const { ai, sessions, events, requests } = setup(start, {
      model: (request) => {
        if (!isBrief(request) && holder.sessions !== undefined) {
          translatedAtRequest.push(
            holder.sessions.get(ID).lines.filter((line) => line.words !== null).length,
          )
        }
        return echo(request)
      },
    })
    holder.sessions = sessions
    await ai.run(ID)
    await ai.idle()

    expect(ended(events)).toEqual({
      type: "run-ended",
      sessionId: ID,
      outcome: "done",
      message: null,
    })
    expect(translatedAtRequest).toEqual([2, 27])
    const asked = requests.flatMap((request) =>
      isBrief(request) ? [] : requestedIds(request.prompt),
    )
    expect(asked).not.toContain("0")
    expect(asked).not.toContain("5")
    const saved = sessions.get(ID)
    expect(saved.lines.every((line) => line.words !== null)).toBe(true)
    expect(saved.lines[0]?.words).toBe("feito à mão")
    expect(saved.lines[5]?.words).toBe("já feito")
    expect(saved.lines[7]).toMatchObject({ words: "pt 7", origin: "ai" })
    expect(saved.brief).not.toBeNull()
    expect(saved.spend).toEqual([
      { model: SPENT.model, requests: 3, input: 30, output: 15, cached: 0 },
    ])
    expect(saved.activeMs).toBeGreaterThan(0)
    const batches = events.filter((event) => event.type === "lines")
    expect(batches).toHaveLength(2)
    expect(batches[1]?.type === "lines" ? batches[1].lines.map((line) => line.index) : []).toEqual([
      27, 28, 29,
    ])
    const progress = events.filter((event) => event.type === "run-progress")
    expect(progress.map((event) => event.activity)).toContain("Reading the episode")
    expect(progress.map((event) => event.activity)).toContain("Translating batch 2 of 2")
    expect(progress.at(-1)).toMatchObject({ index: 2, total: 2, linesDone: 30, lineTotal: 30 })
    // While a batch is out its lines are named; once it lands none are.
    const working = progress.map((event) => event.indexes)
    expect(working).toContainEqual([1, 2, 3, 4, ...Array.from({ length: 21 }, (_, i) => i + 6)])
    expect(working).toContainEqual([27, 28, 29])
    expect(progress.at(-1)).toMatchObject({ indexes: [] })
    expect(ai.activeId()).toBeNull()
  })

  it("an edit made during the run survives the batch that contained the line", async () => {
    const holder: { sessions?: ReturnType<typeof createWorkSessions> } = {}
    const { ai, sessions } = setup(session(5), {
      model: (request) => {
        if (!isBrief(request)) {
          holder.sessions?.edit(ID, 3, "Escrito à mão.")
        }
        return echo(request)
      },
    })
    holder.sessions = sessions
    await ai.run(ID)
    await ai.idle()
    const saved = sessions.get(ID)
    expect(saved.lines[3]).toMatchObject({ words: "Escrito à mão.", origin: "manual" })
    expect(saved.lines[2]).toMatchObject({ words: "pt 2", origin: "ai" })
    expect(saved.edits).toHaveLength(1)
  })

  it("stop keeps finished batches", async () => {
    const holder: { stop?: () => void } = {}
    const { ai, sessions, events } = setup(session(30), {
      model: (request) => {
        if (!isBrief(request)) holder.stop?.()
        return echo(request)
      },
    })
    holder.stop = () => {
      ai.stop()
    }
    await ai.run(ID)
    await ai.idle()
    expect(ended(events)).toMatchObject({ outcome: "stopped", message: null })
    const lines = sessions.get(ID).lines
    expect(lines.filter((line) => line.words !== null).map((line) => line.index)).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    )
  })

  it("refuses a second run", async () => {
    let release = (): void => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { ai, events } = setup(session(3), {
      model: async (request) => {
        await gate
        return echo(request)
      },
    })
    await ai.run(ID)
    expect(ai.activeId()).toBe(ID)
    await expect(ai.run(ID)).rejects.toThrow("Honya is already translating.")
    release()
    await ai.idle()
    expect(ended(events)).toMatchObject({ outcome: "done" })
  })

  it("reports a provider failure as a failed run and keeps the spend", async () => {
    const { ai, sessions, events } = setup(session(3), {
      model: (request) =>
        isBrief(request) ? echo(request) : Promise.reject(new Error("The key was rejected.")),
    })
    await ai.run(ID)
    await ai.idle()
    expect(ended(events)).toEqual({
      type: "run-ended",
      sessionId: ID,
      outcome: "failed",
      message: "The key was rejected.",
    })
    expect(sessions.get(ID).spend[0]?.requests).toBe(1)
    expect(ai.activeId()).toBeNull()
  })

  it("ends as failed when the run can't even start its provider", async () => {
    const { ai, events } = setup(session(3), {
      completerFor: () => {
        throw new Error("No key for Gemini.")
      },
    })
    await ai.run(ID)
    await ai.idle()
    expect(ended(events)).toEqual({
      type: "run-ended",
      sessionId: ID,
      outcome: "failed",
      message: "No key for Gemini.",
    })
    expect(ai.activeId()).toBeNull()
  })

  it("logs replies the pipeline couldn't use", async () => {
    const { ai, problems } = setup(session(3), {
      model: (request) =>
        isBrief(request) ? Promise.resolve({ refused: true, reason: "safety" }) : echo(request),
    })
    await ai.run(ID)
    await ai.idle()
    expect(problems).toContainEqual({
      provider: "gemini",
      problem: { tier: "cheap", problem: "brief: safety" },
    })
  })

  it("retranslates a manual line with the hint and adds the spend", async () => {
    const { ai, sessions, requests } = setup(session(5))
    sessions.edit(ID, 1, "Escrito à mão.")
    const view = await ai.retranslate(ID, 1, "mais curto")
    expect(view).toMatchObject({ index: 1, words: "pt 1", origin: "ai" })
    expect(requests[0]?.tier).toBe("strong")
    expect(requests[0]?.prompt).toContain("mais curto")
    const saved = sessions.get(ID)
    expect(saved.lines[1]).toMatchObject({ words: "pt 1", retranslated: 1 })
    expect(saved.spend[0]?.requests).toBe(1)
  })

  it("drafts a rule from a line with the cheap model", async () => {
    const known: Rule[] = [{ kind: "prose", text: "Use tu." }]
    const rule = { kind: "glossary", text: "", source: "Line", pt: "Linha" }
    const { ai, sessions, requests } = setup(session(5), {
      rules: known,
      model: () => Promise.resolve({ value: rule }),
    })
    await expect(ai.draftRule(ID, 1)).rejects.toThrow("This line has no translation to learn from.")
    sessions.edit(ID, 1, "Linha 1.")
    expect(await ai.draftRule(ID, 1)).toEqual({ kind: "glossary", source: "Line", pt: "Linha" })
    expect(requests[0]?.tier).toBe("cheap")
    expect(requests[0]?.prompt).toContain("Use tu.")
    expect(requests[0]?.prompt).toContain("Linha 1.")
    expect(sessions.get(ID).spend[0]?.requests).toBe(1)
  })

  it("throws when the drafted rule is unusable", async () => {
    const { ai, sessions } = setup(session(5), {
      model: () => Promise.resolve({ value: { kind: "prose", text: " ", source: "", pt: "" } }),
    })
    sessions.edit(ID, 1, "Linha 1.")
    await expect(ai.draftRule(ID, 1)).rejects.toThrow("The model couldn't draft a rule. Try again.")
    expect(sessions.get(ID).spend[0]?.requests).toBe(1)
  })

  it("serves a line's frame as a data URL and caches it", async () => {
    const { ai, sessions, grabs } = setup(session(3, { videoPath: "/v/ep01.mkv" }))
    expect(await ai.frame(ID, 1)).toBe("data:image/png;base64,AQID")
    expect(await ai.frame(ID, 1)).toBe("data:image/png;base64,AQID")
    expect(grabs).toEqual([1])
    expect(sessions.get(ID).framesGrabbed).toBe(1)
    expect(sessions.readFrame(ID, "1")).toEqual(new Uint8Array([1, 2, 3]))
  })

  it("has no frame without a video or when the grab fails", async () => {
    const plain = setup(session(3))
    expect(await plain.ai.frame(ID, 1)).toBeNull()
    expect(plain.grabs).toEqual([])
    const failing = setup(session(3, { videoPath: "/v/ep01.mkv" }), {
      grab: () => Promise.resolve(null),
    })
    expect(await failing.ai.frame(ID, 1)).toBeNull()
    expect(failing.sessions.get(ID).framesGrabbed).toBe(0)
  })

  it("sends cached frames during a run when frames are on", async () => {
    const { ai, sessions, requests, grabs } = setup(
      session(3, { videoPath: "/v/ep01.mkv", frameSetting: "every" }),
    )
    sessions.writeFrame(ID, "0", new Uint8Array([9]))
    await ai.run(ID)
    await ai.idle()
    expect(grabs).toEqual([1, 2])
    const images = requests.flatMap((request) => request.images ?? [])
    expect(images.find((image) => image.id === "0")?.bytes).toEqual(new Uint8Array([9]))
    expect(sessions.get(ID).framesGrabbed).toBe(2)
  })
})
