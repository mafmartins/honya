import { describe, expect, it } from "vitest"
import type { Correction, Rule } from "../../../src/core/library/types"
import type { Completion, CompletionRequest } from "../../../src/core/pipeline/run"
import type { SessionLine, WorkSession } from "../../../src/core/session/types"
import { createExportService } from "../../../src/main/workspace/export"
import type { Owner } from "../../../src/main/workspace/projects"
import { makeSession } from "../../session/fixture"

function withLine(session: WorkSession, index: number, patch: Partial<SessionLine>): WorkSession {
  return {
    ...session,
    lines: session.lines.map((line) => (line.index === index ? { ...line, ...patch } : line)),
  }
}

function edited(): WorkSession {
  let session = withLine(makeSession(), 0, { words: "Raios!", origin: "manual" })
  session = withLine(session, 1, { words: "Olá.", origin: "ai", flag: "forma" })
  return { ...session, edits: [{ index: 0, en: "Damn it!", draft: "Droga!", final: "Raios!" }] }
}

const SPENT = { model: "gemini-2.5-flash", usage: { input: 10, output: 5, cached: 0 } }
const SUGGESTION = { kind: "prose", text: "Use Raios for Damn it.", source: "", pt: "", lines: [0] }

function setup(start: WorkSession, reply: Completion = { value: { suggestions: [SUGGESTION] } }) {
  let stored = start
  const requests: CompletionRequest[] = []
  const written: { path: string; text: string }[] = []
  const corrections: Correction[][] = []
  const rules: { owner: Owner; rule: Rule }[] = []
  const service = createExportService({
    sessions: {
      get: () => stored,
      save: (next) => {
        stored = next
      },
    },
    completerFor: () => (request) => {
      requests.push(request)
      return Promise.resolve({ ...reply, spent: SPENT })
    },
    knownRules: () => [],
    addCorrections: (_id, list) => corrections.push(list),
    addRule: (owner, rule) => rules.push({ owner, rule }),
    writeFile: (path, text) => written.push({ path, text }),
    now: () => Date.parse("2026-10-17T12:00:00Z"),
  })
  return { service, requests, written, corrections, rules, stored: () => stored }
}

describe("export service", () => {
  it("previews counts, default path and suggestions, recording the spend", async () => {
    const t = setup(edited())
    const preview = await t.service.preview("s1")
    expect(preview).toMatchObject({
      translated: 2,
      english: 1,
      openFlags: 1,
      defaultPath: "/a/ep01.pt-pt.ass",
    })
    expect(preview.suggestions).toEqual([
      { rule: { kind: "prose", text: "Use Raios for Damn it." }, lines: [0] },
    ])
    expect(t.requests).toHaveLength(1)
    expect(t.requests[0]?.tier).toBe("cheap")
    expect(t.stored().spend).toHaveLength(1)
  })

  it("makes no request without edits and returns no suggestions for an unusable reply", async () => {
    const none = setup(makeSession())
    expect((await none.service.preview("s1")).suggestions).toEqual([])
    expect(none.requests).toHaveLength(0)
    const bad = setup(edited(), { refused: true })
    expect((await bad.service.preview("s1")).suggestions).toEqual([])
  })

  it("refuses the source path and writes nothing", () => {
    const t = setup(edited())
    expect(() => t.service.write("s1", "/a/../a/ep01.ass", [])).toThrow(
      "Choose a different name: Honya never overwrites the original script.",
    )
    expect(t.written).toHaveLength(0)
    expect(t.rules).toHaveLength(0)
    expect(t.corrections).toHaveLength(0)
    expect(t.stored().exportedAt).toBeNull()
  })

  it("writes the file, saves rules and corrections and sets exportedAt", () => {
    const t = setup(edited())
    const rule: Rule = { kind: "prose", text: "Use Raios." }
    const owner: Owner = { kind: "project", id: "p1" }
    const result = t.service.write("s1", "/a/out.ass", [{ owner, rule }])
    expect(result.path).toBe("/a/out.ass")
    expect(t.written[0]?.text).toContain("Raios!")
    expect(t.written[0]?.text).toContain("Olá. {note: forma}")
    expect(t.written[0]?.text).toContain("Bye.")
    expect(t.rules).toEqual([{ owner, rule }])
    expect(t.corrections).toEqual([[{ en: "Damn it!", draft: "Droga!", final: "Raios!" }]])
    expect(t.stored().exportedAt).toBe("2026-10-17T12:00:00.000Z")
  })
})
