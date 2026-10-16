# Honya LGPL ffmpeg builds

## Intent

Honya bundles one ffmpeg executable per platform and uses it for exactly one job: open a video and write one frame as a PNG at a given time (`src/core/frames/grab.ts` runs `ffmpeg -ss <sec> -i <video> -frames:v 1 -f image2pipe -vcodec png pipe:1`). The binary must be LGPL so Honya can ship as it likes. Today `build/ffmpeg/` holds only a README, so packaged apps have no ffmpeg and frames never work.

The user chose to build every platform's binary ourselves, from source, with one shared minimal configuration, rather than download third-party builds. Reason: no trustworthy LGPL download exists for macOS, and one configuration everywhere means a video that opens on one platform opens on all of them.

## Goals

- A reproducible, pinned, LGPL-only ffmpeg executable for: macOS (one universal binary, arm64 + x86_64), Windows x64, Linux x64.
- The same decoder-only configuration on every platform.
- Built by a GitHub Actions workflow in this repo and published as release assets with checksums.
- A fetch step that puts the right binary in `build/ffmpeg/<os>/` before `npm run pack`, verifying checksums.
- The macOS binary signed together with the app so a notarized app can run it.
- LGPL compliance material published with every build: the exact source tarball, the configure flags, the licence text.

## Non-goals

- Windows ARM64 and Linux ARM64 (later, if needed).
- Building ffmpeg on every app release or in the regular CI workflow.
- Hardware decoding, encoding anything except PNG, audio, ffprobe, ffplay.
- Changing how Honya calls ffmpeg (`grab.ts` stays as is).

## Anti-goals

- Any GPL or nonfree code in a shipped binary. A build where `ffmpeg -buildconf` shows `--enable-gpl`, `--enable-nonfree` or `--enable-version3` must fail.
- A binary that depends on libraries not present on a clean user machine (no Homebrew dylibs on macOS, no DLLs beside `ffmpeg.exe` on Windows, no distro-specific shared libraries on Linux).
- Downloading an unverified binary into a release.

## The build

**Source.** The official release tarball from ffmpeg.org for a pinned version (the current release branch, 9.0.x at the time of writing), verified against a SHA256 stored in the repo.

**Pins.** One file, `build/ffmpeg/VERSION`, holds everything that decides a build: the ffmpeg version and tarball SHA256, the dav1d version and SHA256, the zlib version and SHA256, and the build number `n` used in the release tag. The workflow reads its inputs only from this file and refuses to publish if the tag `ffmpeg-<version>-<n>` already exists, so a published tag never changes. Bumping any pin means bumping `n`. *(My call.)* The file's exact format is the builder's.

**Configuration (shared).** Start from `--disable-everything --disable-autodetect --disable-doc --disable-network --disable-debug`, keep `--disable-gpl --disable-nonfree` explicit, build statically (`--enable-static --disable-shared`), and enable only what the grab needs:

- programs: `ffmpeg` only (`--disable-ffprobe --disable-ffplay`)
- protocols: `file`, `pipe`
- demuxers: `matroska` (covers WebM), `mov` (MP4/MOV/M4V), `avi`, `mpegts`
- parsers and decoders: `h264`, `hevc`, `vp8`, `vp9`, `mpeg4`, `mpeg2video`
- AV1: decoded through `libdav1d` (BSD-2-Clause, LGPL-compatible), built and statically linked as part of the job *(my call; AV1 is common in recent web releases and ffmpeg's built-in AV1 decoder needs hardware acceleration)*
- encoder: `png`; muxer: `image2pipe` (and `image2`)
- filters needed by the default conversion: `scale`, `format`, `null`, `buffer`, `buffersink` (swscale enabled)
- zlib for PNG: static zlib on Windows and Linux; the system zlib on macOS is acceptable

The exact flag list is the builder's to finalize; the rule is "the smallest set that makes the smoke test pass on the sample videos".

**Per platform:**

- **macOS:** built on a GitHub Apple Silicon runner. x86_64 is cross-compiled from it (`--arch=x86_64 --enable-cross-compile` with clang `-arch x86_64`). The two are merged with `lipo` into one universal `ffmpeg`, which is then re-signed ad-hoc (`codesign -s - --force`), because `lipo` invalidates the linker's ad-hoc signature and Apple Silicon refuses to run unsigned code. Developer ID signing happens later, in electron-builder, when a certificate is configured *(my call)*. Minimum macOS deployment target matches Electron 44's minimum *(builder confirms the value)*.
- dav1d is built with meson, ninja and nasm on each platform (natively on macOS for both architectures, cross with a MinGW meson cross file for Windows, in the Alpine container for Linux).
- **Windows x64:** cross-compiled on a Linux runner with MinGW-w64 (`--target-os=mingw32 --arch=x86_64 --cross-prefix=x86_64-w64-mingw32-`), fully static, producing a single `ffmpeg.exe`.
- **Linux x64:** built inside an Alpine (musl) container as a fully static executable.

**Checks every build must pass before publishing:**

1. `ffmpeg -buildconf` contains `--disable-gpl` and `--disable-nonfree` and none of `--enable-gpl`, `--enable-nonfree`, `--enable-version3`.
2. Dependency check: macOS `otool -L` lists only `/usr/lib/` and `/System/` entries; Windows `objdump -p` imports only system DLLs (KERNEL32, msvcrt/ucrt, etc.); Linux `file` reports "statically linked".
3. Smoke test on the build's own platform; the Windows binary is passed to a `windows-latest` job and tested there, not under Wine *(my call)*: grab a frame from small sample clips covering H.264 in MP4, HEVC in MKV, VP9 in WebM and AV1 in MKV, and check the output starts with the PNG signature. Sample clips are generated in the job with a throwaway ffmpeg (they don't need to be LGPL and are never shipped) or committed as tiny fixtures *(builder's call)*.
4. macOS: `lipo -archs` reports `x86_64 arm64`.

**Publishing.** The repository is public (made public on 2026-10-16 for this reason), so release assets download anonymously and the LGPL source material is reachable by anyone. The workflow runs on manual dispatch and when `build/ffmpeg/VERSION` changes on `main`. It publishes a GitHub release in this repo tagged `ffmpeg-<version>-<n>` with:

- `ffmpeg-mac.zip`, `ffmpeg-win.zip`, `ffmpeg-linux.zip`, each with a `.sha256`
- `SOURCES.txt` (or similar): the source tarball URL and SHA256, the dav1d and zlib versions and hashes (and, for macOS, that the system zlib is used), and the full configure line per platform
- the ffmpeg source tarball itself, and `COPYING.LGPLv2.1`

## Packaging

- Packaging happens on a developer machine; there is no release workflow, and none is added here *(my call)*. A script (e.g. `scripts/fetch-ffmpeg.mjs`, run by a new `npm run fetch:ffmpeg`, and run automatically before `pack`) downloads the assets of the release tag pinned in `build/ffmpeg/VERSION` into `build/ffmpeg/mac/ffmpeg`, `build/ffmpeg/win/ffmpeg.exe`, `build/ffmpeg/linux/ffmpeg`, verifies each `.sha256`, and sets the executable bit. It fetches only the current host's platform by default, with a flag for all. It refuses to overwrite with a file whose checksum doesn't match.
- `electron-builder.yml` keeps `extraResources: build/ffmpeg/${os} → ffmpeg` (electron-builder's `${os}` is `mac`, `win`, `linux`, matching the folder names) and lists the macOS binary under `mac.binaries` so it is signed with the hardened runtime as part of the app.
- `npm start` (unpackaged) already looks in `build/ffmpeg/<os>/` (`devFfmpegPath`), so running the fetch script once makes frames work in development too.
- `build/ffmpeg/*` stays git-ignored except the README and `VERSION`.
- Update `build/ffmpeg/README.md` to describe the new flow and replace the old configure line.

## Signing and first launch

Releases are unsigned for now: no Apple Developer ID, no notarization, no Windows code-signing certificate (user's decision, 2026-10-16). macOS still requires an ad-hoc signature on Apple Silicon, which electron-builder applies to the app and the workflow applies to ffmpeg. When a Developer ID is added later, electron-builder signs ffmpeg through `mac.binaries` with no change to the build workflow.

The project `README.md` gets an "Installing" section with first-launch steps:

- **macOS:** open Honya once, dismiss the "Apple could not verify" dialog, then go to System Settings → Privacy & Security, click **Open Anyway** next to the Honya message, and confirm. Needed once per installed version. As an alternative for technical users: `xattr -dr com.apple.quarantine /Applications/Honya.app`.
- **Windows:** on the SmartScreen "Windows protected your PC" screen, click **More info** → **Run anyway**.
- **Linux:** make the AppImage executable (`chmod +x Honya-*.AppImage`) and run it.
- A short note on why: the app is not signed because signing costs a yearly fee; the source and build steps are public in the repository.

## Constraints

- Node 24.21 and the project's existing rules (strict TypeScript, pinned dependencies at least a week old, single-line commits) apply to any script code.
- No new npm dependencies for the fetch script (Node's `fetch`, `crypto` and `fs` are enough); a zip extractor may use the system `unzip`/`tar` or a small pure-JS approach *(builder's call)*.
- GitHub Actions only; no self-hosted runners.

## Left to the builder

- The final flag list, within the rules above.
- Whether sample clips are generated in the job or committed.
- Whether the macOS universal binary is merged in the same job or a follow-up job.
- How `VERSION` records the pinned ffmpeg version, hashes and release tag.
