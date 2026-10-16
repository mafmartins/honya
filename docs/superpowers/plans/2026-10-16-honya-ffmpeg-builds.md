# Honya LGPL ffmpeg Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pinned, decoder-only, LGPL ffmpeg for macOS (universal), Windows x64 and Linux x64 in GitHub Actions, publish it as release assets, and fetch it into `build/ffmpeg/<os>/` before packaging.

**Architecture:** Pins live in `build/ffmpeg/VERSION` (JSON). Shell build scripts under `scripts/ffmpeg/` share one flag list; small TypeScript helpers under `scripts/ffmpeg/` (run directly by Node 24's type stripping) do the pin reading, licence and dependency checks, the smoke test (reusing `src/core/frames/grab.ts`), and the fetch. A workflow `.github/workflows/ffmpeg.yml` builds each platform, checks it, smoke-tests it on its own OS, and publishes a release `ffmpeg-<version>-<build>`.

**Tech Stack:** ffmpeg 9.0.x source, dav1d (meson/ninja/nasm), zlib, clang + lipo + codesign (macOS), MinGW-w64 (Windows cross), Alpine/musl (Linux static), GitHub Actions, Node 24.21 TypeScript scripts, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-16-honya-ffmpeg-builds-design.md`

## Global Constraints

- Node from `.nvmrc` (24.21.0); run `export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH` before npm/npx/node.
- TypeScript rules from CLAUDE.md (no `any`, no `as unknown as`, no ts-ignore, no `!`). Scripts in `scripts/ffmpeg/*.ts` import each other with explicit `.ts` extensions and use `import type` for types (Node type stripping); they must not use enums, namespaces or parameter properties.
- No new npm dependencies.
- Commits: one line `type: subject`, no body, no trailers, no co-author.
- A shipped binary must never contain GPL or nonfree code: `--disable-gpl --disable-nonfree` present, none of `--enable-gpl`, `--enable-nonfree`, `--enable-version3`.
- Platform folder names are electron-builder's `${os}` values: `mac`, `win`, `linux`. Binaries: `build/ffmpeg/mac/ffmpeg`, `build/ffmpeg/win/ffmpeg.exe`, `build/ffmpeg/linux/ffmpeg`.
- Release assets (plan decision, simplifies fetching: no zip extraction): `ffmpeg-mac`, `ffmpeg-win.exe`, `ffmpeg-linux`, each with `<asset>.sha256` (64 lowercase hex chars, optionally followed by whitespace and a filename), plus `SOURCES.txt`, the ffmpeg source tarball, and `COPYING.LGPLv2.1`.
- Release tag: `ffmpeg-<ffmpeg.version>-<build>`; the workflow refuses to publish an existing tag.
- Releases ship unsigned; macOS binaries are ad-hoc re-signed after `lipo`.
- Repository is public: `https://github.com/mafmartins/honya`; release assets download from `https://github.com/mafmartins/honya/releases/download/<tag>/<asset>` without auth.

## Review Focus

1. **A partial or corrupt download** (network drop, HTML error page saved as the binary). Expected: fetch fails with the checksum mismatch, leaves no file at the target path. Pinned in Task 4.
2. **A flag list that drops a needed decoder** (an anime raw in HEVC 10-bit MKV, a WebM VP9, an AV1 MKV). Expected: the smoke test fails the build before publishing. Pinned in Task 3 (clip set includes HEVC Main10).
3. **A workflow re-run after a successful release.** Expected: refuses to overwrite `ffmpeg-<version>-<build>`; nothing changes for packaged apps. Pinned in Task 3.
4. **Packing on a machine without the binary or offline.** Expected: `npm run pack` stops with a clear message instead of producing an installer without ffmpeg. Pinned in Task 4.
5. **The macOS universal binary losing its signature or an architecture.** Expected: CI fails if `lipo -archs` isn't `x86_64 arm64` or `codesign --verify` fails. Pinned in Task 3.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `build/ffmpeg/VERSION` | JSON pins: ffmpeg, dav1d, zlib versions + SHA256, build number |
| `scripts/ffmpeg/pins.ts` | Read/validate pins, compute tag and asset URLs |
| `scripts/ffmpeg/checks.ts` | Pure checks: licence flags, macOS/Windows/Linux dependency output, PNG signature |
| `scripts/ffmpeg/check.ts` | CLI wrapper: run `-buildconf` and the platform dependency tool on a binary, exit non-zero on problems |
| `scripts/ffmpeg/smoke.ts` | CLI: grab a frame from each clip with `grabFrame`, require PNG output |
| `scripts/ffmpeg/fetch.ts` | CLI + exported functions: download pinned assets, verify, place, chmod |
| `scripts/ffmpeg/flags.sh` | The shared configure flag list |
| `scripts/ffmpeg/build-deps.sh` | Build static zlib and dav1d for a target |
| `scripts/ffmpeg/build.sh` | Configure + build ffmpeg for `mac-arm64`, `mac-x86_64`, `win`, `linux` |
| `scripts/ffmpeg/make-clips.sh` | Generate the smoke clips with a throwaway ffmpeg |
| `.github/workflows/ffmpeg.yml` | Build, check, smoke, publish |
| `tests/ffmpeg/*.test.ts` | Unit tests for pins, checks, fetch |
| `tsconfig.json`, `package.json`, `.gitignore`, `electron-builder.yml`, `build/ffmpeg/README.md`, `README.md`, `CLAUDE.md` | Wiring and docs |

---

### Task 1: Pins

**Files:**
- Create: `build/ffmpeg/VERSION`, `scripts/ffmpeg/pins.ts`, `tests/ffmpeg/pins.test.ts`
- Modify: `.gitignore` (add `!build/ffmpeg/VERSION`), `tsconfig.json` (`include` adds `"scripts/ffmpeg"`; `compilerOptions.allowImportingTsExtensions: true`), `package.json` (`lint` becomes `eslint src tests scripts/ffmpeg`)

**Interfaces:**
- Produces:
  ```ts
  export type OsName = "mac" | "win" | "linux"
  export interface Pin { version: string; sha256: string }
  export interface Pins { ffmpeg: Pin; dav1d: Pin; zlib: Pin; build: number }
  export function parsePins(text: string): Pins            // throws Error("Invalid build/ffmpeg/VERSION: <what>")
  export function releaseTag(pins: Pins): string            // "ffmpeg-<ffmpeg.version>-<build>"
  export function assetName(os: OsName): string             // "ffmpeg-mac" | "ffmpeg-win.exe" | "ffmpeg-linux"
  export function assetUrl(pins: Pins, asset: string): string // https://github.com/mafmartins/honya/releases/download/<tag>/<asset>
  export function hostOs(platform: NodeJS.Platform): OsName  // darwin→mac, win32→win, else linux
  ```
  `pins.ts` also runs as a CLI: `node scripts/ffmpeg/pins.ts <field>` prints `ffmpeg.version`, `ffmpeg.sha256`, `dav1d.version`, `dav1d.sha256`, `zlib.version`, `zlib.sha256`, `build` or `tag` from `build/ffmpeg/VERSION` (the shell scripts and workflow read pins through this).

- [ ] **Step 1: Write the failing tests** (`tests/ffmpeg/pins.test.ts`)
  - `"parses valid pins and builds the tag and urls"`: JSON with ffmpeg `9.0.2`, build `1` → `releaseTag` is `"ffmpeg-9.0.2-1"`; `assetUrl(pins, "ffmpeg-mac")` is `"https://github.com/mafmartins/honya/releases/download/ffmpeg-9.0.2-1/ffmpeg-mac"`.
  - `"rejects missing fields, bad hashes and bad build numbers"`: missing `dav1d`, `sha256: "abc"`, `build: 0`, `build: 1.5`, invalid JSON → each throws an Error whose message starts with `"Invalid build/ffmpeg/VERSION"`.
  - `"names assets and host folders"`: `assetName("win")` → `"ffmpeg-win.exe"`; `hostOs("darwin")` → `"mac"`, `hostOs("win32")` → `"win"`, `hostOs("linux")` → `"linux"`.
- [ ] **Step 2: Run** `npx vitest run tests/ffmpeg/pins.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `pins.ts` (sha256 = `/^[0-9a-f]{64}$/`; build = positive integer).
- [ ] **Step 4: Write real pins.** Use the latest ffmpeg 9.0.x release tarball (`https://ffmpeg.org/releases/ffmpeg-<v>.tar.xz`), the latest dav1d release tarball (`https://downloads.videolan.org/pub/videolan/dav1d/<v>/dav1d-<v>.tar.xz`) and the latest zlib (`https://zlib.net/zlib-<v>.tar.gz`). Download each, compute SHA256 with `shasum -a 256`, write `build/ffmpeg/VERSION` with `build: 1`. Check `node scripts/ffmpeg/pins.ts tag` prints `ffmpeg-<v>-1`.
- [ ] **Step 5: Run** full checks (`npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`) → PASS.
- [ ] **Step 6: Commit** — `git commit -m "chore: pin ffmpeg dav1d and zlib sources"`

---

### Task 2: Licence, dependency and frame checks

**Files:**
- Create: `scripts/ffmpeg/checks.ts`, `scripts/ffmpeg/check.ts`, `scripts/ffmpeg/smoke.ts`, `tests/ffmpeg/checks.test.ts`

**Interfaces:**
- Consumes: `OsName` (Task 1); `grabFrame` from `src/core/frames/grab.ts` (import with `.ts` extension).
- Produces:
  ```ts
  export function licenceProblems(buildconf: string): string[]   // missing --disable-gpl / --disable-nonfree, or any --enable-gpl / --enable-nonfree / --enable-version3
  export function macForeignLibraries(otool: string): string[]   // `otool -L` lines not under /usr/lib/ or /System/
  export function windowsForeignDlls(objdump: string): string[]  // "DLL Name: X" entries not in the system allowlist (case-insensitive): kernel32, user32, advapi32, bcrypt, ws2_32, shell32, ole32, msvcrt, api-ms-win-crt-*, ucrtbase
  export function linuxIsStatic(fileOutput: string): boolean     // `file` output contains "statically linked" or "static-pie linked"
  export function isPng(bytes: Uint8Array): boolean              // starts with 89 50 4E 47 0D 0A 1A 0A
  ```
  CLIs: `node scripts/ffmpeg/check.ts <os> <binary>` runs `<binary> -hide_banner -buildconf` and the OS tool (`otool -L`, `x86_64-w64-mingw32-objdump -p` (fallback `objdump -p`), `file`), prints each problem, exits 1 if any. `node scripts/ffmpeg/smoke.ts <binary> <clipsDir>` grabs a frame at 0.5 s from every file in `clipsDir` via `grabFrame` (with a `run` built on `child_process.spawn`), prints `ok <clip>` or `FAILED <clip>`, exits 1 if any failed or the folder is empty.

- [ ] **Step 1: Write the failing tests** with captured real-tool output samples as fixtures (inline strings):
  - `licenceProblems`: a buildconf with `--disable-gpl --disable-nonfree` → `[]`; with `--enable-gpl` → contains `"--enable-gpl present"`; without `--disable-nonfree` → contains `"--disable-nonfree missing"`; `--enable-version3` → contains `"--enable-version3 present"`.
  - `macForeignLibraries`: otool output listing `/usr/lib/libSystem.B.dylib`, `/System/Library/Frameworks/CoreFoundation.framework/...` → `[]`; adding `/opt/homebrew/lib/libdav1d.7.dylib` → `["/opt/homebrew/lib/libdav1d.7.dylib"]`.
  - `windowsForeignDlls`: objdump text with `DLL Name: KERNEL32.dll` and `DLL Name: api-ms-win-crt-runtime-l1-1-0.dll` → `[]`; adding `DLL Name: libwinpthread-1.dll` → `["libwinpthread-1.dll"]`.
  - `linuxIsStatic`: `"ELF 64-bit LSB executable, x86-64, statically linked"` → true; `"... dynamically linked, interpreter /lib/ld-musl-x86_64.so.1"` → false.
  - `isPng`: PNG signature bytes → true; `new TextEncoder().encode("<html>")` → false.
- [ ] **Step 2: Run** `npx vitest run tests/ffmpeg/checks.test.ts` → FAIL.
- [ ] **Step 3: Implement** `checks.ts`, then the two CLIs (thin; no unit tests for spawning).
- [ ] **Step 4: Local sanity** (macOS dev machine): `node scripts/ffmpeg/check.ts mac /opt/homebrew/bin/ffmpeg` → exits 1 listing `--enable-gpl present` and Homebrew dylibs (proves the check catches a GPL build).
- [ ] **Step 5: Run** full checks → PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat: check ffmpeg builds for gpl code and outside libraries"`

---

### Task 3: Build scripts and workflow

**Files:**
- Create: `scripts/ffmpeg/flags.sh`, `scripts/ffmpeg/build-deps.sh`, `scripts/ffmpeg/build.sh`, `scripts/ffmpeg/make-clips.sh`, `.github/workflows/ffmpeg.yml`

**Interfaces:**
- Consumes: `pins.ts` CLI (Task 1), `check.ts` and `smoke.ts` (Task 2).
- `flags.sh` exports one array/string of shared flags (spec "Configuration (shared)"):
  `--disable-everything --disable-autodetect --disable-doc --disable-network --disable-debug --disable-gpl --disable-nonfree --enable-static --disable-shared --disable-ffprobe --disable-ffplay --enable-ffmpeg --enable-protocol=file,pipe --enable-demuxer=matroska,mov,avi,mpegts --enable-parser=h264,hevc,vp8,vp9,mpeg4video,mpegvideo,av1 --enable-decoder=h264,hevc,vp8,vp9,mpeg4,mpeg2video,libdav1d --enable-libdav1d --enable-zlib --enable-encoder=png --enable-muxer=image2pipe,image2 --enable-filter=scale,format,null,buffer,buffersink --enable-swscale`
  (the implementer may add the minimum extra components the smoke test proves necessary, e.g. a bitstream filter; never a GPL/nonfree/version3 one).
- `build.sh <target>` with target `mac-arm64 | mac-x86_64 | win | linux` writes `out/<target>/ffmpeg[.exe]` and `out/<target>/configure-line.txt`. macOS: `-mmacosx-version-min` = Electron 44's minimum macOS (look it up in Electron's release notes; record it in `flags.sh`), x86_64 via `--arch=x86_64 --enable-cross-compile --extra-cflags=-arch x86_64 --extra-ldflags=-arch x86_64`. Windows: `--target-os=mingw32 --arch=x86_64 --cross-prefix=x86_64-w64-mingw32- --pkg-config-flags=--static --extra-ldflags=-static`. Linux: run inside `alpine:3` with `--extra-ldflags=-static --pkg-config-flags=--static`.
- `build-deps.sh <target>` builds zlib (static) and dav1d (`meson setup --default-library=static -Denable_tools=false -Denable_tests=false`, with a MinGW cross file for `win`, `--cross-file` for `mac-x86_64`) into a prefix `out/<target>/deps`, verifying each tarball's SHA256 from the pins. macOS may use the system zlib instead of building it.
- Workflow jobs (`on: workflow_dispatch` and `push` to `main` with `paths: [build/ffmpeg/VERSION, scripts/ffmpeg/**, .github/workflows/ffmpeg.yml]`; a `push` run builds and tests but publishes only if the tag doesn't exist yet):
  1. `clips` (ubuntu-latest): `apt-get install ffmpeg`, run `make-clips.sh clips/` producing 1-second clips: `h264.mp4` (libx264, yuv420p), `hevc10.mkv` (libx265, yuv420p10le), `vp9.webm` (libvpx-vp9), `av1.mkv` (libaom-av1 or libsvtav1), `mpeg4.avi`; upload artifact `clips`.
  2. `mac` (macos-latest, Apple Silicon): install meson/ninja/nasm via brew; build `mac-arm64` and `mac-x86_64`; `lipo -create` → `out/mac/ffmpeg`; `codesign -s - --force out/mac/ffmpeg`; assert `lipo -archs out/mac/ffmpeg` is `x86_64 arm64` and `codesign --verify out/mac/ffmpeg` succeeds; `check.ts mac`; download `clips`; `smoke.ts`. Upload artifact `ffmpeg-mac` + `configure-line.txt`.
  3. `win-build` (ubuntu-latest): install `mingw-w64 meson ninja-build nasm pkg-config`; build `win`; `check.ts win`; upload artifact.
  4. `win-test` (windows-latest, needs win-build, clips): download both, run `node scripts/ffmpeg/smoke.ts ffmpeg.exe clips` (setup-node with `.nvmrc`).
  5. `linux` (ubuntu-latest, `container: alpine:3`): `apk add build-base nasm meson ninja pkgconf linux-headers file nodejs npm` (Node ≥ 22.6 for type stripping; if Alpine's nodejs is older, use `node:24-alpine` as the container image instead); build `linux`; `check.ts linux`; smoke with clips; upload artifact.
  6. `publish` (ubuntu-latest, needs all): compute tag via `pins.ts tag`; if `gh release view <tag>` succeeds, print `"<tag> already exists; not publishing"` and exit 0 without uploading; else rename binaries to the asset names, write `<asset>.sha256` with `sha256sum`, download the pinned ffmpeg tarball (verify SHA256), write `SOURCES.txt` (source URLs + SHA256 for ffmpeg, dav1d, zlib; "macOS uses the system zlib" if so; each platform's `configure-line.txt`), copy `COPYING.LGPLv2.1` from the ffmpeg tarball, and `gh release create <tag> --title <tag> --notes-file SOURCES.txt <files…>`. `permissions: contents: write`.

- [ ] **Step 1: Local mac build (controller or implementer on the macOS dev machine, if meson/ninja/nasm are available; otherwise skip to Step 3).** `scripts/ffmpeg/build.sh mac-arm64` → `out/mac-arm64/ffmpeg` exists; `node scripts/ffmpeg/check.ts mac out/mac-arm64/ffmpeg` exits 0.
- [ ] **Step 2: Local clips + smoke** (needs any ffmpeg with x264/x265/vpx/aom, e.g. Homebrew's for clip *creation only*): `scripts/ffmpeg/make-clips.sh /tmp/clips && node scripts/ffmpeg/smoke.ts out/mac-arm64/ffmpeg /tmp/clips` → `ok` for all five clips.
- [ ] **Step 3: Lint the workflow** with actionlint (`brew install actionlint` or `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint`); it must report no errors. If neither is available, say so in the report; the remote run in Step 6 is the final check.
- [ ] **Step 4: Run** full repo checks → PASS (shell files aren't covered; `format:check` must still pass — add `out/` to `.gitignore` and `.prettierignore`).
- [ ] **Step 5: Commit** — `git commit -m "feat: build lgpl ffmpeg for mac windows and linux in ci"`
- [ ] **Step 6: Remote run (controller, needs the user's go-ahead to push):** push `main`, `gh workflow run ffmpeg.yml`, watch it; every job green; the release `ffmpeg-<v>-1` exists with the three binaries, three `.sha256`, `SOURCES.txt`, the tarball and `COPYING.LGPLv2.1`. Re-run the workflow: publish job prints `already exists; not publishing` (Review Focus 3). Fix failures in follow-up commits (one per fix).

---

### Task 4: Fetch and packaging

**Files:**
- Create: `scripts/ffmpeg/fetch.ts`, `tests/ffmpeg/fetch.test.ts`
- Modify: `package.json` (`"fetch:ffmpeg": "node scripts/ffmpeg/fetch.ts"`, `"pack": "node scripts/ffmpeg/fetch.ts && node scripts/build.mjs && electron-builder"`), `electron-builder.yml` (`mac.binaries: ["Contents/Resources/ffmpeg/ffmpeg"]`; replace the header comment with one saying releases are unsigned and electron-builder signs the bundled ffmpeg when a certificate is configured)

**Interfaces:**
- Consumes: `parsePins`, `assetName`, `assetUrl`, `hostOs`, `OsName` (Task 1).
- Produces:
  ```ts
  export interface FetchDeps { fetch: typeof fetch; readFile(path: string): string; writeFile(path: string, bytes: Uint8Array): void; chmod(path: string): void; exists(path: string): boolean; remove(path: string): void }
  export function targetPath(root: string, os: OsName): string            // <root>/build/ffmpeg/<os>/ffmpeg[.exe]
  export function parseChecksum(text: string): string                     // first 64-hex token, lowercase; throws Error("Bad checksum file") otherwise
  export async function fetchFfmpeg(root: string, os: OsName, deps: FetchDeps): Promise<"downloaded" | "up-to-date">
  ```
  Behavior: reads `<root>/build/ffmpeg/VERSION`; downloads `<asset>.sha256` then `<asset>`; non-200 → throws `` `Couldn't download ${asset} (HTTP ${status}). Check your connection, or that release ${tag} exists.` ``; a network rejection → throws `` `Couldn't download ${asset}: ${message}` ``; SHA256 of the bytes ≠ checksum → throws `` `${asset} failed its checksum; nothing was written.` `` and writes nothing; an existing target whose SHA256 already matches → `"up-to-date"` (no download of the binary); otherwise writes to `<target>.part`, renames over the target, `chmod 0o755` (skipped on win). CLI: default = host OS; `--all` = all three; prints one line per OS (`ffmpeg mac: downloaded` / `up-to-date`); on error prints the message and exits 1 (Review Focus 4: `pack` stops).

- [ ] **Step 1: Write the failing tests** with an in-memory fake `FetchDeps` and a fake `fetch` keyed by URL:
  - `"downloads, verifies and places the binary"`: correct checksum → returns `"downloaded"`; file written at `targetPath(root, "mac")`; `chmod` called for mac, not for win.
  - `"refuses a binary whose checksum doesn't match and writes nothing"` (Review Focus 1): body `"<html>error</html>"` → rejects with `"ffmpeg-mac failed its checksum; nothing was written."`; no file at the target and no `.part` left.
  - `"skips the download when the existing binary matches"`: target exists with matching bytes → `"up-to-date"`, the binary URL never requested.
  - `"reports a missing release clearly"`: 404 → rejects with `"Couldn't download ffmpeg-mac.sha256 (HTTP 404). Check your connection, or that release ffmpeg-9.0.2-1 exists."`.
  - `parseChecksum`: `"<64hex>  ffmpeg-mac\n"` → the hex; `"nope"` → throws `"Bad checksum file"`.
- [ ] **Step 2: Run** `npx vitest run tests/ffmpeg/fetch.test.ts` → FAIL.
- [ ] **Step 3: Implement** `fetch.ts` (SHA256 via `node:crypto`; real deps via `node:fs`).
- [ ] **Step 4: Run** full checks → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: fetch the pinned ffmpeg before packaging"`

---

### Task 5: Docs

**Files:**
- Modify: `build/ffmpeg/README.md`, `README.md`, `CLAUDE.md`

- [ ] **Step 1:** `build/ffmpeg/README.md`: replace the old configure section with: where binaries come from (the `ffmpeg` workflow and releases tagged `ffmpeg-<version>-<build>`), how to bump (edit `VERSION`, bump `build`, push, run the workflow), `npm run fetch:ffmpeg [--all]`, the LGPL material each release carries, and that the flag list lives in `scripts/ffmpeg/flags.sh`.
- [ ] **Step 2:** `README.md`: add an "Installing" section with the spec's first-launch steps verbatim in meaning (macOS Open Anyway path + `xattr` alternative; Windows More info → Run anyway; Linux `chmod +x`), the one-line "why unsigned" note, and in "Development" replace the ffmpeg paragraph with `npm run fetch:ffmpeg`.
- [ ] **Step 3:** `CLAUDE.md`: `build/ffmpeg/<os>/` line now says "fetched by `npm run fetch:ffmpeg` from this repo's `ffmpeg-*` releases (built by `.github/workflows/ffmpeg.yml`); not committed"; add `npm run fetch:ffmpeg` to Commands.
- [ ] **Step 4:** `npm run format:check` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "docs: explain the ffmpeg builds and first launch steps"`

---

### Task 6: End-to-end verification (controller + user)

- [ ] **Step 1:** After the release exists: `npm run fetch:ffmpeg` on the dev Mac → `ffmpeg mac: downloaded`; `build/ffmpeg/mac/ffmpeg -hide_banner -buildconf` shows `--disable-gpl`; run again → `up-to-date`.
- [ ] **Step 2:** `npm start`, choose a real episode + its video, frame setting "only the marked lines", translate a short script → frames grabbed (no ffmpeg error; report shows frames used).
- [ ] **Step 3:** `npm run pack` → `release/` contains the dmg; mount it, check `Honya.app/Contents/Resources/ffmpeg/ffmpeg` exists, `lipo -archs` shows both architectures, `codesign --verify` passes.
- [ ] **Step 4:** Commit any fixes, one commit per fix.
