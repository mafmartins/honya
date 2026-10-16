export interface ReviewLine {
  words: string
  note: string | null
  english: string
  before: string
  after: string
}

export function ReviewScreen(props: {
  series: string
  fileName: string
  variant: string
  preset: string
  openFlagCount: number
  current: ReviewLine | null
}): React.JSX.Element {
  const { current } = props
  return (
    <>
      <header className="card-header">
        <p>{`${props.series} · ${props.fileName} · ${String(props.openFlagCount)} flags`}</p>
        <p>{`${props.variant} · ${props.preset}`}</p>
      </header>
      <div className="review-body">
        <div className="lines">
          {current === null ? null : (
            <>
              <p className="faded">{current.before}</p>
              <p className="current">{current.words}</p>
              {current.note === null ? null : <p className="note">{`{note: ${current.note}}`}</p>}
              <p className="faded">{current.after}</p>
            </>
          )}
        </div>
        <div className="decision">
          <p className="english">{current === null ? "" : current.english}</p>
          <button className="accept" type="button">
            Accept
          </button>
        </div>
      </div>
    </>
  )
}
