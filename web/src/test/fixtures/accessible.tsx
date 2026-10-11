// The same page with the problems fixed: the control for the lint-config test, which expects no findings here.
export function Accessible() {
  return (
    <div>
      <img src="/cover.png" alt="Album cover" />
      <button type="button" onClick={() => undefined}>
        Play
      </button>
      <a href="/about">More</a>
    </div>
  )
}
