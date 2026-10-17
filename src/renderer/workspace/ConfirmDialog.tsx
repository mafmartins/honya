import { Dialog } from "./Dialog"

// A yes/no question over the page. The safe choice comes first, so it takes the focus;
// Esc and the close button cancel.
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}): React.JSX.Element {
  return (
    <Dialog title={title} onClose={onCancel}>
      <p className="dialog-body">{body}</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
