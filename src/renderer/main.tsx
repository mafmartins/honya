import { createRoot } from "react-dom/client"
import { Shell } from "./workspace/Shell"

const root = document.querySelector("#app")
if (root !== null) {
  createRoot(root).render(<Shell api={window.honya} />)
}
