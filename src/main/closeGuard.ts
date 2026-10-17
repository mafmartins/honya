export interface CloseGuardDeps {
  // Whether closing now would cut an AI run short.
  running(): boolean
  // Asks the page whether to stop the run; it answers through `answer`.
  ask(): void
  // Closes the window again once the page said yes.
  close(): void
}

export interface CloseGuard {
  // From the window's close event: false holds the close while the page is asked.
  onClose(): boolean
  answer(allow: boolean): void
}

// Holds a window close during an AI run until the page answers "Stop the AI run?".
export function createCloseGuard(deps: CloseGuardDeps): CloseGuard {
  let allowed = false
  let asking = false
  return {
    onClose() {
      if (allowed || !deps.running()) {
        return true
      }
      if (!asking) {
        asking = true
        deps.ask()
      }
      return false
    },
    answer(allow) {
      if (!asking) {
        return
      }
      asking = false
      if (allow) {
        allowed = true
        deps.close()
      }
    },
  }
}
