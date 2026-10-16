import { spawnSync } from "node:child_process"
import type { OsName } from "./pins.ts"
import { dependencyProblems, licenceProblems } from "./checks.ts"

interface ToolResult {
  output: string
  status: number | null
}

function run(command: string, args: string[]): ToolResult {
  // objdump -p on a static .exe prints several megabytes.
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (result.error !== undefined) {
    throw new Error(`Couldn't run ${command}: ${result.error.message}`)
  }
  return { output: `${result.stdout}${result.stderr}`, status: result.status }
}

function dependencyOutput(os: OsName, binary: string): ToolResult {
  if (os === "mac") {
    return run("otool", ["-L", binary])
  }
  if (os === "win") {
    try {
      return run("x86_64-w64-mingw32-objdump", ["-p", binary])
    } catch {
      return run("objdump", ["-p", binary])
    }
  }
  return run("file", [binary])
}

function isOs(value: string | undefined): value is OsName {
  return value === "mac" || value === "win" || value === "linux"
}

const os = process.argv[2]
const binary = process.argv[3]
if (!isOs(os) || binary === undefined) {
  process.stderr.write("Usage: node scripts/ffmpeg/check.ts <mac|win|linux> <binary>\n")
  process.exit(2)
}

// A Windows binary built on Linux can't run there, so its licence check reads the
// configure line recorded next to it instead of running it.
const buildconf =
  os === "win" && process.platform !== "win32"
    ? run("cat", [binary.replace(/ffmpeg\.exe$/, "configure-line.txt")]).output
    : run(binary, ["-hide_banner", "-buildconf"]).output
const tool = dependencyOutput(os, binary)
const problems = [
  ...licenceProblems(buildconf),
  ...dependencyProblems(os, tool.output, tool.status),
]
for (const problem of problems) {
  process.stdout.write(`${problem}\n`)
}
if (problems.length > 0) {
  process.exit(1)
}
process.stdout.write(`${binary}: LGPL configuration, no outside libraries\n`)
