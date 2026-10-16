export function RunScreen(props: { batchIndex: number; latest: string }): React.JSX.Element {
  return (
    <div className="split">
      <div>
        <p>batch index</p>
        <p>{props.batchIndex}</p>
      </div>
      <div className="decision">
        <p>latest line</p>
        <p>{props.latest}</p>
      </div>
    </div>
  )
}
