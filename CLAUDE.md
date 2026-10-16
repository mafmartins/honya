# Honya

Electron desktop app that translates the dialogue of an English ASS subtitle script into PT-PT or PT-BR using the user's own LLM key (Claude, GPT, Gemini or Mistral). Design: `docs/superpowers/specs/2026-10-15-honya-ass-translation-design.md`. Plan: `docs/superpowers/plans/2026-10-15-honya-mvp.md`.

## Commands

Use the Node version in `.nvmrc` (`nvm use`). `.npmrc` sets `engine-strict`, so npm refuses an older Node.

- `npm test` — vitest
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint, strict type-checked
- `npm run format` / `npm run format:check` — Prettier
- `npm run build` — esbuild into `dist/` (main, preload, renderer)
- `npm start` — build and open the app
- `npm run pack` — build installers into `release/`

CI runs typecheck, lint, format check, tests and build on every pull request.

## Layout

- `src/core/` — product logic as plain TypeScript, no Electron: `ass/` (read, classify, fit, write), `library/` (profiles, style card), `pipeline/` (preflight, batches, escalation, run/resume), `providers/` (chat client per provider), `review/` (flags, structural edits), `frames/` (bundled ffmpeg).
- `src/main/` — Electron main process, IPC handlers, encrypted key store.
- `src/preload/` — context bridge, built as CommonJS.
- `src/renderer/` — card UI. `view.ts` is bundled to `dist/renderer/view.js`; `index.html` and `styles.css` are copied next to it. Never commit a compiled `.js` under `src/`.
- `tests/` mirrors `src/core`. Tests call modules directly; they never open a window or call a live provider.
- `build/ffmpeg/<os>/` — LGPL ffmpeg binary per platform, not committed (see its README).

## TypeScript

Compile with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Do not use:

- `any`, including `as any` and `any[]`
- `as unknown as SomeType`
- `@ts-ignore` and `@ts-expect-error`
- a trailing `!` non-null assertion
- `eslint-disable` for a TypeScript rule

Narrow with a type guard or by reading a field the library already types. `ass-compiler`'s `parse` returns `ParsedASS`; use `Style`, `Name`, `Start`, `End`, `Text.raw` and `Text.combined` from that type.

## Dependencies

Pin exact versions (`--save-exact`) and only pick releases at least a week old.

## Commits

Single-line Conventional Commit, no body, no trailers, no co-author lines:

```
type: subject
```

- `type` is `feat`, `fix`, `docs`, `test`, `refactor` or `chore`
- `subject` is lowercase imperative, no trailing period
