import type { LineView } from "../../../shared/api"

export type LineFilter = "all" | "flagged" | "manual" | "untranslated"

const FILTERS: readonly { id: LineFilter; label: string; test: (line: LineView) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "flagged", label: "Flagged", test: (line) => line.flag !== null },
  { id: "manual", label: "Edited by you", test: (line) => line.origin === "manual" },
  { id: "untranslated", label: "Untranslated", test: (line) => line.words === null },
]

// The lines the filter and the search (English or Portuguese, any case) keep.
export function filterLines(
  lines: readonly LineView[],
  filter: LineFilter,
  search: string,
): LineView[] {
  const test = FILTERS.find((item) => item.id === filter)?.test ?? (() => true)
  const needle = search.trim().toLowerCase()
  return lines.filter(
    (line) =>
      test(line) &&
      (needle === "" ||
        line.english.toLowerCase().includes(needle) ||
        (line.words ?? "").toLowerCase().includes(needle)),
  )
}

export function Filters({
  lines,
  filter,
  search,
  onFilter,
  onSearch,
}: {
  lines: readonly LineView[]
  filter: LineFilter
  search: string
  onFilter: (filter: LineFilter) => void
  onSearch: (search: string) => void
}): React.JSX.Element {
  return (
    <div className="session-filters">
      <div className="filter-group" role="group" aria-label="Show">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className="filter"
            aria-pressed={filter === item.id}
            onClick={() => {
              onFilter(item.id)
            }}
          >
            {item.label} <span className="filter-count">{lines.filter(item.test).length}</span>
          </button>
        ))}
      </div>
      <input
        type="search"
        className="filter-search"
        aria-label="Search lines"
        placeholder="Search English or Portuguese"
        value={search}
        onChange={(event) => {
          onSearch(event.target.value)
        }}
      />
    </div>
  )
}
