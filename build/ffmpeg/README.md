# Bundled ffmpeg

Honya ships one **LGPL** ffmpeg binary per host platform (macOS, Windows, static Linux). Honya calls that unpacked path and does not search `PATH`. The binary is used only to decode video and emit one PNG frame per cue.

Each release publishes the matching ffmpeg source tarball and the configure flags used to build the bundled binary.

## Configure

Build without GPL-only or nonfree components:

```text
./configure --disable-gpl --disable-nonfree --disable-programs --disable-doc --enable-encoder=png
```

Do not pass `--enable-gpl` or `--enable-nonfree`.

## Packaging

electron-builder copies the platform binary into `resources/ffmpeg` via `extraResources`, **outside** the `asar` archive, so the OS can execute it. Map `build/ffmpeg/${os}` to `ffmpeg` in your electron-builder config.
