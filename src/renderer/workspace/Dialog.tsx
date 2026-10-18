import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react"
import { CloseIcon } from "./CloseIcon"

const FOCUSABLE = "button, input, select, textarea, [href], [tabindex]:not([tabindex='-1'])"

// A centred card over a dimmed backdrop. Focus moves to the first field when it opens
// and stays inside; Esc and the close button call onClose when it is given.
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string
  children: ReactNode
  onClose?: () => void
  // For dialogs with two columns, such as the launch window.
  wide?: boolean
}): React.JSX.Element {
  const titleId = useId()
  const card = useRef<HTMLDivElement>(null)
  const focusables = (): HTMLElement[] =>
    Array.from(card.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
      (element) => !element.hasAttribute("disabled"),
    )

  useEffect(() => {
    focusables()[0]?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape" && onClose !== undefined) {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== "Tab") {
      return
    }
    const items = focusables()
    const first = items[0]
    const last = items[items.length - 1]
    if (first === undefined || last === undefined) {
      return
    }
    const active = document.activeElement
    const outside = !(active instanceof HTMLElement) || !items.includes(active)
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="dialog-backdrop" onKeyDown={onKeyDown}>
      <div
        ref={card}
        className={wide ? "dialog dialog-wide" : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        {children}
        {onClose === undefined ? null : (
          <button
            type="button"
            className="icon-button dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  )
}
