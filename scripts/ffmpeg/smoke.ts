import { spawn } from "node:child_process"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { grabFrame } from "../../src/core/frames/grab.ts"
import { isPng } from "./checks.ts"

// The last ffmpeg run's error output, printed when a clip fails.
let lastStderr = ""

function runBinary(command: string, args: string[]): Promise<{ code: number; stdout: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    const chunks: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    child.stderr.on("data", (chunk: Buffer) => {
      errors.push(chunk)
    })
    child.on("error", reject)
    child.on("close", (code) => {
      lastStderr = Buffer.concat(errors).toString("utf8")
      resolve({ code: code ?? 1, stdout: Buffer.concat(chunks) })
    })
  })
}

const binary = process.argv[2]
const clipsDir = process.argv[3]
if (binary === undefined || clipsDir === undefined) {
  process.stderr.write("Usage: node scripts/ffmpeg/smoke.ts <binary> <clipsDir>\n")
  process.exit(2)
}

const clips = readdirSync(clipsDir).filter((name) => !name.startsWith("."))
if (clips.length === 0) {
  process.stderr.write(`No clips in ${clipsDir}\n`)
  process.exit(1)
}

let failed = 0
for (const clip of clips) {
  try {
    const png = await grabFrame({
      ffmpegPath: binary,
      videoPath: join(clipsDir, clip),
      startMs: 0,
      endMs: 1000,
      run: runBinary,
    })
    if (!isPng(png)) {
      throw new Error("not a png")
    }
    process.stdout.write(`ok ${clip}\n`)
  } catch (error) {
    failed += 1
    const reason = error instanceof Error ? error.message : String(error)
    process.stdout.write(`FAILED ${clip}: ${reason}\n`)
    for (const line of lastStderr.trim().split("\n").slice(-8)) {
      process.stdout.write(`    ${line}\n`)
    }
  }
}
process.exit(failed === 0 ? 0 : 1)
