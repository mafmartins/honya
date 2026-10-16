export function bundledFfmpegPath(resourcesPath: string, platform: NodeJS.Platform): string {
  return `${resourcesPath}/ffmpeg/${binaryName(platform)}`
}

export function devFfmpegPath(appPath: string, platform: NodeJS.Platform): string {
  return `${appPath}/build/ffmpeg/${builderOs(platform)}/${binaryName(platform)}`
}

function binaryName(platform: NodeJS.Platform): string {
  return platform === "win32" ? "ffmpeg.exe" : "ffmpeg"
}

function builderOs(platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return "mac"
  }
  return platform === "win32" ? "win" : "linux"
}
