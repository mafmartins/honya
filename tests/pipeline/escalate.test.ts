import { describe, expect, it } from "vitest"
import { escalationIds } from "../../src/core/pipeline/escalate"
import type { LineSignals } from "../../src/core/pipeline/types"

const lines: LineSignals[] = [
  { id: "clean", cheap: "clean", briefHard: false, unfit: false },
  { id: "doubt", cheap: "doubt", briefHard: false, unfit: false },
  { id: "hard", cheap: "hard-call", briefHard: false, unfit: false },
  { id: "brief", cheap: "clean", briefHard: true, unfit: false },
  { id: "long", cheap: "clean", briefHard: false, unfit: true },
  { id: "mild", cheap: "mild", briefHard: false, unfit: false },
]

describe("escalationIds", () => {
  it("nests save inside balanced inside best", () => {
    const save = escalationIds("save", lines)
    const balanced = escalationIds("balanced", lines)
    const best = escalationIds("best", lines)
    expect(save).toEqual(["doubt", "hard"])
    expect(balanced).toEqual(["doubt", "hard", "brief", "long"])
    expect(best).toEqual(["doubt", "hard", "brief", "long", "mild"])
    expect(best).toEqual(expect.arrayContaining(balanced))
    expect(balanced).toEqual(expect.arrayContaining(save))
  })
})
