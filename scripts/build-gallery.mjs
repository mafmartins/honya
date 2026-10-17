import { copyFile, mkdir } from "node:fs/promises"
import { build } from "esbuild"

// Builds the screen gallery into dist/gallery/ (open dist/gallery/index.html).
await build({
  entryPoints: ["scripts/gallery/gallery.tsx"],
  bundle: true,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  outfile: "dist/gallery/gallery.js",
})
await mkdir("dist/gallery", { recursive: true })
await copyFile("scripts/gallery/index.html", "dist/gallery/index.html")
await copyFile("scripts/gallery/gallery.css", "dist/gallery/gallery.css")
await copyFile("src/renderer/styles.css", "dist/gallery/styles.css")
