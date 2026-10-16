import { randomUUID } from "node:crypto"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  createSessionStore,
  fromSavedRun,
  toSavedRun,
  type TranslateSession,
} from "../../../src/main/translate/session"

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "honya-sessions-"))
}

function session(overrides: Partial<TranslateSession> = {}): TranslateSession {
  return {
    version: 2,
    id: randomUUID(),
    startedAt: "2026-10-16T10:00:00.000Z",
    phase: "running",
    scriptPath: "/videos/ep01.ass",
    scriptName: "ep01.ass",
    scriptText: "[Script Info]\n",
    seriesId: "a1",
    seriesName: "Frieren",
    variant: "pt-pt",
    provider: "claude",
    preset: "balanced",
    frameSetting: "none",
    videoPath: null,
    outputPath: "/videos/ep01.pt-pt.ass",
    dialogueStyles: ["Default"],
    card: {
      variant: "pt-pt",
      seriesId: "a1",
      revision: 1,
      cpsLimit: 17,
      voice: "neutral",
      rules: [{ kind: "prose", text: "Tratar por tu." }],
    },
    dialogueLines: 2,
    totalBatches: 1,
    saved: {
      completedBatches: 1,
      results: [["1", { id: "1", words: "Olá.", mark: "clean" }]],
      glossary: [{ source: "Frieren", pt: "Frieren" }],
      brief: "Tom calmo.",
      hardIds: ["2"],
      frameIds: [],
      strongIds: [],
    },
    review: {
      edits: { "1": "Olá, amigo." },
      accepted: [1],
      rules: [{ target: "series", rule: { kind: "prose", text: "Usar tu." } }],
    },
    frameNotes: [],
    framesUsed: 0,
    elapsedMs: 1200,
    error: null,
    ...overrides,
  }
}

describe("session store", () => {
  it("saves and loads a session", () => {
    const dir = tempDir()
    const original = session()
    createSessionStore(dir).save(original)
    expect(createSessionStore(dir).load(original.id)).toEqual(original)
  })

  it("ignores version 1 and unreadable files", () => {
    const dir = tempDir()
    const store = createSessionStore(dir)
    const legacy = randomUUID()
    const broken = randomUUID()
    writeFileSync(join(dir, `${legacy}.json`), JSON.stringify({ mode: "assisted" }))
    writeFileSync(join(dir, `${broken}.json`), "{bad")
    expect(store.load(legacy)).toBeNull()
    expect(store.load(broken)).toBeNull()
    expect(store.latestUnfinished()).toBeNull()
  })

  it("returns null for a version 1 file by id", () => {
    const dir = tempDir()
    const id = randomUUID()
    writeFileSync(join(dir, `${id}.json`), JSON.stringify({ ...session({ id }), version: 1 }))
    expect(createSessionStore(dir).load(id)).toBeNull()
  })

  it("returns the newest unfinished session", () => {
    const store = createSessionStore(tempDir())
    store.save(session({ phase: "done", startedAt: "2026-10-16T12:00:00.000Z" }))
    const review = session({ phase: "review", startedAt: "2026-10-16T11:00:00.000Z" })
    store.save(review)
    store.save(session({ phase: "running", startedAt: "2026-10-16T09:00:00.000Z" }))
    expect(store.latestUnfinished()?.id).toBe(review.id)
  })

  it("refuses an id that is not a uuid", () => {
    const store = createSessionStore(tempDir())
    expect(() => store.load("../keys")).toThrow("Invalid session id.")
    expect(() => {
      store.remove("../keys")
    }).toThrow("Invalid session id.")
  })

  it("removes a session file", () => {
    const dir = tempDir()
    const store = createSessionStore(dir)
    const saved = session()
    store.save(saved)
    store.remove(saved.id)
    expect(store.load(saved.id)).toBeNull()
    expect(readdirSync(dir)).toEqual([])
  })

  it("keeps the old file when a write fails", () => {
    const dir = tempDir()
    const original = session()
    createSessionStore(dir).save(original)
    const failing = createSessionStore(dir, {
      writeFile(path) {
        writeFileSync(path, "{half")
        throw new Error("disk full")
      },
    })
    expect(() => {
      failing.save({ ...original, scriptName: "Changed.ass" })
    }).toThrow("disk full")
    const file = join(dir, `${original.id}.json`)
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(original)
    expect(readdirSync(dir)).toEqual([`${original.id}.json`])
  })

  it("round trips a saved run", () => {
    const saved = {
      completedBatches: 2,
      results: new Map([
        ["1", { id: "1", words: "Olá.", mark: "clean" as const }],
        ["2", { id: "2", words: "Adeus.", mark: "doubt" as const, reason: "dúvida" }],
      ]),
      glossary: [{ source: "Frieren", pt: "Frieren" }],
      brief: "Tom calmo.",
      hardIds: ["2"],
      frameIds: ["1"],
      strongIds: ["2"],
    }
    expect(toSavedRun(fromSavedRun(saved))).toEqual(saved)
  })
})
