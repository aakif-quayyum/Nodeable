// Builds the learning guide PDFs (spec section 16) with Pandoc.
//
//   node tools/learning/build.mjs LG-01                       build one guide to docs/learning/pdf/
//   node tools/learning/build.mjs --all                       build every docs/learning/LG-xx-*.md
//   node tools/learning/build.mjs LG-01 --ref <sha> --tag v0.1.0
//   node tools/learning/build.mjs LG-01 --prepare-only        write the prepared Markdown, skip Pandoc
//   node tools/learning/build.mjs LG-01 --write               update the committed guide's code map and front matter
//   node tools/learning/build.mjs --input docs/learning/_template.md --prepare-only
//
// Use --write once, when a guide is finalised (just before tagging a milestone), so the committed Markdown carries
// the same code map and commit as the PDF. It is not run on every commit: the code map would change in every diff.
// The PDF build always regenerates the map itself, so a stale committed table never reaches a PDF.
//
// For each guide the script:
//   1. regenerates the code map between the code-map markers with collect-anchors, pinned to --ref
//      (default HEAD), so the links point at the release commit and never go stale;
//   2. sets `commit` (and `release`, when --tag is given) in the front matter;
//   3. drops the Markdown's own first H1 (the PDF has a title block) and the template's author note;
//   4. runs Pandoc with syntax highlighting and renders the PDF with WeasyPrint.
//
// Pandoc and WeasyPrint are installed by the "Learning guides" GitHub Actions workflow; they are not needed locally.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { collectAnchors, renderMarkdown, repoFromRemote, repoRoot } from './collect-anchors.mjs'

export const CODE_MAP_START = '<!-- code-map:start -->'
export const CODE_MAP_END = '<!-- code-map:end -->'

const GUIDE_FILE = /^LG-\d{2}-.+\.md$/
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/

/** Replaces `key: "..."` inside the leading front matter block, or appends it when the key is missing. */
export function setFrontMatter(markdown, key, value) {
  const match = FRONT_MATTER.exec(markdown)
  if (!match) throw new Error('The guide has no YAML front matter (--- block) at the top')

  const line = `${key}: "${value}"`
  const pattern = new RegExp(`^${key}:.*$`, 'm')
  const body = pattern.test(match[1]) ? match[1].replace(pattern, line) : `${match[1]}\n${line}`

  return markdown.replace(FRONT_MATTER, `---\n${body}\n---`)
}

/**
 * Returns the guide with its code map regenerated and `commit` (and `release`) set. Nothing else changes, so the
 * result is safe to write back over the committed Markdown (`--write`). Running it twice gives the same text.
 * @param {string} markdown the guide as written
 * @param {{ table: string, sha: string, tag?: string }} options
 */
export function updateGuide(markdown, { table, sha, tag }) {
  const start = markdown.indexOf(CODE_MAP_START)
  const end = markdown.indexOf(CODE_MAP_END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Section 3 must contain ${CODE_MAP_START} and ${CODE_MAP_END} around the code map table`)
  }

  let updated = `${markdown.slice(0, start + CODE_MAP_START.length)}\n\n${table}\n\n${markdown.slice(end)}`
  updated = setFrontMatter(updated, 'commit', sha)
  if (tag) updated = setFrontMatter(updated, 'release', tag)
  return updated
}

/** The guide as Pandoc should see it: updated, then stripped of what only belongs in the Markdown. */
export function prepareGuide(markdown, options) {
  return stripForPdf(updateGuide(markdown, options))
}

/**
 * The PDF has its own title block built from the front matter, so the Markdown's first `# H1` would repeat it.
 * The template's "How to use this template" note is for the author and must never reach a published PDF.
 */
export function stripForPdf(markdown) {
  const front = FRONT_MATTER.exec(markdown)
  if (!front) return markdown

  const head = markdown.slice(0, front[0].length)
  const rest = markdown.slice(front[0].length)

  const withoutTitle = rest.replace(/^\s*# .*\r?\n/, '\n')
  const withoutNote = withoutTitle.replace(/^\s*(?:> *How to use this template[^\n]*\r?\n)(?:>[^\n]*\r?\n)*/, '\n')

  return head + withoutNote
}

function findGuides(root, only) {
  const dir = join(root, 'docs', 'learning')
  return readdirSync(dir)
    .filter((file) => GUIDE_FILE.test(file))
    .filter((file) => !only || file.startsWith(`${only}-`))
    .map((file) => join(dir, file))
}

function parseArgs(argv) {
  const options = { guide: undefined, all: false, input: undefined, ref: undefined, tag: undefined, prepareOnly: false, write: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--all') options.all = true
    else if (arg === '--prepare-only') options.prepareOnly = true
    else if (arg === '--write') options.write = true
    else if (arg === '--ref') options.ref = argv[++i]
    else if (arg === '--tag') options.tag = argv[++i]
    else if (arg === '--input') options.input = argv[++i]
    else if (/^LG-\d{2}$/.test(arg)) options.guide = arg
    else throw new Error(`Unknown argument "${arg}". See the usage at the top of this file.`)
  }
  if (!options.all && !options.guide && !options.input) {
    throw new Error('Name a guide (LG-01), or pass --all, or --input <file>.')
  }
  if (options.write && (options.input || options.prepareOnly)) {
    throw new Error('--write updates the committed guides themselves; it cannot be combined with --input or --prepare-only.')
  }
  return options
}

function runPandoc(input, output, root) {
  const args = [
    input,
    '--from=gfm+yaml_metadata_block',
    '--output', output,
    '--standalone',
    '--embed-resources',
    '--toc',
    '--toc-depth=2',
    '--highlight-style=tango',
    '--pdf-engine=weasyprint',
    `--css=${join(root, 'tools', 'learning', 'guide.css')}`,
    `--resource-path=${join(root, 'docs', 'learning')}`,
    '--metadata=lang:en',
  ]
  const result = spawnSync('pandoc', args, { stdio: 'inherit' })

  if (result.error && result.error.code === 'ENOENT') {
    throw new Error(
      'Pandoc is not installed. The guide PDFs are built by the "Learning guides" workflow ' +
        '(.github/workflows/learning-guides.yml); use --prepare-only to check the Markdown locally.',
    )
  }
  if (result.status !== 0) throw new Error(`Pandoc failed with exit code ${result.status}`)
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const root = repoRoot()
  process.chdir(root)

  const guides = options.input ? [resolve(options.input)] : findGuides(root, options.all ? undefined : options.guide)
  if (guides.length === 0) {
    console.log('No learning guides found (docs/learning/LG-xx-*.md): nothing to build.')
    return
  }

  const sha = options.ref ?? execGit('rev-parse', 'HEAD')
  const repo = repoFromRemote()
  const { anchors, problems } = collectAnchors()
  if (problems.length > 0) throw new Error(`${problems.length} malformed LEARN comments; run collect-anchors --check`)

  const outDir = join(root, 'docs', 'learning', 'pdf')
  mkdirSync(outDir, { recursive: true })
  const workDir = mkdtempSync(join(tmpdir(), 'nodeable-guide-'))

  for (const guidePath of guides) {
    const name = basename(guidePath, '.md')
    const guideId = /^LG-\d{2}/.exec(name)?.[0]

    // A template or ad-hoc input has no guide id: its code map is built from every guide's anchors.
    const selected = anchors
      .filter((anchor) => !guideId || anchor.guide === guideId)
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
    const table = renderMarkdown(selected, { repo, ref: sha })

    const source = readFileSync(guidePath, 'utf8')

    if (options.write) {
      const updated = updateGuide(source, { table, sha, tag: options.tag })
      if (updated === source) {
        console.log(`${name}: already up to date (${selected.length} anchors, links pinned to ${sha.slice(0, 7)})`)
      } else {
        writeFileSync(guidePath, updated)
        console.log(`${name}: code map and front matter written to ${guidePath} (${selected.length} anchors, links pinned to ${sha.slice(0, 7)})`)
      }
      continue
    }

    const prepared = prepareGuide(source, { table, sha, tag: options.tag })

    if (options.prepareOnly) {
      const target = join(outDir, `${name}.prepared.md`)
      writeFileSync(target, prepared)
      console.log(`${name}: prepared Markdown written to ${target} (${selected.length} anchors, links pinned to ${sha.slice(0, 7)})`)
      continue
    }

    const input = join(workDir, `${name}.md`)
    writeFileSync(input, prepared)
    const output = join(outDir, `${name}.pdf`)
    runPandoc(input, output, root)
    console.log(`${name}: ${output} (${selected.length} anchors, links pinned to ${sha.slice(0, 7)})`)
  }
}

function execGit(...args) {
  const result = spawnSync('git', args, { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed`)
  return result.stdout.trim()
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
