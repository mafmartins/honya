export function ErrorLine({ message }: { message: string | null }): React.JSX.Element | null {
  if (message === null) {
    return null
  }
  return (
    <p className="error-line" role="alert">
      {message}
    </p>
  )
}
