import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { isMain } from "./main.ts"

export type OsName = "mac" | "win" | "linux"

export interface Pin {
  version: string
  sha256: string
}

export interface Pins {
  ffmpeg: Pin
  dav1d: Pin
  zlib: Pin
  build: number
  // SHA256 of each published release file, recorded after the release exists so the
  // repository, not the (mutable) release, decides which bytes are accepted.
  assets?: Record<string, string>
}

export const RELEASE_FILES: readonly string[] = [
  "ffmpeg-mac",
  "ffmpeg-win.exe",
  "ffmpeg-linux",
  "COPYING.LGPLv2.1",
  "COPYING.dav1d",
  "SOURCES.txt",
]

const REPO_RELEASES = "https://github.com/mafmartins/honya/releases/download"
const SHA256 = /^[0-9a-f]{64}$/

export function parsePins(text: string): Pins {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw invalid("not valid JSON")
  }
  if (!isRecord(parsed)) {
    throw invalid("expected an object")
  }
  const build = parsed.build
  if (typeof build !== "number" || !Number.isInteger(build) || build < 1) {
    throw invalid("build must be a positive whole number")
  }
  const pins: Pins = {
    ffmpeg: readPin(parsed, "ffmpeg"),
    dav1d: readPin(parsed, "dav1d"),
    zlib: readPin(parsed, "zlib"),
    build,
  }
  if (parsed.assets !== undefined) {
    pins.assets = readAssets(parsed.assets)
  }
  return pins
}

export function withAssets(text: string, assets: Record<string, string>): string {
  const pins = parsePins(text)
  const next: Pins = { ...pins, assets }
  parsePins(JSON.stringify(next))
  return `${JSON.stringify(next, null, 2)}\n`
}

export function releaseTag(pins: Pins): string {
  return `ffmpeg-${pins.ffmpeg.version}-${String(pins.build)}`
}

export function assetName(os: OsName): string {
  return os === "win" ? "ffmpeg-win.exe" : `ffmpeg-${os}`
}

export function assetUrl(pins: Pins, asset: string): string {
  return `${REPO_RELEASES}/${releaseTag(pins)}/${asset}`
}

export function hostOs(platform: NodeJS.Platform): OsName {
  if (platform === "darwin") {
    return "mac"
  }
  return platform === "win32" ? "win" : "linux"
}

function readPin(record: Record<string, unknown>, name: string): Pin {
  const value = record[name]
  if (!isRecord(value) || typeof value.version !== "string" || value.version === "") {
    throw invalid(`${name}.version is missing`)
  }
  if (typeof value.sha256 !== "string" || !SHA256.test(value.sha256)) {
    throw invalid(`${name}.sha256 must be 64 lowercase hex characters`)
  }
  return { version: value.version, sha256: value.sha256 }
}

function readAssets(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    throw invalid("assets must be an object of file name to SHA256")
  }
  const assets: Record<string, string> = {}
  for (const [name, hash] of Object.entries(value)) {
    if (typeof hash !== "string" || !SHA256.test(hash)) {
      throw invalid(`assets.${name} must be 64 lowercase hex characters`)
    }
    assets[name] = hash
  }
  return assets
}

function invalid(what: string): Error {
  return new Error(`Invalid build/ffmpeg/VERSION: ${what}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function field(pins: Pins, name: string): string | null {
  switch (name) {
    case "ffmpeg.version":
      return pins.ffmpeg.version
    case "ffmpeg.sha256":
      return pins.ffmpeg.sha256
    case "dav1d.version":
      return pins.dav1d.version
    case "dav1d.sha256":
      return pins.dav1d.sha256
    case "zlib.version":
      return pins.zlib.version
    case "zlib.sha256":
      return pins.zlib.sha256
    case "build":
      return String(pins.build)
    case "tag":
      return releaseTag(pins)
    default:
      return null
  }
}

if (isMain(process.argv[1], import.meta.url)) {
  const versionFile = fileURLToPath(new URL("../../build/ffmpeg/VERSION", import.meta.url))
  const name = process.argv[2] ?? ""
  const value = field(parsePins(readFileSync(versionFile, "utf8")), name)
  if (value === null) {
    process.stderr.write(`Unknown field: ${name}\n`)
    process.exit(1)
  }
  process.stdout.write(`${value}\n`)
}
