export interface PreflightView {
  dialogueLineCount: number
  frameCount: number
  provider: string
  preset: string
  outputPath: string
}

export function PreflightScreen({ summary }: { summary: PreflightView }): React.JSX.Element {
  return (
    <div className="split">
      <div>
        <p>line count</p>
        <p>{summary.dialogueLineCount}</p>
        <p>frame count</p>
        <p>{summary.frameCount}</p>
      </div>
      <div className="decision">
        <p>provider</p>
        <p>{summary.provider}</p>
        <p>preset</p>
        <p>{summary.preset}</p>
        <p>output path</p>
        <p>{summary.outputPath}</p>
      </div>
    </div>
  )
}
