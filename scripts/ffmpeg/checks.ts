const REQUIRED_FLAGS = ["--disable-gpl", "--disable-nonfree"]
const FORBIDDEN_FLAGS = ["--enable-gpl", "--enable-nonfree", "--enable-version3"]
const SYSTEM_DLLS = new Set([
  "kernel32.dll",
  "user32.dll",
  "advapi32.dll",
  "bcrypt.dll",
  "ws2_32.dll",
  "shell32.dll",
  "ole32.dll",
  "msvcrt.dll",
  "ucrtbase.dll",
])
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function licenceProblems(buildconf: string): string[] {
  const flags = new Set(buildconf.split(/\s+/).filter((token) => token.startsWith("--")))
  const problems: string[] = []
  for (const flag of REQUIRED_FLAGS) {
    if (!flags.has(flag)) {
      problems.push(`${flag} missing`)
    }
  }
  for (const flag of FORBIDDEN_FLAGS) {
    if (flags.has(flag)) {
      problems.push(`${flag} present`)
    }
  }
  return problems
}

export function macForeignLibraries(otool: string): string[] {
  const foreign: string[] = []
  for (const line of otool.split("\n").slice(1)) {
    const path = line.trim().split(" (compatibility")[0]?.trim() ?? ""
    if (path === "" || path.startsWith("/usr/lib/") || path.startsWith("/System/")) {
      continue
    }
    foreign.push(path)
  }
  return foreign
}

export function windowsForeignDlls(objdump: string): string[] {
  const foreign: string[] = []
  for (const match of objdump.matchAll(/DLL Name:\s*(\S+)/g)) {
    const name = match[1]
    if (name === undefined) {
      continue
    }
    const lower = name.toLowerCase()
    if (SYSTEM_DLLS.has(lower) || lower.startsWith("api-ms-win-crt-")) {
      continue
    }
    foreign.push(name)
  }
  return foreign
}

export function linuxIsStatic(fileOutput: string): boolean {
  return fileOutput.includes("statically linked") || fileOutput.includes("static-pie linked")
}

export function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
}
