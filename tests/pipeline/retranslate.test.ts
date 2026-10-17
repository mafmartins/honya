import { describe, expect, it } from "vitest"
import {
  retranslateLine,
  type Completer,
  type CompletionRequest,
} from "../../src/core/pipeline/run"
import { requestedIds } from "../support/fakeModel"

function script(count: number): string {
  const events = Array.from({ length: count }, (_, i) => {
    const second = String(i).padStart(2, "0")
    return `Dialogue: 0,0:00:${second}.00,0:00:${second}.90,Default,Tanjiro,0,0,0,,Line ${String(i)}.`
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

function replying(text: string, requests: CompletionRequest[] = []): Completer {
  return (request) => {
    requests.push(request)
    const lines = requestedIds(request.prompt).map((id) => ({ id, text, mark: "clean", note: "" }))
    return Promise.resolve({ value: { lines, terms: [] } })
  }
}

function input(complete: Completer, hint = "") {
  return {
    ass: script(10),
    dialogueStyles: new Set(["Default"]),
    card,
    complete,
    index: 5,
    hint,
    known: new Map([
      [1, "um"],
      [2, "dois"],
      [3, "três"],
      [4, "quatro"],
      [5, "cinco velho"],
      [7, "sete"],
    ]),
    brief,
    glossary: [{ source: "Tanjiro", pt: "Tanjiro" }],
  }
}

describe("retranslateLine", () => {
  it("asks the strong model for one line with its neighbours and the hint", async () => {
    const requests: CompletionRequest[] = []
    const image = new Uint8Array([1, 2, 3])
    const result = await retranslateLine({
      ...input(replying("novo", requests), "she is his sister"),
      image,
    })
    expect(result).toEqual({ index: 5, words: "novo", flag: null, strong: true })
    expect(requests).toHaveLength(1)
    const request = requests[0]
    expect(request?.tier).toBe("strong")
    expect(request?.schema.name).toBe("translated_lines")
    expect(request?.system).toContain("Tanjiro protege a irmã.")
    expect(request?.images).toEqual([{ id: "5", bytes: image }])
    const prompt = request?.prompt ?? ""
    expect(prompt).toContain("Line 2. => dois")
    expect(prompt).toContain("Line 4. => quatro")
    expect(prompt).toContain("Line 8.")
    expect(prompt).not.toContain("Line 1.")
    expect(prompt).not.toContain("Line 9.")
    expect(prompt).toContain("cinco velho")
    expect(prompt).toContain("The translator asks: she is his sister")
    expect(prompt).toContain("Tanjiro = Tanjiro")
    expect(requestedIds(prompt)).toEqual(["5"])
  })

  it("leaves the hint out when it is empty", async () => {
    const requests: CompletionRequest[] = []
    await retranslateLine(input(replying("novo", requests)))
    expect(requests[0]?.prompt).not.toContain("The translator asks")
  })

  it("comes back flagged when the new text has a Brazilian form", async () => {
    const result = await retranslateLine(input(replying("Eu estou fazendo isso.")))
    expect(result?.words).toBe("Eu estou fazendo isso.")
    expect(result?.flag).toBe("forma brasileira")
    expect(result?.strong).toBe(true)
  })

  it("returns null when the model gives nothing usable", async () => {
    expect(await retranslateLine(input(() => Promise.resolve({ refused: true })))).toBeNull()
    expect(
      await retranslateLine(input(() => Promise.resolve({ value: { lines: [], terms: [] } }))),
    ).toBeNull()
  })

  it("returns null for an index that is not a dialogue line", async () => {
    expect(await retranslateLine({ ...input(replying("x")), index: 99 })).toBeNull()
  })
})
