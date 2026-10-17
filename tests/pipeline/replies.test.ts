import { describe, expect, it } from "vitest"
import { readBriefReply, readLinesReply } from "../../src/core/pipeline/replies"

describe("reading a batch reply", () => {
  it("reads lines, notes and terms", () => {
    expect(
      readLinesReply({
        lines: [
          { id: "0", text: "Como?", mark: "clean", note: "" },
          { id: "1", text: "Não morras!", mark: "hard-call", note: "registo" },
        ],
        terms: [{ source: "Nezuko", pt: "Nezuko" }],
      }),
    ).toEqual({
      lines: [
        { id: "0", words: "Como?", mark: "clean" },
        { id: "1", words: "Não morras!", mark: "hard-call", reason: "registo" },
      ],
      terms: [{ source: "Nezuko", pt: "Nezuko" }],
    })
  })

  // Shapes Gemini actually sent before replies were constrained by a schema
  // (logs/providers.log, 2026-10-16).
  it("forgives invented marks, numeric ids and a malformed glossary", () => {
    expect(
      readLinesReply({
        lines: [
          { id: 0, words: "Como?", mark: "ok", reason: "Traduzido naturalmente.", glossary: [] },
          { id: 1, words: "Como isso aconteceu?", mark: "dúvida", glossary: {} },
          { id: 25, words: "Obrigado, Hanako.", mark: "", reason: "", glossary: "" },
        ],
        terms: "none",
      }),
    ).toEqual({
      lines: [
        { id: "0", words: "Como?", mark: "doubt", reason: "Traduzido naturalmente." },
        { id: "1", words: "Como isso aconteceu?", mark: "doubt" },
        { id: "25", words: "Obrigado, Hanako.", mark: "doubt" },
      ],
      terms: [],
    })
  })

  it("leaves out a line with no id or no text, so it is asked again", () => {
    expect(
      readLinesReply({
        lines: [
          { id: "0", text: "Olá.", mark: "clean", note: "" },
          { text: "sem id", mark: "clean" },
          { id: "2", text: "  ", mark: "clean" },
          { id: "[3]", text: "Adeus.", mark: "clean", note: "" },
        ],
        terms: [{ source: "x" }, { source: " Hashira ", pt: " Hashira " }],
      }),
    ).toEqual({
      lines: [
        { id: "0", words: "Olá.", mark: "clean" },
        { id: "3", words: "Adeus.", mark: "clean" },
      ],
      terms: [{ source: "Hashira", pt: "Hashira" }],
    })
  })

  it("turns a real newline into an ass line break", () => {
    expect(
      readLinesReply({
        lines: [{ id: "5", text: "Vou salvar-te,\ncuste o que custar!", mark: "clean", note: "" }],
      }),
    ).toMatchObject({ lines: [{ words: "Vou salvar-te,\\Ncuste o que custar!" }] })
  })

  it("says why when nothing is usable", () => {
    expect(readLinesReply({ translations: [] })).toBe("the reply has no lines list")
    expect(readLinesReply({ lines: [{ id: "0" }] })).toBe("the reply has no usable line")
  })
})

describe("reading a brief", () => {
  it("reads the summary, terms and ids, dropping what doesn't fit", () => {
    expect(
      readBriefReply({
        summary: " Tanjiro e Nezuko. ",
        terms: [{ source: "Nezuko", pt: "Nezuko" }, "bad"],
        hard: ["3", 4, "3", null],
        frames: "none",
      }),
    ).toEqual({
      summary: "Tanjiro e Nezuko.",
      terms: [{ source: "Nezuko", pt: "Nezuko" }],
      hard: ["3", "4"],
      frames: [],
    })
    expect(readBriefReply([])).toBe("the brief is not an object")
  })
})
