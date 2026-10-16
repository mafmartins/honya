import { describe, expect, it } from "vitest"
import { refuseWhileRunning } from "../../../src/main/translate/guard"

describe("refuseWhileRunning", () => {
  it("throws for the session that is running", () => {
    expect(() => {
      refuseWhileRunning({ activeId: () => "a" }, "a")
    }).toThrow("That translation is still running.")
  })

  it("lets any other session through", () => {
    expect(() => {
      refuseWhileRunning({ activeId: () => "a" }, "b")
    }).not.toThrow()
    expect(() => {
      refuseWhileRunning({ activeId: () => null }, "a")
    }).not.toThrow()
  })
})
