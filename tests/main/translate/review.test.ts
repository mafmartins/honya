import { randomUUID } from "node:crypto"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { createFileStore } from "../../../src/core/library/fileStore"
import type { Proposal } from "../../../src/core/review/review"
import { createProfileHandlers } from "../../../src/main/ipc/profiles"
import { createReviewHandlers, type ReviewDeps } from "../../../src/main/translate/review"
import {
  createSessionStore,
  type SessionStore,
  type TranslateSession,
} from "../../../src/main/translate/session"

const SCRIPT = [
  "[Script Info]",
  "ScriptType: v4.00+",
  "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,2,2,10,10,10,1",
  "",
  "[Events]",
  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "Dialogue: 0,0:00:01.00,0:00:05.00,Default,,0,0,0,,Hello there.",
  "Dialogue: 0,0:00:06.00,0:00:10.00,Default,,0,0,0,,The Hashira are here.",
  "Dialogue: 0,0:00:11.00,0:00:15.00,Default,,0,0,0,,The Hashira wait.",
  "",
].join("\n")

interface Fixture {
  dir: string
  handlers: ReturnType<typeof createReviewHandlers>
  sessions: SessionStore
  profiles: ReturnType<typeof createProfileHandlers>
  id: string
  seriesId: string
  deps: ReviewDeps
}

function setup(
  overrides: Partial<ReviewDeps> = {},
  dir = mkdtempSync(join(tmpdir(), "honya-review-")),
): Fixture {
  const sessions = createSessionStore(join(dir, "sessions"))
  const profiles = createProfileHandlers(createFileStore(join(dir, "profiles")))
  const existing = profiles.listSeries("pt-pt").series[0]
  const seriesId = existing?.id ?? profiles.createSeries("pt-pt", "Frieren").id
  const id = randomUUID()
  if (sessions.load(id) === null && overrides.sessions === undefined) {
    sessions.save(seed(id, seriesId))
  }
  const deps: ReviewDeps = {
    sessions,
    profiles,
    ask: () => () => Promise.resolve({ refused: true }),
    writeFile: () => undefined,
    reveal: () => undefined,
    now: () => 0,
    ...overrides,
  }
  return { dir, handlers: createReviewHandlers(deps), sessions, profiles, id, seriesId, deps }
}

function seed(id: string, seriesId: string): TranslateSession {
  return {
    version: 2,
    id,
    startedAt: "2026-10-16T10:00:00.000Z",
    phase: "review",
    scriptPath: "/s/subs.ass",
    scriptName: "subs.ass",
    scriptText: SCRIPT,
    seriesId,
    seriesName: "Frieren",
    variant: "pt-pt",
    provider: "claude",
    preset: "balanced",
    frameSetting: "none",
    videoPath: null,
    outputPath: "/s/subs.pt-pt.ass",
    dialogueStyles: ["Default"],
    card: { variant: "pt-pt", seriesId, revision: 1, cpsLimit: 17, voice: "neutral", rules: [] },
    dialogueLines: 3,
    totalBatches: 1,
    saved: {
      completedBatches: 1,
      results: [
        ["0", { id: "0", words: "Olá.", mark: "clean" }],
        ["1", { id: "1", words: "Os Hashira estão aqui. {note: linha longa}", mark: "doubt" }],
        ["2", { id: "2", words: "Os Hashira esperam.", mark: "clean" }],
      ],
      glossary: [],
      brief: "",
      hardIds: [],
      frameIds: [],
      strongIds: [],
    },
    review: { edits: {}, accepted: [], rules: [] },
    frameNotes: [],
    framesUsed: 0,
    elapsedMs: 1000,
    error: null,
  }
}

const PROPOSAL: Proposal = {
  siblings: [{ eventIndex: 2, words: "Os Pilares esperam." }],
  rule: { kind: "glossary", source: "Hashira", pt: "Pilar" },
}

describe("review handlers", () => {
  it("lists lines with english, words without notes and one open flag", () => {
    const { handlers, id } = setup()
    const view = handlers.load(id)
    expect(view.openFlags).toBe(1)
    expect(view.lines.map((line) => line.english)).toEqual([
      "Hello there.",
      "The Hashira are here.",
      "The Hashira wait.",
    ])
    expect(view.lines[1]).toMatchObject({
      words: "Os Hashira estão aqui.",
      note: "linha longa",
      flagged: true,
      accepted: false,
    })
  })

  it("accepting keeps the note and closes the flag", () => {
    const { handlers, id } = setup()
    const view = handlers.accept(id, 1, null)
    expect(view.openFlags).toBe(0)
    expect(view.lines[1]).toMatchObject({ note: "linha longa", accepted: true, edited: false })
  })

  it("editing an unflagged line creates no flag", () => {
    const { handlers, id } = setup()
    const view = handlers.accept(id, 0, "Olá, tu.")
    expect(view.lines[0]).toMatchObject({ words: "Olá, tu.", edited: true, flagged: false })
    expect(view.openFlags).toBe(1)
  })

  it("keeps decisions across a reload", () => {
    const first = setup()
    first.handlers.accept(first.id, 1, "Os Hashira chegaram.")
    first.handlers.accept(first.id, 0, "Olá, tu.")
    const again = setup({}, first.dir)
    const view = createReviewHandlers(again.deps).load(first.id)
    expect(view.openFlags).toBe(0)
    expect(view.lines.map((line) => [line.edited, line.accepted])).toEqual([
      [true, false],
      [true, true],
      [false, false],
    ])
  })

  it("confirm applies siblings and saves a series rule", () => {
    const { handlers, id, profiles, seriesId } = setup()
    const view = handlers.confirm(id, 1, "Os Pilares chegaram.", PROPOSAL, true, "series")
    expect(view.lines[2]).toMatchObject({ words: "Os Pilares esperam.", edited: true })
    expect(view.lines[1]?.accepted).toBe(true)
    expect(view.openFlags).toBe(0)
    expect(profiles.loadSeriesRules("pt-pt", seriesId)).toContainEqual(PROPOSAL.rule)
  })

  it("confirm with applyOthers false and no rule only edits the line", () => {
    const { handlers, id, profiles, seriesId } = setup()
    const view = handlers.confirm(id, 1, "Os Pilares chegaram.", PROPOSAL, false, null)
    expect(view.lines.map((line) => line.edited)).toEqual([false, true, false])
    expect(profiles.loadSeriesRules("pt-pt", seriesId)).toEqual([])
  })

  it("confirm can save a base rule", () => {
    const { handlers, id, profiles } = setup()
    handlers.confirm(id, 1, "Os Pilares chegaram.", PROPOSAL, false, "base")
    expect(profiles.loadBase("pt-pt").base.rules).toContainEqual(PROPOSAL.rule)
  })

  it("check reports a proposal, none and failed", async () => {
    const reply = (text: string) => setup({ ask: () => () => Promise.resolve({ text }) })
    const proposed = reply(
      JSON.stringify({ structural: true, siblings: PROPOSAL.siblings, rule: PROPOSAL.rule }),
    )
    expect(await proposed.handlers.check(proposed.id, 1, "Os Pilares chegaram.")).toEqual({
      status: "proposal",
      proposal: PROPOSAL,
    })
    const none = reply(JSON.stringify({ structural: false }))
    expect(await none.handlers.check(none.id, 1, "x")).toEqual({ status: "none" })
    const refused = setup()
    expect(await refused.handlers.check(refused.id, 1, "x")).toEqual({ status: "failed" })
  })

  it("refuses to finish with open flags", () => {
    const { handlers, id } = setup()
    expect(() => handlers.finish(id)).toThrow("Accept every flagged line before finishing.")
  })

  it("keeps the session when the file can't be written", () => {
    const writeFile = vi.fn<(path: string, text: string) => void>(() => {
      throw new Error("EACCES: permission denied")
    })
    const fixture = setup({ writeFile })
    fixture.handlers.accept(fixture.id, 1, null)
    expect(() => fixture.handlers.finish(fixture.id)).toThrow(
      "Couldn't write /s/subs.pt-pt.ass: EACCES: permission denied",
    )
    expect(fixture.sessions.load(fixture.id)?.phase).toBe("review")
    writeFile.mockImplementation(() => undefined)
    fixture.handlers.finish(fixture.id)
    expect(fixture.sessions.load(fixture.id)?.phase).toBe("done")
  })

  it("finishes, writes notes back, reveals the file and reports", () => {
    const writeFile = vi.fn<(path: string, text: string) => void>()
    const reveal = vi.fn<(path: string) => void>()
    const { handlers, id } = setup({ writeFile, reveal })
    handlers.accept(id, 1, "Os Hashira chegaram.")
    const result = handlers.finish(id)
    const text = writeFile.mock.calls[0]?.[1] ?? ""
    expect(text).toContain("Os Hashira chegaram. {note: linha longa}")
    expect(text).toContain("Olá.")
    expect(reveal).toHaveBeenCalledWith("/s/subs.pt-pt.ass")
    expect(result.report.flags).toBe(1)
    expect(result.outputPath).toBe("/s/subs.pt-pt.ass")
  })

  it("throws for a missing session and discards the file", () => {
    const { handlers, id, sessions } = setup()
    handlers.discard(id)
    expect(sessions.load(id)).toBeNull()
    expect(() => handlers.load(id)).toThrow("That translation no longer exists.")
  })

  it("refuses accept, check, confirm and finish unless the session is in review", async () => {
    const { handlers, sessions, id } = setup()
    const session = sessions.load(id)
    if (session === null) {
      throw new Error("seed missing")
    }
    sessions.save({ ...session, phase: "stopped" })
    const message = "This translation is not ready for review."
    expect(() => handlers.accept(id, 1, null)).toThrow(message)
    await expect(handlers.check(id, 1, "x")).rejects.toThrow(message)
    expect(() => handlers.confirm(id, 1, "x", PROPOSAL, false, null)).toThrow(message)
    expect(() => handlers.finish(id)).toThrow(message)
  })

  it("refuses a line that is not part of the translation", () => {
    const { handlers, id } = setup()
    const message = "That line is not part of this translation."
    expect(() => handlers.accept(id, 99, "x")).toThrow(message)
    expect(() => handlers.confirm(id, 99, "x", PROPOSAL, false, null)).toThrow(message)
  })

  it("confirm skips siblings that are not dialogue lines", () => {
    const { handlers, id, sessions } = setup()
    const proposal: Proposal = {
      siblings: [
        { eventIndex: 99, words: "Fantasma." },
        { eventIndex: 2, words: "Os Pilares esperam." },
      ],
      rule: null,
    }
    handlers.confirm(id, 1, "Os Pilares chegaram.", proposal, true, null)
    expect(sessions.load(id)?.review.edits).toEqual({
      "1": "Os Pilares chegaram.",
      "2": "Os Pilares esperam.",
    })
  })

  it("confirm does not save a rule that is already there", () => {
    const { handlers, id, profiles, seriesId, sessions } = setup()
    handlers.confirm(id, 1, "Os Pilares chegaram.", PROPOSAL, false, "series")
    handlers.confirm(id, 1, "Os Pilares chegaram.", PROPOSAL, false, "series")
    expect(profiles.loadSeriesRules("pt-pt", seriesId)).toEqual([PROPOSAL.rule])
    expect(sessions.load(id)?.review.rules).toHaveLength(1)
    handlers.confirm(id, 1, "Os Pilares chegaram.", PROPOSAL, false, "base")
    handlers.confirm(id, 1, "Os Pilares chegaram.", PROPOSAL, false, "base")
    expect(profiles.loadBase("pt-pt").base.rules).toEqual([PROPOSAL.rule])
    expect(sessions.load(id)?.review.rules).toHaveLength(2)
  })
})
