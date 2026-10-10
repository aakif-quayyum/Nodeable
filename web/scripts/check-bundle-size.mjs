// Fails when the JavaScript needed for the first load exceeds the budget (spec section 12, decision 0002).
//
// "First load" is every script that index.html loads or preloads. Lazy chunks (the About route, the OpenTelemetry
// SDK) are not referenced from index.html, so they are reported separately and do not count.
//
// Usage: node scripts/check-bundle-size.mjs <budget in KB gzipped>
import { appendFileSync, readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const budgetKb = Number(process.argv[2] ?? 250)
if (!Number.isFinite(budgetKb) || budgetKb <= 0) {
  console.error('Usage: node scripts/check-bundle-size.mjs <budget in KB gzipped>')
  process.exit(2)
}

const dist = new URL('../dist/', import.meta.url)
const html = readFileSync(new URL('index.html', dist), 'utf8')

// Same method as Vite's build report (default gzip level, 1 KB = 1000 bytes), so the two numbers agree.
const gzipKb = (name) => gzipSync(readFileSync(new URL(name, dist))).length / 1000

const initial = new Set([...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((match) => match[1]))
const lazy = readdirSync(new URL('assets/', dist))
  .filter((file) => file.endsWith('.js'))
  .map((file) => `assets/${file}`)
  .filter((file) => !initial.has(file))

const rows = [
  ...[...initial].map((file) => ({ file, kb: gzipKb(file), kind: 'first load' })),
  ...lazy.map((file) => ({ file, kb: gzipKb(file), kind: 'lazy' })),
]
const initialKb = rows.filter((row) => row.kind === 'first load').reduce((sum, row) => sum + row.kb, 0)

const lines = [
  '### JavaScript bundle size (gzip)',
  '',
  '| File | Loaded | KB |',
  '| --- | --- | ---: |',
  ...rows.map((row) => `| ${row.file} | ${row.kind} | ${row.kb.toFixed(2)} |`),
  '',
  `First load: **${initialKb.toFixed(2)} KB** of ${budgetKb} KB budget`,
]
console.log(lines.join('\n'))

// On GitHub Actions the same table appears on the run's summary page.
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`)
}

if (initialKb > budgetKb) {
  console.error(`::error::First-load JavaScript is ${initialKb.toFixed(2)} KB, over the ${budgetKb} KB budget. Propose a spec change with these numbers (decision 0002) instead of raising the limit.`)
  process.exit(1)
}
