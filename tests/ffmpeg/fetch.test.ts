import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  fetchFfmpeg,
  recordAssets,
  targetPath,
  type FetchDeps,
} from "../../scripts/ffmpeg/fetch.ts"

const ROOT = "/repo"
const RELEASE = "https://github.com/mafmartins/honya/releases/download/ffmpeg-9.0.2-1"
const BINARY = new TextEncoder().encode("real ffmpeg bytes")
const LGPL = new TextEncoder().encode("GNU LESSER GENERAL PUBLIC LICENSE")
const DAV1D = new TextEncoder().encode("Copyright © 2018, VideoLAN and dav1d authors")
const SOURCES = new TextEncoder().encode("LGPL ffmpeg builds for Honya")

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function versionText(assets?: Record<string, string>): string {
  return JSON.stringify({
    ffmpeg: { version: "9.0.2", sha256: "a".repeat(64) },
    dav1d: { version: "1.5.4", sha256: "b".repeat(64) },
    zlib: { version: "1.3.2", sha256: "c".repeat(64) },
    build: 1,
    ...(assets === undefined ? {} : { assets }),
  })
}

const PINNED = {
  "ffmpeg-mac": sha256(BINARY),
  "ffmpeg-win.exe": sha256(BINARY),
  "ffmpeg-linux": sha256(BINARY),
  "COPYING.LGPLv2.1": sha256(LGPL),
  "COPYING.dav1d": sha256(DAV1D),
  "SOURCES.txt": sha256(SOURCES),
}

function releaseResponses(
  overrides: Record<string, Response | Error> = {},
): Record<string, Response | Error> {
  return {
    [`${RELEASE}/ffmpeg-mac`]: new Response(BINARY),
    [`${RELEASE}/ffmpeg-win.exe`]: new Response(BINARY),
    [`${RELEASE}/ffmpeg-linux`]: new Response(BINARY),
    [`${RELEASE}/COPYING.LGPLv2.1`]: new Response(LGPL),
    [`${RELEASE}/COPYING.dav1d`]: new Response(DAV1D),
    [`${RELEASE}/SOURCES.txt`]: new Response(SOURCES),
    ...overrides,
  }
}

interface Fake {
  deps: FetchDeps
  files: Map<string, Uint8Array>
  chmodded: string[]
  requested: string[]
}

function fake(version: string, responses: Record<string, Response | Error>): Fake {
  const files = new Map<string, Uint8Array>()
  const chmodded: string[] = []
  const requested: string[] = []
  files.set(`${ROOT}/build/ffmpeg/VERSION`, new TextEncoder().encode(version))
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
  it("downloads the binary and its licence files, verified against the pinned checksums", async () => {
    const mac = fake(versionText(PINNED), releaseResponses())
    expect(await fetchFfmpeg(ROOT, "mac", mac.deps)).toBe("downloaded")
    expect(mac.files.get(targetPath(ROOT, "mac"))).toEqual(BINARY)
    expect(mac.files.get("/repo/build/ffmpeg/mac/COPYING.LGPLv2.1")).toEqual(LGPL)
    expect(mac.files.get("/repo/build/ffmpeg/mac/COPYING.dav1d")).toEqual(DAV1D)
    expect(mac.files.get("/repo/build/ffmpeg/mac/SOURCES.txt")).toEqual(SOURCES)
    expect(mac.chmodded).toEqual([targetPath(ROOT, "mac")])

    const win = fake(versionText(PINNED), releaseResponses())
    expect(await fetchFfmpeg(ROOT, "win", win.deps)).toBe("downloaded")
    expect(targetPath(ROOT, "win")).toBe("/repo/build/ffmpeg/win/ffmpeg.exe")
    expect(win.chmodded).toEqual([])
  })

  it("refuses a file whose checksum doesn't match and writes nothing for it", async () => {
    const mac = fake(
      versionText(PINNED),
      releaseResponses({ [`${RELEASE}/ffmpeg-mac`]: new Response("<html>error</html>") }),
    )
    await expect(fetchFfmpeg(ROOT, "mac", mac.deps)).rejects.toThrow(
      "ffmpeg-mac failed its checksum; nothing was written.",
    )
    expect(mac.files.has(targetPath(ROOT, "mac"))).toBe(false)
    expect(mac.files.has(`${targetPath(ROOT, "mac")}.part`)).toBe(false)
  })

  it("makes no network request when every file already matches", async () => {
    const mac = fake(versionText(PINNED), {})
    mac.files.set(targetPath(ROOT, "mac"), BINARY)
    mac.files.set("/repo/build/ffmpeg/mac/COPYING.LGPLv2.1", LGPL)
    mac.files.set("/repo/build/ffmpeg/mac/COPYING.dav1d", DAV1D)
    mac.files.set("/repo/build/ffmpeg/mac/SOURCES.txt", SOURCES)
    expect(await fetchFfmpeg(ROOT, "mac", mac.deps)).toBe("up-to-date")
    expect(mac.requested).toEqual([])
    expect(mac.chmodded).toEqual([targetPath(ROOT, "mac")])
  })

  it("explains what to do when the release's checksums aren't pinned yet", async () => {
    await expect(fetchFfmpeg(ROOT, "mac", fake(versionText(), {}).deps)).rejects.toThrow(
      "build/ffmpeg/VERSION has no pinned checksums for ffmpeg-9.0.2-1. Once that release is published, run `npm run ffmpeg:pin` and commit the result.",
    )
  })

  it("reports a missing release and a network failure clearly", async () => {
    await expect(fetchFfmpeg(ROOT, "mac", fake(versionText(PINNED), {}).deps)).rejects.toThrow(
      "Couldn't download ffmpeg-mac (HTTP 404). Check your connection, or that release ffmpeg-9.0.2-1 exists.",
    )
    const offline = fake(
      versionText(PINNED),
      releaseResponses({ [`${RELEASE}/ffmpeg-mac`]: new Error("getaddrinfo ENOTFOUND") }),
    )
    await expect(fetchFfmpeg(ROOT, "mac", offline.deps)).rejects.toThrow(
      "Couldn't download ffmpeg-mac: getaddrinfo ENOTFOUND",
    )
  })

  it("records the checksum of every release file", async () => {
    const pin = fake(versionText(), releaseResponses())
    expect(await recordAssets(ROOT, pin.deps)).toEqual(PINNED)
  })
})
