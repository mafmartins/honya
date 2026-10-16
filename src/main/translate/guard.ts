export function refuseWhileRunning(runner: { activeId(): string | null }, id: string): void {
  if (runner.activeId() === id) {
    throw new Error("That translation is still running.")
  }
}
