export function bundledFfmpegPath(resourcesPath: string, platform: NodeJS.Platform): string {
  const name = platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
  return `${resourcesPath}/ffmpeg/${name}`
}
