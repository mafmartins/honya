# Honya Translate Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Start screen's choices into a translated `.ass` on one Translate screen: style check, live progress, end-of-run review with rule offers, then the file revealed in Finder with a report.

**Architecture:** Provider failures become typed `ProviderError`s with backoff retries; the core pipeline gains a progress callback and records lines the strong model answered. The main process gets an Electron-free `src/main/translate/` package (session store, runner, review, prepare) bound to `honya:translate-*` / `honya:review-*` IPC channels plus one push channel for progress events. The renderer gets a `TranslateScreen` whose phases (styles, running, stopped/failed, review, done) are separate components. The old `honya:start` / `honya:preflight` / `honya:export` contract and the `autonomous` / `assisted` mode are removed.

**Tech Stack:** Electron 44, TypeScript 6 (strict), React 19.3, esbuild 0.28, Vitest 5 + React Testing Library 16 on jsdom 30.

**Spec:** `docs/superpowers/specs/2026-10-16-honya-translate-flow-design.md`

## Global Constraints

- Node from `.nvmrc` (24.21.0): run `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH` before npm/npx.
- TypeScript: no `any`, no `as unknown as`, no `@ts-ignore`/`@ts-expect-error`, no trailing `!`, no `eslint-disable` for a TypeScript rule.
- Lint pitfalls seen in part 1: `unbound-method` (never assign a method off an object; use arrow wrappers) and react-hooks v7 `set-state-in-effect` (no synchronous setState in an effect body; set state in promise callbacks or remount with `key`).
- No new dependencies.
- Commits: one line `type: subject`, type in `feat|fix|docs|test|refactor|chore`, lowercase imperative, no body, no trailers, no co-author.
- Every new IPC argument is validated in main (as `src/main/ipc/register.ts` does); every reply is shape-checked in the preload (as `src/preload/readers.ts` does).
- The renderer bundle must never contain `ass-compiler` (`tests/renderer/bundle.test.ts`).
- Default suite: no live provider, no window.
- Colors: paper `#faf7f2`, page `#f3efe6`, ink `#2a2420`, orange `#e36b1e`. Orange marks notes/flags and the main action.
- Retry delays for rate-limit, server and network errors: `1000`, `4000`, `15000` ms; authentication errors are never retried.
- Output path: `proposedOutputPath(sourcePath, variant)` (`<name>.<variant>.ass` next to the source); never the source path; an existing file is replaced.
- Session files: `userData/sessions/<id>.json`, format `version: 2`; older files are never offered for resume.
- After every task: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass.

## Review Focus

1. **Key rejected mid-run.** Batch 3 gets a 401. Expected: run stops, batches 1–2 stay saved, the message "Claude rejected the key. Replace it on Profiles." reaches the screen, and Retry continues at batch 3. Pinned in Task 6.
2. **App closed during review.** Expected: Resume opens the review with accepted flags still accepted and edits still applied. Pinned in Task 7.
3. **Script edited on disk after the run started.** Expected: resume refused with "subs.ass changed since this translation started." Pinned in Task 6.
4. **Output folder not writable.** Expected: finish shows "Couldn't write …", the session stays in review, Try again works once the cause is fixed. Pinned in Task 7.
5. **Stop pressed during the brief, then Translate pressed again elsewhere.** Expected: the run stops after the current step, is resumable, and a second start while one runs is refused with "A translation is already running." Pinned in Task 6.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `src/core/providers/errors.ts` | create | `ProviderError`, kinds, user-facing messages, provider display names |
| `src/core/providers/complete.ts` | modify | Throw `ProviderError` on HTTP/network failure; add `completeText` |
| `src/core/providers/retry.ts` | create | `withRetry` backoff wrapper for a `Completer` |
| `src/core/pipeline/run.ts` | modify | `onEvent` progress callback; `SavedRun.strongIds` |
| `src/core/pipeline/report.ts` | create | `buildReport` |
| `src/main/translate/session.ts` | create | Session v2 type, guards, file store |
| `src/main/translate/prepare.ts` | create | Style guesses + output path for a script |
| `src/main/translate/runner.ts` | create | Start/resume/stop a run batch by batch, emit events |
| `src/main/translate/review.ts` | create | Review state, structural check, rule saving, finish |
| `src/main/ipc/translate.ts` | create | `honya:translate-*` / `honya:review-*` channels + event push |
| `src/main/main.ts` | modify | Wire translate deps; delete old start/preflight/export code |
| `src/shared/api.ts` | modify | `TranslateApi`, event and view types |
| `src/preload/readers.ts`, `preload.ts` | modify | Translate calls, readers, `onTranslateEvent` |
| `src/renderer/App.tsx` | modify | `translate` screen |
| `src/renderer/screens/StartScreen.tsx` | modify | Translate button, resume card |
| `src/renderer/screens/TranslateScreen.tsx` | create | Phase switch |
| `src/renderer/translate/StylesStep.tsx`, `LivePanel.tsx`, `HaltPanel.tsx`, `ReviewPanel.tsx`, `ProposalPanel.tsx`, `DonePanel.tsx` | create | Phase components |
| `src/renderer/screens/StylesScreen.tsx`, `PreflightScreen.tsx`, `RunScreen.tsx`, `ReviewScreen.tsx` | delete | Replaced by the phase components |

---

### Task 1: Provider errors and plain-text completion

**Files:**
- Create: `src/core/providers/errors.ts`
- Modify: `src/core/providers/complete.ts`
- Test: `tests/providers/errors.test.ts`, `tests/providers/complete.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ProviderErrorKind = "auth" | "rate-limit" | "server" | "network" | "request"
  export class ProviderError extends Error {
    constructor(kind: ProviderErrorKind, provider: ProviderId, message: string, status: number | null)
    readonly kind: ProviderErrorKind; readonly provider: ProviderId; readonly status: number | null
  }
  export function providerName(provider: ProviderId): string   // claude→"Claude", gpt→"OpenAI", gemini→"Gemini", mistral→"Mistral"
  export function providerError(provider: ProviderId, status: number | null, body: string | null): ProviderError
  export function completeText(input: ChatInput): Promise<{ text: string } | { refused: true }>
  ```
  `completeChat` keeps its signature but now **throws** `ProviderError` for any non-200 status or a rejected `fetch`; malformed or refused content still returns `{ refused: true }`.

- [ ] **Step 1: Write the failing tests**

`tests/providers/errors.test.ts`:
```ts
it("maps statuses to kinds and user messages", () => {
  expect(providerError("claude", 401, null)).toMatchObject({ kind: "auth", message: "Claude rejected the key. Replace it on Profiles." })
  expect(providerError("gpt", 403, null).kind).toBe("auth")
  expect(providerError("gemini", 429, null)).toMatchObject({ kind: "rate-limit", message: "Gemini is rate limiting requests. Try again in a few minutes." })
  expect(providerError("mistral", 503, null)).toMatchObject({ kind: "server", message: "Mistral had a server error (503). Try again later." })
  expect(providerError("claude", null, null)).toMatchObject({ kind: "network", message: "Couldn't reach Claude. Check your connection." })
  expect(providerError("gpt", 400, '{"error":{"message":"model not found"}}')).toMatchObject({ kind: "request", message: "OpenAI refused the request: model not found" })
  expect(providerError("gpt", 404, "not json").message).toBe("OpenAI refused the request: HTTP 404")
})
```
In `tests/providers/complete.test.ts` add:
- `"throws a ProviderError on a non-200 reply"`: fake `fetch` returns status 401 → `await expect(completeChat(input)).rejects.toMatchObject({ kind: "auth" })`.
- `"throws a network ProviderError when fetch rejects"`: fake `fetch` rejects → `rejects.toMatchObject({ kind: "network" })`.
- `"still returns refused for unreadable content"`: status 200, body `"nope"` → `{ refused: true }`.
- `"completeText returns the assistant text without the lines instruction"`: capture the request body, assert it does not contain `"lines"` instruction text and the reply `{ content: [{ type: "text", text: "hello" }] }` for claude gives `{ text: "hello" }`.

- [ ] **Step 2: Run and confirm failure** — `npx vitest run tests/providers` → FAIL (module `errors` missing; completeChat resolves instead of rejecting).

- [ ] **Step 3: Implement** `errors.ts`; in `complete.ts` make `buildRequest` take a flag for the lines instruction, throw `providerError(...)` on non-200 (pass `await response.text()` as body) and wrap `fetch` rejection as `providerError(provider, null, null)`. The error detail for `request` comes from the first string found at `error.message` or `message` in the JSON body. `completeText` reuses `buildRequest` without the instruction and `assistantText`.

- [ ] **Step 4: Run** `npx vitest run tests/providers` → PASS; full checks pass.

- [ ] **Step 5: Commit** — `git commit -m "feat: report provider failures as errors"`

---

### Task 2: Retry with backoff

**Files:**
- Create: `src/core/providers/retry.ts`
- Test: `tests/providers/retry.test.ts`

**Interfaces:**
- Consumes: `ProviderError` (Task 1), `Completer` from `src/core/pipeline/run.ts`.
- Produces:
  ```ts
  export const RETRY_DELAYS_MS: readonly number[] = [1000, 4000, 15000]
  export function withRetry(complete: Completer, sleep: (ms: number) => Promise<void>, onRetry: (delayMs: number, error: ProviderError) => void): Completer
  ```

- [ ] **Step 1: Write the failing tests** (`tests/providers/retry.test.ts`)
  - `"retries rate-limit, server and network errors with 1s, 4s, 15s"`: completer throws `rate-limit` 3 times then succeeds → result is the success; `sleep` saw `[1000, 4000, 15000]`; `onRetry` called 3 times with those delays.
  - `"gives up after the last delay"`: always throws `server` → rejects with that error after 4 calls.
  - `"never retries auth or request errors"`: throws `auth` → rejects after 1 call, `sleep` never called.
  - `"passes non-provider errors through"`: throws `new Error("boom")` → rejects after 1 call.

- [ ] **Step 2: Run** `npx vitest run tests/providers/retry.test.ts` → FAIL.
- [ ] **Step 3: Implement** `withRetry`.
- [ ] **Step 4: Run** → PASS; full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: retry rate limited and failed provider calls"`

---

### Task 3: Pipeline progress events and strong-model lines

**Files:**
- Modify: `src/core/pipeline/run.ts`
- Test: `tests/pipeline/run.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type RunEvent =
    | { type: "brief" }
    | { type: "batch"; index: number; total: number }            // index is 1-based, emitted before the batch's first call
    | { type: "escalate"; count: number }                        // before a strong-model request, count = lines sent
    | { type: "batch-done"; index: number; total: number; lines: LineResult[] }
  // RunInput gains: onEvent?: (event: RunEvent) => void
  // SavedRun gains: strongIds: string[]   (ids whose final words came from a strong-model reply; accumulates across resume)
  export function totalBatches(lineCount: number): number      // same chunking as chunkDialogue
  ```
  Translation behavior does not change. A completer that **throws** makes `runTranslation` / `resumeTranslation` reject (no catch added anywhere in the pipeline).

- [ ] **Step 1: Write the failing tests** in `tests/pipeline/run.test.ts` (reuse `scriptWith` and the echo completer from "resumes at batch three"):
  - `"emits brief, batch and batch-done events in order"`: 60 lines, collect events → first is `{ type: "brief" }`, then `batch 1/3`, `batch-done 1/3` with 25 lines, …, `batch-done 3/3` with 10 lines.
  - `"records lines answered by the strong model"`: completer refuses every cheap request and echoes strong ones; preset `"best"`, 3 lines → `result.saved.strongIds` has all 3 ids and an `escalate` event with `count: 3` was emitted.
  - `"rejects when the completer throws"`: completer throws `new Error("401")` → `await expect(runTranslation(...)).rejects.toThrow("401")`.
  - `"counts batches like chunkDialogue"`: `totalBatches(0)` → `0`, `totalBatches(25)` → `1`, `totalBatches(26)` → `2`.
  - Existing tests that build `SavedRun` by hand get `strongIds: []`.

- [ ] **Step 2: Run** `npx vitest run tests/pipeline` → FAIL.
- [ ] **Step 3: Implement** in `run.ts`. Emit events in `runTranslation` (brief), `continueTranslation` (batch, batch-done), `escalateFailedChunk` and the doubt-escalation path (escalate). Track strong ids where strong replies are merged.
- [ ] **Step 4: Run** → PASS; full checks (main.ts compiles; give its stored-run reader a default `strongIds: []` until Task 8 deletes it).
- [ ] **Step 5: Commit** — `git commit -m "feat: report pipeline progress and strong model lines"`

---

### Task 4: Report builder

**Files:**
- Create: `src/core/pipeline/report.ts`
- Test: `tests/pipeline/report.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface TranslateReport {
    dialogueLines: number; translated: number; strongModel: number; leftInEnglish: number; overLimit: number
    flags: number; editedFlags: number; acceptedAsIs: number
    rulesSaved: { series: number; base: number }
    framesUsed: number; frameFailures: number; unchanged: number
    elapsedMs: number; outputPath: string
  }
  export function buildReport(input: {
    ass: string; dialogueStyles: ReadonlySet<string>; finalWords: Map<number, string>   // words without notes
    results: Map<string, LineResult>; strongIds: readonly string[]; cpsLimit: number
    flagged: readonly number[]; edited: readonly number[]
    rules: readonly { target: "series" | "base" }[]
    framesUsed: number; frameNotes: readonly string[]; writeReport: readonly string[]
    elapsedMs: number; outputPath: string
  }): TranslateReport
  ```
  `leftInEnglish` = results whose `reason` is `"tradução falhou"`; `translated` = dialogue lines minus `leftInEnglish`; `overLimit` uses `charactersPerSecond`/`exceedsLimit` from `src/core/ass/fit.ts` on `finalWords`; `editedFlags` = flagged ∩ edited; `acceptedAsIs` = flagged − edited; `frameFailures` = `frameNotes.length`; `unchanged` = `writeReport.length` (each entry is an event copied unchanged).

- [ ] **Step 1: Write the failing test** `"summarises a finished run"`: a 4-line script (one line 2 s long with 60 characters so it's over 17 cps), results with one `tradução falhou`, `strongIds: ["1"]`, flagged `[0, 2]`, edited `[2, 3]`, rules `[{target:"series"},{target:"series"},{target:"base"}]`, `frameNotes: ["event 1: frame grab failed"]`, `writeReport: ["event 3: tags could not be split"]` → exact `toEqual` of the expected report object.
- [ ] **Step 2–4:** run (FAIL), implement, run (PASS) + full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: build the end of run report"`

---

### Task 5: Session store v2

**Files:**
- Create: `src/main/translate/session.ts`
- Test: `tests/main/translate/session.test.ts`

**Interfaces:**
- Consumes: `isRecord`, `isVariant`, `isRuleList` from `src/core/library/guards.ts`; `StyleCard`, `Rule`; `LineResult`, `SavedRun`.
- Produces:
  ```ts
  export const SESSION_VERSION = 2
  export type SessionPhase = "running" | "stopped" | "failed" | "review" | "done"
  export interface StoredRun { completedBatches: number; results: [string, LineResult][]; glossary: { source: string; pt: string }[]; brief: string; hardIds: string[]; frameIds: string[]; strongIds: string[] }
  export interface ReviewState { edits: Record<string, string>; accepted: number[]; rules: { target: "series" | "base"; rule: Rule }[] }
  export interface TranslateSession {
    version: 2; id: string; startedAt: string; phase: SessionPhase
    scriptPath: string; scriptName: string; scriptText: string
    seriesId: string; seriesName: string; variant: Variant; provider: ProviderId; preset: Preset
    frameSetting: "none" | "marked" | "every"; videoPath: string | null; outputPath: string
    dialogueStyles: string[]; card: StyleCard; dialogueLines: number; totalBatches: number
    saved: StoredRun; review: ReviewState; frameNotes: string[]; framesUsed: number; elapsedMs: number; error: string | null
  }
  export interface SessionStore {
    save(session: TranslateSession): void          // atomic: temp file + rename, like fileStore
    load(id: string): TranslateSession | null      // null for missing, invalid, or version !== 2
    latestUnfinished(): TranslateSession | null    // phase !== "done", newest startedAt
    remove(id: string): void
  }
  export function createSessionStore(dir: string): SessionStore
  export function toSavedRun(stored: StoredRun): SavedRun
  export function fromSavedRun(saved: SavedRun): StoredRun
  ```
  Session ids are UUIDs; `load`/`remove` with any other id throw `Error("Invalid session id.")`.

- [ ] **Step 1: Write the failing tests** (temp dir, a `session()` fixture builder):
  - `"saves and loads a session"` round trip `toEqual`.
  - `"ignores version 1 and unreadable files"`: write `{ "mode": "assisted" }` and `"{bad"` files → `load` returns `null`, `latestUnfinished()` returns `null`.
  - `"returns the newest unfinished session"`: three sessions (done newest, review middle, running oldest) → the review one.
  - `"refuses an id that is not a uuid"`: `load("../keys")` throws `"Invalid session id."`.
  - `"keeps the old file when a write fails"`: same pattern as `tests/library/fileStore.test.ts`.
  - `"round trips a saved run"`: `toSavedRun(fromSavedRun(saved))` equals `saved` (Map preserved).
- [ ] **Step 2–4:** FAIL, implement, PASS + full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: store translation sessions for resume"`

---

### Task 6: Runner

**Files:**
- Create: `src/main/translate/prepare.ts`, `src/main/translate/runner.ts`
- Test: `tests/main/translate/runner.test.ts`, `tests/main/translate/prepare.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `runTranslation`, `resumeTranslation`, `totalBatches`, `RunEvent`; `readAss`; `classifyScript`; `proposedOutputPath`; `noteOf`-style note parsing (`/\{note: ([^}]*)\}/`).
- Produces:
  ```ts
  // prepare.ts
  export interface PreparedScript { styles: ListedStyle[]; outputPath: string; scriptName: string }
  export function prepareTranslation(scriptPath: string, variant: Variant, readScript: (path: string) => string): PreparedScript

  // runner.ts
  export interface TranslateRequest { scriptPath: string; variant: Variant; seriesId: string; provider: ProviderId; preset: Preset; frameSetting: "none" | "marked" | "every"; videoPath: string | null; dialogueStyles: string[] }
  export interface LiveLine { eventIndex: number; english: string; words: string; note: string | null }   // words without the note
  export type TranslateEvent =
    | { type: "activity"; sessionId: string; text: string }
    | { type: "batch"; sessionId: string; index: number; total: number; linesDone: number; lineTotal: number; lines: LiveLine[] }
    | { type: "stopped"; sessionId: string }
    | { type: "failed"; sessionId: string; message: string }
    | { type: "finished"; sessionId: string; openFlags: number }
  export interface RunnerDeps {
    sessions: SessionStore
    loadCard(variant: Variant, seriesId: string): { card: StyleCard; seriesName: string }   // missing base = empty base; missing series throws "That series no longer exists."
    hasKey(provider: ProviderId): boolean
    completerFor(provider: ProviderId, onRetry: (delayMs: number, error: ProviderError) => void): Completer
    grabFrames(cues: readonly DialogueCue[], videoPath: string, setting: "marked" | "every"): Promise<{ frames: Map<string, Uint8Array>; notes: string[] }>
    ffmpegReady(): boolean
    readScript(path: string): string
    now(): number; newId(): string; sleep(ms: number): Promise<void>
    emit(event: TranslateEvent): void
  }
  export interface Runner {
    start(request: TranslateRequest): Promise<string>   // validates, saves the session, returns its id; batches continue in the background
    resume(id: string): Promise<string>
    stop(): void                                         // honored after the current step
    activeId(): string | null
    idle(): Promise<void>                                // resolves when no run is active (for tests and shutdown)
  }
  export function createRunner(deps: RunnerDeps): Runner
  ```
- Exact messages: `"A translation is already running."`, `` `No ${providerName(p)} key saved. Add it on the start screen.` ``, `"This script has no dialogue lines in the chosen styles."`, `"Honya's bundled ffmpeg is missing, so frames can't be grabbed. Set frames to none or reinstall Honya."`, `` `${scriptName} changed since this translation started.` ``, `"That translation no longer exists."`, `"That translation is already finished."`.
- Activity texts: `"Reading the episode"` (brief), `` `Translating batch ${i} of ${n}` ``, `` `Asking the strong model about ${count} lines` ``, `` `Rate limited, retrying in ${s} s` `` (rate-limit) / `` `${name} didn't answer, retrying in ${s} s` `` (server/network), `"Grabbing frames"`, `"Stopping after this batch…"` (on stop).
- Behavior: the runner calls the pipeline with `stopAfterBatches = completed + 1` in a loop (as `startTranslation` in `main.ts` does today), saves the session after every batch (`phase: "running"`, `elapsedMs` accumulated), emits `batch`, and checks the stop flag between steps. All batches done → `phase: "review"` (even with zero open flags; the renderer then finishes straight away), emit `finished` with the open-flag count. A thrown `ProviderError` → `phase: "failed"`, `error` = its message, emit `failed`; any other error → same with the error's message. Resume: `phase` in `stopped|failed|running` continues the run; `review` emits `finished` immediately; script text on disk ≠ stored text → throws the "changed" message; frames are re-grabbed for the remaining cues when the video still exists, otherwise a note `"video missing on resume: continued without pictures"` is added to `frameNotes`.

- [ ] **Step 1: Write the failing tests** with a temp-dir session store, a fake card loader, `readScript` from a map, an echo completer (as in `tests/pipeline/run.test.ts`), `sleep` resolving immediately, and `emit` collecting events. Use `await runner.idle()` to wait.
  - `prepare`: `"guesses styles and proposes the output path"` → styles from `classifyScript`, `outputPath` `/s/subs.pt-pt.ass`, `scriptName` `subs.ass`.
  - `"runs every batch and ends in review"`: 60 lines → events include `batch` 1..3 with `linesDone` 25/50/60 and `lineTotal` 60, last event `finished`; stored phase `"review"`.
  - `"refuses a second start while running"` (Review Focus 5): start, then start again before `idle()` → rejects `"A translation is already running."`.
  - `"stops after the current step and resumes"` (Review Focus 5): call `stop()` inside `emit` on the `brief` activity → events end with `stopped`, phase `"stopped"`, `completedBatches` 1 at most; `resume(id)` → reaches `finished`.
  - `"stops on a rejected key and retries from the next batch"` (Review Focus 1): completer throws `providerError("claude", 401, null)` on batch 3's request → last event `failed` with `"Claude rejected the key. Replace it on Profiles."`, phase `"failed"`, `completedBatches` 2; swap the completer to succeed, `resume(id)` → first `batch` event has `index: 3`, ends `finished`.
  - `"refuses to resume a changed script"` (Review Focus 3): edit the map's script text, `resume(id)` → rejects `"subs.ass changed since this translation started."`.
  - `"refuses without a key"`, `"refuses when no chosen style has dialogue"`, `"refuses frames without ffmpeg"`: exact messages above.
  - `"reports retries in the activity line"`: `completerFor` calls `onRetry(4000, providerError("claude", 429, null))` once → an activity `"Rate limited, retrying in 4 s"`.
- [ ] **Step 2–4:** FAIL, implement, PASS + full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: run translations batch by batch with progress events"`

---

### Task 7: Review and finish

**Files:**
- Create: `src/main/translate/review.ts`
- Test: `tests/main/translate/review.test.ts`

**Interfaces:**
- Consumes: Tasks 4–6; `proposeStructural`, `Proposal` from `src/core/review/review.ts`; `applyTranslations`; `appendNote`; `ProfileHandlers` (part 1).
- Produces:
  ```ts
  export interface ReviewLine { eventIndex: number; english: string; words: string; note: string | null; edited: boolean; flagged: boolean; accepted: boolean }
  export interface ReviewView { sessionId: string; scriptName: string; seriesName: string; variant: Variant; preset: Preset; outputPath: string; lines: ReviewLine[]; openFlags: number }
  export type CheckResult = { status: "none" } | { status: "proposal"; proposal: Proposal } | { status: "failed" }
  export interface FinishResult { outputPath: string; report: TranslateReport }
  export interface ReviewDeps {
    sessions: SessionStore; profiles: ProfileHandlers
    ask(provider: ProviderId): (prompt: string) => Promise<{ text: string } | { refused: true }>   // cheap model, completeText
    writeFile(path: string, text: string): void; reveal(path: string): void; now(): number
  }
  export interface ReviewHandlers {
    load(id: string): ReviewView
    accept(id: string, eventIndex: number, words: string | null): ReviewView        // stores an edit when words differ from the current words; accepts the flag if the line is flagged
    check(id: string, eventIndex: number, words: string): Promise<CheckResult>       // stores nothing
    confirm(id: string, eventIndex: number, words: string, proposal: Proposal, applyOthers: boolean, ruleTarget: "series" | "base" | null): ReviewView
    finish(id: string): FinishResult
    reveal(id: string): void
    discard(id: string): void
  }
  export function createReviewHandlers(deps: ReviewDeps): ReviewHandlers
  ```
- Rules: a line is flagged when its stored words contain `{note: …}`; `words` in views are without the note; a flag closes only through `accept`/`confirm` on that line; editing an unflagged line creates no flag. `confirm`: stores the edit; if `applyOthers`, stores each sibling's words as edits; if `ruleTarget` and `proposal.rule`, appends the rule through `profiles.saveSeriesRules` (series) or `profiles.saveBase` (base) and records it in `review.rules`; accepts the edited line's flag. `check` returns `{ status: "none" }` when `proposeStructural` returns a proposal with no siblings and no rule. `finish`: open flags → throw `"Accept every flagged line before finishing."`; final words = edit ?? stored words-without-note, then `appendNote` when the line has a note; write with `applyTranslations`; `writeFile` throws → throw `` `Couldn't write ${outputPath}: ${reason}` `` and keep `phase: "review"`; success → `phase: "done"`, `reveal(outputPath)`, return the report. `discard` removes the session file only.

- [ ] **Step 1: Write the failing tests** (temp-dir sessions seeded with a finished 3-line run where line 1 has `{note: linha longa}`; real `createProfileHandlers` on a temp `createFileStore`):
  - `"lists lines with english, words without notes and one open flag"`.
  - `"accepting keeps the note and closes the flag"`; `"editing an unflagged line creates no flag"`.
  - `"keeps decisions across a reload"` (Review Focus 2): accept + edit, then create new handlers over the same dir → `load` shows the same `accepted`/`edited` state.
  - `"confirm applies siblings and saves a series rule"`: proposal with sibling line 2 and glossary rule `Hashira → Pilar`, `applyOthers: true`, `ruleTarget: "series"` → line 2 edited, `profiles.loadSeriesRules` contains the rule, flag on the edited line closed.
  - `"confirm with applyOthers false and no rule only edits the line"`.
  - `"check reports failed when the model refuses"`.
  - `"refuses to finish with open flags"`.
  - `"keeps the session when the file can't be written"` (Review Focus 4): `writeFile` throws `new Error("EACCES: permission denied")` → `finish` rejects `` `Couldn't write /s/subs.pt-pt.ass: EACCES: permission denied` ``, phase still `"review"`; a working `writeFile` then succeeds.
  - `"finishes, writes notes back, reveals the file and reports"`: written text contains the edited words and `{note: linha longa}`; `reveal` called with the output path; `report.flags` 1.
- [ ] **Step 2–4:** FAIL, implement, PASS + full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: review flagged lines and write the translated file"`

---

### Task 8: IPC, preload, and removing the old contract

**Files:**
- Create: `src/main/ipc/translate.ts`
- Modify: `src/main/main.ts`, `src/shared/api.ts`, `src/preload/readers.ts`, `src/preload/preload.ts`
- Test: `tests/preload/translateReaders.test.ts`

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces in `src/shared/api.ts` (types re-exported from the main modules, as part 1 does):
  ```ts
  export interface UnfinishedSession { id: string; scriptName: string; seriesName: string; phase: SessionPhase; completedBatches: number; totalBatches: number; openFlags: number }
  export interface TranslateApi {
    prepareTranslation(scriptPath: string, variant: Variant): Promise<PreparedScript>
    startTranslation(request: TranslateRequest): Promise<string>
    resumeTranslation(id: string): Promise<string>
    stopTranslation(): Promise<void>
    latestUnfinished(): Promise<UnfinishedSession | null>
    discardTranslation(id: string): Promise<void>
    loadReview(id: string): Promise<ReviewView>
    acceptLine(id: string, eventIndex: number, words: string | null): Promise<ReviewView>
    checkEdit(id: string, eventIndex: number, words: string): Promise<CheckResult>
    confirmEdit(id: string, eventIndex: number, words: string, proposal: Proposal, applyOthers: boolean, ruleTarget: "series" | "base" | null): Promise<ReviewView>
    finishTranslation(id: string): Promise<FinishResult>
    revealOutput(id: string): Promise<void>
    onTranslateEvent(listener: (event: TranslateEvent) => void): () => void
  }
  export type HonyaApi = SetupApi & TranslateApi
  ```
  Channels: `honya:translate-prepare`, `-start`, `-resume`, `-stop`, `-latest`, `-discard`, `-finish`, `-reveal`, `honya:review-load`, `-accept`, `-check`, `-confirm`; push channel `honya:translate-event` (main → `webContents.send`).
- `main.ts`: build `createSessionStore(join(userData, "sessions"))`, the runner (`completerFor` = `withRetry(provider completer, sleep, onRetry)`; `emit` = send to every window), review handlers (`ask` uses `completeText` with the cheap model; `reveal` = `shell.showItemInFolder`; `writeFile` = `writeFileSync`), and `registerTranslateIpc`. Delete `registerIpc`'s preflight/start/export handlers, `StartRequest`, `PreflightRequest`, `ExportRequest`, `StoredSession` and every helper only they used; delete the matching preload calls and readers.

- [ ] **Step 1: Write the failing tests** for the new preload readers: `readTranslateEvent` accepts each of the five event shapes and rejects a `batch` event with a non-number `index`; `readReviewView` rejects a line without `flagged`; `readCheckResult` accepts `{ status: "none" }`, `{ status: "failed" }`, and a proposal (sibling list + glossary rule), rejects `{ status: "maybe" }`; `readUnfinished` accepts `null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** readers, `registerTranslateIpc(deps)` (validate every argument; `confirm`'s proposal re-checked with the same reader logic as the preload's), preload calls (`onTranslateEvent` subscribes with `ipcRenderer.on`, drops events that fail `readTranslateEvent`, returns an unsubscribe), and the `main.ts` wiring and deletions.
- [ ] **Step 4: Run** full checks and `npm run build` → PASS; `grep -n "honya:start\|honya:export\|honya:preflight" -r src` → no matches.
- [ ] **Step 5: Commit** — `git commit -m "feat: expose translation and review to the window"`

---

### Task 9: Start screen — Translate and Resume

**Files:**
- Modify: `src/renderer/App.tsx`, `src/renderer/screens/StartScreen.tsx`, `tests/renderer/fakeApi.ts`
- Create: `src/renderer/translate/ResumeCard.tsx`, placeholder `src/renderer/screens/TranslateScreen.tsx` (heading "Translate" and a Back button; filled in Task 10)
- Test: `tests/renderer/start.test.tsx`

**Interfaces:**
- Produces: `App` screen union gains `"translate"` with `TranslateTarget = { kind: "new"; request: Omit<TranslateRequest, "dialogueStyles">; scriptName: string; seriesName: string } | { kind: "resume"; id: string }`; `TranslateScreen` props `{ target: TranslateTarget; onBack: () => void; onAnother: () => void }`; `fakeApi` gains every `TranslateApi` method plus `emitTranslate(event: TranslateEvent): void` for tests.
- Translate button label `"Translate"`, class `action`; enabled only when a script is chosen, a series is chosen, and the provider's key exists. Resume card text: `` `Unfinished: ${scriptName} · ${seriesName} · batch ${completed} of ${total}` `` (running/stopped/failed) or `` `Unfinished: ${scriptName} · ${seriesName} · in review, ${openFlags} flags left` ``, buttons `"Resume"` and `"Discard"` (Discard asks `window.confirm("Discard this translation? Finished batches will be lost.")`).
- "Translate another" from Done returns to Start with variant, series, provider and preset kept and script, video and frame setting cleared.

- [ ] **Step 1: Write the failing tests**: Translate disabled until script + series + key; clicking it opens the Translate screen; resume card shows for an unfinished session and Resume opens Translate with `{ kind: "resume" }`; Discard (confirm → true) calls `discardTranslation` and hides the card; no card when `latestUnfinished` returns `null`.
- [ ] **Step 2–4:** FAIL, implement, PASS + full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: start or resume a translation from the start screen"`

---

### Task 10: Translate screen — styles, live run, stop and failure

**Files:**
- Modify: `src/renderer/screens/TranslateScreen.tsx`, `src/renderer/styles.css`
- Create: `src/renderer/translate/StylesStep.tsx`, `LivePanel.tsx`, `HaltPanel.tsx`
- Delete: `src/renderer/screens/StylesScreen.tsx`, `PreflightScreen.tsx`, `RunScreen.tsx`, `ReviewScreen.tsx` (and their test in `tests/renderer/screens.test.tsx`)
- Test: `tests/renderer/translate.test.tsx`

**Interfaces:**
- Phases: `"loading" | "styles" | "running" | "halted" | "review" | "done"`. New target: `prepareTranslation` → if any style is `ambiguous`, phase `styles` (`StyleChecklist` with confirm label `"Start translating"`; empty dialogue list shows `"This script has no dialogue lines in the chosen styles."` and Back); else `startTranslation` immediately with the dialogue styles. Resume target: `resumeTranslation(id)`.
- Header: `` `${scriptName} · ${seriesName} · ${variant} · ${provider} · ${preset}` `` and `` `Output: ${outputPath}` ``.
- LivePanel: `` `Batch ${index} of ${total}` ``, a `<progress>` with `value=linesDone max=lineTotal`, `` `${linesDone} of ${lineTotal} lines` ``, the latest activity text, a list (`role="list"`, label `"live lines"`) of rows showing English and Portuguese; rows with a note get class `noted` and show `{note: …}` in orange; the list scrolls to the newest row unless the user scrolled up. Button `"Stop"`; after clicking it shows `"Stopping after this batch…"` and is disabled.
- HaltPanel (after `stopped` or `failed`): the failure message (in the error line for `failed`), `"Stopped. Finished batches are saved."` for `stopped`; buttons `"Retry"` (failed) / `"Continue"` (stopped) → `resumeTranslation`, and `"Back to Start"`.
- On `finished` → phase `review` (Task 11 fills it; until then render `"Review"` text).
- Subscribe with `api.onTranslateEvent` in an effect; ignore events whose `sessionId` is not this screen's session; unsubscribe on unmount.

- [ ] **Step 1: Write the failing tests** (fake API + `emitTranslate`): no-ambiguity script starts immediately with the dialogue styles; ambiguous style shows the checklist and Start translating stays disabled until chosen; a `batch` event renders `"Batch 2 of 12"`, `"50 of 290 lines"` and a noted row in orange class; an `activity` event updates the activity line; Stop → `stopTranslation` called and the button reads `"Stopping after this batch…"`; `failed` event shows the message and Retry calls `resumeTranslation`; events for another session id are ignored.
- [ ] **Step 2–4:** FAIL, implement, PASS + full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: show the translation live on the translate screen"`

---

### Task 11: Review panel with rule offers

**Files:**
- Create: `src/renderer/translate/ReviewPanel.tsx`, `ProposalPanel.tsx`
- Modify: `src/renderer/screens/TranslateScreen.tsx`, `src/renderer/styles.css`
- Test: `tests/renderer/review.test.tsx`

**Interfaces:**
- On entering review: `loadReview(id)`; zero open flags → go straight to finish (Task 12's flow).
- Layout (spec "Review"): header `` `${seriesName} · ${scriptName} · ${openFlags} flags` `` and `` `${variant} · ${preset}` ``; left: previous line faded, current words, `{note: …}` in orange, next line faded; right: English, a textarea labelled `"translation"` prefilled with the words, `"Accept"` (orange). Navigation `"Previous flag"` / `"Next flag"`, and a line list (label `"all lines"`) to open any line.
- Accept: words unchanged → `acceptLine(id, i, null)`; changed → `checkEdit` first, showing `"Checking whether this is a lasting change…"`; `none` → `acceptLine(id, i, words)`; `failed` → `acceptLine(id, i, words)` and the note `"The check couldn't run. Your edit is kept on this line only."` with `"Retry check"`; `proposal` → ProposalPanel.
- ProposalPanel: other lines as `before → after`, checkbox `"Also change these ${n} lines"` (checked; hidden when n = 0); rule text with radio `"Save to series"`, `"Save to base"`, `"Don't save"` (default Don't save; hidden when `rule` is null); `"Confirm"` → `confirmEdit(...)`; `"Cancel"` returns to the edit.
- After each accept/confirm, move to the next open flag. `"Finish"` button enabled only when `openFlags === 0`.

- [ ] **Step 1: Write the failing tests**: accept unchanged closes the flag and moves on; edited accept shows the checking text then calls `acceptLine` with the words on `none`; `proposal` shows the sibling and rule, unchecking + "Save to base" calls `confirmEdit(id, i, words, proposal, false, "base")`; failed check shows the note and keeps the edit; Finish disabled while a flag is open; opening an unflagged line from the list and accepting an edit works.
- [ ] **Step 2–4:** FAIL, implement, PASS + full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: review flagged lines and offer rules from edits"`

---

### Task 12: Done panel and report

**Files:**
- Create: `src/renderer/translate/DonePanel.tsx`
- Modify: `src/renderer/screens/TranslateScreen.tsx`, `src/renderer/styles.css`
- Test: `tests/renderer/done.test.tsx`

**Interfaces:**
- Finish = `finishTranslation(id)`; while running show `"Writing the file…"`; error → error line with the message and `"Try again"`.
- DonePanel shows `"Done"` and report rows (exact labels): `Lines translated` (`${translated} of ${dialogueLines}`), `Sent to the strong model`, `Left in English`, `Over the reading speed limit`, `Flags` (`${flags}: ${editedFlags} edited, ${acceptedAsIs} accepted as they were`), `Rules saved` (`${series} to the series, ${base} to the base`), `Frames` (`${framesUsed} used, ${frameFailures} couldn't be grabbed`; hidden when both 0), `Events copied unchanged` (hidden when 0), `Time` (`m min s s`), `Saved to` (output path). Buttons `"Show in Finder"` (`revealOutput`) and `"Translate another"` (`onAnother`).

- [ ] **Step 1: Write the failing tests**: zero-flag run finishes automatically and shows the report rows with the fake report's numbers; a finish error shows `"Couldn't write …"` and Try again succeeds on the second call; Show in Finder calls `revealOutput`; Translate another calls `onAnother`.
- [ ] **Step 2–4:** FAIL, implement, PASS + full checks.
- [ ] **Step 5: Commit** — `git commit -m "feat: show the finished file and the run report"`

---

### Task 13: Verify the whole flow

- [ ] **Step 1:** `rm -rf dist && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build` → all pass.
- [ ] **Step 2: Render check** (controller): load `dist/renderer` in a hidden Electron window with a fake `window.honya` (same approach as part 1's layout check; run Electron with `ELECTRON_RUN_AS_NODE` unset), drive Start → Translate with scripted events, and capture the live, review and done phases at 1100×820. Check: no horizontal scroll, the card stays centred, long file names truncate, the live list scrolls inside the card.
- [ ] **Step 3: User walk-through** with a real key and a short `.ass`: translate, stop and continue, quit mid-run and resume, review an edit that triggers a rule offer, finish, Finder opens on `<name>.<variant>.ass`, report matches.
- [ ] **Step 4:** Commit any fixes, one commit per fix.
