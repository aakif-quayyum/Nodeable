// Resets the local database: removes the PostgreSQL data volume the AppHost keeps (decision 0011), so the next run
// starts empty and the Api applies the migrations again.
//
//   node tools/dev/reset-local-db.mjs          shows what would be removed
//   node tools/dev/reset-local-db.mjs --yes    removes it
//
// Stop the AppHost first (Ctrl+C). Everything stored there is lost: the graphs and every crawled MusicBrainz record,
// which costs about one request per second to fetch again. The generated database password stays in the AppHost's user
// secrets and is reused by the new volume, so nothing else needs to change.
import { spawnSync } from 'node:child_process'

export const VOLUME = 'nodeable-postgres-data'

function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.error) {
    throw new Error('Could not run docker. Is Docker installed and running?')
  }
  if (result.status !== 0) {
    throw new Error(`docker ${args.join(' ')} failed:\n${result.stderr.trim()}`)
  }
  return result.stdout.trim()
}

function main() {
  const confirmed = process.argv.includes('--yes')

  const existing = docker('volume', 'ls', '--filter', `name=^${VOLUME}$`, '--format', '{{.Name}}')
  if (existing !== VOLUME) {
    console.log(`There is no volume named ${VOLUME}: the local database is already empty.`)
    return
  }

  // A volume that a container still uses cannot be removed, and a stopped AppHost can leave its containers behind.
  const containers = docker('ps', '-aq', '--filter', `volume=${VOLUME}`).split(/\s+/).filter(Boolean)

  console.log(`Volume: ${VOLUME}`)
  console.log(`Containers using it: ${containers.length === 0 ? 'none' : containers.join(', ')}`)

  if (!confirmed) {
    console.log('\nNothing was removed. Run again with --yes to remove the volume and those containers.')
    return
  }

  if (containers.length > 0) {
    docker('rm', '-f', ...containers)
  }
  docker('volume', 'rm', VOLUME)
  console.log('Removed. The next run of the AppHost starts with an empty database.')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
}
