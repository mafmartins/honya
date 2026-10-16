import { copyFile, mkdir } from "node:fs/promises"
import { build } from "esbuild"

await build({
  entryPoints: ["src/main/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "dist/main.js",
  external: ["electron"],
})

await build({
  entryPoints: ["src/preload/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "dist/preload.cjs",
  external: ["electron"],
})

await build({
  entryPoints: ["src/renderer/view.ts"],
  bundle: true,
  platform: "browser",
  format: "esm",
  outfile: "dist/renderer/view.js",
})

await mkdir("dist/renderer", { recursive: true })
await copyFile("src/renderer/index.html", "dist/renderer/index.html")
await copyFile("src/renderer/styles.css", "dist/renderer/styles.css")
