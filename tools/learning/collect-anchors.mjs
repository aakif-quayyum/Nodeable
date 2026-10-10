// Collects LEARN anchors from the repository and prints the code map for a learning guide (spec section 16).
//
//   node tools/learning/collect-anchors.mjs LG-01                 code map table for one guide
//   node tools/learning/collect-anchors.mjs                       anchor counts per guide
//   node tools/learning/collect-anchors.mjs LG-01 --ref <sha>     pin permalinks to a commit (default: HEAD)
//   node tools/learning/collect-anchors.mjs --check               exit 1 on malformed or duplicate anchors
//   node tools/learning/collect-anchors.mjs LG-01 --format json
//
// An anchor is a comment in this exact format (CLAUDE.md):  LEARN: LG-01 short-id | one-line explanation
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { pathToFileURL } from 'node:url'

const MARKER = /LEARN:/
// Group 1: guide, 2: short id, 3: explanation. A trailing "-->" closes a one-line XML comment.
const ANCHOR = /LEARN:\s*(LG-\d{2})\s+([a-z0-9][a-z0-9-]*)\s*\|\s*(.*?)\s*(?:-->)?\s*$/
// Lines that are only a comment: skipped when looking for the code an anchor describes.
const COMMENT_ONLY = /^\s*(\/\/|\/\*|\*|<!--|-->)/
const MAX_BLOCK_LINES = 20

const TEXT_EXTENSIONS = new Set([
  '.cs', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.csproj', '.props', '.targets', '.json', '.yml', '.yaml', '.sql', '.css', '.html', '.sh',
])
// Documentation talks about anchors, so it is not scanned; neither is generated or lock-file content.
const EXCLUDED = [/^docs\//, /^tools\//, /^CLAUDE\.md$/, /(^|\/)package-lock\.json$/]

/**
 * Finds the anchors in one file's text.
 * @param {string} text
 * @param {string} file repo-relative path, forward slashes
 */
export function parseAnchors(text, file) {
  const lines = text.split(/\r?\n/)
  const anchors = []
  const problems = []

  lines.forEach((line, index) => {
    if (!MARKER.test(line)) return

    const match = ANCHOR.exec(line)
    if (!match) {
      problems.push({ file, line: index + 1, message: 'LEARN comment does not match "LEARN: LG-xx short-id | explanation"' })
      return
    }

    const [, guide, id, explanation] = match
    anchors.push({ guide, id, explanation, file, line: index + 1, ...describeBlock(lines, index) })
  })

  return { anchors, problems }
}

/**
 * The first code line after an anchor, and the line where that contiguous block of code ends.
 * It is a heuristic (no parsing): blank lines end a block, and blocks are capped at MAX_BLOCK_LINES.
 */
function describeBlock(lines, anchorIndex) {
  let start = anchorIndex + 1
  while (start < lines.length && (lines[start].trim() === '' || COMMENT_ONLY.test(lines[start]))) start += 1

  if (start >= lines.length) {
    return { code: '', endLine: anchorIndex + 1 }
  }

  let end = start
  while (end + 1 < lines.length && lines[end + 1].trim() !== '' && end - start < MAX_BLOCK_LINES) end += 1

  return { code: lines[start].trim(), endLine: end + 1 }
}

/** Reports (guide, id) pairs used more than once: an id should point at one place. */
export function findDuplicates(anchors) {
  const seen = new Map()
  for (const anchor of anchors) {
    const key = `${anchor.guide} ${anchor.id}`
    seen.set(key, [...(seen.get(key) ?? []), anchor])
  }
  return [...seen.values()].filter((group) => group.length > 1)
}

/** Builds the markdown code map (template section 3) with permalinks pinned to `ref`. */
export function renderMarkdown(anchors, { repo, ref }) {
  const cell = (text) => text.replaceAll('|', '\\|')
  const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

  const rows = anchors.map((anchor) => {
    const range = anchor.endLine > anchor.line ? `L${anchor.line}-L${anchor.endLine}` : `L${anchor.line}`
    const label = `${anchor.file}#${range}`
    const link = `https://github.com/${repo}/blob/${ref}/${anchor.file}#${range}`
    const code = anchor.code ? `\`${cell(shorten(anchor.code, 70))}\`` : ''
    return `| \`${anchor.id}\` | [\`${label}\`](${link}) | ${code} | ${cell(anchor.explanation)} |`
  })

  return [
    '| Anchor | File and lines | What it does | Concept it teaches |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n')
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function listSourceFiles() {
  // Tracked files plus new, not-yet-ignored ones, so the script is useful before the first commit of a feature.
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' })
  return output
    .split('\0')
    .filter(Boolean)
    .filter((file) => TEXT_EXTENSIONS.has(extname(file)))
    .filter((file) => !EXCLUDED.some((pattern) => pattern.test(file)))
}

/** Absolute path of the repository root; the scripts run from here so file paths are repo-relative. */
export function repoRoot() {
  return git('rev-parse', '--show-toplevel')
}

/** The `owner/repo` of the origin remote, for building permalinks. */
export function repoFromRemote() {
  const url = git('remote', 'get-url', 'origin')
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url)
  if (!match) throw new Error(`Cannot read owner/repo from the origin remote "${url}". Pass --repo owner/repo.`)
  return match[1]
}

/** Every anchor in the working tree, plus comments that look like anchors but are malformed. Run from the repo root. */
export function collectAnchors() {
  const found = listSourceFiles().map((file) => parseAnchors(readFileSync(file, 'utf8'), file))
  return {
    anchors: found.flatMap((result) => result.anchors),
    problems: found.flatMap((result) => result.problems),
  }
}

function parseArgs(argv) {
  const options = { guide: undefined, ref: undefined, repo: undefined, format: 'markdown', check: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--check') options.check = true
    else if (arg === '--ref') options.ref = argv[++i]
    else if (arg === '--repo') options.repo = argv[++i]
    else if (arg === '--format') options.format = argv[++i]
    else if (/^LG-\d{2}$/.test(arg)) options.guide = arg
    else throw new Error(`Unknown argument "${arg}". See the usage at the top of this file.`)
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  process.chdir(repoRoot())

  const { anchors, problems } = collectAnchors()
  const duplicates = findDuplicates(anchors)

  for (const problem of problems) console.error(`${problem.file}:${problem.line}: ${problem.message}`)
  for (const group of duplicates) {
    const where = group.map((anchor) => `${anchor.file}:${anchor.line}`).join(', ')
    console.error(`Duplicate anchor ${group[0].guide} ${group[0].id}: ${where}`)
  }

  if (options.check) {
    console.error(`${anchors.length} anchors, ${problems.length} malformed, ${duplicates.length} duplicated ids`)
    process.exit(problems.length + duplicates.length === 0 ? 0 : 1)
  }

  if (!options.guide) {
    const counts = new Map()
    for (const anchor of anchors) counts.set(anchor.guide, (counts.get(anchor.guide) ?? 0) + 1)
    for (const [guide, count] of [...counts].sort()) console.log(`${guide}: ${count} anchors`)
    return
  }

  const selected = anchors
    .filter((anchor) => anchor.guide === options.guide)
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

  if (options.format === 'json') {
    console.log(JSON.stringify(selected, null, 2))
    return
  }

  const repo = options.repo ?? repoFromRemote()
  const ref = options.ref ?? git('rev-parse', 'HEAD')
  console.log(renderMarkdown(selected, { repo, ref }))
  console.error(`${selected.length} anchors for ${options.guide}, links pinned to ${ref.slice(0, 7)}`)
}

// Run the CLI only when executed directly, not when the tests import the functions above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(2)
  }
}
