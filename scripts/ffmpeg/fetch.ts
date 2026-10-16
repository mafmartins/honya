import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  assetName,
  assetUrl,
  hostOs,
  parsePins,
  RELEASE_FILES,
  releaseTag,
  withAssets,
  type OsName,
} from "./pins.ts"
import { isMain } from "./main.ts"

export interface FetchDeps {
  fetch: typeof fetch
  readFile(path: string): string
  readBytes(path: string): Uint8Array | null
  writeFile(path: string, bytes: Uint8Array): void
  rename(from: string, to: string): void
  remove(path: string): void
  chmod(path: string): void
}

export function targetPath(root: string, os: OsName): string {
  return join(root, "build", "ffmpeg", os, os === "win" ? "ffmpeg.exe" : "ffmpeg")
}

// Files placed next to the binary so the app carries the LGPL text, dav1d's BSD notice
// and the source and build details (they end up in Resources/ffmpeg/).
const NOTICE_FILES = ["COPYING.LGPLv2.1", "COPYING.dav1d", "SOURCES.txt"]

export async function fetchFfmpeg(
  root: string,
  os: OsName,
  deps: FetchDeps,
): Promise<"downloaded" | "up-to-date"> {
  const pins = parsePins(deps.readFile(join(root, "build", "ffmpeg", "VERSION")))
  const tag = releaseTag(pins)
  const assets = pins.assets
  if (assets === undefined) {
    throw new Error(
      `build/ffmpeg/VERSION has no pinned checksums for ${tag}. Once that release is published, run \`npm run ffmpeg:pin\` and commit the result.`,
    )
  }
  const binary = targetPath(root, os)
  const folder = dirname(binary)
  const wanted: [string, string][] = [
    [assetName(os), binary],
    ...NOTICE_FILES.map((name): [string, string] => [name, join(folder, name)]),
  ]
  let downloaded = false
  for (const [asset, target] of wanted) {
    const expected = assets[asset]
    if (expected === undefined) {
      throw new Error(`build/ffmpeg/VERSION has no pinned checksum for ${asset}.`)
    }
    const existing = deps.readBytes(target)
    if (existing !== null && sha256(existing) === expected) {
      continue
    }
    const bytes = await download(deps, assetUrl(pins, asset), asset, tag)
    if (sha256(bytes) !== expected) {
      throw new Error(`${asset} failed its checksum; nothing was written.`)
    }
    const part = `${target}.part`
    try {
      deps.writeFile(part, bytes)
      deps.rename(part, target)
    } catch (error) {
      deps.remove(part)
      throw error
    }
    downloaded = true
  }
  if (os !== "win") {
    deps.chmod(binary)
  }
  return downloaded ? "downloaded" : "up-to-date"
}

export async function recordAssets(root: string, deps: FetchDeps): Promise<Record<string, string>> {
  const pins = parsePins(deps.readFile(join(root, "build", "ffmpeg", "VERSION")))
  const tag = releaseTag(pins)
  const assets: Record<string, string> = {}
  for (const asset of RELEASE_FILES) {
    assets[asset] = sha256(await download(deps, assetUrl(pins, asset), asset, tag))
  }
  return assets
}

async function download(
  deps: FetchDeps,
  url: string,
  asset: string,
  tag: string,
): Promise<Uint8Array> {
  let response: Response
  try {
    response = await deps.fetch(url)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Couldn't download ${asset}: ${message}`)
  }
  if (response.status !== 200) {
    throw new Error(
      `Couldn't download ${asset} (HTTP ${String(response.status)}). Check your connection, or that release ${tag} exists.`,
    )
  }
  return new Uint8Array(await response.arrayBuffer())
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

const nodeDeps: FetchDeps = {
  fetch: (input, init) => fetch(input, init),
  readFile: (path) => readFileSync(path, "utf8"),
  readBytes: (path) => {
    try {
      return new Uint8Array(readFileSync(path))
    } catch {
      return null
    }
  },
  writeFile: (path, bytes) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, bytes)
  },
  rename: (from, to) => {
    renameSync(from, to)
  },
  remove: (path) => {
    rmSync(path, { force: true })
  },
  chmod: (path) => {
    chmodSync(path, 0o755)
  },
}

if (isMain(process.argv[1], import.meta.url)) {
  const root = fileURLToPath(new URL("../..", import.meta.url))
  try {
    if (process.argv.includes("--pin")) {
      const versionFile = join(root, "build", "ffmpeg", "VERSION")
      const assets = await recordAssets(root, nodeDeps)
      writeFileSync(versionFile, withAssets(readFileSync(versionFile, "utf8"), assets))
      process.stdout.write(
        `Pinned ${String(Object.keys(assets).length)} release files in build/ffmpeg/VERSION\n`,
      )
    } else {
      const targets: OsName[] = process.argv.includes("--all")
        ? ["mac", "win", "linux"]
        : [hostOs(process.platform)]
      for (const os of targets) {
        const result = await fetchFfmpeg(root, os, nodeDeps)
        process.stdout.write(`ffmpeg ${os}: ${result}\n`)
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
