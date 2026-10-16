import { spawn } from "node:child_process"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { grabFrame } from "../../src/core/frames/grab.ts"
import { isPng } from "./checks.ts"

function runBinary(command: string, args: string[]): Promise<{ code: number; stdout: Uint8Array }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] })
    const chunks: Buffer[] = []
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk)
    })
    child.on("error", reject)
    child.on("close", (code) => {
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
  } catch {
    failed += 1
    process.stdout.write(`FAILED ${clip}\n`)
  }
}
process.exit(failed === 0 ? 0 : 1)
