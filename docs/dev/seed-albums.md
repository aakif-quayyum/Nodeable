# Seed albums for the launch (decision D7)

Proposal of 10 albums for the first graphs shown at launch, with credit counts measured from MusicBrainz on 2026-10-23. It needs your OK before PR 10 loads them.

## How it was measured

`tools/dev/measure-seed-albums.mjs` (one request per second, identifying User-Agent, MusicBrainz only). For each album it takes the earliest official release of the release group and makes one lookup with the recording, work and release relationships. A **credit** is one relationship between a person and a track: a recording role (producer, engineer, mixer, instrument, vocals and so on), a writing role on the track's work (composer, writer, lyricist), or a release-level role counted once. **People** are distinct MusicBrainz artists. A **hub** is a person credited on two or more tracks of the album, which is what the graph turns into a shared node.

These are MusicBrainz's own relationship counts, not what the app's crawl will store: the crawl follows the same relationships, so the real numbers should be close, but they are measured again after the seed crawl. The earliest release is used, so a later deluxe edition can hold more.

## The proposal

| # | Album | Genre | Tracks | Credits | People | Hubs | Most-credited |
|---|-------|-------|-------:|--------:|-------:|-----:|---------------|
| 1 | Childish Gambino, *Awaken, My Love!* (2016) | funk, soul | 11 | 201 | 30 | 11 | Donald Glover, Ludwig Göransson, Riley Mackin (all 11) |
| 2 | Kanye West, *My Beautiful Dark Twisted Fantasy* (2010) | hip-hop | 13 | 344 | 101 | 33 | Mike Dean (13), Andrew Dawson (12) |
| 3 | Benson Boone, *Fireworks & Rollerblades* (2024) | pop | 15 | 249 | 50 | 10 | Jack LaFrantz (10), Jason Suwito (5) |
| 4 | LISA, *Alter Ego* (2025) | K-pop, pop | 12 | 259 | 77 | 16 | Kuk Harrell (12), Jelli Dorman (11) |
| 5 | Michael Jackson, *Thriller* (1982) | pop, R&B | 9 | 197 | 46 | 26 | Quincy Jones (9), Bruce Swedien (9) |
| 6 | Kendrick Lamar, *To Pimp a Butterfly* (2015) | hip-hop, jazz | 16 | 294 | 91 | 29 | Derek Ali (16), Terrace Martin (14) |
| 7 | Beyoncé, *Lemonade* (2016) | R&B, pop | 12 | 248 | 122 | 52 | Stuart White (6), John Silas Cranfield (6) |
| 8 | Taylor Swift, *folklore* (2020) | indie folk | 17 | 410 | 31 | 26 | Laura Sisk (14), Jonathan Low (13), Aaron Dessner (11) |
| 9 | Daft Punk, *Random Access Memories* (2013) | electronic, disco | 13 | 181 | 27 | 16 | Thomas Bangalter (13), Paul Jackson, Jr. (10) |
| 10 | Radiohead, *OK Computer* (1997) | rock | 12 | 420 | 11 | 11 | Nigel Godrich (12), Nick Ingman (12) |

Your three: **Awaken, My Love!** is in (30 people, every track has a writer and 10 of 11 a producer). **Kanye West** is *My Beautiful Dark Twisted Fantasy*, the richest by far (101 people). **Benson Boone and LISA both pass**: Benson has 50 people with a producer on all 15 tracks; LISA has 77 people and 16 hubs. Drop one if you want a shorter list.

## Measured and left out

| Album | Why |
|-------|-----|
| Kanye West, *Graduation* | 27 credits, 13 people, 2 hubs, no producer credits in MusicBrainz yet. A poor graph. |
| Billie Eilish, *When We All Fall Asleep, Where Do We Go?* | 4 people in total. |
| Bad Bunny, *Un Verano Sin Ti* | Only 2 of 23 tracks have any credit (3 people). |
| Dua Lipa, *Future Nostalgia* | 55 credits, 7 hubs, no producer credits. |
| Burna Boy, *Twice as Tall* | Only 6 of 15 tracks credited (27 people, 9 hubs). |
| Miles Davis, *Kind of Blue* | Nine people on 5 tracks: a clean graph, but a very small one. A jazz reserve. |
| Stevie Wonder, *Songs in the Key of Life* | Good (66 people, 22 hubs); a reserve if you want a second soul album. |
| Fleetwood Mac, *Rumours* | Good writers, only 10 people; a reserve for rock. |

Genres that MusicBrainz documents thinly (Latin, Afrobeats, recent bedroom pop) came out poorly, which matters for the About page's honesty note: the app is as good as MusicBrainz's volunteers' coverage.

## Open choices for you

1. Keep the ten, or swap any for a reserve.
2. If you want jazz in the set, *Kind of Blue* is the pick; it replaces *OK Computer* (rock) or Benson Boone (pop), not an addition.
