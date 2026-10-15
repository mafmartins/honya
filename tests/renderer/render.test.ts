import { describe, expect, it } from "vitest"
import { render } from "../../src/renderer/render"

describe("render", () => {
  it("draws the split review card in paper, ink, and orange", () => {
    const html = render({
      screen: "review",
      series: "Frieren",
      fileName: "episode.ass",
      variant: "pt-pt",
      preset: "balanced",
      provider: "mistral",
      openFlagCount: 3,
      current: { words: "Estás a dizer-me que aquela coisa é um dragão?", note: "linha longa para o cue", english: "You're telling me that thing is a dragon?", before: "O Himmel teria sorrido.", after: "Vamos andando." },
      proposal: null,
    })
    expect(html).toContain("Frieren")
    expect(html).toContain("episode.ass")
    expect(html).toContain("3 flags")
    expect(html).toContain("You're telling me that thing is a dragon?")
    expect(html).toContain("{note: linha longa para o cue}")
    expect(html).toContain("Accept")
    expect(html).toContain("#e36b1e")
    expect(html).toContain("#faf7f2")
    expect(html).toContain("#2a2420")
  })
})
