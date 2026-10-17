# Honya

Honya is an open-source desktop app for fansubbers and hobbyist translators. It translates the dialogue of an English ASS script into European or Brazilian Portuguese, in your own voice, using your own API key for Claude, GPT, Gemini or Mistral.

Everything runs locally on Linux, macOS and Windows. Scripts, projects and keys stay on your machine. There is no account and no hosted service.

## Installing

Download the installer for your system from the [releases page](https://github.com/mafmartins/honya/releases). Honya is not code-signed yet, because signing costs a yearly fee, so your system will warn you the first time. The source and the build steps are all public in this repository.

- **macOS:** open Honya once and dismiss the "Apple could not verify" message. Then go to **System Settings → Privacy & Security**, click **Open Anyway** next to the Honya message, and confirm. You need to do this once per installed version. If you're comfortable with Terminal, `xattr -dr com.apple.quarantine /Applications/Honya.app` does the same.
- **Windows:** on the "Windows protected your PC" screen, click **More info**, then **Run anyway**.
- **Linux:** make the AppImage executable with `chmod +x Honya-*.AppImage`, then run it.

## Development

Requires the Node version in `.nvmrc`.

```sh
nvm use
npm ci
npm start
```

Checks:

```sh
npm run typecheck
npm run lint
npm run format:check
npm test
```

## Video frames

A video is optional context for the translation. Honya reads frames with a bundled LGPL ffmpeg. Fetch it once for development:

```sh
npm run fetch:ffmpeg
```

See [build/ffmpeg/README.md](build/ffmpeg/README.md) for how the binaries are built.

## Packaging

```sh
npm run pack
```

Installers are written to `release/`.
