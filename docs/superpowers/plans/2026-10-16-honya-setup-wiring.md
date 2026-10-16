# Honya Setup Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Start and Profiles screens work: native file dialogs, profiles saved to disk, provider keys and model ids, all wired through a React renderer.

**Architecture:** The main process gains plain, testable handler modules (`src/main/ipc/*`, `src/main/modelStore.ts`) over a new disk-backed `ProfileStore` (`src/core/library/fileStore.ts`). `src/main/ipc/register.ts` binds them to `honya:*` IPC channels; the preload exposes them as typed calls whose shape is defined once in `src/shared/api.ts`. The renderer becomes React: `App` holds the session choices and switches between `StartScreen` and `ProfilesScreen`; every call goes through an `ApiContext` so tests pass a fake.

**Tech Stack:** Electron 44, TypeScript 6 (strict), esbuild 0.28, React 19.3, Vitest 5, React Testing Library 16 on jsdom 30.

**Spec:** `docs/superpowers/specs/2026-10-16-honya-setup-wiring-design.md`

## Global Constraints

- Use Node from `.nvmrc` (24.21.0). Run every command after `nvm use`.
- TypeScript: no `any`, no `as unknown as`, no `@ts-ignore`/`@ts-expect-error`, no trailing `!`, no `eslint-disable` for a TypeScript rule. Narrow with type guards.
- Dependencies are pinned exactly (`--save-exact`) to releases at least a week old. This plan's versions: `react@19.3.0`, `react-dom@19.3.0`, `@types/react@19.3.0`, `@types/react-dom@19.3.0`, `eslint-plugin-react-hooks@7.1.1`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`, `jsdom@30.1.2`.
- Commits are a single line: `type: subject`, type one of `feat`, `fix`, `docs`, `test`, `refactor`, `chore`; lowercase imperative; no body, no trailers, no co-author lines.
- The renderer bundle must never contain `ass-compiler`.
- A provider key is never written to a profile file or `models.json`; keys live only in `keys.bin` through `safeStorage`.
- Profiles live under `<userData>/profiles/` as `base-<variant>.json` and `series/<variant>/<id>.json`. Model overrides live in `<userData>/models.json`.
- Colors: paper `#faf7f2`, page `#f3efe6`, ink `#2a2420`, orange `#e36b1e`. Cards keep the 1.5px ink border and `7px 7px 0` ink shadow.
- Characters per second: whole number from 1 to 60, default 17.
- Code style: Prettier (`semi: false`, `printWidth: 100`). Run `npm run format` before each commit.
- After every task: `npm test`, `npm run typecheck`, `npm run lint` and `npm run format:check` all pass.

## Review Focus

1. **A series id that is a path.** A renderer (or a bug) sends `deleteSeries("pt-pt", "../../keys")`. Expected: refused; nothing outside `profiles/series/<variant>/` is read, written or deleted. Pinned in Task 3.
2. **Electron's IPC error prefix.** A handler throws `Error("A series called Frieren already exists for pt-pt.")`; the renderer receives `Error invoking remote method 'honya:create-series': Error: A series called …`. Expected: the error line shows only the handler's sentence. Pinned in Task 8.
3. **A script saved by Aegisub with a UTF-8 BOM and CRLF line endings.** Expected: it is accepted like any other script and its dialogue is found. Pinned in Task 6.
4. **Switching variant twice quickly.** The pt-pt series list arrives after the pt-br one. Expected: the dropdown shows pt-br series, never the stale pt-pt list. Pinned in Task 10.
5. **Series names that differ only by case or spaces.** `"Frieren "` and `"frieren"` count as the same name in a variant; renaming a series to its own name in a different case is allowed. Pinned in Task 7.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/core/library/types.ts` | modify | `ExampleScript`; `BaseProfile.examples` becomes `ExampleScript[]` |
| `src/core/library/card.ts` | modify | `importExample(base, name, text)`; voice joins example text |
| `src/core/library/example.ts` | create | Dialogue text of chosen styles from a script |
| `src/core/library/guards.ts` | create | Shape checks for variants, rules, base and series profiles |
| `src/core/library/fileStore.ts` | create | `ProfileStore` on disk with rename, delete, problem reporting |
| `src/main/secrets.ts` | modify | `removeKey`; refuse to save when encryption is unavailable |
| `src/main/modelStore.ts` | create | Model id overrides in `models.json` |
| `src/main/ipc/files.ts` | create | File dialogs: script, video, example |
| `src/main/ipc/profiles.ts` | create | Profile operations with validation |
| `src/main/ipc/register.ts` | create | Binds handlers to `honya:*` channels |
| `src/main/main.ts` | modify | Creates stores, registers setup IPC, uses model overrides |
| `src/shared/api.ts` | create | `SetupApi` and its data types, shared by preload and renderer |
| `src/preload/readers.ts` | create | Reply shape checks and IPC error message cleanup |
| `src/preload/preload.ts` | modify | Exposes the setup calls |
| `src/renderer/api.ts` | create | `ApiContext`, `useApi`, `errorMessage` |
| `src/renderer/action.ts` | create | `ErrorContext`, `useAction` |
| `src/renderer/App.tsx` | create | Session state, screen switch, error line |
| `src/renderer/main.tsx` | create | Mounts `App` with `window.honya` |
| `src/renderer/ErrorLine.tsx` | create | Orange error line |
| `src/renderer/screens/StartScreen.tsx` | create | Start screen |
| `src/renderer/screens/ProfilesScreen.tsx` | create | Profiles layout |
| `src/renderer/screens/StylesScreen.tsx`, `PreflightScreen.tsx`, `RunScreen.tsx`, `ReviewScreen.tsx` | create | Ported, unwired screens |
| `src/renderer/components/SeriesPicker.tsx` | create | Series dropdown with "New series…" |
| `src/renderer/components/KeyField.tsx` | create | Password field + Save |
| `src/renderer/components/RuleList.tsx`, `RuleEditor.tsx` | create | Show, delete, add rules |
| `src/renderer/components/StyleChecklist.tsx` | create | Dialogue/Skip choice per style |
| `src/renderer/components/BaseSection.tsx`, `SeriesSection.tsx`, `KeysSection.tsx`, `ModelsSection.tsx` | create | Profiles sections |
| `src/renderer/format.ts` | create | `formatRule` |
| `src/renderer/view.ts`, `src/renderer/render.ts` | delete | Replaced by components |
| `src/renderer/index.html`, `styles.css` | modify | Load `main.js`; classes replace inline styles |
| `scripts/build.mjs`, `tsconfig.json`, `eslint.config.js`, `package.json` | modify | React build, JSX, hooks lint, deps |

---

### Task 1: Examples carry a name

**Files:**
- Modify: `src/core/library/types.ts`
- Modify: `src/core/library/card.ts`
- Create: `src/core/library/example.ts`
- Modify: `src/renderer/render.ts` (drop `importExampleScript`)
- Modify: `tests/library/card.test.ts`
- Create: `tests/library/example.test.ts`
- Modify: `tests/renderer/render.test.ts` (drop the `importExampleScript` test)

**Interfaces:**
- Produces: `interface ExampleScript { name: string; text: string }`; `BaseProfile.examples: ExampleScript[]`; `importExample(base: BaseProfile, name: string, text: string): BaseProfile`; `exampleText(script: string, dialogueStyles: readonly string[]): string`.

- [ ] **Step 1: Write the failing tests**

In `tests/library/card.test.ts`, change the first test's import line and add a test:

```ts
    const pt = importExample(emptyBase("pt-pt"), "ep01.ass", "Olá.")
```

```ts
  it("keeps each example's name and joins their text into the voice", () => {
    const base = importExample(
      importExample(emptyBase("pt-pt"), "ep01.ass", "Olá."),
      "ep02.ass",
      "Adeus.",
    )
    expect(base.examples).toEqual([
      { name: "ep01.ass", text: "Olá." },
      { name: "ep02.ass", text: "Adeus." },
    ])
    const card = compileCard(base, { id: "s", variant: "pt-pt", name: "S", rules: [] })
    expect(card.voice).toBe("Olá.\nAdeus.")
  })
```

Create `tests/library/example.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { exampleText } from "../../src/core/library/example"

const SCRIPT = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Frieren,0,0,0,,{\\i1}Hello.{\\i0}
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,Shop
`

describe("example text", () => {
  it("keeps the visible words of the chosen styles", () => {
    expect(exampleText(SCRIPT, ["Default", "Signs"])).toBe("Hello.\nShop")
    expect(exampleText(SCRIPT, ["Default"])).toBe("Hello.")
  })

  it("is empty when no chosen style has dialogue", () => {
    expect(exampleText(SCRIPT, ["Title"])).toBe("")
  })
})
```

In `tests/renderer/render.test.ts`, delete the `importExampleScript` import and the `it(...)` block that calls `importExampleScript` (the block containing `importExampleScript(base, SCRIPT, ["Default", "Signs"])`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/library`
Expected: FAIL. `example.ts` does not exist and `importExample` takes two arguments.

- [ ] **Step 3: Implement**

In `src/core/library/types.ts`, add above `BaseProfile` and change the field:

```ts
export interface ExampleScript {
  name: string
  text: string
}
```

```ts
  examples: ExampleScript[]
```

In `src/core/library/card.ts`, replace `importExample` and the `voice` line:

```ts
export function importExample(base: BaseProfile, name: string, text: string): BaseProfile {
  return {
    variant: base.variant,
    cpsLimit: base.cpsLimit,
    examples: [...base.examples, { name, text }],
    rules: base.rules,
    cardRevision: base.cardRevision + 1,
  }
}
```

```ts
    voice: base.examples.map((example) => example.text).join("\n"),
```

Create `src/core/library/example.ts`:

```ts
import { readAss } from "../ass/script"

export function exampleText(script: string, dialogueStyles: readonly string[]): string {
  const keep = new Set(dialogueStyles)
  return readAss(script)
    .filter((cue) => keep.has(cue.style))
    .map((cue) => cue.visible)
    .join("\n")
}
```

Replace `src/renderer/render.ts` with only its re-exports (the function moved to `example.ts`):

```ts
export { acceptStyleList, render, setStyleGuess } from "./view"
export type { AppState, ListedStyle, ProfileScreenState, RunScreenState, Screen } from "./view"
```

- [ ] **Step 4: Run all checks**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/core/library src/renderer/render.ts tests/library tests/renderer/render.test.ts
git commit -m "refactor: keep example script names in the base profile"
```

---

### Task 2: Profile shape checks

**Files:**
- Create: `src/core/library/guards.ts`
- Create: `tests/library/guards.test.ts`

**Interfaces:**
- Consumes: `ExampleScript`, `BaseProfile`, `SeriesProfile`, `Rule`, `Variant` from Task 1.
- Produces: `isVariant(value: unknown): value is Variant`; `isRule(value: unknown): value is Rule`; `isRuleList(value: unknown): value is Rule[]`; `readBaseProfile(value: unknown): BaseProfile | null`; `readSeriesProfile(value: unknown): SeriesProfile | null`; `isRecord(value: unknown): value is Record<string, unknown>`.

- [ ] **Step 1: Write the failing test**

Create `tests/library/guards.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { emptyBase } from "../../src/core/library/card"
import {
  isRule,
  isVariant,
  readBaseProfile,
  readSeriesProfile,
} from "../../src/core/library/guards"

describe("profile guards", () => {
  it("accepts the two variants only", () => {
    expect(isVariant("pt-pt")).toBe(true)
    expect(isVariant("pt-br")).toBe(true)
    expect(isVariant("en")).toBe(false)
  })

  it("accepts prose and glossary rules only", () => {
    expect(isRule({ kind: "prose", text: "Use tu." })).toBe(true)
    expect(isRule({ kind: "glossary", source: "Himmel", pt: "Himmel" })).toBe(true)
    expect(isRule({ kind: "glossary", source: "Himmel" })).toBe(false)
    expect(isRule({ kind: "other" })).toBe(false)
  })

  it("reads a base profile and rejects a wrong shape", () => {
    const base = { ...emptyBase("pt-pt"), examples: [{ name: "a.ass", text: "Olá." }] }
    expect(readBaseProfile(JSON.parse(JSON.stringify(base)))).toEqual(base)
    expect(readBaseProfile({ ...base, examples: ["Olá."] })).toBeNull()
    expect(readBaseProfile({ ...base, cpsLimit: "17" })).toBeNull()
    expect(readBaseProfile(null)).toBeNull()
  })

  it("reads a series profile and rejects a wrong shape", () => {
    const series = { id: "a1", variant: "pt-br", name: "Frieren", rules: [] }
    expect(readSeriesProfile(series)).toEqual(series)
    expect(readSeriesProfile({ ...series, name: 3 })).toBeNull()
    expect(readSeriesProfile({ ...series, variant: "pt" })).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/library/guards.test.ts`
Expected: FAIL. Cannot find module `guards`.

- [ ] **Step 3: Implement**

Create `src/core/library/guards.ts`:

```ts
import type { BaseProfile, ExampleScript, Rule, SeriesProfile, Variant } from "./types"

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isVariant(value: unknown): value is Variant {
  return value === "pt-pt" || value === "pt-br"
}

export function isRule(value: unknown): value is Rule {
  if (!isRecord(value)) {
    return false
  }
  if (value.kind === "prose") {
    return typeof value.text === "string"
  }
  if (value.kind === "glossary") {
    return typeof value.source === "string" && typeof value.pt === "string"
  }
  return false
}

export function isRuleList(value: unknown): value is Rule[] {
  return Array.isArray(value) && value.every(isRule)
}

function isExample(value: unknown): value is ExampleScript {
  return isRecord(value) && typeof value.name === "string" && typeof value.text === "string"
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

export function readBaseProfile(value: unknown): BaseProfile | null {
  if (!isRecord(value) || !isVariant(value.variant)) {
    return null
  }
  if (!isFiniteNumber(value.cpsLimit) || !isFiniteNumber(value.cardRevision)) {
    return null
  }
  const examples = value.examples
  const rules = value.rules
  if (!Array.isArray(examples) || !examples.every(isExample) || !isRuleList(rules)) {
    return null
  }
  return {
    variant: value.variant,
    cpsLimit: value.cpsLimit,
    examples: examples.map((example) => ({ name: example.name, text: example.text })),
    rules,
    cardRevision: value.cardRevision,
  }
}

export function readSeriesProfile(value: unknown): SeriesProfile | null {
  if (!isRecord(value) || !isVariant(value.variant)) {
    return null
  }
  if (typeof value.id !== "string" || typeof value.name !== "string" || !isRuleList(value.rules)) {
    return null
  }
  return { id: value.id, variant: value.variant, name: value.name, rules: value.rules }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/library/guards.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/core/library/guards.ts tests/library/guards.test.ts
git commit -m "feat: check the shape of stored profiles"
```

---

### Task 3: Profiles saved to disk

**Files:**
- Create: `src/core/library/fileStore.ts`
- Create: `tests/library/fileStore.test.ts`

**Interfaces:**
- Consumes: `compileCard`, `readBaseProfile`, `readSeriesProfile`, `ProfileStore` and profile types.
- Produces:
  ```ts
  interface FileProfileStore extends ProfileStore {
    renameSeries(variant: Variant, id: string, name: string): SeriesProfile | null
    deleteSeries(variant: Variant, id: string): boolean
    takeProblems(): string[]
  }
  interface FileOps { writeFile(path: string, data: string): void }
  function createFileStore(dir: string, ops?: FileOps): FileProfileStore
  ```
  `listSeries` returns series sorted by name. `loadSeries`, `saveSeries`, `renameSeries` and `deleteSeries` throw `Error("Invalid series id.")` for an id that does not match `/^[A-Za-z0-9-]+$/`.

- [ ] **Step 1: Write the failing test**

Create `tests/library/fileStore.test.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { emptyBase, importExample } from "../../src/core/library/card"
import { createFileStore } from "../../src/core/library/fileStore"

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "honya-profiles-"))
}

const FRIEREN = { id: "a1", variant: "pt-pt" as const, name: "Frieren", rules: [] }

describe("file profile store", () => {
  it("saves and reloads a base and series across store instances", () => {
    const dir = tempDir()
    const first = createFileStore(dir)
    first.saveBase(importExample(emptyBase("pt-pt"), "ep01.ass", "Olá."))
    first.saveSeries(FRIEREN)
    const second = createFileStore(dir)
    expect(second.loadBase("pt-pt")?.examples).toEqual([{ name: "ep01.ass", text: "Olá." }])
    expect(second.loadSeries("pt-pt", "a1")).toEqual(FRIEREN)
    expect(second.loadBase("pt-br")).toBeNull()
  })

  it("lists series by variant, sorted by name", () => {
    const store = createFileStore(tempDir())
    store.saveSeries({ ...FRIEREN, id: "b2", name: "Mushishi" })
    store.saveSeries(FRIEREN)
    store.saveSeries({ ...FRIEREN, id: "c3", variant: "pt-br" })
    expect(store.listSeries("pt-pt").map((series) => series.name)).toEqual(["Frieren", "Mushishi"])
    expect(store.listSeries("pt-br").map((series) => series.id)).toEqual(["c3"])
  })

  it("renames without changing the id and deletes the file", () => {
    const dir = tempDir()
    const store = createFileStore(dir)
    store.saveSeries(FRIEREN)
    expect(store.renameSeries("pt-pt", "a1", "Sousou no Frieren")?.id).toBe("a1")
    expect(store.loadSeries("pt-pt", "a1")?.name).toBe("Sousou no Frieren")
    expect(store.renameSeries("pt-pt", "missing", "X")).toBeNull()
    expect(store.deleteSeries("pt-pt", "a1")).toBe(true)
    expect(existsSync(join(dir, "series", "pt-pt", "a1.json"))).toBe(false)
    expect(store.deleteSeries("pt-pt", "a1")).toBe(false)
  })

  it("skips an unreadable series file and reports it once", () => {
    const dir = tempDir()
    const store = createFileStore(dir)
    store.saveSeries(FRIEREN)
    writeFileSync(join(dir, "series", "pt-pt", "broken.json"), "{not json")
    expect(store.listSeries("pt-pt").map((series) => series.id)).toEqual(["a1"])
    expect(store.takeProblems()).toEqual(["Couldn't read series file broken.json."])
    expect(store.takeProblems()).toEqual([])
  })

  it("moves an unreadable base aside and starts empty", () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, "base-pt-pt.json"), JSON.stringify({ variant: "pt-pt" }))
    const store = createFileStore(dir)
    expect(store.loadBase("pt-pt")).toBeNull()
    expect(existsSync(join(dir, "base-pt-pt.json.bad"))).toBe(true)
    expect(existsSync(join(dir, "base-pt-pt.json"))).toBe(false)
    expect(store.takeProblems()).toEqual([
      "base-pt-pt.json couldn't be read and was moved to base-pt-pt.json.bad.",
    ])
  })

  it("keeps the previous file when a write fails", () => {
    const dir = tempDir()
    createFileStore(dir).saveSeries(FRIEREN)
    const failing = createFileStore(dir, {
      writeFile(path) {
        writeFileSync(path, "{half")
        throw new Error("disk full")
      },
    })
    expect(() => {
      failing.saveSeries({ ...FRIEREN, name: "Changed" })
    }).toThrow("disk full")
    const file = join(dir, "series", "pt-pt", "a1.json")
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(FRIEREN)
    expect(readdirSync(join(dir, "series", "pt-pt"))).toEqual(["a1.json"])
  })

  it("refuses a series id that would leave the series folder", () => {
    const store = createFileStore(tempDir())
    expect(() => store.loadSeries("pt-pt", "../../keys")).toThrow("Invalid series id.")
    expect(() => store.deleteSeries("pt-pt", "../base-pt-pt")).toThrow("Invalid series id.")
    expect(() => {
      store.saveSeries({ ...FRIEREN, id: "a/b" })
    }).toThrow("Invalid series id.")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/library/fileStore.test.ts`
Expected: FAIL. Cannot find module `fileStore`.

- [ ] **Step 3: Implement**

Create `src/core/library/fileStore.ts`:

```ts
import { randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { compileCard } from "./card"
import { readBaseProfile, readSeriesProfile } from "./guards"
import type { BaseProfile, ProfileStore, SeriesProfile, StyleCard, Variant } from "./types"

export interface FileProfileStore extends ProfileStore {
  renameSeries(variant: Variant, id: string, name: string): SeriesProfile | null
  deleteSeries(variant: Variant, id: string): boolean
  takeProblems(): string[]
}

export interface FileOps {
  writeFile(path: string, data: string): void
}

const SERIES_ID = /^[A-Za-z0-9-]+$/

const DEFAULT_OPS: FileOps = {
  writeFile(path, data) {
    writeFileSync(path, data, "utf8")
  },
}

export function createFileStore(dir: string, ops: FileOps = DEFAULT_OPS): FileProfileStore {
  let problems: string[] = []
  const cards = new Map<string, StyleCard>()

  const basePath = (variant: Variant): string => join(dir, `base-${variant}.json`)
  const seriesFolder = (variant: Variant): string => join(dir, "series", variant)
  const seriesPath = (variant: Variant, id: string): string => {
    if (!SERIES_ID.test(id)) {
      throw new Error("Invalid series id.")
    }
    return join(seriesFolder(variant), `${id}.json`)
  }

  const writeJson = (path: string, value: unknown): void => {
    mkdirSync(dirname(path), { recursive: true })
    const temp = `${path}.${randomUUID()}.tmp`
    try {
      ops.writeFile(temp, JSON.stringify(value, null, 2))
      renameSync(temp, path)
    } catch (error) {
      rmSync(temp, { force: true })
      throw error
    }
  }

  const loadBase = (variant: Variant): BaseProfile | null => {
    const path = basePath(variant)
    if (!existsSync(path)) {
      return null
    }
    const base = readBaseProfile(readJson(path))
    if (base === null || base.variant !== variant) {
      const name = `base-${variant}.json`
      renameSync(path, `${path}.bad`)
      problems.push(`${name} couldn't be read and was moved to ${name}.bad.`)
      return null
    }
    return base
  }

  const loadSeries = (variant: Variant, id: string): SeriesProfile | null => {
    const path = seriesPath(variant, id)
    if (!existsSync(path)) {
      return null
    }
    const series = readSeriesProfile(readJson(path))
    return series !== null && series.variant === variant && series.id === id ? series : null
  }

  const saveSeries = (series: SeriesProfile): void => {
    writeJson(seriesPath(series.variant, series.id), series)
  }

  return {
    saveBase(base) {
      writeJson(basePath(base.variant), base)
    },
    loadBase,
    saveSeries,
    loadSeries,
    listSeries(variant) {
      const folder = seriesFolder(variant)
      if (!existsSync(folder)) {
        return []
      }
      const found: SeriesProfile[] = []
      for (const file of readdirSync(folder)) {
        if (!file.endsWith(".json")) {
          continue
        }
        const id = file.slice(0, -".json".length)
        const series = SERIES_ID.test(id) ? loadSeries(variant, id) : null
        if (series === null) {
          problems.push(`Couldn't read series file ${file}.`)
          continue
        }
        found.push(series)
      }
      return found.sort((left, right) => left.name.localeCompare(right.name))
    },
    renameSeries(variant, id, name) {
      const series = loadSeries(variant, id)
      if (series === null) {
        return null
      }
      const renamed = { ...series, name }
      saveSeries(renamed)
      return renamed
    },
    deleteSeries(variant, id) {
      const path = seriesPath(variant, id)
      if (!existsSync(path)) {
        return false
      }
      rmSync(path)
      return true
    },
    loadCard(variant, seriesId) {
      const base = loadBase(variant)
      const series = loadSeries(variant, seriesId)
      if (base === null || series === null) {
        return null
      }
      const card = compileCard(base, series)
      cards.set(`${variant}:${seriesId}`, card)
      return card
    },
    cardIsStale(variant, seriesId) {
      const card = cards.get(`${variant}:${seriesId}`)
      return card?.revision !== loadBase(variant)?.cardRevision
    },
    takeProblems() {
      const taken = problems
      problems = []
      return taken
    },
  }
}

function readJson(path: string): unknown {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"))
    return parsed
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/library/fileStore.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/core/library/fileStore.ts tests/library/fileStore.test.ts
git commit -m "feat: save profiles as json files"
```

---

### Task 4: Remove keys and refuse unencrypted storage

**Files:**
- Modify: `src/main/secrets.ts`
- Modify: `tests/main/secrets.test.ts`

**Interfaces:**
- Produces: `SecretStore.removeKey(provider: ProviderId): void`. `setKey` and `removeKey` throw `Error("This system can't encrypt keys, so Honya won't store them.")` when `safeStorage.isEncryptionAvailable()` is false.

- [ ] **Step 1: Write the failing tests**

In `tests/main/secrets.test.ts`, extract the fake into a helper at the top of the file and add tests:

```ts
function fakeStore(available = true): {
  store: ReturnType<typeof createSecretStore>
  files: Map<string, Buffer>
} {
  const files = new Map<string, Buffer>()
  const store = createSecretStore(
    {
      isEncryptionAvailable: () => available,
      encryptString: (value) => Buffer.from(Buffer.from(`enc:${value}`).toString("base64")),
      decryptString: (value) =>
        Buffer.from(value.toString("utf8"), "base64").toString("utf8").replace(/^enc:/, ""),
    },
    {
      read: () => files.get("keys") ?? null,
      write: (value) => {
        files.set("keys", value)
      },
    },
  )
  return { store, files }
}
```

Rewrite the existing test to use `const { store, files } = fakeStore()` and add:

```ts
  it("removes one key and keeps the others", () => {
    const { store } = fakeStore()
    store.setKey("claude", "a")
    store.setKey("gpt", "b")
    store.removeKey("claude")
    expect(store.hasKey("claude")).toBe(false)
    expect(store.getKey("gpt")).toBe("b")
  })

  it("refuses to store a key when encryption is unavailable", () => {
    const { store, files } = fakeStore(false)
    expect(() => {
      store.setKey("claude", "a")
    }).toThrow("This system can't encrypt keys, so Honya won't store them.")
    expect(files.size).toBe(0)
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/main/secrets.test.ts`
Expected: FAIL. `removeKey` is not a function; `setKey` does not throw.

- [ ] **Step 3: Implement**

In `src/main/secrets.ts`, add `removeKey(provider: ProviderId): void` to `SecretStore`, add the constant, and replace `setKey`:

```ts
const NO_ENCRYPTION = "This system can't encrypt keys, so Honya won't store them."
```

```ts
    setKey(provider, key) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(NO_ENCRYPTION)
      }
      const keys = readKeys(safeStorage, file)
      keys[provider] = key
      file.write(safeStorage.encryptString(JSON.stringify(keys)))
    },
    removeKey(provider) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(NO_ENCRYPTION)
      }
      const keys = readKeys(safeStorage, file)
      const remaining: Partial<Record<ProviderId, string>> = {}
      for (const other of PROVIDERS) {
        const value = keys[other]
        if (other !== provider && value !== undefined) {
          remaining[other] = value
        }
      }
      file.write(safeStorage.encryptString(JSON.stringify(remaining)))
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/main/secrets.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/main/secrets.ts tests/main/secrets.test.ts
git commit -m "feat: remove provider keys and refuse unencrypted storage"
```

---

### Task 5: Model id overrides

**Files:**
- Create: `src/main/modelStore.ts`
- Create: `tests/main/modelStore.test.ts`

**Interfaces:**
- Consumes: `defaultModels(provider)` from `src/core/providers/models.ts`.
- Produces:
  ```ts
  interface ModelPair { cheap: string; strong: string }
  interface TextFile { read(): string | null; write(text: string): void }
  interface ModelStore {
    get(provider: ProviderId): ModelPair
    set(provider: ProviderId, pair: ModelPair): ModelPair
    reset(provider: ProviderId): ModelPair
  }
  function createModelStore(file: TextFile): ModelStore
  ```
  `set` trims both ids and throws `Error("Model ids can't be empty.")` if either is empty. `ModelPair` is re-exported by `src/shared/api.ts` in Task 8.

- [ ] **Step 1: Write the failing test**

Create `tests/main/modelStore.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { defaultModels } from "../../src/core/providers/models"
import { createModelStore } from "../../src/main/modelStore"

function memoryFile(initial: string | null = null): {
  read(): string | null
  write(text: string): void
} {
  let text = initial
  return {
    read: () => text,
    write: (next) => {
      text = next
    },
  }
}

describe("model store", () => {
  it("returns the defaults until an override is saved", () => {
    const store = createModelStore(memoryFile())
    expect(store.get("claude")).toEqual(defaultModels("claude"))
    store.set("claude", { cheap: " small ", strong: "large" })
    expect(store.get("claude")).toEqual({ cheap: "small", strong: "large" })
    expect(store.get("gpt")).toEqual(defaultModels("gpt"))
  })

  it("resets one provider to its defaults", () => {
    const store = createModelStore(memoryFile())
    store.set("claude", { cheap: "a", strong: "b" })
    store.set("gpt", { cheap: "c", strong: "d" })
    expect(store.reset("claude")).toEqual(defaultModels("claude"))
    expect(store.get("gpt")).toEqual({ cheap: "c", strong: "d" })
  })

  it("refuses an empty id", () => {
    const store = createModelStore(memoryFile())
    expect(() => store.set("claude", { cheap: " ", strong: "b" })).toThrow(
      "Model ids can't be empty.",
    )
  })

  it("treats an unreadable file as no overrides", () => {
    const store = createModelStore(memoryFile("{broken"))
    expect(store.get("mistral")).toEqual(defaultModels("mistral"))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/modelStore.test.ts`
Expected: FAIL. Cannot find module `modelStore`.

- [ ] **Step 3: Implement**

Create `src/main/modelStore.ts`:

```ts
import { isRecord } from "../core/library/guards"
import type { ProviderId } from "../core/pipeline/types"
import { defaultModels } from "../core/providers/models"

export interface ModelPair {
  cheap: string
  strong: string
}

export interface TextFile {
  read(): string | null
  write(text: string): void
}

export interface ModelStore {
  get(provider: ProviderId): ModelPair
  set(provider: ProviderId, pair: ModelPair): ModelPair
  reset(provider: ProviderId): ModelPair
}

type Overrides = Partial<Record<ProviderId, ModelPair>>

const PROVIDERS = ["claude", "gpt", "gemini", "mistral"] as const

export function createModelStore(file: TextFile): ModelStore {
  const read = (): Overrides => parseOverrides(file.read())
  const write = (overrides: Overrides): void => {
    file.write(JSON.stringify(overrides, null, 2))
  }
  return {
    get(provider) {
      return read()[provider] ?? defaultModels(provider)
    },
    set(provider, pair) {
      const cheap = pair.cheap.trim()
      const strong = pair.strong.trim()
      if (cheap === "" || strong === "") {
        throw new Error("Model ids can't be empty.")
      }
      const overrides = read()
      overrides[provider] = { cheap, strong }
      write(overrides)
      return { cheap, strong }
    },
    reset(provider) {
      const overrides = read()
      const remaining: Overrides = {}
      for (const other of PROVIDERS) {
        const pair = overrides[other]
        if (other !== provider && pair !== undefined) {
          remaining[other] = pair
        }
      }
      write(remaining)
      return defaultModels(provider)
    },
  }
}

function parseOverrides(text: string | null): Overrides {
  if (text === null) {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return {}
  }
  if (!isRecord(parsed)) {
    return {}
  }
  const overrides: Overrides = {}
  for (const provider of PROVIDERS) {
    const pair = parsed[provider]
    if (isRecord(pair) && typeof pair.cheap === "string" && typeof pair.strong === "string") {
      overrides[provider] = { cheap: pair.cheap, strong: pair.strong }
    }
  }
  return overrides
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/modelStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/main/modelStore.ts tests/main/modelStore.test.ts
git commit -m "feat: save model id overrides"
```

---

### Task 6: File dialogs

**Files:**
- Create: `src/main/ipc/files.ts`
- Create: `tests/main/files.test.ts`

**Interfaces:**
- Consumes: `readAss` from `src/core/ass/script.ts`; `classifyScript`, `StyleClassification` from `src/core/ass/classify.ts`.
- Produces:
  ```ts
  interface FileFilter { name: string; extensions: string[] }
  type OpenFile = (filters: FileFilter[]) => Promise<string | null>
  interface PickedScript { path: string; name: string; text: string }
  interface PickedVideo { path: string; name: string }
  interface ListedStyle { name: string; guess: StyleClassification }
  interface PickedExample { name: string; text: string; styles: ListedStyle[] }
  function pickScript(open: OpenFile): Promise<PickedScript | null>
  function pickVideo(open: OpenFile): Promise<PickedVideo | null>
  function pickExample(open: OpenFile): Promise<PickedExample | null>
  ```
  These data types are re-exported by `src/shared/api.ts` in Task 8. A script with no dialogue events throws `Error("<name> has no dialogue lines. Is it an ASS script?")`.

- [ ] **Step 1: Write the failing test**

Create `tests/main/files.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { pickExample, pickScript, pickVideo, type FileFilter } from "../../src/main/ipc/files"

const SCRIPT = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Frieren,0,0,0,,Hello.
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,Shop
Dialogue: 0,0:00:06.00,0:00:07.00,Default,Frieren,0,0,0,,Bye.
`

function fixture(name: string, text: string): string {
  const path = join(mkdtempSync(join(tmpdir(), "honya-files-")), name)
  writeFileSync(path, text, "utf8")
  return path
}

describe("file dialogs", () => {
  it("returns null when the dialog is cancelled", async () => {
    const cancel = (): Promise<null> => Promise.resolve(null)
    expect(await pickScript(cancel)).toBeNull()
    expect(await pickVideo(cancel)).toBeNull()
    expect(await pickExample(cancel)).toBeNull()
  })

  it("reads a script and filters the dialog to ass files", async () => {
    const path = fixture("ep01.ass", SCRIPT)
    let filters: FileFilter[] = []
    const picked = await pickScript((next) => {
      filters = next
      return Promise.resolve(path)
    })
    expect(filters).toEqual([{ name: "ASS subtitles", extensions: ["ass"] }])
    expect(picked).toEqual({ path, name: "ep01.ass", text: SCRIPT })
  })

  it("accepts a script with a byte order mark and windows line endings", async () => {
    const path = fixture("aegisub.ass", `﻿${SCRIPT.replaceAll("\n", "\r\n")}`)
    const picked = await pickScript(() => Promise.resolve(path))
    expect(picked?.text.startsWith("[Script Info]")).toBe(true)
  })

  it("refuses a file without dialogue lines", async () => {
    const path = fixture("notes.ass", "hello world")
    await expect(pickScript(() => Promise.resolve(path))).rejects.toThrow(
      "notes.ass has no dialogue lines. Is it an ASS script?",
    )
  })

  it("returns a video's path and name", async () => {
    const picked = await pickVideo(() => Promise.resolve("/videos/ep01.mkv"))
    expect(picked).toEqual({ path: "/videos/ep01.mkv", name: "ep01.mkv" })
  })

  it("returns an example's styles with their guesses, once each", async () => {
    const path = fixture("ep02.ass", SCRIPT)
    const picked = await pickExample(() => Promise.resolve(path))
    expect(picked?.name).toBe("ep02.ass")
    expect(picked?.styles).toEqual([
      { name: "Default", guess: "dialogue" },
      { name: "Signs", guess: "skip" },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/files.test.ts`
Expected: FAIL. Cannot find module `files`.

- [ ] **Step 3: Implement**

Create `src/main/ipc/files.ts`:

```ts
import { readFileSync } from "node:fs"
import { basename } from "node:path"
import { classifyScript, type StyleClassification } from "../../core/ass/classify"
import { readAss, type DialogueCue } from "../../core/ass/script"

export interface FileFilter {
  name: string
  extensions: string[]
}

export type OpenFile = (filters: FileFilter[]) => Promise<string | null>

export interface PickedScript {
  path: string
  name: string
  text: string
}

export interface PickedVideo {
  path: string
  name: string
}

export interface ListedStyle {
  name: string
  guess: StyleClassification
}

export interface PickedExample {
  name: string
  text: string
  styles: ListedStyle[]
}

const ASS_FILTER: FileFilter[] = [{ name: "ASS subtitles", extensions: ["ass"] }]
const VIDEO_FILTER: FileFilter[] = [
  { name: "Video", extensions: ["mkv", "mp4", "webm", "avi", "mov"] },
]

export async function pickScript(open: OpenFile): Promise<PickedScript | null> {
  const path = await open(ASS_FILTER)
  if (path === null) {
    return null
  }
  const { text } = readScript(path)
  return { path, name: basename(path), text }
}

export async function pickVideo(open: OpenFile): Promise<PickedVideo | null> {
  const path = await open(VIDEO_FILTER)
  return path === null ? null : { path, name: basename(path) }
}

export async function pickExample(open: OpenFile): Promise<PickedExample | null> {
  const path = await open(ASS_FILTER)
  if (path === null) {
    return null
  }
  const { text, cues } = readScript(path)
  const guesses = classifyScript(cues.map((cue) => cue.style))
  const styles = [...guesses].map(([name, guess]) => ({ name, guess }))
  return { name: basename(path), text, styles }
}

function readScript(path: string): { text: string; cues: DialogueCue[] } {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "")
  let cues: DialogueCue[] = []
  try {
    cues = readAss(text)
  } catch {
    cues = []
  }
  if (cues.length === 0) {
    throw new Error(`${basename(path)} has no dialogue lines. Is it an ASS script?`)
  }
  return { text, cues }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/files.test.ts`
Expected: PASS (6 tests). If the BOM test fails because `ass-compiler` rejects `\r\n`, normalize with `.replace(/\r\n/g, "\n")` in `readScript` and keep returning the normalized text.

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/main/ipc/files.ts tests/main/files.test.ts
git commit -m "feat: pick scripts and videos with the system dialog"
```

---

### Task 7: Profile operations

**Files:**
- Create: `src/main/ipc/profiles.ts`
- Create: `tests/main/profiles.test.ts`

**Interfaces:**
- Consumes: `FileProfileStore` (Task 3), `emptyBase`, `importExample` (Task 1), `exampleText` (Task 1).
- Produces:
  ```ts
  interface SeriesSummary { id: string; name: string; ruleCount: number }
  interface SeriesList { series: SeriesSummary[]; problems: string[] }
  interface LoadedBase { base: BaseProfile; problems: string[] }
  interface ProfileHandlers {
    listSeries(variant: Variant): SeriesList
    createSeries(variant: Variant, name: string): SeriesSummary
    renameSeries(variant: Variant, id: string, name: string): SeriesSummary
    deleteSeries(variant: Variant, id: string): void
    loadSeriesRules(variant: Variant, id: string): Rule[]
    saveSeriesRules(variant: Variant, id: string, rules: Rule[]): void
    loadBase(variant: Variant): LoadedBase
    saveBase(base: BaseProfile): BaseProfile
    importExample(variant: Variant, name: string, text: string, dialogueStyles: string[]): BaseProfile
  }
  function createProfileHandlers(store: FileProfileStore, newId?: () => string): ProfileHandlers
  ```
  Error messages (exact): empty name `"Give the series a name."`; duplicate `"A series called <name> already exists for <variant>."`; missing series `"That series no longer exists."`; bad limit `"Characters per second must be a whole number from 1 to 60."`; empty example `"None of the chosen styles has dialogue in this script."`. `saveBase`, `saveSeriesRules` and `importExample` set the stored base's `cardRevision` to the previous stored value plus one, ignoring the revision sent in.

- [ ] **Step 1: Write the failing test**

Create `tests/main/profiles.test.ts`:

```ts
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { emptyBase } from "../../src/core/library/card"
import { createFileStore } from "../../src/core/library/fileStore"
import { createProfileHandlers } from "../../src/main/ipc/profiles"

const SCRIPT = `[Script Info]
ScriptType: v4.00+

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.00,Default,Frieren,0,0,0,,Hello.
Dialogue: 0,0:00:04.00,0:00:05.00,Signs,,0,0,0,,Shop
`

function handlers(): ReturnType<typeof createProfileHandlers> {
  let next = 0
  const store = createFileStore(mkdtempSync(join(tmpdir(), "honya-handlers-")))
  return createProfileHandlers(store, () => {
    next += 1
    return `id-${String(next)}`
  })
}

describe("profile handlers", () => {
  it("creates, lists, renames and deletes a series", () => {
    const profiles = handlers()
    const created = profiles.createSeries("pt-pt", "  Frieren ")
    expect(created).toEqual({ id: "id-1", name: "Frieren", ruleCount: 0 })
    expect(profiles.listSeries("pt-pt")).toEqual({ series: [created], problems: [] })
    expect(profiles.listSeries("pt-br").series).toEqual([])
    expect(profiles.renameSeries("pt-pt", "id-1", "Sousou no Frieren").name).toBe(
      "Sousou no Frieren",
    )
    profiles.deleteSeries("pt-pt", "id-1")
    expect(profiles.listSeries("pt-pt").series).toEqual([])
  })

  it("refuses an empty name and a name that differs only by case or spaces", () => {
    const profiles = handlers()
    profiles.createSeries("pt-pt", "Frieren")
    expect(() => profiles.createSeries("pt-pt", "   ")).toThrow("Give the series a name.")
    expect(() => profiles.createSeries("pt-pt", " frieren ")).toThrow(
      "A series called frieren already exists for pt-pt.",
    )
    expect(profiles.createSeries("pt-br", "Frieren").name).toBe("Frieren")
  })

  it("allows renaming a series to its own name in a different case", () => {
    const profiles = handlers()
    profiles.createSeries("pt-pt", "frieren")
    profiles.createSeries("pt-pt", "Mushishi")
    expect(profiles.renameSeries("pt-pt", "id-1", "Frieren").name).toBe("Frieren")
    expect(() => profiles.renameSeries("pt-pt", "id-1", "MUSHISHI")).toThrow(
      "A series called MUSHISHI already exists for pt-pt.",
    )
    expect(() => profiles.renameSeries("pt-pt", "nope", "X")).toThrow(
      "That series no longer exists.",
    )
  })

  it("saves series rules and bumps the base revision", () => {
    const profiles = handlers()
    profiles.createSeries("pt-pt", "Frieren")
    const before = profiles.loadBase("pt-pt").base.cardRevision
    profiles.saveSeriesRules("pt-pt", "id-1", [{ kind: "glossary", source: "Himmel", pt: "Himmel" }])
    expect(profiles.loadSeriesRules("pt-pt", "id-1")).toHaveLength(1)
    expect(profiles.listSeries("pt-pt").series[0]?.ruleCount).toBe(1)
    expect(profiles.loadBase("pt-pt").base.cardRevision).toBe(before + 1)
  })

  it("starts from an empty base and saves a valid characters-per-second limit", () => {
    const profiles = handlers()
    expect(profiles.loadBase("pt-br")).toEqual({ base: emptyBase("pt-br"), problems: [] })
    const saved = profiles.saveBase({ ...emptyBase("pt-br"), cpsLimit: 20, cardRevision: 99 })
    expect(saved.cpsLimit).toBe(20)
    expect(saved.cardRevision).toBe(1)
  })

  it("refuses a limit that is not a whole number from 1 to 60", () => {
    const profiles = handlers()
    for (const cpsLimit of [0, 61, 17.5]) {
      expect(() => profiles.saveBase({ ...emptyBase("pt-pt"), cpsLimit })).toThrow(
        "Characters per second must be a whole number from 1 to 60.",
      )
    }
    expect(profiles.loadBase("pt-pt").base.cpsLimit).toBe(17)
  })

  it("imports the dialogue of the chosen styles under the file name", () => {
    const profiles = handlers()
    const base = profiles.importExample("pt-pt", "ep01.ass", SCRIPT, ["Default"])
    expect(base.examples).toEqual([{ name: "ep01.ass", text: "Hello." }])
    expect(() => profiles.importExample("pt-pt", "ep01.ass", SCRIPT, ["Title"])).toThrow(
      "None of the chosen styles has dialogue in this script.",
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/main/profiles.test.ts`
Expected: FAIL. Cannot find module `profiles`.

- [ ] **Step 3: Implement**

Create `src/main/ipc/profiles.ts`:

```ts
import { randomUUID } from "node:crypto"
import { emptyBase, importExample } from "../../core/library/card"
import { exampleText } from "../../core/library/example"
import type { FileProfileStore } from "../../core/library/fileStore"
import type { BaseProfile, Rule, SeriesProfile, Variant } from "../../core/library/types"

export interface SeriesSummary {
  id: string
  name: string
  ruleCount: number
}

export interface SeriesList {
  series: SeriesSummary[]
  problems: string[]
}

export interface LoadedBase {
  base: BaseProfile
  problems: string[]
}

export interface ProfileHandlers {
  listSeries(variant: Variant): SeriesList
  createSeries(variant: Variant, name: string): SeriesSummary
  renameSeries(variant: Variant, id: string, name: string): SeriesSummary
  deleteSeries(variant: Variant, id: string): void
  loadSeriesRules(variant: Variant, id: string): Rule[]
  saveSeriesRules(variant: Variant, id: string, rules: Rule[]): void
  loadBase(variant: Variant): LoadedBase
  saveBase(base: BaseProfile): BaseProfile
  importExample(
    variant: Variant,
    name: string,
    text: string,
    dialogueStyles: string[],
  ): BaseProfile
}

export function createProfileHandlers(
  store: FileProfileStore,
  newId: () => string = randomUUID,
): ProfileHandlers {
  const currentBase = (variant: Variant): BaseProfile => store.loadBase(variant) ?? emptyBase(variant)

  const writeBase = (base: BaseProfile): BaseProfile => {
    const next = { ...base, cardRevision: currentBase(base.variant).cardRevision + 1 }
    store.saveBase(next)
    return next
  }

  const requireSeries = (variant: Variant, id: string): SeriesProfile => {
    const series = store.loadSeries(variant, id)
    if (series === null) {
      throw new Error("That series no longer exists.")
    }
    return series
  }

  const checkName = (variant: Variant, name: string, exceptId: string | null): string => {
    const trimmed = name.trim()
    if (trimmed === "") {
      throw new Error("Give the series a name.")
    }
    const key = trimmed.toLowerCase()
    const taken = store
      .listSeries(variant)
      .some((series) => series.id !== exceptId && series.name.trim().toLowerCase() === key)
    if (taken) {
      throw new Error(`A series called ${trimmed} already exists for ${variant}.`)
    }
    return trimmed
  }

  return {
    listSeries(variant) {
      const series = store.listSeries(variant).map(summary)
      return { series, problems: store.takeProblems() }
    },
    createSeries(variant, name) {
      const series = { id: newId(), variant, name: checkName(variant, name, null), rules: [] }
      store.saveSeries(series)
      return summary(series)
    },
    renameSeries(variant, id, name) {
      requireSeries(variant, id)
      const renamed = store.renameSeries(variant, id, checkName(variant, name, id))
      if (renamed === null) {
        throw new Error("That series no longer exists.")
      }
      return summary(renamed)
    },
    deleteSeries(variant, id) {
      store.deleteSeries(variant, id)
    },
    loadSeriesRules(variant, id) {
      return requireSeries(variant, id).rules
    },
    saveSeriesRules(variant, id, rules) {
      const series = requireSeries(variant, id)
      store.saveSeries({ ...series, rules })
      writeBase(currentBase(variant))
    },
    loadBase(variant) {
      const base = currentBase(variant)
      return { base, problems: store.takeProblems() }
    },
    saveBase(base) {
      if (!Number.isInteger(base.cpsLimit) || base.cpsLimit < 1 || base.cpsLimit > 60) {
        throw new Error("Characters per second must be a whole number from 1 to 60.")
      }
      return writeBase(base)
    },
    importExample(variant, name, text, dialogueStyles) {
      const body = exampleText(text, dialogueStyles)
      if (body === "") {
        throw new Error("None of the chosen styles has dialogue in this script.")
      }
      return writeBase(importExample(currentBase(variant), name, body))
    },
  }
}

function summary(series: SeriesProfile): SeriesSummary {
  return { id: series.id, name: series.name, ruleCount: series.rules.length }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/main/profiles.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
npm run format
git add src/main/ipc/profiles.ts tests/main/profiles.test.ts
git commit -m "feat: create rename and delete series profiles"
```

---

### Task 8: Wire the setup calls through IPC and the preload

**Files:**
- Create: `src/shared/api.ts`
- Create: `src/main/ipc/register.ts`
- Modify: `src/main/main.ts`
- Create: `src/preload/readers.ts`
- Modify: `src/preload/preload.ts`
- Create: `tests/preload/readers.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces (`src/shared/api.ts`, type-only, safe for the renderer to import):
  ```ts
  export type { Rule, Variant, BaseProfile, ExampleScript } from "../core/library/types"
  export type { ProviderId, Preset } from "../core/pipeline/types"
  export type { ModelPair } from "../main/modelStore"
  export type { PickedScript, PickedVideo, PickedExample, ListedStyle } from "../main/ipc/files"
  export type { SeriesSummary, SeriesList, LoadedBase } from "../main/ipc/profiles"
  export interface SetupApi {
    pickScript(): Promise<PickedScript | null>
    pickVideo(): Promise<PickedVideo | null>
    pickExample(): Promise<PickedExample | null>
    hasKey(provider: ProviderId): Promise<boolean>
    setKey(provider: ProviderId, key: string): Promise<void>
    removeKey(provider: ProviderId): Promise<void>
    getModels(provider: ProviderId): Promise<ModelPair>
    setModels(provider: ProviderId, pair: ModelPair): Promise<ModelPair>
    resetModels(provider: ProviderId): Promise<ModelPair>
    listSeries(variant: Variant): Promise<SeriesList>
    createSeries(variant: Variant, name: string): Promise<SeriesSummary>
    renameSeries(variant: Variant, id: string, name: string): Promise<SeriesSummary>
    deleteSeries(variant: Variant, id: string): Promise<void>
    loadSeriesRules(variant: Variant, id: string): Promise<Rule[]>
    saveSeriesRules(variant: Variant, id: string, rules: Rule[]): Promise<void>
    loadBase(variant: Variant): Promise<LoadedBase>
    saveBase(base: BaseProfile): Promise<BaseProfile>
    importExample(variant: Variant, name: string, text: string, dialogueStyles: string[]): Promise<BaseProfile>
  }
  export const PROVIDERS: readonly ProviderId[]
  export const VARIANTS: readonly Variant[]
  export const PRESETS: readonly Preset[]
  ```
  Channels: `honya:pick-script`, `honya:pick-video`, `honya:pick-example`, `honya:has-key`, `honya:set-key`, `honya:remove-key`, `honya:get-models`, `honya:set-models`, `honya:reset-models`, `honya:list-series`, `honya:create-series`, `honya:rename-series`, `honya:delete-series`, `honya:load-series-rules`, `honya:save-series-rules`, `honya:load-base`, `honya:save-base`, `honya:import-example`.
- `src/preload/readers.ts` exports `ipcMessage(reason: unknown): string` and one `read*` function per reply type, each returning the value or `null`.

- [ ] **Step 1: Write the failing test**

Create `tests/preload/readers.test.ts`:

```ts
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
```

`readPicked*` return `{ value: T | null } | null` so a valid `null` (cancelled) differs from an invalid reply (`null`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/preload/readers.test.ts`
Expected: FAIL. Cannot find module `readers`.

- [ ] **Step 3: Implement the shared types**

Create `src/shared/api.ts`:

```ts
import type { BaseProfile, Rule, Variant } from "../core/library/types"
import type { Preset, ProviderId } from "../core/pipeline/types"
import type { PickedExample, PickedScript, PickedVideo } from "../main/ipc/files"
import type { LoadedBase, SeriesList, SeriesSummary } from "../main/ipc/profiles"
import type { ModelPair } from "../main/modelStore"

export type { BaseProfile, ExampleScript, Rule, Variant } from "../core/library/types"
export type { Preset, ProviderId } from "../core/pipeline/types"
export type { ListedStyle, PickedExample, PickedScript, PickedVideo } from "../main/ipc/files"
export type { LoadedBase, SeriesList, SeriesSummary } from "../main/ipc/profiles"
export type { ModelPair } from "../main/modelStore"

export const PROVIDERS: readonly ProviderId[] = ["claude", "gpt", "gemini", "mistral"]
export const VARIANTS: readonly Variant[] = ["pt-pt", "pt-br"]
export const PRESETS: readonly Preset[] = ["save", "balanced", "best"]

export interface SetupApi {
  pickScript(): Promise<PickedScript | null>
  pickVideo(): Promise<PickedVideo | null>
  pickExample(): Promise<PickedExample | null>
  hasKey(provider: ProviderId): Promise<boolean>
  setKey(provider: ProviderId, key: string): Promise<void>
  removeKey(provider: ProviderId): Promise<void>
  getModels(provider: ProviderId): Promise<ModelPair>
  setModels(provider: ProviderId, pair: ModelPair): Promise<ModelPair>
  resetModels(provider: ProviderId): Promise<ModelPair>
  listSeries(variant: Variant): Promise<SeriesList>
  createSeries(variant: Variant, name: string): Promise<SeriesSummary>
  renameSeries(variant: Variant, id: string, name: string): Promise<SeriesSummary>
  deleteSeries(variant: Variant, id: string): Promise<void>
  loadSeriesRules(variant: Variant, id: string): Promise<Rule[]>
  saveSeriesRules(variant: Variant, id: string, rules: Rule[]): Promise<void>
  loadBase(variant: Variant): Promise<LoadedBase>
  saveBase(base: BaseProfile): Promise<BaseProfile>
  importExample(
    variant: Variant,
    name: string,
    text: string,
    dialogueStyles: string[],
  ): Promise<BaseProfile>
}
```

Check that `Preset` is exported from `src/core/pipeline/types.ts` (`grep -n "export type Preset" src/core/pipeline/types.ts`). It is used by `main.ts`, so it is.

- [ ] **Step 4: Implement the readers**

Create `src/preload/readers.ts`:

```ts
import { isRecord, isRuleList, readBaseProfile } from "../core/library/guards"
import type {
  LoadedBase,
  ModelPair,
  PickedExample,
  PickedScript,
  PickedVideo,
  Rule,
  SeriesList,
  SeriesSummary,
} from "../shared/api"

const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

export function ipcMessage(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message.replace(IPC_PREFIX, "")
  }
  return "Something went wrong."
}

export function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null
}

export function readNothing(value: unknown): undefined | null {
  return value === null || value === undefined ? undefined : null
}

export function readModelPair(value: unknown): ModelPair | null {
  if (!isRecord(value) || typeof value.cheap !== "string" || typeof value.strong !== "string") {
    return null
  }
  return { cheap: value.cheap, strong: value.strong }
}

export function readPickedScript(value: unknown): { value: PickedScript | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    typeof value.name !== "string" ||
    typeof value.text !== "string"
  ) {
    return null
  }
  return { value: { path: value.path, name: value.name, text: value.text } }
}

export function readPickedVideo(value: unknown): { value: PickedVideo | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.name !== "string") {
    return null
  }
  return { value: { path: value.path, name: value.name } }
}

export function readPickedExample(value: unknown): { value: PickedExample | null } | null {
  if (value === null) {
    return { value: null }
  }
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.text !== "string") {
    return null
  }
  const styles = value.styles
  if (!Array.isArray(styles)) {
    return null
  }
  const listed: PickedExample["styles"] = []
  for (const style of styles) {
    if (!isRecord(style) || typeof style.name !== "string") {
      return null
    }
    const guess = style.guess
    if (guess !== "dialogue" && guess !== "skip" && guess !== "ambiguous") {
      return null
    }
    listed.push({ name: style.name, guess })
  }
  return { value: { name: value.name, text: value.text, styles: listed } }
}

export function readSeriesSummary(value: unknown): SeriesSummary | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string") {
    return null
  }
  const ruleCount = value.ruleCount
  if (typeof ruleCount !== "number" || !Number.isInteger(ruleCount)) {
    return null
  }
  return { id: value.id, name: value.name, ruleCount }
}

export function readSeriesList(value: unknown): SeriesList | null {
  if (!isRecord(value) || !Array.isArray(value.series) || !isStringList(value.problems)) {
    return null
  }
  const series: SeriesSummary[] = []
  for (const item of value.series) {
    const summary = readSeriesSummary(item)
    if (summary === null) {
      return null
    }
    series.push(summary)
  }
  return { series, problems: value.problems }
}

export function readRules(value: unknown): Rule[] | null {
  return isRuleList(value) ? value : null
}

export function readLoadedBase(value: unknown): LoadedBase | null {
  if (!isRecord(value) || !isStringList(value.problems)) {
    return null
  }
  const base = readBaseProfile(value.base)
  return base === null ? null : { base, problems: value.problems }
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}
```

Run: `npx vitest run tests/preload/readers.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the handlers in the main process**

Create `src/main/ipc/register.ts`:

```ts
import { ipcMain } from "electron"
import { isRecord, isRuleList, isVariant, readBaseProfile } from "../../core/library/guards"
import type { ProviderId } from "../../core/pipeline/types"
import type { ModelStore } from "../modelStore"
import type { SecretStore } from "../secrets"
import { pickExample, pickScript, pickVideo, type OpenFile } from "./files"
import type { ProfileHandlers } from "./profiles"

export interface SetupDeps {
  open: OpenFile
  secrets: SecretStore
  models: ModelStore
  profiles: ProfileHandlers
}

export function registerSetupIpc(deps: SetupDeps): void {
  const { open, secrets, models, profiles } = deps
  handle("honya:pick-script", () => pickScript(open))
  handle("honya:pick-video", () => pickVideo(open))
  handle("honya:pick-example", () => pickExample(open))
  handle("honya:has-key", (args) => secrets.hasKey(provider(args, 0)))
  handle("honya:set-key", (args) => {
    secrets.setKey(provider(args, 0), text(args, 1))
    return null
  })
  handle("honya:remove-key", (args) => {
    secrets.removeKey(provider(args, 0))
    return null
  })
  handle("honya:get-models", (args) => models.get(provider(args, 0)))
  handle("honya:set-models", (args) => {
    const pair = args[1]
    if (!isRecord(pair) || typeof pair.cheap !== "string" || typeof pair.strong !== "string") {
      throw new Error("Invalid model ids.")
    }
    return models.set(provider(args, 0), { cheap: pair.cheap, strong: pair.strong })
  })
  handle("honya:reset-models", (args) => models.reset(provider(args, 0)))
  handle("honya:list-series", (args) => profiles.listSeries(variant(args, 0)))
  handle("honya:create-series", (args) => profiles.createSeries(variant(args, 0), text(args, 1)))
  handle("honya:rename-series", (args) =>
    profiles.renameSeries(variant(args, 0), text(args, 1), text(args, 2)),
  )
  handle("honya:delete-series", (args) => {
    profiles.deleteSeries(variant(args, 0), text(args, 1))
    return null
  })
  handle("honya:load-series-rules", (args) =>
    profiles.loadSeriesRules(variant(args, 0), text(args, 1)),
  )
  handle("honya:save-series-rules", (args) => {
    const rules = args[2]
    if (!isRuleList(rules)) {
      throw new Error("Invalid rules.")
    }
    profiles.saveSeriesRules(variant(args, 0), text(args, 1), rules)
    return null
  })
  handle("honya:load-base", (args) => profiles.loadBase(variant(args, 0)))
  handle("honya:save-base", (args) => {
    const base = readBaseProfile(args[0])
    if (base === null) {
      throw new Error("Invalid base profile.")
    }
    return profiles.saveBase(base)
  })
  handle("honya:import-example", (args) => {
    const styles = args[3]
    if (!Array.isArray(styles) || !styles.every((style) => typeof style === "string")) {
      throw new Error("Invalid styles.")
    }
    return profiles.importExample(variant(args, 0), text(args, 1), text(args, 2), styles)
  })
}

function handle(channel: string, run: (args: readonly unknown[]) => unknown): void {
  ipcMain.handle(channel, (_event, ...args: unknown[]) => run(args))
}

function provider(args: readonly unknown[], index: number): ProviderId {
  const value = args[index]
  if (value === "claude" || value === "gpt" || value === "gemini" || value === "mistral") {
    return value
  }
  throw new Error("Invalid provider.")
}

function variant(args: readonly unknown[], index: number): "pt-pt" | "pt-br" {
  const value = args[index]
  if (!isVariant(value)) {
    throw new Error("Invalid variant.")
  }
  return value
}

function text(args: readonly unknown[], index: number): string {
  const value = args[index]
  if (typeof value !== "string") {
    throw new Error("Invalid text argument.")
  }
  return value
}
```

- [ ] **Step 6: Use it from `main.ts`**

In `src/main/main.ts`:

1. Change the Electron import to `import { app, BrowserWindow, dialog, ipcMain, safeStorage } from "electron"` and add:

```ts
import { createFileStore } from "../core/library/fileStore"
import { createProfileHandlers } from "./ipc/profiles"
import { registerSetupIpc } from "./ipc/register"
import { createModelStore, type ModelStore } from "./modelStore"
```

Remove the now-unused `import { defaultModels } from "../core/providers/models"`.

2. Replace `boot()`:

```ts
function boot(): void {
  const secrets = createSecretStore(safeStorage, { read: readKeyFile, write: writeKeyFile })
  const models = createModelStore({ read: readModelFile, write: writeModelFile })
  const store = createFileStore(join(app.getPath("userData"), "profiles"))
  registerSetupIpc({ open: openFile, secrets, models, profiles: createProfileHandlers(store) })
  registerIpc(secrets, models)
  openWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openWindow()
    }
  })
}

async function openFile(filters: { name: string; extensions: string[] }[]): Promise<string | null> {
  const result = await dialog.showOpenDialog({ properties: ["openFile"], filters })
  if (result.canceled) {
    return null
  }
  return result.filePaths[0] ?? null
}

function modelPath(): string {
  return join(app.getPath("userData"), "models.json")
}

function readModelFile(): string | null {
  const file = modelPath()
  return existsSync(file) ? readFileSync(file, "utf8") : null
}

function writeModelFile(text: string): void {
  const file = modelPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text, "utf8")
}
```

3. In `registerIpc`, change the signature to `function registerIpc(secrets: SecretStore, models: ModelStore): void` and delete the `honya:has-key`, `honya:set-key` and `honya:get-models` handlers (they now live in `register.ts`). Thread `models` through: `startTranslation(secrets, models, request)` → `translationInput(request, dialogueStyles, grabbed.frames, secrets, models)` → `complete: (chat) => completeWithProvider(secrets, models, request.provider, chat)`.

4. In `completeWithProvider`, add the `models: ModelStore` parameter after `secrets` and replace `const models = defaultModels(provider)` with:

```ts
  const pair = models.get(provider)
```

and use `pair.cheap` / `pair.strong` for `model`.

- [ ] **Step 7: Expose the calls in the preload**

In `src/preload/preload.ts`:

1. Replace the local `ModelPair` interface and the `HonyaApi` interface with:

```ts
import type { SetupApi } from "../shared/api"
import {
  ipcMessage,
  readBoolean,
  readLoadedBase,
  readModelPair,
  readNothing,
  readPickedExample,
  readPickedScript,
  readPickedVideo,
  readRules,
  readSeriesList,
  readSeriesSummary,
} from "./readers"
import { readBaseProfile } from "../core/library/guards"

interface HonyaApi extends SetupApi {
  preflight(input: PreflightRequest): Promise<PreflightResult>
  start(input: StartRequest): Promise<StartResponse>
  export(input: ExportRequest): Promise<ExportResponse>
}
```

2. Replace the `hasKey`, `setKey` and `getModels` members of the `honya` object and add the new ones:

```ts
  pickScript: () => picked("honya:pick-script", [], readPickedScript),
  pickVideo: () => picked("honya:pick-video", [], readPickedVideo),
  pickExample: () => picked("honya:pick-example", [], readPickedExample),
  hasKey: (provider) => read("honya:has-key", [provider], readBoolean),
  setKey: (provider, key) => read("honya:set-key", [provider, key], readNothing),
  removeKey: (provider) => read("honya:remove-key", [provider], readNothing),
  getModels: (provider) => read("honya:get-models", [provider], readModelPair),
  setModels: (provider, pair) => read("honya:set-models", [provider, pair], readModelPair),
  resetModels: (provider) => read("honya:reset-models", [provider], readModelPair),
  listSeries: (variant) => read("honya:list-series", [variant], readSeriesList),
  createSeries: (variant, name) =>
    read("honya:create-series", [variant, name], readSeriesSummary),
  renameSeries: (variant, id, name) =>
    read("honya:rename-series", [variant, id, name], readSeriesSummary),
  deleteSeries: (variant, id) => read("honya:delete-series", [variant, id], readNothing),
  loadSeriesRules: (variant, id) => read("honya:load-series-rules", [variant, id], readRules),
  saveSeriesRules: (variant, id, rules) =>
    read("honya:save-series-rules", [variant, id, rules], readNothing),
  loadBase: (variant) => read("honya:load-base", [variant], readLoadedBase),
  saveBase: (base) => read("honya:save-base", [base], readBaseProfile),
  importExample: (variant, name, text, styles) =>
    read("honya:import-example", [variant, name, text, styles], readBaseProfile),
```

3. Change `read` so `undefined` counts as a valid parsed value, add `picked`, and make `invoke` use `ipcMessage`:

```ts
async function read<T>(
  channel: string,
  args: readonly unknown[],
  parse: (value: unknown) => T | null,
): Promise<T> {
  const value = await invoke(channel, args)
  const parsed = parse(value)
  if (parsed === null) {
    throw new Error(`invalid ${channel} response`)
  }
  return parsed
}

async function picked<T>(
  channel: string,
  args: readonly unknown[],
  parse: (value: unknown) => { value: T | null } | null,
): Promise<T | null> {
  const result = await read(channel, args, parse)
  return result.value
}
```

In `invoke`, replace `reject(toError(reason))` with `reject(new Error(ipcMessage(reason)))` and delete `toError`, the old `readBoolean`, `readModelPair` and `isRecord` if nothing else uses them (keep `isRecord` if the start/preflight readers still need it). `readNothing` returns `undefined`, which `read` accepts because only `null` means invalid.

- [ ] **Step 8: Run all checks**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS. `dist/main.js` and `dist/preload.cjs` build.

- [ ] **Step 9: Commit**

```bash
npm run format
git add src/shared src/main src/preload tests/preload
git commit -m "feat: expose profile key model and file calls to the window"
```

---

### Task 9: React renderer shell

**Files:**
- Modify: `package.json`, `package-lock.json` (dependencies)
- Modify: `tsconfig.json`, `eslint.config.js`, `scripts/build.mjs`
- Modify: `src/renderer/index.html`, `src/renderer/styles.css`
- Create: `src/renderer/main.tsx`, `App.tsx`, `api.ts`, `action.ts`, `ErrorLine.tsx`, `format.ts`
- Create: `src/renderer/screens/StylesScreen.tsx`, `PreflightScreen.tsx`, `RunScreen.tsx`, `ReviewScreen.tsx`, `StartScreen.tsx` (placeholder filled in Task 10), `ProfilesScreen.tsx` (placeholder filled in Task 11)
- Delete: `src/renderer/view.ts`, `src/renderer/render.ts`, `tests/renderer/render.test.ts`
- Create: `tests/renderer/fakeApi.ts`, `tests/renderer/bundle.test.ts`, `tests/renderer/screens.test.tsx`

**Interfaces:**
- Consumes: `SetupApi`, `PROVIDERS`, `VARIANTS`, `PRESETS` from `src/shared/api.ts`.
- Produces:
  - `api.ts`: `ApiContext: React.Context<SetupApi | null>`, `useApi(): SetupApi`, `errorMessage(error: unknown): string`.
  - `action.ts`: `ErrorContext: React.Context<(message: string | null) => void>`, `useAction(): (task: () => Promise<void>) => void` (clears the error line when the task succeeds, shows the error when it fails), `useReport(): (message: string | null) => void`.
  - `App.tsx`: `interface Session { script: PickedScript | null; variant: Variant; seriesId: string | null; provider: ProviderId; preset: Preset; video: PickedVideo | null; frameSetting: FrameSetting }`, `type FrameSetting = "none" | "marked" | "every"`, `function App(props: { api: SetupApi }): JSX.Element`.
  - `StartScreen` props: `{ session: Session; onChange: (patch: Partial<Session>) => void; onOpenProfiles: () => void }`.
  - `ProfilesScreen` props: `{ variant: Variant; onVariantChange: (variant: Variant) => void; onBack: () => void }`.
  - `tests/renderer/fakeApi.ts`: `fakeApi(overrides?: Partial<SetupApi>): SetupApi` with in-memory behavior for every call.

- [ ] **Step 1: Install dependencies**

```bash
npm install --save-exact react@19.3.0 react-dom@19.3.0
npm install --save-exact --save-dev @types/react@19.3.0 @types/react-dom@19.3.0 eslint-plugin-react-hooks@7.1.1 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 jsdom@30.1.2
```

- [ ] **Step 2: Configure TypeScript, ESLint and the build**

In `tsconfig.json` add to `compilerOptions`:

```json
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
```

In `eslint.config.js`, import the plugin and add its flat config after `strictTypeChecked`:

```js
import reactHooks from "eslint-plugin-react-hooks"
```

```js
  tseslint.configs.strictTypeChecked,
  reactHooks.configs.flat.recommended,
```

In `scripts/build.mjs`, replace the renderer build:

```js
await build({
  entryPoints: ["src/renderer/main.tsx"],
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: "dist/renderer/main.js",
})
```

Replace `src/renderer/index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Honya</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main id="app"></main>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the failing tests**

Create `tests/renderer/fakeApi.ts`:

```ts
import { emptyBase } from "../../src/core/library/card"
import type {
  BaseProfile,
  ModelPair,
  ProviderId,
  Rule,
  SeriesSummary,
  SetupApi,
  Variant,
} from "../../src/shared/api"

export function fakeApi(overrides: Partial<SetupApi> = {}): SetupApi {
  const keys = new Set<ProviderId>()
  const models = new Map<ProviderId, ModelPair>()
  const series = new Map<Variant, (SeriesSummary & { rules: Rule[] })[]>([
    ["pt-pt", []],
    ["pt-br", []],
  ])
  const bases = new Map<Variant, BaseProfile>([
    ["pt-pt", emptyBase("pt-pt")],
    ["pt-br", emptyBase("pt-br")],
  ])
  let next = 0
  const listOf = (variant: Variant): (SeriesSummary & { rules: Rule[] })[] =>
    series.get(variant) ?? []
  const summary = (item: SeriesSummary & { rules: Rule[] }): SeriesSummary => ({
    id: item.id,
    name: item.name,
    ruleCount: item.rules.length,
  })
  const find = (variant: Variant, id: string): SeriesSummary & { rules: Rule[] } => {
    const item = listOf(variant).find((entry) => entry.id === id)
    if (item === undefined) {
      throw new Error("That series no longer exists.")
    }
    return item
  }
  const api: SetupApi = {
    pickScript: () => Promise.resolve(null),
    pickVideo: () => Promise.resolve(null),
    pickExample: () => Promise.resolve(null),
    hasKey: (provider) => Promise.resolve(keys.has(provider)),
    setKey: (provider) => {
      keys.add(provider)
      return Promise.resolve()
    },
    removeKey: (provider) => {
      keys.delete(provider)
      return Promise.resolve()
    },
    getModels: (provider) =>
      Promise.resolve(models.get(provider) ?? { cheap: `${provider}-cheap`, strong: `${provider}-strong` }),
    setModels: (provider, pair) => {
      models.set(provider, pair)
      return Promise.resolve(pair)
    },
    resetModels: (provider) => {
      models.delete(provider)
      return Promise.resolve({ cheap: `${provider}-cheap`, strong: `${provider}-strong` })
    },
    listSeries: (variant) =>
      Promise.resolve({ series: listOf(variant).map(summary), problems: [] }),
    createSeries: (variant, name) => {
      next += 1
      const item = { id: `id-${String(next)}`, name: name.trim(), ruleCount: 0, rules: [] }
      listOf(variant).push(item)
      return Promise.resolve(summary(item))
    },
    renameSeries: (variant, id, name) => {
      const item = find(variant, id)
      item.name = name
      return Promise.resolve(summary(item))
    },
    deleteSeries: (variant, id) => {
      series.set(
        variant,
        listOf(variant).filter((item) => item.id !== id),
      )
      return Promise.resolve()
    },
    loadSeriesRules: (variant, id) => Promise.resolve(find(variant, id).rules),
    saveSeriesRules: (variant, id, rules) => {
      find(variant, id).rules = rules
      return Promise.resolve()
    },
    loadBase: (variant) =>
      Promise.resolve({ base: bases.get(variant) ?? emptyBase(variant), problems: [] }),
    saveBase: (base) => {
      bases.set(base.variant, base)
      return Promise.resolve(base)
    },
    importExample: (variant, name, text) => {
      const base = bases.get(variant) ?? emptyBase(variant)
      const saved = { ...base, examples: [...base.examples, { name, text }] }
      bases.set(variant, saved)
      return Promise.resolve(saved)
    },
  }
  return { ...api, ...overrides }
}
```

Create `tests/renderer/bundle.test.ts`:

```ts
import { buildSync } from "esbuild"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

describe("renderer bundle", () => {
  it("never contains ass-compiler", () => {
    const result = buildSync({
      entryPoints: [fileURLToPath(new URL("../../src/renderer/main.tsx", import.meta.url))],
      bundle: true,
      platform: "browser",
      format: "esm",
      jsx: "automatic",
      define: { "process.env.NODE_ENV": '"production"' },
      write: false,
    })
    const text = result.outputFiles.map((file) => file.text).join("\n")
    expect(text).not.toContain("ass-compiler")
    expect(text).not.toContain("readAss")
  })
})
```

Create `tests/renderer/screens.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../../src/renderer/App"
import { ReviewScreen } from "../../src/renderer/screens/ReviewScreen"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

describe("renderer shell", () => {
  it("opens on the start screen inside the card", async () => {
    render(<App api={fakeApi()} />)
    expect(await screen.findByRole("button", { name: "Profiles" })).toBeTruthy()
    expect(document.querySelector("article.card")).not.toBeNull()
  })

  it("shows review text as text, not markup", () => {
    render(
      <ReviewScreen
        series="<b>Frieren</b>"
        fileName="ep01.ass"
        variant="pt-pt"
        preset="balanced"
        openFlagCount={3}
        current={{ words: "Olá", note: "linha longa", english: "Hi", before: "", after: "" }}
      />,
    )
    expect(screen.getByText("<b>Frieren</b> · ep01.ass · 3 flags")).toBeTruthy()
    expect(screen.getByText("{note: linha longa}")).toBeTruthy()
  })
})
```

Run: `npx vitest run tests/renderer`
Expected: FAIL. `App` and `ReviewScreen` do not exist.

- [ ] **Step 4: Implement the shell**

Delete `src/renderer/view.ts`, `src/renderer/render.ts` and `tests/renderer/render.test.ts`.

Create `src/renderer/api.ts`:

```ts
import { createContext, useContext } from "react"
import type { SetupApi } from "../shared/api"

export const ApiContext = createContext<SetupApi | null>(null)

export function useApi(): SetupApi {
  const api = useContext(ApiContext)
  if (api === null) {
    throw new Error("ApiContext is missing.")
  }
  return api
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong."
}
```

Create `src/renderer/action.ts`:

```ts
import { createContext, useCallback, useContext } from "react"
import { errorMessage } from "./api"

export const ErrorContext = createContext<(message: string | null) => void>(() => undefined)

export function useReport(): (message: string | null) => void {
  return useContext(ErrorContext)
}

export function useAction(): (task: () => Promise<void>) => void {
  const report = useContext(ErrorContext)
  return useCallback(
    (task: () => Promise<void>) => {
      void task().then(
        () => {
          report(null)
        },
        (error: unknown) => {
          report(errorMessage(error))
        },
      )
    },
    [report],
  )
}
```

Create `src/renderer/ErrorLine.tsx`:

```tsx
export function ErrorLine({ message }: { message: string | null }): React.JSX.Element | null {
  if (message === null) {
    return null
  }
  return (
    <p className="error-line" role="alert">
      {message}
    </p>
  )
}
```

Create `src/renderer/format.ts`:

```ts
import type { Rule } from "../shared/api"

export function formatRule(rule: Rule): string {
  return rule.kind === "prose" ? rule.text : `${rule.source} → ${rule.pt}`
}
```

Create `src/renderer/App.tsx`:

```tsx
import { useState } from "react"
import type {
  PickedScript,
  PickedVideo,
  Preset,
  ProviderId,
  SetupApi,
  Variant,
} from "../shared/api"
import { ErrorContext } from "./action"
import { ApiContext } from "./api"
import { ErrorLine } from "./ErrorLine"
import { ProfilesScreen } from "./screens/ProfilesScreen"
import { StartScreen } from "./screens/StartScreen"

export type FrameSetting = "none" | "marked" | "every"

export interface Session {
  script: PickedScript | null
  variant: Variant
  seriesId: string | null
  provider: ProviderId
  preset: Preset
  video: PickedVideo | null
  frameSetting: FrameSetting
}

const FIRST_SESSION: Session = {
  script: null,
  variant: "pt-pt",
  seriesId: null,
  provider: "claude",
  preset: "save",
  video: null,
  frameSetting: "none",
}

export function App({ api }: { api: SetupApi }): React.JSX.Element {
  const [screen, setScreen] = useState<"start" | "profiles">("start")
  const [session, setSession] = useState<Session>(FIRST_SESSION)
  const [error, setError] = useState<string | null>(null)
  const change = (patch: Partial<Session>): void => {
    setSession((current) => ({ ...current, ...patch }))
  }
  return (
    <ApiContext.Provider value={api}>
      <ErrorContext.Provider value={setError}>
        <article className="card">
          <ErrorLine message={error} />
          {screen === "start" ? (
            <StartScreen
              session={session}
              onChange={change}
              onOpenProfiles={() => {
                setScreen("profiles")
              }}
            />
          ) : (
            <ProfilesScreen
              variant={session.variant}
              onVariantChange={(variant) => {
                change({ variant, seriesId: null })
              }}
              onBack={() => {
                setScreen("start")
              }}
            />
          )}
        </article>
      </ErrorContext.Provider>
    </ApiContext.Provider>
  )
}
```

Create `src/renderer/main.tsx`:

```tsx
import { createRoot } from "react-dom/client"
import { App } from "./App"

const root = document.querySelector("#app")
if (root !== null) {
  createRoot(root).render(<App api={window.honya} />)
}
```

Create placeholders that Tasks 10 and 11 replace. `src/renderer/screens/StartScreen.tsx`:

```tsx
import type { Session } from "../App"

export function StartScreen(props: {
  session: Session
  onChange: (patch: Partial<Session>) => void
  onOpenProfiles: () => void
}): React.JSX.Element {
  return (
    <header className="card-header">
      <button type="button" className="link" onClick={props.onOpenProfiles}>
        Profiles
      </button>
    </header>
  )
}
```

`src/renderer/screens/ProfilesScreen.tsx`:

```tsx
import type { Variant } from "../../shared/api"

export function ProfilesScreen(props: {
  variant: Variant
  onVariantChange: (variant: Variant) => void
  onBack: () => void
}): React.JSX.Element {
  return (
    <header className="card-header">
      <button type="button" className="link" onClick={props.onBack}>
        Back
      </button>
    </header>
  )
}
```

Port the four unwired screens with the content `view.ts` had. `src/renderer/screens/StylesScreen.tsx`:

```tsx
import type { ListedStyle } from "../../shared/api"

export function StylesScreen({ styles }: { styles: ListedStyle[] }): React.JSX.Element {
  return (
    <div className="split">
      <div>
        <ul className="styles">
          {styles.map((style) => (
            <li key={style.name}>
              <span className="name">{style.name}</span> <span className="guess">{style.guess}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="decision">
        <button className="action" type="button">
          Accept
        </button>
      </div>
    </div>
  )
}
```

`src/renderer/screens/PreflightScreen.tsx`:

```tsx
export interface PreflightView {
  dialogueLineCount: number
  frameCount: number
  provider: string
  preset: string
  outputPath: string
}

export function PreflightScreen({ summary }: { summary: PreflightView }): React.JSX.Element {
  return (
    <div className="split">
      <div>
        <p>line count</p>
        <p>{summary.dialogueLineCount}</p>
        <p>frame count</p>
        <p>{summary.frameCount}</p>
      </div>
      <div className="decision">
        <p>provider</p>
        <p>{summary.provider}</p>
        <p>preset</p>
        <p>{summary.preset}</p>
        <p>output path</p>
        <p>{summary.outputPath}</p>
      </div>
    </div>
  )
}
```

`src/renderer/screens/RunScreen.tsx`:

```tsx
export function RunScreen(props: { batchIndex: number; latest: string }): React.JSX.Element {
  return (
    <div className="split">
      <div>
        <p>batch index</p>
        <p>{props.batchIndex}</p>
      </div>
      <div className="decision">
        <p>latest line</p>
        <p>{props.latest}</p>
      </div>
    </div>
  )
}
```

`src/renderer/screens/ReviewScreen.tsx`:

```tsx
export interface ReviewLine {
  words: string
  note: string | null
  english: string
  before: string
  after: string
}

export function ReviewScreen(props: {
  series: string
  fileName: string
  variant: string
  preset: string
  openFlagCount: number
  current: ReviewLine | null
}): React.JSX.Element {
  const { current } = props
  return (
    <>
      <header className="card-header">
        <p>{`${props.series} · ${props.fileName} · ${String(props.openFlagCount)} flags`}</p>
        <p>{`${props.variant} · ${props.preset}`}</p>
      </header>
      <div className="review-body">
        <div className="lines">
          {current === null ? null : (
            <>
              <p className="faded">{current.before}</p>
              <p className="current">{current.words}</p>
              {current.note === null ? null : (
                <p className="note">{`{note: ${current.note}}`}</p>
              )}
              <p className="faded">{current.after}</p>
            </>
          )}
        </div>
        <div className="decision">
          <p className="english">{current === null ? "" : current.english}</p>
          <button className="accept" type="button">
            Accept
          </button>
        </div>
      </div>
    </>
  )
}
```

Append to `src/renderer/styles.css`:

```css
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
}

.link {
  border: none;
  padding: 0;
  margin: 0;
  background: none;
  color: #e36b1e;
  text-decoration: underline;
  cursor: pointer;
}

.error-line {
  margin: 0 0 16px;
  color: #e36b1e;
  border-left: 3px solid #e36b1e;
  padding-left: 10px;
}

.picked {
  display: flex;
  align-items: center;
  gap: 8px;
}

.picked span {
  flex: 1;
  border: 1.5px dashed #2a2420;
  padding: 8px 10px;
}

.muted {
  opacity: 0.6;
}

.field {
  display: grid;
  gap: 6px;
  margin: 0 0 14px;
}

section + section {
  margin-top: 20px;
}

input:disabled,
select:disabled {
  opacity: 0.5;
}
```

- [ ] **Step 5: Run all checks**

If Vitest reports `React is not defined` or cannot parse JSX in a `.test.tsx` file, set the JSX runtime in `vitest.config.ts` with `esbuild: { jsx: "automatic" }` inside `defineConfig({...})`, then rerun.

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: PASS. `dist/renderer/main.js` exists and `dist/renderer/view.js` no longer does (delete `dist/` first if it lingers: `rm -rf dist && npm run build`).

- [ ] **Step 6: Commit**

```bash
npm run format
git add -A package.json package-lock.json tsconfig.json eslint.config.js scripts src/renderer tests/renderer
git commit -m "refactor: render the card screens with react"
```

---

### Task 10: Start screen

**Files:**
- Modify: `src/renderer/screens/StartScreen.tsx`
- Create: `src/renderer/components/SeriesPicker.tsx`
- Create: `src/renderer/components/KeyField.tsx`
- Create: `tests/renderer/start.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `useAction`, `useReport`, `Session`, `SetupApi`, `VARIANTS`, `PROVIDERS`, `PRESETS`.
- Produces:
  - `SeriesPicker` props: `{ variant: Variant; seriesId: string | null; onSelect: (id: string | null) => void }`.
  - `KeyField` props: `{ provider: ProviderId; onSaved: () => void }`. The input is labelled `<provider> key`.

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/start.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { App } from "../../src/renderer/App"
import type { SeriesList, Variant } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
})

describe("start screen", () => {
  it("shows the picked script's name and keeps it after a cancelled pick", async () => {
    let pick: { path: string; name: string; text: string } | null = {
      path: "/s/ep01.ass",
      name: "ep01.ass",
      text: "x",
    }
    render(<App api={fakeApi({ pickScript: () => Promise.resolve(pick) })} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose script…" }))
    expect(await screen.findByText("ep01.ass")).toBeTruthy()
    pick = null
    fireEvent.click(screen.getByRole("button", { name: "Choose script…" }))
    await waitFor(() => {
      expect(screen.getByText("ep01.ass")).toBeTruthy()
    })
  })

  it("shows the error when the script can't be read", async () => {
    const api = fakeApi({
      pickScript: () => Promise.reject(new Error("notes.ass has no dialogue lines. Is it an ASS script?")),
    })
    render(<App api={api} />)
    fireEvent.click(screen.getByRole("button", { name: "Choose script…" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "notes.ass has no dialogue lines. Is it an ASS script?",
    )
  })

  it("creates a series and selects it", async () => {
    render(<App api={fakeApi()} />)
    const picker = await screen.findByLabelText("series")
    fireEvent.change(picker, { target: { value: "__new__" } })
    fireEvent.change(screen.getByLabelText("new series name"), { target: { value: "Frieren" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    await waitFor(() => {
      const select = screen.getByLabelText("series")
      expect(select instanceof HTMLSelectElement && select.selectedOptions[0]?.text).toBe("Frieren")
    })
  })

  it("shows a refused name in the error line", async () => {
    const api = fakeApi({
      createSeries: () => Promise.reject(new Error("A series called Frieren already exists for pt-pt.")),
    })
    render(<App api={api} />)
    fireEvent.change(await screen.findByLabelText("series"), { target: { value: "__new__" } })
    fireEvent.change(screen.getByLabelText("new series name"), { target: { value: "frieren" } })
    fireEvent.click(screen.getByRole("button", { name: "Create" }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "A series called Frieren already exists for pt-pt.",
    )
  })

  it("reloads series for the new variant and ignores a late reply for the old one", async () => {
    let releasePt: (list: SeriesList) => void = () => undefined
    const api = fakeApi({
      listSeries: (variant: Variant) =>
        variant === "pt-pt"
          ? new Promise<SeriesList>((resolve) => {
              releasePt = resolve
            })
          : Promise.resolve({ series: [{ id: "b", name: "Mushishi", ruleCount: 0 }], problems: [] }),
    })
    render(<App api={api} />)
    fireEvent.change(screen.getByLabelText("variant"), { target: { value: "pt-br" } })
    expect(await screen.findByRole("option", { name: "Mushishi" })).toBeTruthy()
    releasePt({ series: [{ id: "a", name: "Frieren", ruleCount: 0 }], problems: [] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole("option", { name: "Frieren" })).toBeNull()
  })

  it("asks for a key only when the provider has none, and hides it after saving", async () => {
    render(<App api={fakeApi()} />)
    const field = await screen.findByLabelText("claude key")
    fireEvent.change(field, { target: { value: "sk-test" } })
    fireEvent.click(screen.getByRole("button", { name: "Save key" }))
    await waitFor(() => {
      expect(screen.queryByLabelText("claude key")).toBeNull()
    })
    fireEvent.change(screen.getByLabelText("provider"), { target: { value: "gpt" } })
    expect(await screen.findByLabelText("gpt key")).toBeTruthy()
  })

  it("disables the frame setting until a video is chosen", async () => {
    const api = fakeApi({
      pickVideo: () => Promise.resolve({ path: "/v/ep01.mkv", name: "ep01.mkv" }),
    })
    render(<App api={api} />)
    const frames = screen.getByLabelText("frame setting")
    expect(frames instanceof HTMLSelectElement && frames.disabled).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Choose video…" }))
    expect(await screen.findByText("ep01.mkv")).toBeTruthy()
    expect(frames instanceof HTMLSelectElement && frames.disabled).toBe(false)
    fireEvent.click(screen.getByRole("button", { name: "Clear video" }))
    expect(frames instanceof HTMLSelectElement && frames.disabled).toBe(true)
  })

  it("keeps the start choices after visiting profiles", async () => {
    render(<App api={fakeApi()} />)
    fireEvent.change(screen.getByLabelText("preset"), { target: { value: "best" } })
    fireEvent.click(screen.getByRole("button", { name: "Profiles" }))
    fireEvent.click(await screen.findByRole("button", { name: "Back" }))
    const preset = await screen.findByLabelText("preset")
    expect(preset instanceof HTMLSelectElement && preset.value).toBe("best")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/start.test.tsx`
Expected: FAIL. No "Choose script…" button.

- [ ] **Step 3: Implement `KeyField`**

Create `src/renderer/components/KeyField.tsx`:

```tsx
import { useState } from "react"
import type { ProviderId } from "../../shared/api"
import { useAction } from "../action"
import { useApi } from "../api"

export function KeyField(props: { provider: ProviderId; onSaved: () => void }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const [key, setKey] = useState("")
  const label = `${props.provider} key`
  return (
    <div className="picked">
      <label>
        <span>{label}</span>
        <input
          type="password"
          aria-label={label}
          value={key}
          onChange={(event) => {
            setKey(event.target.value)
          }}
        />
      </label>
      <button
        type="button"
        className="action"
        disabled={key.trim() === ""}
        onClick={() => {
          act(async () => {
            await api.setKey(props.provider, key.trim())
            setKey("")
            props.onSaved()
          })
        }}
      >
        Save key
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Implement `SeriesPicker`**

Create `src/renderer/components/SeriesPicker.tsx`:

```tsx
import { useEffect, useState } from "react"
import type { SeriesSummary, Variant } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"

const NEW = "__new__"

export function SeriesPicker(props: {
  variant: Variant
  seriesId: string | null
  onSelect: (id: string | null) => void
}): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [series, setSeries] = useState<SeriesSummary[]>([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let current = true
    api.listSeries(props.variant).then(
      (list) => {
        if (!current) {
          return
        }
        setSeries(list.series)
        if (list.problems.length > 0) {
          report(list.problems.join(" "))
        }
      },
      (error: unknown) => {
        if (current) {
          report(errorMessage(error))
        }
      },
    )
    return () => {
      current = false
    }
  }, [api, props.variant, reload, report])

  if (creating) {
    return (
      <div className="picked">
        <input
          aria-label="new series name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
          }}
        />
        <button
          type="button"
          className="action"
          onClick={() => {
            act(async () => {
              const created = await api.createSeries(props.variant, name)
              setCreating(false)
              setName("")
              setReload((count) => count + 1)
              props.onSelect(created.id)
            })
          }}
        >
          Create
        </button>
        <button
          type="button"
          onClick={() => {
            setCreating(false)
            setName("")
          }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <select
      aria-label="series"
      value={props.seriesId ?? ""}
      onChange={(event) => {
        const value = event.target.value
        if (value === NEW) {
          setCreating(true)
          return
        }
        props.onSelect(value === "" ? null : value)
      }}
    >
      <option value="">Choose a series…</option>
      {series.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
      <option value={NEW}>New series…</option>
    </select>
  )
}
```

- [ ] **Step 5: Implement `StartScreen`**

Replace `src/renderer/screens/StartScreen.tsx`:

```tsx
import { useEffect, useState } from "react"
import { PRESETS, PROVIDERS, VARIANTS, type Preset, type ProviderId, type Variant } from "../../shared/api"
import type { FrameSetting, Session } from "../App"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { KeyField } from "../components/KeyField"
import { SeriesPicker } from "../components/SeriesPicker"

export function StartScreen(props: {
  session: Session
  onChange: (patch: Partial<Session>) => void
  onOpenProfiles: () => void
}): React.JSX.Element {
  const { session, onChange } = props
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [hasKey, setHasKey] = useState(true)

  useEffect(() => {
    let current = true
    api.hasKey(session.provider).then(
      (present) => {
        if (current) {
          setHasKey(present)
        }
      },
      (error: unknown) => {
        if (current) {
          report(errorMessage(error))
        }
      },
    )
    return () => {
      current = false
    }
  }, [api, session.provider, report])

  return (
    <>
      <header className="card-header">
        <p>Start</p>
        <button type="button" className="link" onClick={props.onOpenProfiles}>
          Profiles
        </button>
      </header>
      <div className="split">
        <div>
          <div className="field">
            <span>file</span>
            <div className="picked">
              <span className={session.script === null ? "muted" : ""}>
                {session.script === null ? "No script chosen" : session.script.name}
              </span>
              <button
                type="button"
                onClick={() => {
                  act(async () => {
                    const script = await api.pickScript()
                    if (script !== null) {
                      onChange({ script })
                    }
                  })
                }}
              >
                Choose script…
              </button>
            </div>
          </div>
          <label>
            <span>variant</span>
            <select
              aria-label="variant"
              value={session.variant}
              onChange={(event) => {
                const variant = VARIANTS.find((item) => item === event.target.value)
                if (variant !== undefined) {
                  onChange({ variant, seriesId: null })
                }
              }}
            >
              {VARIANTS.map((variant: Variant) => (
                <option key={variant}>{variant}</option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>series</span>
            <SeriesPicker
              variant={session.variant}
              seriesId={session.seriesId}
              onSelect={(seriesId) => {
                onChange({ seriesId })
              }}
            />
          </div>
          <label>
            <span>provider</span>
            <select
              aria-label="provider"
              value={session.provider}
              onChange={(event) => {
                const provider = PROVIDERS.find((item) => item === event.target.value)
                if (provider !== undefined) {
                  onChange({ provider })
                }
              }}
            >
              {PROVIDERS.map((provider: ProviderId) => (
                <option key={provider}>{provider}</option>
              ))}
            </select>
          </label>
          {hasKey ? null : (
            <KeyField
              provider={session.provider}
              onSaved={() => {
                setHasKey(true)
              }}
            />
          )}
          <label>
            <span>preset</span>
            <select
              aria-label="preset"
              value={session.preset}
              onChange={(event) => {
                const preset = PRESETS.find((item) => item === event.target.value)
                if (preset !== undefined) {
                  onChange({ preset })
                }
              }}
            >
              {PRESETS.map((preset: Preset) => (
                <option key={preset}>{preset}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="decision">
          <div className="field">
            <span>video</span>
            <div className="picked">
              <span className={session.video === null ? "muted" : ""}>
                {session.video === null ? "No video chosen" : session.video.name}
              </span>
              {session.video === null ? null : (
                <button
                  type="button"
                  aria-label="Clear video"
                  onClick={() => {
                    onChange({ video: null, frameSetting: "none" })
                  }}
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  act(async () => {
                    const video = await api.pickVideo()
                    if (video !== null) {
                      onChange({ video })
                    }
                  })
                }}
              >
                Choose video…
              </button>
            </div>
          </div>
          <label>
            <span>frame setting</span>
            <select
              aria-label="frame setting"
              disabled={session.video === null}
              value={session.frameSetting}
              onChange={(event) => {
                const value = event.target.value
                const frameSetting: FrameSetting | undefined =
                  value === "none" || value === "marked" || value === "every" ? value : undefined
                if (frameSetting !== undefined) {
                  onChange({ frameSetting })
                }
              }}
            >
              <option value="none">none</option>
              <option value="marked">only the marked lines</option>
              <option value="every">every dialogue line</option>
            </select>
          </label>
        </div>
      </div>
    </>
  )
}
```

Rows that hold a button (file, series, video) use `div.field`, not `<label>`: a label forwards clicks on its text to the first control inside it, which would press "Choose…". Selects carry `aria-label`, so tests and screen readers find them by name.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/renderer && npm run typecheck && npm run lint`
Expected: PASS (8 new tests).

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/renderer tests/renderer
git commit -m "feat: pick a script series key and video on the start screen"
```

---

### Task 11: Profiles screen, base side

**Files:**
- Modify: `src/renderer/screens/ProfilesScreen.tsx`
- Create: `src/renderer/components/RuleList.tsx`, `RuleEditor.tsx`, `StyleChecklist.tsx`, `BaseSection.tsx`
- Create: `tests/renderer/profilesBase.test.tsx`

**Interfaces:**
- Consumes: `useApi`, `useAction`, `useReport`, `formatRule`, `SetupApi`, `ListedStyle`, `Rule`, `BaseProfile`.
- Produces:
  - `RuleList` props: `{ rules: Rule[]; onDelete: (index: number) => void }`; each delete button is labelled `Delete rule <formatted rule>`.
  - `RuleEditor` props: `{ onAdd: (rule: Rule) => void }`; a kind select (`rule kind`: `prose` | `glossary`), inputs `rule text` or `english` + `portuguese`, button `Add rule`.
  - `StyleChecklist` props: `{ styles: ListedStyle[]; onConfirm: (dialogueStyles: string[]) => void; onCancel: () => void }`; one radio pair per style named `<style> dialogue` / `<style> skip`; `Import` disabled until every style has a choice.
  - `BaseSection` props: `{ variant: Variant }`.
  - `ProfilesScreen` renders a variant toggle (`profiles variant` select), Back, and two columns: `BaseSection` on the left; the right column is filled in Task 12.

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/profilesBase.test.tsx`:

```tsx
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
    const saveBase = api.saveBase
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
    const importExample = api.importExample
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/profilesBase.test.tsx`
Expected: FAIL. No "base profile" region.

- [ ] **Step 3: Implement `RuleList` and `RuleEditor`**

Create `src/renderer/components/RuleList.tsx`:

```tsx
import type { Rule } from "../../shared/api"
import { formatRule } from "../format"

export function RuleList(props: { rules: Rule[]; onDelete: (index: number) => void }): React.JSX.Element {
  if (props.rules.length === 0) {
    return <p className="muted">No rules yet.</p>
  }
  return (
    <ul className="rules">
      {props.rules.map((rule, index) => {
        const text = formatRule(rule)
        return (
          <li key={`${String(index)}-${text}`}>
            <span>{text}</span>{" "}
            <button
              type="button"
              aria-label={`Delete rule ${text}`}
              onClick={() => {
                props.onDelete(index)
              }}
            >
              ✕
            </button>
          </li>
        )
      })}
    </ul>
  )
}
```

Create `src/renderer/components/RuleEditor.tsx`:

```tsx
import { useState } from "react"
import type { Rule } from "../../shared/api"

export function RuleEditor(props: { onAdd: (rule: Rule) => void }): React.JSX.Element {
  const [kind, setKind] = useState<"prose" | "glossary">("prose")
  const [text, setText] = useState("")
  const [source, setSource] = useState("")
  const [pt, setPt] = useState("")
  const ready = kind === "prose" ? text.trim() !== "" : source.trim() !== "" && pt.trim() !== ""
  return (
    <div>
      <select
        aria-label="rule kind"
        value={kind}
        onChange={(event) => {
          setKind(event.target.value === "glossary" ? "glossary" : "prose")
        }}
      >
        <option value="prose">prose</option>
        <option value="glossary">glossary</option>
      </select>
      {kind === "prose" ? (
        <input
          aria-label="rule text"
          value={text}
          onChange={(event) => {
            setText(event.target.value)
          }}
        />
      ) : (
        <>
          <input
            aria-label="english"
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
            }}
          />
          <input
            aria-label="portuguese"
            value={pt}
            onChange={(event) => {
              setPt(event.target.value)
            }}
          />
        </>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={() => {
          props.onAdd(
            kind === "prose"
              ? { kind: "prose", text: text.trim() }
              : { kind: "glossary", source: source.trim(), pt: pt.trim() },
          )
          setText("")
          setSource("")
          setPt("")
        }}
      >
        Add rule
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Implement `StyleChecklist`**

Create `src/renderer/components/StyleChecklist.tsx`:

```tsx
import { useState } from "react"
import type { ListedStyle } from "../../shared/api"

type Choice = "dialogue" | "skip" | null

export function StyleChecklist(props: {
  styles: ListedStyle[]
  onConfirm: (dialogueStyles: string[]) => void
  onCancel: () => void
}): React.JSX.Element {
  const [choices, setChoices] = useState<Map<string, Choice>>(
    () =>
      new Map(
        props.styles.map((style) => [style.name, style.guess === "ambiguous" ? null : style.guess]),
      ),
  )
  const ready = [...choices.values()].every((choice) => choice !== null)
  const choose = (name: string, choice: Choice): void => {
    setChoices((current) => new Map(current).set(name, choice))
  }
  return (
    <div>
      <ul className="styles">
        {props.styles.map((style) => (
          <li key={style.name}>
            <span className="name">{style.name}</span>{" "}
            {(["dialogue", "skip"] as const).map((choice) => (
              <label key={choice} className="picked">
                <input
                  type="radio"
                  name={`style-${style.name}`}
                  aria-label={`${style.name} ${choice}`}
                  checked={choices.get(style.name) === choice}
                  onChange={() => {
                    choose(style.name, choice)
                  }}
                />
                {choice}
              </label>
            ))}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="action"
        disabled={!ready}
        onClick={() => {
          props.onConfirm(
            [...choices].filter(([, choice]) => choice === "dialogue").map(([name]) => name),
          )
        }}
      >
        Import
      </button>
      <button type="button" onClick={props.onCancel}>
        Cancel
      </button>
    </div>
  )
}
```

- [ ] **Step 5: Implement `BaseSection` and the screen layout**

Create `src/renderer/components/BaseSection.tsx`:

```tsx
import { useEffect, useState } from "react"
import type { BaseProfile, PickedExample, Variant } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { RuleEditor } from "./RuleEditor"
import { RuleList } from "./RuleList"
import { StyleChecklist } from "./StyleChecklist"

export function BaseSection({ variant }: { variant: Variant }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [base, setBase] = useState<BaseProfile | null>(null)
  const [cps, setCps] = useState("")
  const [example, setExample] = useState<PickedExample | null>(null)

  useEffect(() => {
    let current = true
    api.loadBase(variant).then(
      (loaded) => {
        if (!current) {
          return
        }
        setBase(loaded.base)
        setCps(String(loaded.base.cpsLimit))
        if (loaded.problems.length > 0) {
          report(loaded.problems.join(" "))
        }
      },
      (error: unknown) => {
        if (current) {
          report(errorMessage(error))
        }
      },
    )
    return () => {
      current = false
    }
  }, [api, variant, report])

  if (base === null) {
    return <section aria-label="base profile" />
  }

  const save = (next: BaseProfile): void => {
    act(async () => {
      try {
        const saved = await api.saveBase(next)
        setBase(saved)
        setCps(String(saved.cpsLimit))
      } catch (error) {
        setCps(String(base.cpsLimit))
        throw error
      }
    })
  }

  return (
    <section aria-label="base profile">
      <p>{`base · ${variant}`}</p>
      <label>
        <span>characters per second</span>
        <input
          type="number"
          aria-label="characters per second"
          value={cps}
          onChange={(event) => {
            setCps(event.target.value)
          }}
          onBlur={() => {
            if (cps !== String(base.cpsLimit)) {
              save({ ...base, cpsLimit: Number(cps) })
            }
          }}
        />
      </label>
      <p>rules</p>
      <RuleList
        rules={base.rules}
        onDelete={(index) => {
          save({ ...base, rules: base.rules.filter((_, at) => at !== index) })
        }}
      />
      <RuleEditor
        onAdd={(rule) => {
          save({ ...base, rules: [...base.rules, rule] })
        }}
      />
      <p>example scripts</p>
      <ul className="examples">
        {base.examples.map((item, index) => (
          <li key={`${String(index)}-${item.name}`}>
            <span>{item.name}</span>{" "}
            <button
              type="button"
              aria-label={`Remove example ${item.name}`}
              onClick={() => {
                save({ ...base, examples: base.examples.filter((_, at) => at !== index) })
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {example === null ? (
        <button
          type="button"
          onClick={() => {
            act(async () => {
              setExample(await api.pickExample())
            })
          }}
        >
          Import example…
        </button>
      ) : (
        <StyleChecklist
          styles={example.styles}
          onCancel={() => {
            setExample(null)
          }}
          onConfirm={(styles) => {
            act(async () => {
              setBase(await api.importExample(variant, example.name, example.text, styles))
              setExample(null)
            })
          }}
        />
      )}
    </section>
  )
}
```

Replace `src/renderer/screens/ProfilesScreen.tsx`:

```tsx
import { VARIANTS, type Variant } from "../../shared/api"
import { BaseSection } from "../components/BaseSection"

export function ProfilesScreen(props: {
  variant: Variant
  onVariantChange: (variant: Variant) => void
  onBack: () => void
}): React.JSX.Element {
  return (
    <>
      <header className="card-header">
        <button type="button" className="link" onClick={props.onBack}>
          Back
        </button>
        <select
          aria-label="profiles variant"
          value={props.variant}
          onChange={(event) => {
            const variant = VARIANTS.find((item) => item === event.target.value)
            if (variant !== undefined) {
              props.onVariantChange(variant)
            }
          }}
        >
          {VARIANTS.map((variant) => (
            <option key={variant}>{variant}</option>
          ))}
        </select>
      </header>
      <div className="split">
        <div>
          <BaseSection key={props.variant} variant={props.variant} />
        </div>
        <div className="decision" />
      </div>
    </>
  )
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/renderer && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/renderer tests/renderer
git commit -m "feat: edit base rules limits and examples on the profiles screen"
```

---

### Task 12: Profiles screen, series, keys and models

**Files:**
- Create: `src/renderer/components/SeriesSection.tsx`, `KeysSection.tsx`, `ModelsSection.tsx`
- Modify: `src/renderer/screens/ProfilesScreen.tsx` (fill the right column)
- Create: `tests/renderer/profilesSide.test.tsx`

**Interfaces:**
- Consumes: `RuleList`, `RuleEditor`, `KeyField` (Tasks 10–11), `useApi`, `useAction`, `useReport`.
- Produces: `SeriesSection` props `{ variant: Variant }` (region `series`); `KeysSection` (region `provider keys`); `ModelsSection` (region `model ids`).

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/profilesSide.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../../src/renderer/App"
import type { SetupApi } from "../../src/shared/api"
import { fakeApi } from "./fakeApi"

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function openProfiles(api: SetupApi): Promise<void> {
  render(<App api={api} />)
  fireEvent.click(await screen.findByRole("button", { name: "Profiles" }))
}

describe("profiles series keys and models", () => {
  it("renames a series, edits its rules and deletes it after confirming", async () => {
    const api = fakeApi()
    await api.createSeries("pt-pt", "Frieren")
    await openProfiles(api)
    const series = await screen.findByRole("region", { name: "series" })
    fireEvent.click(await within(series).findByRole("button", { name: "Rename Frieren" }))
    fireEvent.change(within(series).getByLabelText("series name"), {
      target: { value: "Sousou no Frieren" },
    })
    fireEvent.click(within(series).getByRole("button", { name: "Save name" }))
    fireEvent.click(await within(series).findByRole("button", { name: "Sousou no Frieren" }))
    fireEvent.change(await within(series).findByLabelText("rule text"), {
      target: { value: "Keep honorifics." },
    })
    fireEvent.click(within(series).getByRole("button", { name: "Add rule" }))
    expect(await within(series).findByText("Keep honorifics.")).toBeTruthy()
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    fireEvent.click(within(series).getByRole("button", { name: "Delete Sousou no Frieren" }))
    expect(confirm).toHaveBeenCalledWith("Delete Sousou no Frieren and its 1 rules?")
    await waitFor(() => {
      expect(within(series).queryByText("Sousou no Frieren")).toBeNull()
    })
  })

  it("keeps a series when the delete is not confirmed", async () => {
    const api = fakeApi()
    await api.createSeries("pt-pt", "Frieren")
    await openProfiles(api)
    const series = await screen.findByRole("region", { name: "series" })
    vi.spyOn(window, "confirm").mockReturnValue(false)
    fireEvent.click(await within(series).findByRole("button", { name: "Delete Frieren" }))
    expect(within(series).getByRole("button", { name: "Frieren" })).toBeTruthy()
  })

  it("replaces and removes a provider key", async () => {
    const api = fakeApi()
    await openProfiles(api)
    const keys = await screen.findByRole("region", { name: "provider keys" })
    fireEvent.click(await within(keys).findByRole("button", { name: "Replace claude key" }))
    fireEvent.change(within(keys).getByLabelText("claude key"), { target: { value: "sk-1" } })
    fireEvent.click(within(keys).getByRole("button", { name: "Save key" }))
    expect(await within(keys).findByText("claude: saved")).toBeTruthy()
    fireEvent.click(within(keys).getByRole("button", { name: "Remove claude key" }))
    expect(await within(keys).findByText("claude: missing")).toBeTruthy()
  })

  it("saves model ids on blur and resets them", async () => {
    await openProfiles(fakeApi())
    const models = await screen.findByRole("region", { name: "model ids" })
    const cheap = await within(models).findByLabelText("claude cheap model")
    fireEvent.change(cheap, { target: { value: "claude-small" } })
    fireEvent.blur(cheap)
    await waitFor(() => {
      expect(cheap instanceof HTMLInputElement && cheap.value).toBe("claude-small")
    })
    fireEvent.click(within(models).getByRole("button", { name: "Reset claude models" }))
    await waitFor(() => {
      expect(cheap instanceof HTMLInputElement && cheap.value).toBe("claude-cheap")
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/renderer/profilesSide.test.tsx`
Expected: FAIL. No "series" region.

- [ ] **Step 3: Implement `SeriesSection`**

Create `src/renderer/components/SeriesSection.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react"
import type { Rule, SeriesSummary, Variant } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { RuleEditor } from "./RuleEditor"
import { RuleList } from "./RuleList"

export function SeriesSection({ variant }: { variant: Variant }): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [series, setSeries] = useState<SeriesSummary[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [rules, setRules] = useState<Rule[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [name, setName] = useState("")

  const refresh = useCallback(async () => {
    const list = await api.listSeries(variant)
    setSeries(list.series)
    if (list.problems.length > 0) {
      report(list.problems.join(" "))
    }
  }, [api, variant, report])

  useEffect(() => {
    refresh().catch((error: unknown) => {
      report(errorMessage(error))
    })
  }, [refresh, report])

  const saveRules = (next: Rule[]): void => {
    if (selected === null) {
      return
    }
    act(async () => {
      await api.saveSeriesRules(variant, selected, next)
      setRules(next)
      await refresh()
    })
  }

  return (
    <section aria-label="series">
      <p>{`series · ${variant}`}</p>
      <ul className="series-list">
        {series.map((item) => (
          <li key={item.id}>
            {renaming === item.id ? (
              <span className="picked">
                <input
                  aria-label="series name"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                  }}
                />
                <button
                  type="button"
                  className="action"
                  onClick={() => {
                    act(async () => {
                      await api.renameSeries(variant, item.id, name)
                      setRenaming(null)
                      await refresh()
                    })
                  }}
                >
                  Save name
                </button>
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    act(async () => {
                      setRules(await api.loadSeriesRules(variant, item.id))
                      setSelected(item.id)
                    })
                  }}
                >
                  {item.name}
                </button>{" "}
                <button
                  type="button"
                  aria-label={`Rename ${item.name}`}
                  onClick={() => {
                    setRenaming(item.id)
                    setName(item.name)
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => {
                    if (
                      !window.confirm(`Delete ${item.name} and its ${String(item.ruleCount)} rules?`)
                    ) {
                      return
                    }
                    act(async () => {
                      await api.deleteSeries(variant, item.id)
                      if (selected === item.id) {
                        setSelected(null)
                        setRules([])
                      }
                      await refresh()
                    })
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {selected === null ? null : (
        <>
          <p>series rules</p>
          <RuleList
            rules={rules}
            onDelete={(index) => {
              saveRules(rules.filter((_, at) => at !== index))
            }}
          />
          <RuleEditor
            onAdd={(rule) => {
              saveRules([...rules, rule])
            }}
          />
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Implement `KeysSection` and `ModelsSection`**

Create `src/renderer/components/KeysSection.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react"
import { PROVIDERS, type ProviderId } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"
import { KeyField } from "./KeyField"

export function KeysSection(): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [saved, setSaved] = useState<Map<ProviderId, boolean>>(new Map())
  const [replacing, setReplacing] = useState<ProviderId | null>(null)

  const refresh = useCallback(async () => {
    const entries = await Promise.all(
      PROVIDERS.map(async (provider) => [provider, await api.hasKey(provider)] as const),
    )
    setSaved(new Map(entries))
  }, [api])

  useEffect(() => {
    refresh().catch((error: unknown) => {
      report(errorMessage(error))
    })
  }, [refresh, report])

  return (
    <section aria-label="provider keys">
      <p>provider keys</p>
      <ul>
        {PROVIDERS.map((provider) => (
          <li key={provider}>
            <span>{`${provider}: ${saved.get(provider) === true ? "saved" : "missing"}`}</span>{" "}
            {replacing === provider ? (
              <KeyField
                provider={provider}
                onSaved={() => {
                  setReplacing(null)
                  act(refresh)
                }}
              />
            ) : (
              <button
                type="button"
                aria-label={`Replace ${provider} key`}
                onClick={() => {
                  setReplacing(provider)
                }}
              >
                Replace
              </button>
            )}
            {saved.get(provider) === true ? (
              <button
                type="button"
                aria-label={`Remove ${provider} key`}
                onClick={() => {
                  act(async () => {
                    await api.removeKey(provider)
                    await refresh()
                  })
                }}
              >
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
```

Create `src/renderer/components/ModelsSection.tsx`:

```tsx
import { useEffect, useState } from "react"
import { PROVIDERS, type ModelPair, type ProviderId } from "../../shared/api"
import { useAction, useReport } from "../action"
import { errorMessage, useApi } from "../api"

export function ModelsSection(): React.JSX.Element {
  const api = useApi()
  const act = useAction()
  const report = useReport()
  const [stored, setStored] = useState<Map<ProviderId, ModelPair>>(new Map())
  const [draft, setDraft] = useState<Map<ProviderId, ModelPair>>(new Map())

  useEffect(() => {
    let current = true
    Promise.all(PROVIDERS.map(async (provider) => [provider, await api.getModels(provider)] as const))
      .then((entries) => {
        if (current) {
          setStored(new Map(entries))
          setDraft(new Map(entries))
        }
      })
      .catch((error: unknown) => {
        if (current) {
          report(errorMessage(error))
        }
      })
    return () => {
      current = false
    }
  }, [api, report])

  const keep = (provider: ProviderId, pair: ModelPair): void => {
    setStored((current) => new Map(current).set(provider, pair))
    setDraft((current) => new Map(current).set(provider, pair))
  }

  return (
    <section aria-label="model ids">
      <p>model ids</p>
      {PROVIDERS.map((provider) => {
        const pair = draft.get(provider)
        if (pair === undefined) {
          return null
        }
        const commit = (): void => {
          const before = stored.get(provider)
          if (before !== undefined && before.cheap === pair.cheap && before.strong === pair.strong) {
            return
          }
          act(async () => {
            try {
              keep(provider, await api.setModels(provider, pair))
            } catch (error) {
              if (before !== undefined) {
                keep(provider, before)
              }
              throw error
            }
          })
        }
        return (
          <div key={provider}>
            <label>
              <span>{`${provider} cheap`}</span>
              <input
                aria-label={`${provider} cheap model`}
                value={pair.cheap}
                onChange={(event) => {
                  setDraft((current) => new Map(current).set(provider, { ...pair, cheap: event.target.value }))
                }}
                onBlur={commit}
              />
            </label>
            <label>
              <span>{`${provider} strong`}</span>
              <input
                aria-label={`${provider} strong model`}
                value={pair.strong}
                onChange={(event) => {
                  setDraft((current) => new Map(current).set(provider, { ...pair, strong: event.target.value }))
                }}
                onBlur={commit}
              />
            </label>
            <button
              type="button"
              aria-label={`Reset ${provider} models`}
              onClick={() => {
                act(async () => {
                  keep(provider, await api.resetModels(provider))
                })
              }}
            >
              Reset to defaults
            </button>
          </div>
        )
      })}
    </section>
  )
}
```

- [ ] **Step 5: Fill the right column**

In `src/renderer/screens/ProfilesScreen.tsx`, import the three sections and replace `<div className="decision" />` with:

```tsx
        <div className="decision">
          <SeriesSection key={props.variant} variant={props.variant} />
          <KeysSection />
          <ModelsSection />
        </div>
```

```tsx
import { KeysSection } from "../components/KeysSection"
import { ModelsSection } from "../components/ModelsSection"
import { SeriesSection } from "../components/SeriesSection"
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/renderer && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npm run format
git add src/renderer tests/renderer
git commit -m "feat: manage series keys and model ids on the profiles screen"
```

---

### Task 13: Verify the whole app

**Files:** none changed unless a check fails.

- [ ] **Step 1: Run every check from a clean build**

```bash
rm -rf dist
npm run typecheck && npm run lint && npm run format:check && npm test && npm run build
```

Expected: all pass. `dist/` holds `main.js`, `preload.cjs`, `renderer/index.html`, `renderer/main.js`, `renderer/styles.css`.

- [ ] **Step 2: Check the bundle for leaks**

```bash
grep -c "ass-compiler" dist/renderer/main.js || true
grep -c "sk-" dist/renderer/main.js || true
```

Expected: `0` for both.

- [ ] **Step 3: Launch the app and walk the flow**

Run: `npm start`

Walk through, with a real `.ass` file:
1. Choose script… → a file dialog filtered to `.ass` opens; the name shows.
2. Series → New series… → "Frieren" → Create; it is selected.
3. Provider without a key → the key field shows; save a key; it hides.
4. Choose video… → frame setting enables; ✕ disables it again.
5. Profiles → add a base rule and a glossary rule; set characters per second to 99 (refused) and 20 (kept); import an example and confirm its styles.
6. Rename and delete a series; replace and remove a key; change and reset a model id.
7. Quit and relaunch. The series, rules, examples, limit, key status and model ids are still there.

If a step fails, fix it in the task that owns the code, with a test that reproduces it, before moving on.

- [ ] **Step 4: Commit any fixes**

```bash
npm run format
git add -A src tests
git commit -m "fix: <what the walk-through found>"
```

Skip this step if nothing changed.
