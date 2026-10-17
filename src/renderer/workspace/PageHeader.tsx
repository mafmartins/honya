import type { ReactNode } from "react"

// The header row every main-area page starts with: title left, actions right.
export function PageHeader({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}): React.JSX.Element {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children === undefined ? null : <div className="page-actions">{children}</div>}
    </header>
  )
}
