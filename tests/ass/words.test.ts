import { describe, expect, it } from "vitest"
import { replaceWords } from "../../src/core/ass/words"

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
      raw: "Olá.{\\an8}",
    })
  })

  it("places words on an empty string", () => {
    expect(replaceWords("", "Olá.")).toEqual({ ok: true, raw: "Olá." })
  })
})
