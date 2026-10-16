import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  fetchFfmpeg,
  parseChecksum,
  targetPath,
  type FetchDeps,
} from "../../scripts/ffmpeg/fetch.ts"

const ROOT = "/repo"
const RELEASE = "https://github.com/mafmartins/honya/releases/download/ffmpeg-9.0.2-1"
const BINARY = new TextEncoder().encode("real ffmpeg bytes")

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

const VERSION = JSON.stringify({
  ffmpeg: { version: "9.0.2", sha256: "a".repeat(64) },
  dav1d: { version: "1.5.4", sha256: "b".repeat(64) },
  zlib: { version: "1.3.2", sha256: "c".repeat(64) },
  build: 1,
})

interface Fake {
  deps: FetchDeps
  files: Map<string, Uint8Array>
  chmodded: string[]
  requested: string[]
}

function fake(responses: Record<string, Response | Error>): Fake {
  const files = new Map<string, Uint8Array>()
  const chmodded: string[] = []
  const requested: string[] = []
  files.set(`${ROOT}/build/ffmpeg/VERSION`, new TextEncoder().encode(VERSION))
  const deps: FetchDeps = {
    fetch: (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      requested.push(url)
      const response = responses[url]
      if (response instanceof Error) {
        return Promise.reject(response)
      }
      return Promise.resolve(response ?? new Response("missing", { status: 404 }))
    },
    readFile: (path) => {
      const bytes = files.get(path)
      if (bytes === undefined) {
        throw new Error(`ENOENT ${path}`)
      }
      return new TextDecoder().decode(bytes)
    },
    readBytes: (path) => files.get(path) ?? null,
    writeFile: (path, bytes) => {
      files.set(path, bytes)
    },
    rename: (from, to) => {
      const bytes = files.get(from)
      if (bytes !== undefined) {
        files.set(to, bytes)
        files.delete(from)
      }
    },
    remove: (path) => {
      files.delete(path)
    },
    chmod: (path) => {
      chmodded.push(path)
    },
  }
  return { deps, files, chmodded, requested }
}

describe("fetch ffmpeg", () => {
  it("downloads, verifies and places the binary", async () => {
    const mac = fake({
      [`${RELEASE}/ffmpeg-mac.sha256`]: new Response(`${sha256(BINARY)}  ffmpeg-mac\n`),
      [`${RELEASE}/ffmpeg-mac`]: new Response(BINARY),
    })
    expect(await fetchFfmpeg(ROOT, "mac", mac.deps)).toBe("downloaded")
    expect(mac.files.get(targetPath(ROOT, "mac"))).toEqual(BINARY)
    expect(mac.chmodded).toEqual([targetPath(ROOT, "mac")])

    const win = fake({
      [`${RELEASE}/ffmpeg-win.exe.sha256`]: new Response(sha256(BINARY)),
      [`${RELEASE}/ffmpeg-win.exe`]: new Response(BINARY),
    })
    expect(await fetchFfmpeg(ROOT, "win", win.deps)).toBe("downloaded")
    expect(targetPath(ROOT, "win")).toBe("/repo/build/ffmpeg/win/ffmpeg.exe")
    expect(win.chmodded).toEqual([])
  })

  it("refuses a binary whose checksum doesn't match and writes nothing", async () => {
    const mac = fake({
      [`${RELEASE}/ffmpeg-mac.sha256`]: new Response(sha256(BINARY)),
      [`${RELEASE}/ffmpeg-mac`]: new Response("<html>error</html>"),
    })
    await expect(fetchFfmpeg(ROOT, "mac", mac.deps)).rejects.toThrow(
      "ffmpeg-mac failed its checksum; nothing was written.",
    )
    expect(mac.files.has(targetPath(ROOT, "mac"))).toBe(false)
    expect(mac.files.has(`${targetPath(ROOT, "mac")}.part`)).toBe(false)
  })

  it("skips the download when the existing binary matches", async () => {
    const mac = fake({
      [`${RELEASE}/ffmpeg-mac.sha256`]: new Response(sha256(BINARY)),
    })
    mac.files.set(targetPath(ROOT, "mac"), BINARY)
    expect(await fetchFfmpeg(ROOT, "mac", mac.deps)).toBe("up-to-date")
    expect(mac.requested).toEqual([`${RELEASE}/ffmpeg-mac.sha256`])
  })

  it("reports a missing release and a network failure clearly", async () => {
    await expect(fetchFfmpeg(ROOT, "mac", fake({}).deps)).rejects.toThrow(
      "Couldn't download ffmpeg-mac.sha256 (HTTP 404). Check your connection, or that release ffmpeg-9.0.2-1 exists.",
    )
    const offline = fake({ [`${RELEASE}/ffmpeg-mac.sha256`]: new Error("getaddrinfo ENOTFOUND") })
    await expect(fetchFfmpeg(ROOT, "mac", offline.deps)).rejects.toThrow(
      "Couldn't download ffmpeg-mac.sha256: getaddrinfo ENOTFOUND",
    )
  })

  it("reads the first checksum in a checksum file", () => {
    const hash = "d".repeat(64)
    expect(parseChecksum(`${hash}  ffmpeg-mac\n`)).toBe(hash)
    expect(parseChecksum(hash.toUpperCase())).toBe(hash)
    expect(() => parseChecksum("nope")).toThrow("Bad checksum file")
  })
})
