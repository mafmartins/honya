import { spawnSync } from "node:child_process"
import type { OsName } from "./pins.ts"
import {
  licenceProblems,
  linuxIsStatic,
  macForeignLibraries,
  windowsForeignDlls,
} from "./checks.ts"

function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" })
  if (result.error !== undefined) {
    throw new Error(`Couldn't run ${command}: ${result.error.message}`)
  }
  return `${result.stdout}${result.stderr}`
}

function dependencyProblems(os: OsName, binary: string): string[] {
  if (os === "mac") {
    return macForeignLibraries(run("otool", ["-L", binary])).map((library) => `links ${library}`)
  }
  if (os === "win") {
    let objdump: string
    try {
      objdump = run("x86_64-w64-mingw32-objdump", ["-p", binary])
    } catch {
      objdump = run("objdump", ["-p", binary])
    }
    return windowsForeignDlls(objdump).map((dll) => `imports ${dll}`)
  }
  return linuxIsStatic(run("file", [binary])) ? [] : ["not statically linked"]
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
    ? run("cat", [binary.replace(/ffmpeg\.exe$/, "configure-line.txt")])
    : run(binary, ["-hide_banner", "-buildconf"])
const problems = [...licenceProblems(buildconf), ...dependencyProblems(os, binary)]
for (const problem of problems) {
  process.stdout.write(`${problem}\n`)
}
if (problems.length > 0) {
  process.exit(1)
}
process.stdout.write(`${binary}: LGPL configuration, no outside libraries\n`)
