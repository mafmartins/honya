import { describe, expect, it } from "vitest"
import {
  ipcMessage,
  readLoadedBase,
  readModelPair,
  readPickedExample,
  readPickedScript,
  readSeriesList,
} from "../../src/preload/readers"

describe("preload readers", () => {
  it("strips electron's prefix from a handler error", () => {
    const error = new Error(
      "Error invoking remote method 'honya:create-series': Error: A series called Frieren already exists for pt-pt.",
    )
    expect(ipcMessage(error)).toBe("A series called Frieren already exists for pt-pt.")
    expect(ipcMessage(new Error("plain"))).toBe("plain")
    expect(ipcMessage("nope")).toBe("Something went wrong.")
  })

  it("accepts null for a cancelled pick and rejects a wrong shape", () => {
    expect(readPickedScript(null)).toEqual({ value: null })
    expect(readPickedScript({ path: "/a.ass", name: "a.ass", text: "x" })).toEqual({
      value: { path: "/a.ass", name: "a.ass", text: "x" },
    })
    expect(readPickedScript({ path: "/a.ass" })).toBeNull()
  })

  it("checks example styles and their guesses", () => {
    const example = { name: "a.ass", text: "x", styles: [{ name: "Default", guess: "dialogue" }] }
    expect(readPickedExample(example)).toEqual({ value: example })
    expect(
      readPickedExample({ ...example, styles: [{ name: "Default", guess: "maybe" }] }),
    ).toBeNull()
  })

  it("checks series lists, bases and model pairs", () => {
    expect(
      readSeriesList({ series: [{ id: "a", name: "F", ruleCount: 0 }], problems: [] }),
    ).toEqual({ series: [{ id: "a", name: "F", ruleCount: 0 }], problems: [] })
    expect(readSeriesList({ series: [{ id: "a" }], problems: [] })).toBeNull()
    expect(readModelPair({ cheap: "a", strong: "b" })).toEqual({ cheap: "a", strong: "b" })
    expect(readLoadedBase({ base: { variant: "pt-pt" }, problems: [] })).toBeNull()
  })
})
