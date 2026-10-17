# Honya

Electron desktop app that translates the dialogue of an English ASS subtitle script into PT-PT or PT-BR using the user's own LLM key (Claude, GPT, Gemini or Mistral). Design: `docs/superpowers/specs/2026-10-15-honya-ass-translation-design.md`. Plan: `docs/superpowers/plans/2026-10-15-honya-mvp.md`.

## Commands

Use the Node version in `.nvmrc` (`nvm use`). `.npmrc` sets `engine-strict`, so npm refuses an older Node.

- `npm test` — vitest
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint, strict type-checked
- `npm run format` / `npm run format:check` — Prettier
- `npm run build` — esbuild into `dist/` (main, preload, renderer)
- `npm run gallery` — build the screen gallery into `dist/gallery/`
- `npm start` — build and open the app
- `npm run fetch:ffmpeg` — download the pinned LGPL ffmpeg into `build/ffmpeg/<os>/` (`-- --all` for every platform)
- `npm run pack` — fetch ffmpeg, build, and write installers into `release/`

CI runs typecheck, lint, format check, tests and build on every pull request.

## Layout

- `src/core/` — product logic as plain TypeScript, no Electron: `ass/` (read, classify, fit, write), `library/` (language styles and projects, style card, learning), `pipeline/` (preflight, batches, escalation, translate missing lines, retranslate one), `providers/` (chat client per provider, prices, models), `session/` (line-by-line sessions, migration, export, stats), `frames/` (bundled ffmpeg).
- `src/main/` — Electron main process: `workspace/` (projects, sessions, the AI run, export), IPC handlers, settings and encrypted key store.
- `src/preload/` — context bridge, built as CommonJS.
- `src/renderer/` — React workspace UI: `workspace/` (shell, menu, dialogs, `session/` and `pages/`), `components/` (shared pieces). `main.tsx` is bundled to `dist/renderer/main.js`; `index.html` and `styles.css` are copied next to it. Never commit a compiled `.js` under `src/`.
- `tests/` mirrors `src/core`, plus `main/`, `preload/` and `renderer/` (components rendered with `tests/renderer/fakeApi.ts`). Tests call modules directly; they never open a window or call a live provider.
- `scripts/gallery/` — every screen as a 1440×900 window with demo data (`npm run gallery`, then `dist/gallery/index.html?screen=<key>`).
- `build/ffmpeg/<os>/` — LGPL ffmpeg binary per platform, fetched by `npm run fetch:ffmpeg` from this repo's `ffmpeg-*` releases (built by `.github/workflows/ffmpeg.yml`, pinned in `build/ffmpeg/VERSION`); not committed.
- `scripts/ffmpeg/` — ffmpeg build scripts and Node TypeScript helpers (run directly by Node; import with `.ts` extensions).

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
