# Honya

Honya is an open-source desktop app for fansubbers and hobbyist translators. It translates the dialogue of an English ASS script into European or Brazilian Portuguese, in your own voice, using your own API key for Claude, GPT, Gemini or Mistral.

Everything runs locally on Linux, macOS and Windows. Scripts, profiles and keys stay on your machine. There is no account and no hosted service.

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

A video is optional context for the translation. To use it, place an LGPL ffmpeg binary in `build/ffmpeg/<os>/` before packaging. See [build/ffmpeg/README.md](build/ffmpeg/README.md) for the build flags.

## Packaging

```sh
npm run pack
```

Installers are written to `release/`.
