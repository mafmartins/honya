import type { ListedStyle } from "../../shared/api"

export function StylesScreen({ styles }: { styles: ListedStyle[] }): React.JSX.Element {
  return (
    <div className="split">
      <div>
        <ul className="styles">
          {styles.map((style) => (
            <li key={style.name}>
              <span className="name">{style.name}</span>{" "}
              <span className="guess">{style.guess}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="decision">
        <button className="action" type="button">
          Accept
        </button>
      </div>
    </div>
  )
}
