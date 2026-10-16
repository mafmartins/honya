import { createHash } from "node:crypto"
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { assetName, assetUrl, hostOs, parsePins, releaseTag, type OsName } from "./pins.ts"
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

export function parseChecksum(text: string): string {
  const match = /\b([0-9a-fA-F]{64})\b/.exec(text)
  if (match?.[1] === undefined) {
    throw new Error("Bad checksum file")
  }
  return match[1].toLowerCase()
}

export async function fetchFfmpeg(
  root: string,
  os: OsName,
  deps: FetchDeps,
): Promise<"downloaded" | "up-to-date"> {
  const pins = parsePins(deps.readFile(join(root, "build", "ffmpeg", "VERSION")))
  const tag = releaseTag(pins)
  const asset = assetName(os)
  const target = targetPath(root, os)

  const expected = parseChecksum(
    new TextDecoder().decode(
      await download(deps, assetUrl(pins, `${asset}.sha256`), `${asset}.sha256`, tag),
    ),
  )
  const existing = deps.readBytes(target)
  if (existing !== null && sha256(existing) === expected) {
    return "up-to-date"
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
  if (os !== "win") {
    deps.chmod(target)
  }
  return "downloaded"
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
  const targets: OsName[] = process.argv.includes("--all")
    ? ["mac", "win", "linux"]
    : [hostOs(process.platform)]
  try {
    for (const os of targets) {
      const result = await fetchFfmpeg(root, os, nodeDeps)
      process.stdout.write(`ffmpeg ${os}: ${result}\n`)
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
