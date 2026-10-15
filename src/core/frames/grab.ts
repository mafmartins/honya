export interface GrabInput {
  ffmpegPath: string
  videoPath: string
  startMs: number
  endMs: number
  run: (command: string, args: string[]) => Promise<{ code: number, stdout: Uint8Array }>
}

export async function grabFrame(input: GrabInput): Promise<Uint8Array> {
  const midpointSec = (input.startMs + input.endMs) / 2000
  const args = [
    "-ss",
    String(midpointSec),
    "-i",
    input.videoPath,
    "-frames:v",
    "1",
    "-f",
    "image2pipe",
    "-vcodec",
    "png",
    "pipe:1",
  ]
  const result = await input.run(input.ffmpegPath, args)
  if (result.code !== 0) {
    throw new Error("frame grab failed")
  }
  return result.stdout
}
