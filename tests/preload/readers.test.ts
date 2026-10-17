import { describe, expect, it } from "vitest"
import { ipcMessage, readModelPair, readPickedExample } from "../../src/preload/readers"

describe("preload readers", () => {
  it("strips electron's prefix from a handler error", () => {
    const error = new Error(
      "Error invoking remote method 'honya:ws-create-project': Error: A project called Frieren already exists for pt-pt.",
    )
    expect(ipcMessage(error)).toBe("A project called Frieren already exists for pt-pt.")
    expect(ipcMessage(new Error("plain"))).toBe("plain")
    expect(ipcMessage("nope")).toBe("Something went wrong.")
  })

  it("accepts null for a cancelled pick and checks example styles", () => {
    expect(readPickedExample(null)).toEqual({ value: null })
    const example = { name: "a.ass", text: "x", styles: [{ name: "Default", guess: "dialogue" }] }
    expect(readPickedExample(example)).toEqual({ value: example })
    expect(
      readPickedExample({ ...example, styles: [{ name: "Default", guess: "maybe" }] }),
    ).toBeNull()
  })

  it("checks model pairs", () => {
    expect(readModelPair({ cheap: "a", strong: "b" })).toEqual({ cheap: "a", strong: "b" })
    expect(readModelPair({ cheap: "a" })).toBeNull()
  })
})
