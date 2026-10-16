# Bundled ffmpeg

Honya ships one **LGPL** ffmpeg executable per platform and uses it for one job: open a video and write one frame as a PNG. Honya runs that bundled binary and never searches `PATH`.

The binary is a small decoder-only build (H.264, HEVC, VP8, VP9, MPEG-4, MPEG-2 and AV1 through dav1d, in MKV/WebM, MP4/MOV, AVI and MPEG-TS). It contains no GPL or nonfree code.

## Where the binaries come from

The [`ffmpeg` workflow](../../.github/workflows/ffmpeg.yml) builds them from source on GitHub Actions and publishes a release in this repository tagged `ffmpeg-<version>-<build>`:

| Asset            | Platform                              |
| ---------------- | ------------------------------------- |
| `ffmpeg-mac`     | macOS 13+, universal (arm64 + x86_64) |
| `ffmpeg-win.exe` | Windows x64                           |
| `ffmpeg-linux`   | Linux x64, fully static (musl)        |

Each asset has a `.sha256` file. Before publishing, every build must pass a licence check (`--disable-gpl --disable-nonfree`, no `--enable-gpl`, `--enable-nonfree` or `--enable-version3`), a check that it links only system libraries, and a smoke test that grabs a frame from H.264, HEVC 10-bit, VP9, AV1, MPEG-4 and MPEG-2 clips on its own operating system.

## Getting the binary

```sh
npm run fetch:ffmpeg        # this machine's platform
npm run fetch:ffmpeg -- --all
```

This downloads the release pinned in [`VERSION`](VERSION) into `build/ffmpeg/<os>/`, checks the SHA256 and refuses anything that doesn't match. `npm run pack` runs it first, so a package never ships without ffmpeg; `npm start` uses the same folder.

## Changing the build

- **Flags:** [`scripts/ffmpeg/flags.sh`](../../scripts/ffmpeg/flags.sh). Keep it the smallest set that passes the smoke test.
- **Versions:** edit [`VERSION`](VERSION) (ffmpeg, dav1d and zlib versions with their tarball SHA256) and **increase `build`**. A published tag never changes; the workflow refuses to overwrite one.
- Push to `main` (or run the workflow by hand). When it finishes, `npm run fetch:ffmpeg` picks up the new release.

To build locally: `scripts/ffmpeg/build.sh <mac-arm64|mac-x86_64|win|linux>` (needs meson, ninja and, for x86, nasm), then `node scripts/ffmpeg/check.ts <os> out/<target>/ffmpeg`.

## LGPL material

Every release carries the exact ffmpeg source tarball, `COPYING.LGPLv2.1`, and a `SOURCES.txt` listing the source URLs and hashes for ffmpeg, dav1d and zlib, and the full configure line for each platform.

## Packaging

electron-builder copies `build/ffmpeg/${os}` to `Resources/ffmpeg` with `extraResources`, outside the `asar` archive, so the OS can run it. On macOS it is listed under `mac.binaries`, so it is signed together with the app once a certificate is configured.
