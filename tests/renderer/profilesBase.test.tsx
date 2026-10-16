// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../../src/renderer/App"
import type { SetupApi } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

async function openProfiles(api: SetupApi): Promise<HTMLElement> {
  render(<App api={api} />)
  fireEvent.click(await screen.findByRole("button", { name: "Profiles" }))
  return screen.findByRole("region", { name: "base profile" })
}

describe("profiles base side", () => {
  it("adds and deletes a base rule", async () => {
    const base = await openProfiles(fakeApi())
    fireEvent.change(within(base).getByLabelText("rule text"), { target: { value: "Use tu." } })
    fireEvent.click(within(base).getByRole("button", { name: "Add rule" }))
    expect(await within(base).findByText("Use tu.")).toBeTruthy()
    fireEvent.change(within(base).getByLabelText("rule kind"), { target: { value: "glossary" } })
    fireEvent.change(within(base).getByLabelText("english"), { target: { value: "Himmel" } })
    fireEvent.change(within(base).getByLabelText("portuguese"), { target: { value: "Himmel" } })
    fireEvent.click(within(base).getByRole("button", { name: "Add rule" }))
    expect(await within(base).findByText("Himmel → Himmel")).toBeTruthy()
    fireEvent.click(within(base).getByRole("button", { name: "Delete rule Use tu." }))
    await waitFor(() => {
      expect(within(base).queryByText("Use tu.")).toBeNull()
    })
  })

  it("refuses an invalid characters-per-second limit and shows the stored value again", async () => {
    const api = fakeApi()
    const saveBase = (next: Parameters<SetupApi["saveBase"]>[0]) => api.saveBase(next)
    const base = await openProfiles({
      ...api,
      saveBase: (next) =>
        next.cpsLimit > 60
          ? Promise.reject(new Error("Characters per second must be a whole number from 1 to 60."))
          : saveBase(next),
    })
    const field = within(base).getByLabelText("characters per second")
    fireEvent.change(field, { target: { value: "99" } })
    fireEvent.blur(field)
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Characters per second must be a whole number from 1 to 60.",
    )
    await waitFor(() => {
      expect(field instanceof HTMLInputElement && field.value).toBe("17")
    })
  })

  it("imports an example after the styles are confirmed", async () => {
    const api = fakeApi({
      pickExample: () =>
        Promise.resolve({
          name: "ep01.ass",
          text: "x",
          styles: [
            { name: "Default", guess: "dialogue" },
            { name: "Sign/Dialogue", guess: "ambiguous" },
          ],
        }),
    })
    let chosen: string[] = []
    const importExample: SetupApi["importExample"] = (...args) => api.importExample(...args)
    const base = await openProfiles({
      ...api,
      importExample: (variant, name, text, styles) => {
        chosen = styles
        return importExample(variant, name, text, styles)
      },
    })
    fireEvent.click(within(base).getByRole("button", { name: "Import example…" }))
    const confirm = await within(base).findByRole("button", { name: "Import" })
    expect(confirm instanceof HTMLButtonElement && confirm.disabled).toBe(true)
    fireEvent.click(within(base).getByLabelText("Sign/Dialogue skip"))
    fireEvent.click(confirm)
    expect(await within(base).findByText("ep01.ass")).toBeTruthy()
    expect(chosen).toEqual(["Default"])
  })
})
