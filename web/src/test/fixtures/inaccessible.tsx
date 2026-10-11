// Each element below breaks one accessibility rule on purpose. src/test/lint-config.test.ts lints this file and
// expects exactly these findings; eslint.config.js ignores the folder so `npm run lint` stays clean.
export function Inaccessible() {
  return (
    <div>
      <img src="/cover.png" />
      <div onClick={() => undefined}>Play</div>
      <a href="#">More</a>
    </div>
  )
}
