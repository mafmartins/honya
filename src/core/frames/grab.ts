export interface GrabInput {
  ffmpegPath: string
  videoPath: string
  startMs: number
  endMs: number
  run: (command: string, args: string[]) => Promise<{ code: number; stdout: Uint8Array }>
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
    // 640 px wide is plenty for the model to see the scene and keeps each PNG small;
    // smaller videos are left at their own size.
    "-vf",
    "scale='min(640,iw)':-2",
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
