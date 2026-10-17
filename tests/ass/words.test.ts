import { describe, expect, it } from "vitest"
import { matchBreaks, replaceWords } from "../../src/core/ass/words"

describe("replaceWords", () => {
  it("replaces words and keeps the original override blocks", () => {
    const next = replaceWords("{\\an8}{\\i1}Hello.{\\i0}", "Olá.")
    expect(next).toEqual({ ok: true, raw: "{\\an8}{\\i1}Olá.{\\i0}" })
  })

  it("keeps hard line breaks inside the words", () => {
    const next = replaceWords("Hello.\\NThere.", "Olá.\\NAli.")
    expect(next).toEqual({ ok: true, raw: "Olá.\\NAli." })
  })

  it("refuses an unclosed override", () => {
    expect(replaceWords("{\\an8Hello", "Olá.").ok).toBe(false)
  })

  it("places words on a tag-only line", () => {
    expect(replaceWords("{\\an8}", "Olá.")).toEqual({
      ok: true,
      raw: "{\\an8}Olá.",
    })
  })

  it("places words on an empty string", () => {
    expect(replaceWords("", "Olá.")).toEqual({ ok: true, raw: "Olá." })
  })

  it("keeps the source's break when the translation sends a real newline", () => {
    expect(replaceWords("{\\i1}Hello.\\NThere.{\\i0}", "Olá.\nAli.")).toEqual({
      ok: true,
      raw: "{\\i1}Olá.\\NAli.{\\i0}",
    })
  })
})

describe("matchBreaks", () => {
  it("leaves a line with the right number of breaks alone", () => {
    expect(matchBreaks("Olá.\\NAli.", 1)).toBe("Olá.\\NAli.")
    expect(matchBreaks("Olá.", 0)).toBe("Olá.")
  })

  it("adds a missing break at the space nearest the middle, before the note", () => {
    expect(matchBreaks("O teu mano jura que te vai salvar {note: dúvida}", 1)).toBe(
      "O teu mano jura\\Nque te vai salvar {note: dúvida}",
    )
  })

  it("removes breaks the source doesn't have", () => {
    expect(matchBreaks("Olá.\\NAli.", 0)).toBe("Olá. Ali.")
    expect(matchBreaks("a b\\Nc d\\Ne f", 1)).toBe("a b c\\Nd e f")
  })

  it("reads a lowercase \\n as the break", () => {
    expect(matchBreaks("Tu também, Shigeru.\\nMas trago-vos guloseimas.", 1)).toBe(
      "Tu também, Shigeru.\\NMas trago-vos guloseimas.",
    )
  })

  it("still matches the count on a line with no spaces", () => {
    expect(matchBreaks("Olá!", 1)).toBe("Olá!\\N")
  })
})
