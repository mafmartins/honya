# Honya Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Honya's Start / Profiles / Translate screens with a widescreen workspace: a left menu, a line-by-line session editor where the AI fills only what's missing, language styles that projects inherit, settings, session stats in euros, first-time setup and a launch window.

**Architecture:** Three stages, each leaving the app working. Stage 1 adds pure core logic (session model v3, inheritance, engine subset runs, rule drafting, key test) with tests and no UI change. Stage 2 adds main-process services and a new `WorkspaceApi` over IPC **alongside** the old API. Stage 3 builds the new renderer, switches the app to it, then deletes the old screens, old IPC and old session runner.

**Tech Stack:** Electron 41, React 19, TypeScript (strict), esbuild, Vitest + Testing Library (jsdom). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-17-honya-workspace-redesign-design.md`

## Global Constraints

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. No `any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error`, trailing `!`, or `eslint-disable` for a TypeScript rule.
- No new dependencies (the line list windowing is hand-written).
- Commits: single line `type: subject`, lowercase imperative, no body, no trailers. One commit per task, on `main`, pushed.
- Tests call core modules directly or render components with a fake API; never a live provider, never a window.
- Internal names stay `BaseProfile` (= language style) and `SeriesProfile` (= project); the UI says "PT-PT style", "PT-BR style", "project".
- CSS variables are named after the Figma variables of file `C7ZYwFTNa1Wxvj20b6EHe8`: `--color-bg-page #f3efe6`, `--color-bg-surface #faf7f2`, `--color-bg-hover #f3efe6`, `--color-fill-accent #e36b1e`, `--color-text-primary #2a2420`, `--color-text-accent #e36b1e`, `--color-border-default #2a2420`, `--color-border-accent #e36b1e`, `--color-icon-default #2a2420`, `--color-shadow #2a2420`, `--space-6/8/10/14/16/20/28/32`, `--border-width 1.5px`, `--border-accent-width 3px`, `--shadow-stamp 7px 7px 0`, `--shadow-stamp-small 3px 3px 0`. Font stack: `"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif`.
- Character budget: `charLimit` in `src/core/ass/fit.ts` (reading speed, or English length + 20% or + 5 characters).
- Exported notes: `{note: reason}` after the words, outside the tags; open flags only.
- Manual lines are never changed by the AI except through "Ask AI again" on that line.
- Costs: dollars from `costOf` (`src/core/providers/prices.ts`), shown in euros with the Settings rate; label them estimates.
- Every visible element aligns to the spacing scale above; layouts use grid/flex with `gap`, never ad-hoc margins.

## Review Focus

1. **Editing a line while an AI batch containing it is in flight** — the translator's text must survive; AI results apply only to lines still untranslated when the batch returns. (Test in Task 4 and Task 9.)
2. **The script file changes or disappears on disk after loading** — the session keeps working from its stored copy; export still works. (Test in Task 8.)
3. **Exporting onto the source script's path** — refused with a clear message; the source is never overwritten. (Test in Task 10.)
4. **A corrupt or unknown session file during migration** — skipped and reported, others migrate, originals kept. (Test in Task 3.)
5. **Key test with no network or a rejected key** — a plain message, no crash, setup stays on step 1. (Test in Task 6.)

---

## Stage 1 — Core logic (no UI change)

### Task 1: Project settings and inheritance in the style card

**Files:**
- Modify: `src/core/library/types.ts`, `src/core/library/guards.ts`, `src/core/library/card.ts`
- Test: `tests/library/card.test.ts`, `tests/library/guards.test.ts`

**Interfaces:**
- Produces:
  - `type FrameSetting = "none" | "marked" | "every"` exported from `src/core/library/types.ts`.
  - `SeriesProfile` gains optional `cpsLimit?: number`, `preset?: Preset`, `frameSetting?: FrameSetting`.
  - `compileCard(base, series)`: `cpsLimit = series.cpsLimit ?? base.cpsLimit`; rules = base rules then series rules, except a base glossary rule is dropped when the series has a glossary rule with the same `source` (case-insensitive).
  - `projectPreset(series: SeriesProfile, fallback: Preset): Preset` and `projectFrames(series: SeriesProfile, fallback: FrameSetting): FrameSetting` in `card.ts`.

- [ ] **Step 1: Write failing tests**
  - `card.test.ts › "a project's glossary entry wins over the style's for the same term"`: base rules `[{glossary Hashira→Hashira}, {prose "Use tu."}]`, series `[{glossary hashira→Pilar}]` → card rules `[{prose "Use tu."}, {glossary hashira→Pilar}]`.
  - `"a project's characters per second overrides the style's"`: base 17, series 20 → 20; series unset → 17.
  - `guards.test.ts › "reads project settings and ignores invalid ones"`: `{…, cpsLimit: 20, preset: "best", frameSetting: "marked"}` round-trips; `cpsLimit: 0`, `preset: "x"` → those fields dropped, profile still read.
- [ ] **Step 2: Run** `npx vitest run tests/library` — expect the new tests to fail.
- [ ] **Step 3: Implement** the type fields, guard reading (cps whole number 1–60), `compileCard` merge and the two helpers.
- [ ] **Step 4: Run** `npx vitest run tests/library && npx tsc --noEmit` — pass.
- [ ] **Step 5: Commit** `feat: let projects override the language style's settings`

### Task 2: Session model v3 and line operations

**Files:**
- Create: `src/core/session/types.ts`, `src/core/session/lines.ts`, `src/core/session/stats.ts`
- Test: `tests/session/lines.test.ts`, `tests/session/stats.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type LineOrigin = "ai" | "manual"
  export type Resolution = "accepted" | "edited" | "retranslated"
  export interface SessionLine {
    index: number            // dialogue event index from readAss
    words: string | null     // Portuguese without the note; null = untranslated
    origin: LineOrigin | null
    flag: string | null      // open flag reason (Portuguese), null = none
    resolution: Resolution | null
    aiDraft: string | null   // last AI text, kept for corrections
    strong: boolean          // last AI text came from the strong model
    retranslated: number     // times "Ask AI again" was used
  }
  export interface LineEdit { index: number; en: string; draft: string | null; final: string }
  export interface SessionBrief { summary: string; hardIds: string[]; frameIds: string[] }
  export interface WorkSession {
    version: 3; id: string; projectId: string; variant: Variant
    createdAt: string; updatedAt: string
    scriptPath: string; scriptName: string; scriptText: string; dialogueStyles: string[]
    videoPath: string | null
    provider: ProviderId; preset: Preset; frameSetting: FrameSetting
    brief: SessionBrief | null; glossary: { source: string; pt: string }[]
    lines: SessionLine[]; edits: LineEdit[]
    spend: ModelSpend[]; activeMs: number; framesGrabbed: number
    exportedAt: string | null; finishedOverride: boolean | null
  }
  ```
- Produces (`lines.ts`), all pure, returning a new session:
  - `emptyLines(cues: readonly DialogueCue[]): SessionLine[]`
  - `editLine(session, index: number, words: string): WorkSession` — trimmed empty → untranslated (`words/origin/flag = null`); otherwise `origin "manual"`, flag cleared with `resolution "edited"` if one was open; appends/replaces `LineEdit` for that index with `draft = aiDraft`.
  - `acceptLine(session, index): WorkSession` — clears flag, `resolution "accepted"`.
  - `applyAiLines(session, results: readonly AiLine[]): WorkSession` where `AiLine = { index: number; words: string; flag: string | null; strong: boolean }` — **skips any line whose `origin` is `"manual"` or whose `words` is not null** (Review Focus 1).
  - `applyRetranslation(session, line: AiLine): WorkSession` — always applies (explicit request); `origin "ai"`, `retranslated + 1`; if the old line had a flag and the new has none → `resolution "retranslated"`.
  - `untranslatedIndexes(session): number[]`
  - `isFinished(session): boolean` — `finishedOverride ?? (exportedAt !== null && every line has words && no open flags)`.
- Produces (`stats.ts`): `sessionStats(session: WorkSession): SessionStats` with `{ lines: { ai, manual, untranslated, total }, flags: { open, accepted, edited, retranslated }, strongLines, retranslatedLines, cost: Cost, activeMs, framesGrabbed }` (`Cost` from `prices.ts`).

- [ ] **Step 1: Write failing tests** in `lines.test.ts`:
  - `"editing makes a line manual, resolves its flag and records the correction"` — line with aiDraft "Droga!", flag "forma brasileira" → edit "Raios!": origin manual, flag null, resolution edited, edits `[{index, en, draft "Droga!", final "Raios!"}]`; editing again replaces that edit.
  - `"clearing a line makes it untranslated"`.
  - `"AI results never overwrite a manual or already translated line"` — lines 1 manual "Olá", 2 untranslated; apply AI for 1 and 2 → line 1 still "Olá"/manual, line 2 AI.
  - `"asking again resolves a flag when the new text is clean"`.
  - `"a session is finished once exported with everything translated and no open flags, unless overridden"`.
  - `stats.test.ts › "counts lines, flags and cost"` with a fixture session (spend on `gemini-3.8-flash`).
- [ ] **Step 2: Run** `npx vitest run tests/session` — fail.
- [ ] **Step 3: Implement** `types.ts`, `lines.ts`, `stats.ts`.
- [ ] **Step 4: Run** `npx vitest run tests/session && npx tsc --noEmit` — pass.
- [ ] **Step 5: Commit** `feat: add the line-by-line session model`

### Task 3: Migrate old sessions to v3

**Files:**
- Create: `src/core/session/migrate.ts`
- Test: `tests/session/migrate.test.ts`

**Interfaces:**
- Consumes: `TranslateSession` shape (v2) from `src/main/translate/session.ts` — read it as `unknown` with guards, do not import main code into core.
- Produces: `migrateV2(value: unknown): WorkSession | string` — string is the reason it couldn't be migrated. Mapping: `seriesId → projectId`; each `saved.results` entry → line `words` = text without `{note: …}`, `origin "ai"`, `flag` = note text unless the event is in `review.accepted`; `review.edits` → `origin "manual"` with a `LineEdit`; `phase "done"` → `exportedAt = startedAt`; `brief/hardIds/frameIds/glossary/spend/elapsedMs` carried over (`activeMs = elapsedMs`); `provider/preset/frameSetting/videoPath` carried.

- [ ] **Step 1: Write failing tests**: `"maps a reviewed v2 session to lines"` (fixture with one accepted flag, one edit, one untranslated line); `"refuses a file that isn't a v2 session and says why"` (`{}` → `"not a version 2 session"`; `version: 2` without `saved` → reason mentions saved) — Review Focus 4.
- [ ] **Step 2: Run** `npx vitest run tests/session/migrate.test.ts` — fail.
- [ ] **Step 3: Implement** `migrateV2`.
- [ ] **Step 4: Run** — pass; `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat: migrate old sessions to the line model`

### Task 4: Engine translates only missing lines, with manual lines as context

**Files:**
- Modify: `src/core/pipeline/run.ts`, `src/core/pipeline/prompts.ts`
- Test: `tests/pipeline/missing.test.ts`, `tests/pipeline/prompts.test.ts`

**Interfaces:**
- Consumes: `translateChunk` internals already in `run.ts` (cheap pass, missing retry, checks/fix request, escalation, `finishLine`).
- Produces in `run.ts`:
  ```ts
  export interface MissingInput {
    ass: string; dialogueStyles: ReadonlySet<string>; card: StyleCard; preset: Preset
    complete: Completer; sleep: (ms: number) => Promise<void>
    frameSetting: FrameSetting; frames?: FrameProvider
    known: ReadonlyMap<number, string>   // lines that already have Portuguese (manual or AI)
    manual: ReadonlySet<number>          // which of `known` the translator wrote
    brief: SessionBrief | null; glossary: { source: string; pt: string }[]
    shouldStop: () => boolean
    onBrief?: (brief: SessionBrief, glossary: { source: string; pt: string }[]) => void
    onBatch: (event: { index: number; total: number; lines: AiLine[]; glossary: { source: string; pt: string }[] }) => void
    onEvent?: (event: RunEvent) => void
  }
  export async function translateMissing(input: MissingInput): Promise<"done" | "stopped">
  ```
  - Requests the brief only when `brief === null` (and calls `onBrief`).
  - Batches = untranslated cues in script order, 25 per batch (`chunkDialogue`).
  - `previous` context = up to 3 nearest earlier lines with Portuguese (from `known` or this run's results).
  - Each batch prompt also lists manual lines whose index falls between the batch's first and last cue as "already translated by the translator".
  - `AiLine.words` excludes the note; `AiLine.flag` = the note reason or null; `strong` = answered by the strong model.
  - Checks `shouldStop()` between batches.
- Produces in `prompts.ts`: `batchPrompt(cues, glossary, previous, cpsLimit, fixed?: readonly { english: string; pt: string }[])` adds a section `"Already translated by the translator (keep these, context only):\n" + "English => Portuguese"` lines before the lines to translate. The translator system prompt gains: `"terms may include names and terms taken from the translator's lines."`

- [ ] **Step 1: Write failing tests** in `missing.test.ts` (use `tests/support/fakeModel.ts`):
  - `"translates only lines without Portuguese"` — 30 lines, known {0..9}, manual {0..4} → requested ids are 10..29 only; batches 1 (10–29 is 20 lines → one batch).
  - `"shows the translator's lines inside the batch range as context"` — known manual {12}, untranslated 10..14 → prompt contains `"Already translated by the translator"` and line 12's English, and 12 is not requested.
  - `"skips the brief when the session already has one"`.
  - `"stops between batches"` — `shouldStop` true after first `onBatch` → returns "stopped", one batch delivered.
  - `prompts.test.ts › "lists the translator's lines as context"`.
- [ ] **Step 2: Run** `npx vitest run tests/pipeline` — new tests fail.
- [ ] **Step 3: Implement** `translateMissing` by extracting the per-chunk logic into a shared function used by both `runTranslation` and `translateMissing`.
- [ ] **Step 4: Run** `npx vitest run tests/pipeline && npx tsc --noEmit` — pass (old `runTranslation` tests still pass).
- [ ] **Step 5: Commit** `feat: translate only missing lines with the translator's as context`

### Task 5: Retranslate one line with a hint

**Files:**
- Modify: `src/core/pipeline/run.ts`, `src/core/pipeline/prompts.ts`
- Test: `tests/pipeline/retranslate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function retranslateLine(input: {
    ass: string; dialogueStyles: ReadonlySet<string>; card: StyleCard
    complete: Completer; index: number; hint: string
    known: ReadonlyMap<number, string>; brief: SessionBrief | null
    glossary: { source: string; pt: string }[]; image?: Uint8Array
  }): Promise<AiLine | null>   // null = no usable answer
  ```
  Strong tier, `LINES_SCHEMA`, prompt `retranslatePrompt(cue, context, current, hint, glossary, cpsLimit)` with the 3 lines before and after (English => Portuguese where known), the current Portuguese, and `"The translator asks: <hint>"` when the hint isn't empty. The answer goes through the same checks (`lineProblems`, `finishLine`) so it can come back flagged.
- [ ] **Step 1: Write failing tests**: `"asks the strong model for one line with its neighbours and the hint"`; `"comes back flagged when the new text has a Brazilian form"`; `"returns null when the model gives nothing usable"`.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/pipeline/retranslate.test.ts && npx tsc --noEmit` — pass.
- [ ] **Step 5: Commit** `feat: retranslate a single line on request`

### Task 6: Key test, model catalogue, rule drafting and export suggestions

**Files:**
- Create: `src/core/providers/keyTest.ts`, `src/core/providers/catalog.ts`, `src/core/library/suggest.ts`
- Modify: `src/core/providers/prices.ts`
- Test: `tests/providers/keyTest.test.ts`, `tests/providers/catalog.test.ts`, `tests/library/suggest.test.ts`, `tests/providers/prices.test.ts`

**Interfaces:**
- `testKey(provider: ProviderId, apiKey: string, fetchImpl: typeof fetch, model: string): Promise<{ ok: true } | { ok: false; message: string }>` — one `completeText` request, prompt `"Reply with OK."`, `effort "low"`, `timeoutMs 20000`. `ProviderError` → its `message`; other errors → `"Couldn't reach <Provider>. Check your connection."` (Review Focus 5).
- `modelOptions(provider: ProviderId): { cheap: ModelOption[]; strong: ModelOption[] }` with `ModelOption = { id: string; label: string; recommended: boolean }`; recommended = `defaultModels(provider)`; include at least one alternative per tier (Claude: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`; GPT: `gpt-6-luna`, `gpt-6.1-sol`; Gemini: `gemini-3.8-flash`, `gemini-3.5-flash-lite`, `gemini-4-argon`; Mistral: `mistral-small-latest`, `mistral-large-latest`).
- `toEuros(usd: number, rate: number): number` in `prices.ts` (rounded to 4 decimals); `DEFAULT_EUR_RATE = 0.86`.
- `suggest.ts`:
  - `draftRuleRequest(line: { en: string; before: string | null; after: string }, known: readonly Rule[]): { system: string; prompt: string; schema: ReplySchema }` and `readDraftedRule(value: unknown): Rule | null` — schema `{ kind: "prose"|"glossary", text, source, pt }` (all required; unused fields "").
  - `suggestionsRequest(edits: readonly LineEdit[], known: readonly Rule[]): { system; prompt; schema }` and `readSuggestions(value: unknown, known: readonly Rule[]): { rule: Rule; lines: number[] }[]` — schema `{ suggestions: [{ kind, text, source, pt, lines: integer[] }] }`; drops rules already known; at most 8.
- [ ] **Step 1: Write failing tests**: key test ok / rejected key (401 → "Gemini rejected the key…") / network failure message; catalogue: every provider has at least one option per tier and exactly one recommended per tier, equal to `defaultModels(provider)`; `toEuros(0.0708, 0.86) === 0.0609`; suggestions drop known rules and read glossary vs prose; drafted rule reads both kinds and rejects empty.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/providers tests/library && npx tsc --noEmit` — pass.
- [ ] **Step 5: Commit** `feat: add key testing, model options and rule suggestions`

## Stage 2 — Main-process services and the new API (old UI keeps working)

### Task 7: Settings store and project service

**Files:**
- Create: `src/main/settingsStore.ts`, `src/main/workspace/projects.ts`
- Test: `tests/main/settingsStore.test.ts`, `tests/main/workspace/projects.test.ts`

**Interfaces:**
- `settingsStore.ts`:
  ```ts
  export interface AppSettings {
    setupDone: boolean; defaultProvider: ProviderId
    defaults: { variant: Variant; preset: Preset; frameSetting: FrameSetting }
    eurRate: number
  }
  export function createSettingsStore(file: TextFile): { get(): AppSettings; update(patch: Partial<AppSettings>): AppSettings }
  ```
  Defaults: `{ setupDone: false, defaultProvider: "claude", defaults: { variant: "pt-pt", preset: "save", frameSetting: "none" }, eurRate: DEFAULT_EUR_RATE }`. `setupDone` is treated as true when any provider key already exists (existing users skip setup) — computed by the caller (Task 11).
- `projects.ts` (wraps `FileProfileStore`):
  ```ts
  export type Owner = { kind: "style"; variant: Variant } | { kind: "project"; id: string }
  export interface ProjectSummary { id: string; name: string; variant: Variant; sessions: number; lastActivity: string | null }
  export interface RulesView { own: Rule[]; inherited: Rule[] }   // inherited empty for styles
  export interface ProjectView { summary: ProjectSummary; rules: RulesView; cpsLimit: number | null; styleCps: number; preset: Preset; frameSetting: FrameSetting; references: ExampleScript[] /* style refs only for styles */; languageLocked: boolean }
  export interface StyleView { variant: Variant; rules: Rule[]; cpsLimit: number; references: ExampleScript[]; usedBy: string[] }
  export function createProjectService(store: FileProfileStore, sessionsFor: (projectId: string) => { count: number; last: string | null }, settings: () => AppSettings): {
    listProjects(): ProjectSummary[]; getProject(id: string): ProjectView; getStyle(variant: Variant): StyleView
    createProject(name: string, variant: Variant): ProjectSummary
    updateProject(id: string, patch: { name?: string; cpsLimit?: number | null; preset?: Preset; frameSetting?: FrameSetting; variant?: Variant }): ProjectView
    deleteProject(id: string): void
    updateStyle(variant: Variant, patch: { cpsLimit?: number }): StyleView
    saveRules(owner: Owner, rules: Rule[]): void
    addRule(owner: Owner, rule: Rule): void
    addReference(owner: Owner, name: string, text: string, dialogueStyles: string[]): void
    knownRules(owner: Owner): Rule[]   // own + inherited
  }
  ```
  Projects are searched across both variants (ids are unique). `updateProject` with `variant` throws `"The language can't change once the project has sessions."` when sessions > 0. Project references live on the series profile as `examples` (add `examples?: ExampleScript[]` to `SeriesProfile` and its guard in this task).
- [ ] **Step 1: Write failing tests**: settings defaults and partial update; create/list/rename/delete project; inherited rules shown separately; language locked with sessions; `addRule` to style vs project; project references stored.
- [ ] **Step 2: Run** `npx vitest run tests/main` — fail. **Step 3: Implement.** **Step 4: Run** — pass, `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat: add settings and project services`

### Task 8: Session store v3 with migration and editing service

**Files:**
- Create: `src/main/workspace/sessions.ts`
- Test: `tests/main/workspace/sessions.test.ts`

**Interfaces:**
- ```ts
  export interface SessionSummary { id: string; projectId: string; projectName: string; scriptName: string; translated: number; total: number; openFlags: number; updatedAt: string; finished: boolean }
  export interface LineView { index: number; start: number; speaker: string; english: string; words: string | null; origin: LineOrigin | null; flag: string | null; budget: number }
  export interface SessionView { id: string; projectId: string; projectName: string; variant: Variant; scriptName: string | null; videoName: string | null; provider: ProviderId; preset: Preset; lines: LineView[]; needsStyles: ListedStyle[] | null; stats: SessionStats; finished: boolean }
  export function createWorkSessions(dir: string, deps: { now(): number; newId(): string; projectName(id: string): string; card(projectId: string): StyleCard; readScript(path: string): string; settings(): AppSettings; project(id: string): { preset: Preset; frameSetting: FrameSetting; variant: Variant } }): {
    migrate(): { migrated: number; skipped: string[] }   // v2 files → v3, keeps originals as <id>.v2.json
    create(projectId: string): string
    loadScript(id: string, path: string): SessionView     // reads once, stores scriptText; needsStyles when ambiguous
    confirmStyles(id: string, dialogueStyles: string[]): SessionView
    view(id: string): SessionView
    get(id: string): WorkSession; save(session: WorkSession): void
    edit(id: string, index: number, words: string): LineView
    accept(id: string, index: number): LineView
    setOptions(id: string, patch: { provider?: ProviderId; preset?: Preset }): SessionView
    attachVideo(id: string, path: string | null): SessionView
    setFinished(id: string, value: boolean | null): SessionSummary
    remove(id: string): void
    list(): SessionSummary[]; recent(limit: number): SessionSummary[]; latestUnfinished(): SessionSummary | null
    countFor(projectId: string): { count: number; last: string | null }
  }
  ```
  Saving writes immediately (temp file + rename, as today) and stamps `updatedAt`. Frames stay in `<dir>/<id>/frames/`.
- [ ] **Step 1: Write failing tests**: create → loadScript (styles auto-confirmed when all classified) → edit/accept round-trip through disk; `"keeps working after the script file is deleted"` — delete the source file after loadScript, `view` and `edit` still work (Review Focus 2); migration converts a v2 file and skips a corrupt one with a reason, original kept (Review Focus 4); recent/latestUnfinished ordering by `updatedAt`.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/main/workspace && npx tsc --noEmit` — pass.
- [ ] **Step 5: Commit** `feat: store sessions line by line and migrate old ones`

### Task 9: AI run service: translate missing lines, retranslate, draft rules, frames

**Files:**
- Create: `src/main/workspace/ai.ts`
- Test: `tests/main/workspace/ai.test.ts`

**Interfaces:**
- ```ts
  export type WorkspaceEvent =
    | { type: "run-progress"; sessionId: string; index: number; total: number; linesDone: number; lineTotal: number; activity: string }
    | { type: "lines"; sessionId: string; lines: LineView[] }
    | { type: "run-ended"; sessionId: string; outcome: "done" | "stopped" | "failed"; message: string | null }
  export function createAiService(deps: { sessions: ReturnType<typeof createWorkSessions>; completerFor(provider: ProviderId, onRetry: (ms: number, e: ProviderError) => void): Completer; grabFrame(videoPath: string, cue: DialogueCue): Promise<Uint8Array | null>; emit(e: WorkspaceEvent): void; knownRules(projectId: string): Rule[] }): {
    run(sessionId: string): Promise<void>      // one run at a time; throws "Honya is already translating." if busy
    stop(): void; activeId(): string | null; idle(): Promise<void>
    retranslate(sessionId: string, index: number, hint: string): Promise<LineView>
    draftRule(sessionId: string, index: number): Promise<Rule>
    frame(sessionId: string, index: number): Promise<string | null>   // data:image/png;base64 URL, cached on disk
  }
  ```
  Spend from every request (`reply.spent`) is added to the session (`addSpend`). `run` applies each batch with `applyAiLines` on the **freshly loaded** session (so edits made during the run win), saves, emits `lines` and `run-progress`; stores brief and glossary via `onBrief`/`onBatch`.
- [ ] **Step 1: Write failing tests** with a fake completer: `"translates only untranslated lines and saves after each batch"`; `"an edit made during the run survives the batch that contained the line"` — completer edits line 3 through `sessions.edit` before returning the batch → line 3 stays manual (Review Focus 1); `"stop keeps finished batches"`; `"refuses a second run"`; retranslate applies to a manual line and adds spend; frame returns a data URL and caches.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/main/workspace && npx tsc --noEmit` — pass.
- [ ] **Step 5: Commit** `feat: run the AI on missing lines and single lines`

### Task 10: Export service

**Files:**
- Create: `src/main/workspace/export.ts`, `src/core/session/exportFile.ts`
- Test: `tests/session/exportFile.test.ts`, `tests/main/workspace/export.test.ts`

**Interfaces:**
- `exportWords(session: WorkSession): Map<number, string>` (core) — words for translated lines, `appendNote(words, flag)` for open flags; untranslated lines omitted (writer keeps English).
- ```ts
  export interface ExportPreview { translated: number; english: number; openFlags: number; defaultPath: string; suggestions: { rule: Rule; lines: number[] }[] }
  export function createExportService(deps: { sessions; completerFor(provider: ProviderId): Completer; knownRules(projectId: string): Rule[]; addCorrections(projectId: string, c: Correction[]): void; addRule(owner: Owner, rule: Rule): void; writeFile(path: string, text: string): void; now(): number }): {
    preview(sessionId: string): Promise<ExportPreview>   // one cheap request only when the session has edits
    write(sessionId: string, path: string, rules: { owner: Owner; rule: Rule }[]): { path: string; report: string[] }
  }
  ```
  `write` refuses `path === session.scriptPath` with `"Choose a different name: Honya never overwrites the original script."` (Review Focus 3), saves kept rules, writes corrections from edits that have a `draft`, sets `exportedAt`, saves.
- [ ] **Step 1: Write failing tests**: open flag written as note, accepted line clean, untranslated keeps English; preview counts and skips the request without edits; write refuses the source path; corrections and rules saved; `exportedAt` set.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/session tests/main/workspace && npx tsc --noEmit` — pass.
- [ ] **Step 5: Commit** `feat: export sessions with rule suggestions from edits`

### Task 11: Workspace API over IPC

**Files:**
- Create: `src/main/ipc/workspace.ts`
- Modify: `src/shared/api.ts`, `src/preload/preload.ts`, `src/preload/readers.ts`, `src/main/main.ts`, `tests/renderer/fakeApi.ts`
- Test: `tests/preload/workspaceReaders.test.ts`

**Interfaces:**
- Add `WorkspaceApi` to `src/shared/api.ts` and extend `HonyaApi = SetupApi & TranslateApi & WorkspaceApi`:
  ```ts
  getSettings(): Promise<AppSettings>; updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>
  testKey(provider: ProviderId, key: string): Promise<{ ok: true } | { ok: false; message: string }>
  modelOptions(provider: ProviderId): Promise<{ cheap: ModelOption[]; strong: ModelOption[] }>
  revealLog(): Promise<void>
  listProjects(): Promise<ProjectSummary[]>; getProject(id: string): Promise<ProjectView>; getStyle(variant: Variant): Promise<StyleView>
  createProject(name: string, variant: Variant): Promise<ProjectSummary>
  updateProject(id: string, patch: ProjectPatch): Promise<ProjectView>; deleteProject(id: string): Promise<void>
  updateStyle(variant: Variant, patch: { cpsLimit?: number }): Promise<StyleView>
  saveRules(owner: Owner, rules: Rule[]): Promise<void>; addRule(owner: Owner, rule: Rule): Promise<void>
  addReference(owner: Owner, name: string, text: string, dialogueStyles: string[]): Promise<void>
  launchInfo(): Promise<{ setupDone: boolean; continueSession: SessionSummary | null; projects: ProjectSummary[] }>
  recentSessions(): Promise<SessionSummary[]>; projectSessions(projectId: string): Promise<SessionSummary[]>
  newSession(projectId: string): Promise<string>; openSession(id: string): Promise<SessionView>
  pickScriptForSession(id: string): Promise<SessionView | null>; confirmStyles(id: string, styles: string[]): Promise<SessionView>
  editLine(id: string, index: number, words: string): Promise<LineView>; acceptLine(id: string, index: number): Promise<LineView>
  setSessionOptions(id: string, patch: { provider?: ProviderId; preset?: Preset }): Promise<SessionView>
  pickVideoForSession(id: string): Promise<SessionView | null>; detachVideo(id: string): Promise<SessionView>
  setFinished(id: string, value: boolean | null): Promise<SessionSummary>
  runAi(id: string): Promise<void>; stopAi(): Promise<void>; aiActive(): Promise<string | null>
  retranslate(id: string, index: number, hint: string): Promise<LineView>
  draftRule(id: string, index: number): Promise<Rule>
  lineFrame(id: string, index: number): Promise<string | null>
  exportPreview(id: string): Promise<ExportPreview>
  pickExportPath(defaultPath: string): Promise<string | null>
  exportWrite(id: string, path: string, rules: { owner: Owner; rule: Rule }[]): Promise<{ path: string }>
  revealPath(path: string): Promise<void>
  sessionStats(id: string): Promise<SessionStats>
  onWorkspaceEvent(listener: (event: WorkspaceEvent) => void): () => void
  ```
  Channels `honya:ws-<kebab-name>`; every argument validated in main (session id regex, line index whole number, owner shape, rules via `isRuleList`), every reply validated by a preload reader. `main.ts` wires the services, runs `sessions.migrate()` at boot, computes `setupDone` as `settings.setupDone || any key exists`, and stops a running AI before quit. The old API keeps working.
  `tests/renderer/fakeApi.ts` gains an in-memory implementation of every new method (projects, sessions with lines, AI run that fills lines, export) for the renderer tests in Stage 3.
- [ ] **Step 1: Write failing tests**: readers accept valid `SessionView`, `ProjectView`, `ExportPreview`, `WorkspaceEvent`s and reject malformed ones.
- [ ] **Step 2: Run** — fail. **Step 3: Implement** (API types, IPC handlers, preload, readers, main wiring, fake API).
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint && npm run build` — pass.
- [ ] **Step 5: Commit** `feat: expose the workspace over ipc`

## Stage 3 — The new interface

### Task 12: Window, tokens and the shell with the left menu

**Files:**
- Create: `src/renderer/workspace/Shell.tsx`, `src/renderer/workspace/Menu.tsx`, `src/renderer/workspace/route.ts`
- Modify: `src/renderer/styles.css` (new token layer + workspace styles; old classes stay until Task 19), `src/renderer/main.tsx`, `src/main/main.ts`
- Test: `tests/renderer/shell.test.tsx`

**Interfaces:**
- `type Route = { page: "session"; sessionId: string | null } | { page: "stats" } | { page: "projects" } | { page: "project"; id: string } | { page: "style"; variant: Variant } | { page: "settings" }` in `route.ts`.
- `Shell({ api }: { api: HonyaApi })` owns `route`, the current project id and the open session id; renders `Menu` + the page for the route; provides `ApiContext`/`ErrorContext`.
- `Menu` props: `{ route, projectId, sessionId, onNavigate(route), onSwitchProject(id) }`; sections in spec order; "This session" box from `sessionStats` (euros via settings rate).
- Window: `show: false`, `minWidth: 1200`, `minHeight: 760`, `maximize()` then `show()`.
- `main.tsx` renders `Shell` (the old `App` stays importable until Task 19).
- Layout: CSS grid `grid-template-columns: 248px minmax(0, 1fr)`, full viewport height, each page scrolls inside its own area.
- [ ] **Step 1: Write failing test** `"shows the menu and switches pages"` — renders Shell with fakeApi, menu shows the project switcher, Session, Session stats, Projects, PT-PT style, PT-BR style, Settings; clicking Settings shows the settings page heading.
- [ ] **Step 2: Run** `npx vitest run tests/renderer/shell.test.tsx` — fail. **Step 3: Implement.** **Step 4: Run** — pass; `npm run build`.
- [ ] **Step 5: Commit** `feat: add the workspace shell and left menu`

### Task 13: First-time setup and launch window

**Files:**
- Create: `src/renderer/workspace/SetupDialog.tsx`, `src/renderer/workspace/LaunchDialog.tsx`, `src/renderer/workspace/Dialog.tsx`
- Modify: `src/renderer/workspace/Shell.tsx`
- Test: `tests/renderer/setup.test.tsx`, `tests/renderer/launch.test.tsx`

**Interfaces:**
- `Dialog({ title, children, onClose? })` — centred card with stamp shadow over a dimmed backdrop; Esc closes when `onClose` given; focus moves into it.
- `SetupDialog({ onDone })`: step 1 provider + key + **Test the key** (`testKey`; Continue disabled until ok; failure shows the message); saving calls `setKey`, `updateSettings({ defaultProvider })`; step 2 language, preset ("Save — cheapest", "Balanced", "Best — highest quality"), frames; Finish → `updateSettings({ defaults, setupDone: true })`.
- `LaunchDialog({ info, onContinue(id), onOpenProject(id), onNewSession(projectId), onCreateProject(name, variant), onClose })`.
- Shell on boot: `launchInfo()` → setup if `!setupDone`, then launch window.
- [ ] **Step 1: Write failing tests**: setup can't continue until the key test passes; a failed test shows the provider message (Review Focus 5); finishing saves settings; launch shows Continue with progress, opens a project, creates a project and lands on its empty session.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/renderer` — pass.
- [ ] **Step 5: Commit** `feat: add first-time setup and the launch window`

### Task 14: Session page: loading, top bar, filters and the line list

**Files:**
- Create: `src/renderer/workspace/session/SessionPage.tsx`, `TopBar.tsx`, `LineList.tsx`, `Filters.tsx`, `useSession.ts`
- Test: `tests/renderer/session.test.tsx`

**Interfaces:**
- `useSession(api, id)` → `{ view, setLine(line: LineView), reload() }`; subscribes to `onWorkspaceEvent` `lines` for this session.
- Empty state: large **Load script** button (`pickScriptForSession`), drop target for `.ass` (reads `file.path` via the existing picker flow — drop just triggers the picker if a path isn't available; builder's call), style check via `StyleChecklist` when `needsStyles`.
- `TopBar`: script · project · language; provider and preset selects (`setSessionOptions`); Saved/Saving…; Attach video / video name with ✕; Export…; AI button labels "Translate with AI" / "Translate the rest with AI" / hidden when nothing is untranslated; while running: "Batch i of n · x of y lines", elapsed (reuse `ActivityLine`), Stop.
- `Filters`: All / Flagged / Edited by you / Untranslated with counts + search box (matches English or Portuguese, case-insensitive).
- `LineList({ lines, selected, working: ReadonlySet<number>, onSelect })`: columns number, time (m:ss.cc), speaker, English, Portuguese, mark; fixed row height 44px with windowing (render visible rows ± 10) so 1,000 lines stay smooth; ↑/↓ move selection, Enter focuses the editor (event to LinePanel), Esc returns focus to the list.
- [ ] **Step 1: Write failing tests**: empty session shows Load script; after loading, rows show English/Portuguese, "you" tag and ⚑; filters count and filter; AI button label changes with state; running shows progress and Stop; ↑/↓ moves selection; only a window of rows is in the DOM for 1,000 lines.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/renderer/session.test.tsx` — pass.
- [ ] **Step 5: Commit** `feat: add the session line list and top bar`

### Task 15: Line panel: frame, editor and actions

**Files:**
- Create: `src/renderer/workspace/session/LinePanel.tsx`, `RuleDraftDialog.tsx`
- Test: `tests/renderer/linePanel.test.tsx`

**Interfaces:**
- `LinePanel({ sessionId, line, owner: Owner /* project */, styleOwner: Owner, onLine(line) })`:
  - frame (`lineFrame`; "Attach a video to see frames" without one; loading state);
  - meta "Line n · speaker · 1.12 s · 25 characters max";
  - English; Portuguese textarea with live count `23 / 25` (accent when over);
  - edits saved by `editLine` 600 ms after typing stops and on blur (Saved indicator in TopBar reflects pending saves);
  - flag reason; **Accept** (`acceptLine`), **Ask AI again** (hint input + confirm for manual lines; `retranslate`), **Make a rule…** (`draftRule` → `RuleDraftDialog` editable rule + Project/PT-PT style radio, project preselected → `addRule`).
- [ ] **Step 1: Write failing tests**: typing saves after the pause and on blur; character count turns accent over budget; Accept clears the flag; Ask AI again on a manual line asks to confirm and sends the hint; Make a rule drafts, edits and saves to the chosen owner; no video shows the hint text.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/renderer/linePanel.test.tsx` — pass.
- [ ] **Step 5: Commit** `feat: add the line panel`

### Task 16: Running the AI from the session and leaving safely

**Files:**
- Modify: `src/renderer/workspace/session/SessionPage.tsx`, `src/renderer/workspace/Shell.tsx`
- Test: `tests/renderer/run.test.tsx`

**Interfaces:**
- AI button → `runAi`; progress from `run-progress`; rows being translated show a working state; `run-ended` failed → error line with the message; stopped → "Stopped. Finished batches are saved."
- Navigating to another session, opening the launch window, or closing the window while `aiActive()` is this session → confirm dialog "Stop the AI run?" (Stop / Keep translating); Stop calls `stopAi` then proceeds. Window close: main asks the renderer via an `honya:ws-before-close` event and waits for the answer.
- [ ] **Step 1: Write failing tests**: running fills lines live and shows progress; switching sessions during a run asks to stop and only proceeds on Stop; a failed run shows the message and keeps finished lines.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** — pass.
- [ ] **Step 5: Commit** `feat: run the AI from the session page`

### Task 17: Export dialog

**Files:**
- Create: `src/renderer/workspace/session/ExportDialog.tsx`
- Test: `tests/renderer/export.test.tsx`

**Interfaces:**
- Opens with `exportPreview` (loading text "Looking at your edits…" only when edits exist); shows "288 translated · 16 still in English · 6 open flags will be written as notes"; suggestion list with checkboxes and Project/PT-PT style choice each; **Choose where to save…** (`pickExportPath(defaultPath)`) then **Export** → `exportWrite` → "Saved to …" with **Show in Finder** (`revealPath`) and Done. Errors (e.g. source path refused) show in the dialog.
- [ ] **Step 1: Write failing tests**: summary counts; suggestions kept are sent with their owner; refusing the source path shows the message; success shows Show in Finder.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** — pass.
- [ ] **Step 5: Commit** `feat: add the export dialog`

### Task 18: Projects, project page, language style page, settings and stats

**Files:**
- Create: `src/renderer/workspace/pages/ProjectsPage.tsx`, `ProfilePage.tsx` (project and style), `RulesEditor.tsx`, `ReferencesPanel.tsx` (adapts `LearnPanel` to an `Owner`), `SettingsPage.tsx`, `StatsPage.tsx`
- Modify: `src/renderer/components/LearnPanel.tsx` (take `owner: Owner` and save via `addRule`/`saveRules`)
- Test: `tests/renderer/projects.test.tsx`, `tests/renderer/settings.test.tsx`, `tests/renderer/stats.test.tsx`

**Interfaces:**
- `ProjectsPage`: table (name, language, sessions, last activity), New project.
- `ProfilePage({ owner })`: references (adding runs learning; can be repeated any time), rules and glossary (`RulesEditor`: own editable, inherited greyed "from PT-PT style", search), characters per second (project: number or "use the PT-PT style's value (17)"), preset and frames (project only), language (locked with sessions), sessions with Open / New session / Mark finished / Reopen (project only), "Used by N projects: …" (style only), rename/delete project (confirm with session count).
- `SettingsPage`: default provider; keys per provider with Test/Replace/Remove; defaults for new projects; euro rate; Run setup again; Advanced (collapsed): model dropdowns from `modelOptions` with "(recommended)", Reset to recommended; Show the provider log.
- `StatsPage`: lines (AI / you / untranslated / total), flags (open / accepted / edited / retranslated), strong-model lines, retranslated lines, cost "≈ €0.06 ($0.07 at 0.86)" plus per-model rows (requests, tokens in/out, €), time spent, frames grabbed; "Costs are estimates from list prices." Empty state when no session is open.
- [ ] **Step 1: Write failing tests**: project page shows inherited rules greyed and edits own rules; cps "use style value" toggles to null; language select disabled with sessions; adding a reference twice runs learning twice; settings key test and model reset; stats show euros with the rate.
- [ ] **Step 2: Run** — fail. **Step 3: Implement.** **Step 4: Run** `npx vitest run tests/renderer` — pass.
- [ ] **Step 5: Commit** `feat: add project, style, settings and stats pages`

### Task 19: Remove the old interface, update the gallery, polish

**Files:**
- Delete: `src/renderer/App.tsx`, `src/renderer/screens/`, `src/renderer/translate/` (except `ActivityLine.tsx`, moved to `workspace/`), old components no longer used, `src/main/translate/` (runner, review, session, prepare, guard), `src/main/ipc/translate.ts`, the old `TranslateApi` and `SetupApi` members no longer used, their readers and tests.
- Modify: `src/renderer/styles.css` (drop unused classes), `scripts/gallery/gallery.tsx` (frames: setup step 1 and 2, launch, session empty, session with lines + panel, session running, export dialog, project page, style page, settings, stats), `README.md` screenshots/description if they describe screens.
- Test: whole suite.

- [ ] **Step 1: Delete** the old files and fix imports until `npm run typecheck` passes.
- [ ] **Step 2: Run** `npm test && npm run lint && npm run format:check && npm run build` — pass.
- [ ] **Step 3: Polish pass**: `npm run gallery`, screenshot every frame at 1440×900 (headless Chrome as before), check alignment to the spacing scale, matching edges and baselines, no clipped text, consistent button heights (40px), consistent section gaps (`--space-20`/`--space-28`); fix and re-check once.
- [ ] **Step 4: Run** `npm start`, walk the flow once: setup (if no key) → launch → new project → load a script → edit a line → run AI briefly → stop → export. Fix what breaks.
- [ ] **Step 5: Commit** `refactor: remove the old screens and polish the workspace`

---

## Self-review notes

- Spec coverage: window/menu (12), setup/launch (13), session page (14–16), line panel actions (15), autosave (8, 15), export with suggestions and notes (10, 17), styles/projects/inheritance (1, 7, 18), settings incl. euro rate and model dropdowns (6, 7, 18), stats (2, 18), migration (3, 8), engine subset/retranslate (4, 5), polish (12, 19), gallery (19).
- Old API stays until Task 19 so every stage builds and runs.
