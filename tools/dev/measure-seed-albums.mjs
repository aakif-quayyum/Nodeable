// Measures how many credits MusicBrainz holds for candidate seed albums (decision D7, docs/dev/seed-albums.md).
// Usage: node tools/dev/measure-seed-albums.mjs <candidates.json> <results.json>   (candidates: [{artist, title, genre}])
// It is a manual research tool, not part of the app: one request per second with an identifying User-Agent (NFR-RATE-01).
import fs from 'node:fs';

const UA = 'Nodeable/0.4 ( https://github.com/aakif-quayyum/Nodeable )';
const candidates = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3];
let last = 0;

async function mb(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = 1100 - (Date.now() - last);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const res = await fetch(`https://musicbrainz.org/ws/2/${path}${path.includes('?') ? '&' : '?'}fmt=json`, { headers: { 'User-Agent': UA } });
    if (res.ok) return res.json();
    if (res.status === 503 || res.status === 429) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue; }
    throw new Error(`${res.status} ${path}`);
  }
  throw new Error('gave up ' + path);
}

const results = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : [];
for (const c of candidates) {
  if (results.some(r => r.title === c.title)) continue;
  try {
    const q = encodeURIComponent(`releasegroup:"${c.title}" AND artist:"${c.artist}" AND primarytype:album`);
    const rg = (await mb(`release-group?query=${q}&limit=5`))['release-groups']?.[0];
    if (!rg) { results.push({ ...c, error: 'no release group' }); continue; }
    const rels = (await mb(`release?release-group=${rg.id}&status=official&inc=media&limit=100`)).releases ?? [];
    const dated = rels.filter(r => r.date && r.media?.some(m => (m['track-count'] ?? 0) > 3)).sort((a, b) => a.date.localeCompare(b.date) || (a.media[0]['track-count'] - b.media[0]['track-count']));
    const rel = dated[0] ?? rels[0];
    const full = await mb(`release/${rel.id}?inc=recordings+recording-level-rels+work-rels+work-level-rels+artist-rels`);
    const people = new Map(); // artist id -> { name, tracks:Set, roles:Set }
    const note = (rel, trackNo) => {
      if (rel['target-type'] !== 'artist' || !rel.artist) return 0;
      const p = people.get(rel.artist.id) ?? { name: rel.artist.name, tracks: new Set(), roles: new Set() };
      p.tracks.add(trackNo); p.roles.add(rel.type);
      people.set(rel.artist.id, p);
      return 1;
    };
    let tracks = 0, creditRows = 0, tracksWithCredits = 0, withWriter = 0, withProducer = 0;
    for (const m of full.media ?? []) for (const t of m.tracks ?? []) {
      tracks++;
      let n = 0, writer = false, producer = false;
      for (const r of t.recording?.relations ?? []) {
        if (r['target-type'] === 'artist') { n += note(r, tracks); if (r.type === 'producer') producer = true; }
        if (r['target-type'] === 'work') for (const w of r.work?.relations ?? []) {
          const k = note(w, tracks); n += k;
          if (k && ['composer', 'writer', 'lyricist'].includes(w.type)) writer = true;
        }
      }
      creditRows += n; if (n) tracksWithCredits++; if (writer) withWriter++; if (producer) withProducer++;
    }
    let releaseLevel = 0;
    for (const r of full.relations ?? []) releaseLevel += note(r, 0);
    const hubs = [...people.values()].filter(p => [...p.tracks].filter(x => x > 0).length >= 2);
    const top = hubs.sort((a, b) => b.tracks.size - a.tracks.size).slice(0, 4).map(p => `${p.name} (${p.tracks.size})`);
    results.push({
      ...c, releaseGroup: rg.id, release: rel.id, releaseTitle: full.title, date: full.date, tracks,
      tracksWithCredits, withWriter, withProducer, creditRows, releaseLevel, people: people.size, hubs: hubs.length, top,
    });
    console.log(c.title, '|', tracks, 'tracks', tracksWithCredits, 'credited', creditRows, 'credits', people.size, 'people', hubs.length, 'hubs');
  } catch (e) {
    results.push({ ...c, error: String(e) });
    console.log(c.title, 'ERROR', String(e));
  }
  fs.writeFileSync(out, JSON.stringify(results, null, 1));
}
