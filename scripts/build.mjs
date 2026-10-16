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
  entryPoints: ["src/renderer/main.tsx"],
  bundle: true,
  platform: "browser",
  format: "esm",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: "dist/renderer/main.js",
})

await mkdir("dist/renderer", { recursive: true })
await copyFile("src/renderer/index.html", "dist/renderer/index.html")
await copyFile("src/renderer/styles.css", "dist/renderer/styles.css")
