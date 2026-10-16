import { describe, expect, it } from "vitest"
import { addGlossary, chunkDialogue, emptyGlossary } from "../../src/core/pipeline/batch"

describe("batches", () => {
  it("chunks 25 lines and keeps a short final batch", () => {
    const chunks = chunkDialogue(Array.from({ length: 26 }, (_, i) => i))
    expect(chunks.map((c) => c.length)).toEqual([25, 1])
  })

  it("keeps the first incoming row when the same source appears twice", () => {
    const glossary = addGlossary(emptyGlossary(), [
      { source: "Himmel", pt: "Himmel" },
      { source: "Himmel", pt: "Céu" },
    ])
    expect(glossary.entries).toEqual([{ source: "Himmel", pt: "Himmel" }])
  })
})
