import { realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"

// True when the module at moduleUrl is the script Node was started with. Compares real
// paths: Node resolves argv[1] without following symlinks, but import.meta.url is the
// real path, so a plain comparison fails (and the CLI silently does nothing) when the
// checkout sits behind a symlink, a subst drive or a different drive-letter case.
export function isMain(argv1: string | undefined, moduleUrl: string): boolean {
  if (argv1 === undefined) {
    return false
  }
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl))
  } catch {
    return false
  }
}
