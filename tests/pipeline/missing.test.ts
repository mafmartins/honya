import { describe, expect, it } from "vitest"
import {
  translateMissing,
  type CompletionRequest,
  type MissingInput,
  type RunEvent,
} from "../../src/core/pipeline/run"
import type { Completer } from "../../src/core/pipeline/run"
import type { AiLine } from "../../src/core/session/lines"
import { echo, emptyBrief, isBrief, requestedIds } from "../support/fakeModel"

function scriptWith(count: number): string {
  const events = Array.from({ length: count }, (_, i) => {
    const start = `0:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.00`
    const end = `0:${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}.50`
    return `Dialogue: 0,${start},${end},Default,Tanjiro,0,0,0,,Line ${String(i)}.`
  }).join("\n")
  return `[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events}\n`
}

const card = {
  variant: "pt-pt" as const,
  seriesId: "s",
  revision: 1,
  cpsLimit: 17,
  voice: "",
  rules: [],
}

const brief = { summary: "Tanjiro protege a irmã.", hardIds: [], frameIds: [] }

function recorded(inner: Completer = echo): { complete: Completer; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = []
  return {
    requests,
    complete: (request) => {
      requests.push(request)
      return inner(request)
    },
  }
}

function knownUpTo(count: number): Map<number, string> {
  return new Map(Array.from({ length: count }, (_, i) => [i, `feito ${String(i)}`]))
}

function missingInput(
  count: number,
  complete: Completer,
  overrides: Partial<MissingInput> = {},
): MissingInput & { batches: { index: number; total: number; lines: AiLine[] }[] } {
  const batches: { index: number; total: number; lines: AiLine[] }[] = []
  return {
    ass: scriptWith(count),
    dialogueStyles: new Set(["Default"]),
    card,
    preset: "save",
    complete,
    sleep: async () => {},
    frameSetting: "none",
    known: new Map(),
    manual: new Set(),
    brief,
    glossary: [],
    shouldStop: () => false,
    onBatch: (event) => {
      batches.push({ index: event.index, total: event.total, lines: event.lines })
    },
    batches,
    ...overrides,
  }
}

function linePrompts(requests: readonly CompletionRequest[]): string[] {
  return requests.filter((r) => !isBrief(r)).map((r) => r.prompt)
}

describe("translateMissing", () => {
  it("translates only lines without Portuguese", async () => {
    const { complete, requests } = recorded()
    const input = missingInput(30, complete, {
      known: knownUpTo(10),
      manual: new Set([0, 1, 2, 3, 4]),
    })
    expect(await translateMissing(input)).toBe("done")
    const ids = linePrompts(requests).flatMap(requestedIds)
    expect(ids).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 10)))
    expect(input.batches).toHaveLength(1)
    expect(input.batches[0]?.total).toBe(1)
    expect(input.batches[0]?.lines[0]).toEqual({
      index: 10,
      words: "pt 10",
      flag: null,
      strong: false,
    })
    // The nearest earlier lines with Portuguese give the batch its context.
    expect(linePrompts(requests)[0]).toContain("Line 9. => feito 9")
  })

  it("names the lines of each batch as it starts", async () => {
    const events: RunEvent[] = []
    await translateMissing(
      missingInput(30, echo, {
        known: knownUpTo(3),
        onEvent: (event) => events.push(event),
      }),
    )
    const starts = events.flatMap((event) => (event.type === "batch" ? [event.indexes] : []))
    expect(starts).toEqual([Array.from({ length: 25 }, (_, i) => i + 3), [28, 29]])
  })

  it("shows the translator's lines inside the batch range as context", async () => {
    const { complete, requests } = recorded()
    const known = knownUpTo(10)
    known.set(12, "Linha do tradutor.")
    for (let i = 15; i < 20; i += 1) {
      known.set(i, `feito ${String(i)}`)
    }
    const input = missingInput(20, complete, { known, manual: new Set([12]) })
    await translateMissing(input)
    const prompts = linePrompts(requests)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain("Already translated by the translator")
    expect(prompts[0]).toContain("Line 12. => Linha do tradutor.")
    expect(requestedIds(prompts[0] ?? "")).toEqual(["10", "11", "13", "14"])
  })

  it("asks for the brief only when the session has none", async () => {
    const withBrief = recorded()
    await translateMissing(missingInput(5, withBrief.complete))
    expect(withBrief.requests.filter(isBrief)).toHaveLength(0)

    const without = recorded((request) =>
      isBrief(request)
        ? Promise.resolve({
            value: {
              ...emptyBrief,
              summary: "Resumo.",
              terms: [{ source: "Nezuko", pt: "Nezuko" }],
              hard: ["2"],
            },
          })
        : echo(request),
    )
    const briefs: unknown[] = []
    await translateMissing(
      missingInput(5, without.complete, {
        brief: null,
        onBrief: (next, glossary) => briefs.push({ next, glossary }),
      }),
    )
    expect(without.requests.filter(isBrief)).toHaveLength(1)
    expect(briefs).toEqual([
      {
        next: { summary: "Resumo.", hardIds: ["2"], frameIds: [] },
        glossary: [{ source: "Nezuko", pt: "Nezuko" }],
      },
    ])
  })

  it("stops between batches", async () => {
    const { complete } = recorded()
    let delivered = 0
    const input = missingInput(30, complete, { shouldStop: () => delivered > 0 })
    const onBatch = input.onBatch
    input.onBatch = (event) => {
      delivered += 1
      onBatch(event)
    }
    expect(await translateMissing(input)).toBe("stopped")
    expect(input.batches).toHaveLength(1)
    expect(input.batches[0]?.total).toBe(2)
  })

  it("gives the note as the flag and leaves failed lines untranslated", async () => {
    const complete: Completer = (request) => {
      const ids = requestedIds(request.prompt).filter((id) => id !== "3")
      return Promise.resolve({
        value: {
          lines: ids.map((id) => ({
            id,
            text: `pt ${id}`,
            mark: id === "1" ? "doubt" : "clean",
            note: id === "1" ? "duvidoso" : "",
          })),
          terms: [],
        },
      })
    }
    const input = missingInput(5, complete, { preset: "save" })
    await translateMissing(input)
    const lines = input.batches.flatMap((b) => b.lines)
    expect(lines.map((l) => l.index)).toEqual([0, 1, 2, 4])
    expect(lines.find((l) => l.index === 1)?.flag).toBe("duvidoso")
    expect(lines.find((l) => l.index === 1)?.words).toBe("pt 1")
  })

  it("never asks for a manual line, even when it is not in known", async () => {
    const { complete, requests } = recorded()
    const input = missingInput(5, complete, {
      known: new Map([[0, "feito 0"]]),
      manual: new Set([2]),
    })
    await translateMissing(input)
    const ids = linePrompts(requests).flatMap((prompt) => requestedIds(prompt))
    expect(ids).not.toContain("2")
    expect(ids).toEqual(expect.arrayContaining(["1", "3", "4"]))
  })
})
