import { describe, expect, it } from "vitest"
import {
  isPng,
  licenceProblems,
  linuxIsStatic,
  macForeignLibraries,
  windowsForeignDlls,
} from "../../scripts/ffmpeg/checks.ts"

const LGPL_CONF = `  configuration:
    --disable-everything
    --disable-gpl
    --disable-nonfree
    --enable-libdav1d`

const OTOOL_CLEAN = `out/mac/ffmpeg:
\t/usr/lib/libSystem.B.dylib (compatibility version 1.0.0, current version 1351.0.0)
\t/usr/lib/libz.1.dylib (compatibility version 1.0.0, current version 1.2.12)
\t/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation (compatibility version 150.0.0, current version 3107.0.0)`

const OBJDUMP_CLEAN = `The Import Tables (interpreted .idata section contents)
\tDLL Name: KERNEL32.dll
\tvma:  Hint/Ord Member-Name Bound-To
\tDLL Name: api-ms-win-crt-runtime-l1-1-0.dll
\tDLL Name: msvcrt.dll`

describe("ffmpeg build checks", () => {
  it("accepts an lgpl configuration and names every licence problem", () => {
    expect(licenceProblems(LGPL_CONF)).toEqual([])
    expect(licenceProblems(`${LGPL_CONF}\n    --enable-gpl`)).toContain("--enable-gpl present")
    expect(licenceProblems(LGPL_CONF.replace("--disable-nonfree", ""))).toContain(
      "--disable-nonfree missing",
    )
    expect(licenceProblems(`${LGPL_CONF}\n    --enable-version3`)).toContain(
      "--enable-version3 present",
    )
  })

  it("flags macOS libraries outside the system folders", () => {
    expect(macForeignLibraries(OTOOL_CLEAN)).toEqual([])
    const brew = `${OTOOL_CLEAN}\n\t/opt/homebrew/lib/libdav1d.7.dylib (compatibility version 7.0.0, current version 7.0.0)`
    expect(macForeignLibraries(brew)).toEqual(["/opt/homebrew/lib/libdav1d.7.dylib"])
  })

  it("flags windows dlls that are not part of the system", () => {
    expect(windowsForeignDlls(OBJDUMP_CLEAN)).toEqual([])
    expect(windowsForeignDlls(`${OBJDUMP_CLEAN}\n\tDLL Name: libwinpthread-1.dll`)).toEqual([
      "libwinpthread-1.dll",
    ])
  })

  it("recognises a statically linked linux executable", () => {
    expect(linuxIsStatic("ffmpeg: ELF 64-bit LSB executable, x86-64, statically linked")).toBe(true)
    expect(linuxIsStatic("ffmpeg: ELF 64-bit LSB pie executable, x86-64, static-pie linked")).toBe(
      true,
    )
    expect(
      linuxIsStatic(
        "ffmpeg: ELF 64-bit LSB executable, x86-64, dynamically linked, interpreter /lib/ld-musl-x86_64.so.1",
      ),
    ).toBe(false)
  })

  it("recognises png output", () => {
    expect(isPng(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe(true)
    expect(isPng(new TextEncoder().encode("<html>"))).toBe(false)
  })
})
