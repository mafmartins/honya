import { describe, expect, it } from "vitest"
import {
  translateMissing,
  type CompletionRequest,
  type MissingInput,
  type RunEvent,
} from "../../src/core/pipeline/run"
import type { Completer } from "../../src/core/pipeline/run"
import type { AiLine } from "../../src/core/session/lines"
import type { SessionBrief } from "../../src/core/session/types"
import { echo, emptyBrief, isBrief, requestedIds } from "../support/fakeModel"

// The batch engine behind every AI run: cheap pass, fixes, escalation, the brief and
// frames. Each run here starts from a session with no Portuguese and no brief yet.

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

interface Ran {
  // Every line the AI answered, by dialogue index.
  lines: Map<number, AiLine>
  events: RunEvent[]
  brief: SessionBrief | null
  glossary: { source: string; pt: string }[]
}

async function run(
  count: number,
  complete: Completer,
  overrides: Partial<MissingInput> = {},
): Promise<Ran> {
  const ran: Ran = { lines: new Map(), events: [], brief: null, glossary: [] }
  await translateMissing({
    ass: scriptWith(count),
    dialogueStyles: new Set(["Default"]),
    card,
    preset: "save",
    complete,
    sleep: async () => {},
    frameSetting: "none",
    known: new Map(),
    manual: new Set(),
    brief: null,
    glossary: [],
    shouldStop: () => false,
    onBrief: (brief) => {
      ran.brief = brief
    },
    onBatch: (event) => {
      for (const line of event.lines) {
        ran.lines.set(line.index, line)
      }
      ran.glossary = event.glossary
    },
    onEvent: (event) => {
      ran.events.push(event)
    },
    ...overrides,
  })
  return ran
}

// A model whose cheap and strong tiers answer through the given functions; the brief
// is `brief`.
function model(
  cheap: (ids: string[], request: CompletionRequest) => unknown,
  strong: (ids: string[], request: CompletionRequest) => unknown = (ids) => lines(ids, "forte"),
  brief: unknown = emptyBrief,
): { complete: Completer; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = []
  const complete: Completer = (request) => {
    requests.push(request)
    if (isBrief(request)) {
      return Promise.resolve({ value: brief })
    }
    const ids = requestedIds(request.prompt)
    const value = request.tier === "cheap" ? cheap(ids, request) : strong(ids, request)
    return Promise.resolve(value === null ? { refused: true, reason: "nope" } : { value })
  }
  return { complete, requests }
}

function lines(ids: string[], prefix = "pt", mark = "clean"): unknown {
  return {
    lines: ids.map((id) => ({ id, text: `${prefix} ${id}`, mark, note: "" })),
    terms: [],
  }
}

describe("the batch engine", () => {
  it("asks the cheap model once per batch when it answers every line", async () => {
    const { complete, requests } = model((ids) => lines(ids))
    const ran = await run(30, complete)
    expect(requests.map((r) => (isBrief(r) ? "brief" : r.tier))).toEqual([
      "brief",
      "cheap",
      "cheap",
    ])
    expect(ran.lines.get(29)?.words).toBe("pt 29")
    expect([...ran.lines.values()].every((line) => line.flag === null)).toBe(true)
  })

  it("asks again only for the lines the cheap model left out", async () => {
    const { complete, requests } = model((ids) => lines(ids.filter((id) => id !== "2")))
    const ran = await run(5, complete)
    const cheap = requests.filter((r) => r.tier === "cheap" && !isBrief(r))
    expect(cheap.map((r) => requestedIds(r.prompt))).toEqual([["0", "1", "2", "3", "4"], ["2"]])
    expect(ran.events).toContainEqual({
      type: "problem",
      tier: "cheap",
      reason: "left out lines 2",
    })
  })

  it("sends a line the cheap model never returned to the strong model alone", async () => {
    const { complete, requests } = model((ids) => lines(ids.filter((id) => id !== "2")))
    const ran = await run(5, complete)
    const strong = requests.filter((r) => r.tier === "strong")
    expect(strong.map((r) => requestedIds(r.prompt))).toEqual([["2"]])
    expect(strong[0]?.prompt).toContain("[2] the first pass gave no translation")
    expect(strong[0]?.prompt).toContain("[1] (Tanjiro, 12) Line 1. => pt 1")
    expect(ran.lines.get(2)).toEqual({ index: 2, words: "forte 2", flag: null, strong: true })
    expect(ran.lines.get(1)?.strong).toBe(false)
  })

  it("keeps the cheap draft with its note when the strong model fails", async () => {
    const { complete } = model(
      (ids) => ({
        lines: ids.map((id) => ({
          id,
          text: `pt ${id}`,
          mark: id === "1" ? "doubt" : "clean",
          note: id === "1" ? "sentido ambíguo" : "",
        })),
        terms: [],
      }),
      () => null,
    )
    const ran = await run(3, complete)
    expect(ran.lines.get(1)).toEqual({
      index: 1,
      words: "pt 1",
      flag: "sentido ambíguo",
      strong: false,
    })
  })

  it("leaves a line untranslated when neither model gives it", async () => {
    const { complete, requests } = model(
      () => null,
      () => null,
    )
    const ran = await run(1, complete)
    expect(requests.filter((r) => r.tier === "cheap" && !isBrief(r))).toHaveLength(2)
    expect(requests.filter((r) => r.tier === "strong")).toHaveLength(1)
    expect(ran.lines.size).toBe(0)
  })

  it("asks the cheap model to fix only the lines with a brazilian form", async () => {
    const { complete, requests } = model((ids, request) =>
      request.prompt.includes("These drafts break a rule")
        ? lines(ids, "Raios")
        : {
            lines: ids.map((id) => ({
              id,
              text: id === "1" ? "Droga!" : `pt ${id}`,
              mark: "clean",
              note: "",
            })),
            terms: [],
          },
    )
    const ran = await run(3, complete)
    const fix = requests.find((r) => r.prompt.includes("These drafts break a rule"))
    expect(fix === undefined ? [] : requestedIds(fix.prompt)).toEqual(["1"])
    expect(fix?.prompt).toContain('=> Droga!; "Droga!" is Brazilian')
    expect(ran.events).toContainEqual({ type: "fix", count: 1 })
    expect(ran.lines.get(1)).toEqual({ index: 1, words: "Raios 1", flag: null, strong: false })
  })

  it("flags the draft when the fix doesn't clear the problem", async () => {
    const { complete } = model((ids) => ({
      lines: ids.map((id) => ({ id, text: "Droga!", mark: "clean", note: "" })),
      terms: [],
    }))
    const ran = await run(1, complete)
    expect(ran.lines.get(0)).toEqual({
      index: 0,
      words: "Droga!",
      flag: "forma brasileira",
      strong: false,
    })
  })

  it("enforces the profile's glossary rules", async () => {
    const { complete, requests } = model((ids, request) =>
      request.prompt.includes("These drafts break a rule") ? lines(ids, "Pilar") : lines(ids),
    )
    await run(2, complete, {
      ass: scriptWith(2).replace("Line 1.", "Line 1, a Hashira."),
      card: { ...card, rules: [{ kind: "glossary", source: "Hashira", pt: "Pilar" }] },
    })
    const fix = requests.find((r) => r.prompt.includes("These drafts break a rule"))
    expect(fix?.prompt).toContain('"Hashira" must be translated as "Pilar"')
    expect(fix === undefined ? [] : requestedIds(fix.prompt)).toEqual(["1"])
  })

  it("treats an unknown mark as a doubt", async () => {
    const { complete, requests } = model((ids) => lines(ids, "pt", "good"))
    await run(2, complete)
    const strong = requests.filter((r) => r.tier === "strong")
    expect(strong.map((r) => requestedIds(r.prompt))).toEqual([["0", "1"]])
  })

  it("uses the brief: summary in the instructions, terms in the glossary, hard lines escalated", async () => {
    const { complete, requests } = model(
      (ids) => lines(ids),
      (ids) => lines(ids, "forte"),
      {
        summary: "Tanjiro fala com a irmã.",
        terms: [{ source: "Nezuko", pt: "Nezuko" }],
        hard: ["1", "99"],
        frames: [],
      },
    )
    const ran = await run(3, complete, { preset: "balanced" })
    const cheap = requests.find((r) => r.tier === "cheap" && !isBrief(r))
    expect(cheap?.system).toContain("About this episode:\nTanjiro fala com a irmã.")
    expect(cheap?.prompt).toContain("Glossary (use these forms):\nNezuko = Nezuko")
    expect(ran.brief?.hardIds).toEqual(["1"])
    expect(requests.filter((r) => r.tier === "strong").map((r) => requestedIds(r.prompt))).toEqual([
      ["1"],
    ])
  })

  it("carries terms a batch chose into the next batch", async () => {
    const { complete, requests } = model((ids) => ({
      ...(lines(ids) as object),
      terms: [{ source: "Demon Slayer Corps", pt: "Corpo de Caçadores de Demónios" }],
    }))
    const ran = await run(30, complete)
    const second = requests.filter((r) => r.tier === "cheap" && !isBrief(r))[1]
    expect(second?.prompt).toContain("Demon Slayer Corps = Corpo de Caçadores de Demónios")
    expect(second?.prompt).toContain("Line 24. => pt 24")
    expect(ran.glossary).toHaveLength(1)
  })

  it("says what went wrong when the brief fails, and goes on without it", async () => {
    const complete: Completer = (request) =>
      isBrief(request) ? Promise.resolve({ refused: true, reason: "busy" }) : echo(request)
    const ran = await run(2, complete)
    expect(ran.events).toContainEqual({ type: "problem", tier: "cheap", reason: "brief: busy" })
    expect(ran.lines.get(1)?.words).toBe("pt 1")
  })

  it("emits the brief, then each batch in order", async () => {
    const ran = await run(60, echo)
    const shape = ran.events.map((e) =>
      e.type === "batch" ? `${e.type} ${String(e.index)}/${String(e.total)}` : e.type,
    )
    expect(shape).toEqual(["brief", "batch 1/3", "batch 2/3", "batch 3/3"])
  })

  it("rejects when the completer throws", async () => {
    const complete: Completer = () => Promise.reject(new Error("401"))
    await expect(run(3, complete)).rejects.toThrow("401")
  })
})

describe("frames per batch", () => {
  function completer(sentImages: string[][], briefFrames: string[]): Completer {
    return (request) => {
      if (isBrief(request)) {
        return Promise.resolve({ value: { ...emptyBrief, frames: briefFrames } })
      }
      sentImages.push((request.images ?? []).map((image) => image.id))
      return echo(request)
    }
  }

  function provider(
    asked: string[][],
  ): (ids: readonly string[]) => Promise<ReadonlyMap<string, Uint8Array>> {
    return (ids) => {
      asked.push([...ids])
      return Promise.resolve(new Map(ids.map((id) => [id, new Uint8Array([1])])))
    }
  }

  it("asks for every line's frame one batch at a time", async () => {
    const asked: string[][] = []
    const sent: string[][] = []
    await run(30, completer(sent, []), { frameSetting: "every", frames: provider(asked) })
    const range = (from: number, to: number): string[] =>
      Array.from({ length: to - from }, (_, i) => String(from + i))
    expect(asked).toEqual([range(0, 25), range(25, 30)])
    expect(sent).toEqual([range(0, 25), range(25, 30)])
  })

  it("asks only for the frames the brief marked, and not at all for batches without one", async () => {
    const asked: string[][] = []
    const sent: string[][] = []
    await run(30, completer(sent, ["3", "27"]), {
      frameSetting: "marked",
      frames: provider(asked),
    })
    expect(asked).toEqual([["3"], ["27"]])
    expect(sent).toEqual([["3"], ["27"]])
  })
})
