# 0027. "Built from" comes from MusicBrainz relationships only, with honest labels and a WhoSampled link

- **Status:** Accepted 2026-10-16. The developer approved the research recommendation (MusicBrainz only, a WhoSampled link on every song, no Genius) and then this written design for FR-SAMPLE-01 on 2026-10-16. It is v2 work: nothing is started, and the WhoSampled search URL pattern stays an open item (spec section 15).
- **Date:** 2026-10-16
- **Spec:** FR-SAMPLE-01 (new, v2), FR-TREE-01 (v3, narrowed), FR-CREDIT-USER-01 and FR-CREDIT-REVIEW-01 (extended), section 8 (`sample_links`, `user_sample_links`, `sample_link_review_events`, `crawl_jobs.kind`), section 9 (sources endpoints), section 10 (fetch plan steps 2 and 3, the `source` job, "Built from"), section 12 (liner notes, orbit); decisions 0009, 0021, 0022, 0025, 0026

## Context

People who care who made a song also care what it was made from. "Does Redbone interpolate Bootsy's Rubber Band 'I'd Rather Be with You'?" is a question the credits graph cannot answer today. Three sources were evaluated on 2026-10-14 to 2026-10-16: MusicBrainz (already the data source), Genius, and WhoSampled. FR-TREE-01 (v3) already promised "samples" in a family tree; this decision pulls the samples part forward to v2 as FR-SAMPLE-01 and leaves covers and remixes to FR-TREE-01.

## What was measured (2026-10-15)

Twenty songs, chosen to be sample-heavy (so these rates are an upper bound for songs in general): the five the developer named, the others in the dev database, and some classics. For each, the first five matching recordings at MusicBrainz were read with `recording-rels`, `artist-rels`, `work-rels` and `work-level-rels`, at one request a second with the project's User-Agent.

**Which MusicBrainz relationship answers what** (definitions from musicbrainz.org/relationships):

| Link | Entities | MusicBrainz's own description | Shown as |
| --- | --- | --- | --- |
| **samples material** | recording to recording | "Indicates that the recording contains samples from another." | **Samples** |
| **based on** | work to work | "the second work is based on music or text from the first, but isn't directly a revision or an arrangement of it" | **Based on** |
| **musical quotation**, **lyrical quotation** | work to work | "a brief quotation of the music (lyrics) of another work" | **Quotes** |
| samples from artist | artist to recording | "Use this only if you really cannot figure out the particular recording that has been sampled" | not stored (0 of 20) |
| included works | work to work | a pre-existing work used in another (a soundtrack, a jukebox musical) | not a derivation; not shown |

MusicBrainz has no relationship type called "interpolation". The closest is **based on**, which is why the label is "Based on" and not "Interpolates" (rule 1 below).

**The question that started this:** Redbone's work `c44370d6-70af-454f-8381-021d1f7b6fac` is **based on** the work `25818745-86ac-37e3-a377-6c294ffca64e`, "I'd Rather Be With You" (writers George Clinton, Bootsy Collins and Gary "Mudbone" Cooper). It is a work-to-work link, so it holds for every recording of Redbone, and there is no recording-to-recording sample link for it.

**Coverage, 20 songs** (items counted after the self-reference rule; "sampled in" counted before the official-release rule, which needs the follow-up job and was not measured):

| Song | Samples | Based on | Quotes | Sampled in (first recording / all five) | Notes |
| --- | --- | --- | --- | --- | --- |
| Redbone | 0 | **1** (I'd Rather Be With You) | 0 | 1 / 5 | the "sampled in" items are variants of one fan mash-up, "Mask Off vs Redbone", and the work based on it |
| Gold Digger | 0 | 0 | 0 | 0 / 0 | the sample the song is known for is not linked |
| HUMBLE. | 0 | 0 | 0 | 1 / 1 | its music is quoted in another work |
| Jesus Walks | 0 | 0 | 0 | 1 / 1 | the sample it is known for is not linked |
| Uptown Funk | 0 | **1** (All Gold Everything) | 0 | 1 / 4 | |
| Heartless | 0 | 0 | 0 | 1 / 1 | |
| Otis | **3** (on 3 of 5 recordings only) | 0 (1 self-reference dropped: "OTIS" is based on "Otis") | 0 | 0 / 1 | sample links are on specific recordings |
| Hips Don't Lie | 0 | 0 | 0 | 0 / 0 | |
| Blinding Lights | 0 | 0 | 0 | 1 / 3 | |
| Get Lucky | 0 | 0 | 0 | 0 / 0 | |
| Ice Ice Baby | 0 | **1** (Under Pressure) | 0 | 1 / 1 | |
| Bittersweet Symphony | 0 | **1** (The Last Time) | 0 | 4 / 4 | |
| Hung Up | 0 | **1** (Gimme! Gimme! Gimme!) | 0 | 0 / 0 | |
| Blurred Lines | 0 | 0 | 0 | 0 / 0 | the song most famous for its source is not linked |
| Stan | 0 | **1** (Thankyou) | 0 | 0 / 0 | |
| Crazy in Love | 0 | **1** (Are You My Woman?) | 0 | 1 / 1 | its lyrics are quoted in another work |
| Can I Kick It? | 0 | 0 | 0 | 0 / 0 | no relationships of any kind |
| Shape of You | 0 | **1** (No Scrubs) | 0 | 0 / 1 | |
| Bohemian Rhapsody | 0 | 0 | 0 | 8 / 8 | works based on it; also included in one work |
| Smells Like Teen Spirit | 0 | 0 | 0 | 3 / 3 | two works based on it, one music quotation |

- **Built from, songs with at least one item: 9 of 20 (45%)**: 8 by "based on", 1 by "samples" (Otis, found on 3 of the 5 recordings, not on the first). Items: **8 based on, 3 samples, 0 quotes.**
- **Correct in the cases that could be checked:** all 8 "based on" sources are the right works. The one wrong one was the self-reference.
- **Missing**, from the author's own knowledge and not verified against another source: Gold Digger, Jesus Walks, Blurred Lines, Can I Kick It? and Hips Don't Lie each have a well-known source that MusicBrainz does not link. **Coverage is real and incomplete.**
- **Sampled in: 11 of 20 songs have at least one item on the first recording, 13 with all five.** Many are fan mash-ups, remixes and DJ mixes, which is why rule 4 exists.
- **Cost in requests:** none for reading the links (the work lookup is already made; `work-rels` is one more `inc`). Resolving a source to a playable recording is one more gated request per source, at the scheduled priority (rule 5).

## Genius, WhoSampled and the others

- **Genius is out.** Its documentation says "Commercial use of the Genius API is not allowed without a license" and to write to api-sales@genius.com. Its terms (last updated 2026-01-13) have no API-specific section; they prohibit, except with express written consent, copying, scraping, displaying, distributing and creating derivative works from Genius Content, any data mining, and any commercial use. Nothing in them allows caching or redisplaying API data, so a public site that stores and shows it would need a licence, and a feature flag does not change that. The developer decided not to measure its coverage.
- **WhoSampled has no public API**; unofficial scrapers are off-limits. Only a link out is planned (rule 8). The developer is emailing WhoSampled, and **any use of their data needs their written permission**.
- **SecondHandSongs** is unsuitable: its API licence (read through search results; the page itself returned 403) grants free use only to accredited academic institutions for non-commercial research or teaching, and requires a commercial licence otherwise. **Discogs** is not used: its monthly data dumps are CC0 and its API data is under its API Terms of Use (not read here: 403), but sample information would be free text in notes, which is not a basis for a "Built from" row.

## Decision

1. **Two labels, and "interpolated" is never used unless the data says so.** `samples material` is shown as **Samples**. Work-to-work `based on` is shown as **Based on**, with a tooltip: "MusicBrainz records that this song is based on music or text from the other, without being a direct revision or arrangement. This often means an interpolation or a reused melody, but MusicBrainz does not say which." `musical quotation` and `lyrical quotation` are shown as **Quotes**, saying music or lyrics. The word "interpolates" appears nowhere in the product unless a source's own data says it.
2. **Read at no extra request.** `work-rels` is added to the work lookup (fetch plan step 3), and `recording-rels` to the recording lookup (step 2). Both are the requests the Worker already makes. Each relation is stored once, normalised so that `from` is the song built from `to`; the same rows are read the other way for "Sampled in".
3. **Self-references are dropped:** the same work, or titles that are equal after the duplicate rule of section 10 ("Duplicates": case, accents, apostrophes and punctuation ignored, decoration removed), such as "OTIS" and "Otis". The row is kept with `hidden_reason = 'self_reference'`, not discarded, so a rule can change without a refetch.
4. **"Sampled in" shows only official releases.** A recording that samples this one is shown only when it has a release with status `official` (fan mash-ups, bootlegs and DJ mixes are hidden). That needs the sampling recording's releases, which come with the `source` job (rule 5); until it has run the row is `unofficial_or_unknown` and hidden. Hidden rows keep their provenance and `hidden_reason`.
5. **Resolving a source is a lower-priority job.** A new `crawl_jobs.kind` **`source`** (scheduled priority, 10), target a work or recording MBID that is a link's `to` or a reverse link's `from`. For a **work**: `GET /ws/2/recording?work={mbid}&inc=releases&limit=100`, choosing the original (an official release, no video, a disambiguation that does not say live, remix or edit, the earliest date, the longest on a tie), and storing `resolved_recording_mbid`. For a **recording**: `GET /ws/2/recording/{mbid}?inc=releases` to read the status of its releases. A resolved source then gets a `preview` job, so it can be played; its credits (the `recording` job) are fetched only when someone adds it to a graph or opens it. Nothing is fetched at interactive priority and a person never waits for it.
6. **Provenance per item:** `source` (`musicbrainz` or `user`), `mb_link_type_id` (the relationship type's UUID), `looked_up_mbid` (the entity whose lookup returned it), `fetched_at`, and for a community item the `user_sample_links.id`. The page can say "MusicBrainz relationship 'based on', read 2026-10-16" and link to the MusicBrainz page.
7. **Gaps are filled by the community, through the same queue** (FR-CREDIT-USER-01 and FR-CREDIT-REVIEW-01 extended; below).
8. **WhoSampled is a link, nothing more.** "See samples on WhoSampled" on every song, built from its title and artist and opened in a new tab with `rel="noopener noreferrer"`. The page and the Api fetch nothing from WhoSampled. The exact search URL pattern is **to be confirmed by the developer** (the message that asked for this write-up held a placeholder where the pattern was to be pasted); until it is recorded here, it is not guessed.
9. **No Genius, no Discogs, no scraping.** Nothing in this feature reads a source whose terms were not read or that forbids it.

## Data model (v2)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `sample_links` | One "built from" fact, read from MusicBrainz | `id` PK, `from_type` (`recording` or `work`), `from_mbid`, `to_type` (`recording` or `work`), `to_mbid`, `kind` (`samples`, `based_on`, `quotes_music`, `quotes_lyrics`), `to_title`, `to_artist_credit` (nullable until resolved), `resolved_recording_mbid` (nullable; the recording to play, set by the `source` job), `from_official` (nullable; for the reverse direction: whether the sampling recording has an official release), `hidden_reason` (nullable: `self_reference`, `unofficial`), `source` (`musicbrainz`), `mb_link_type_id`, `looked_up_mbid`, `fetched_at`; unique on (`from_mbid`, `to_mbid`, `kind`) |
| `user_sample_links` | A "built from" item a signed-in person added (v2, with FR-CREDIT-USER-01) | `id` PK, `author_id`, `from_recording_mbid` (FK), `to_type`, `to_mbid` (a MusicBrainz recording or work: no MBID, no row), `kind`, `detail` (never null, length-limited; for example "the bass line"), `status` (`private`, `submitted`, `approved`, `rejected`, `superseded`), `submitted_at`, `decided_at`, `decided_by`, `rejection_reason`, `created_at` |
| `sample_link_review_events` | Append-only audit trail, as `credit_review_events` | `id` PK, `user_sample_link_id` (FK, no cascade), `at`, `actor_id`, `action`, `reason`, `from_status`, `to_status` |
| `crawl_jobs.kind` | gains `source` | CHECK constraint and `CrawlJobKind` widened by a migration |

The "built from" view for a song is `sample_links` (not hidden) for MusicBrainz's, plus approved `user_sample_links`, plus the author's own private ones, each labelled by origin as credits are (section 10, "Community credits"). A `user_sample_links` row is superseded, with an audit row, when a refresh finds the same (`from`, `to`, `kind`) at MusicBrainz.

## UI plan

- **Liner notes:** a **Built from** row in each card, as the credits rows are: items with their label (Samples, Based on, Quotes), title, artist once resolved, and a play button when the source has a preview. A **Sampled in** row for the reverse (official releases only, three shown and the rest on request). An unresolved source shows its title and no play button. Each item has its provenance on a tooltip.
- **Orbit and constellation:** with a "Show sources" switch (off by default, so a graph is not buried), a song's sources are drawn as records of their own, outside the song, joined by a **dashed** link for *samples* and a **dotted** link for *based on* (quotes: dash-dot), in one colour that is not one of the role colours. Pattern, not colour alone, carries the meaning (NFR-A11Y-02). A source that is not in the graph offers "Add to graph". Reduced motion applies as to the rest.
- **Original and new, side by side:** from a Built from item, "Compare" opens two preview players with the waveforms (FR-WAVE-01) next to each other, the new song on one side and the source on the other. There is one audio element, so one plays at a time; an **A/B** control moves to the other at the same position, so the same bar can be heard in each.
- **Gaps:** a person who can see that a link is missing chooses "Add a source" on a song, picks a MusicBrainz recording or work (stored songs first, then a MusicBrainz search through the shared gate), the kind and a short note; it is private to them until they submit it. Every item has **Add it to MusicBrainz**, a link to the song's MusicBrainz page where the person makes the edit themselves (Nodeable never writes to MusicBrainz), and an approved item also offers it.
- **WhoSampled:** "See samples on WhoSampled" beside the Built from row, always shown, with a note on what it is.

## Community gaps (the extension of decision 0021)

- A person adds a "built from" item with the same lifecycle as a credit: `private`, `submitted` after accepting the CC0 terms (the daily submission limit is shared with credits), `approved` or `rejected` by the `admin` with a reason, `superseded` by MusicBrainz.
- The review queue lists credits and sample links together, labelled by type; the `admin` approves or rejects either in the same screen.
- An approved item is shown to everyone labelled **Community**, with a link to submit it to MusicBrainz.
- Sources must be a MusicBrainz recording or work (an MBID), so a made-up title never becomes a row of the shared cache, as with credits.
- CC0 terms apply to submitted items as to credits (decision 0021): a relationship between two works is a fact, and releasing it as CC0 gives it the licence of MusicBrainz's core data.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| MusicBrainz and Genius behind a feature flag | Genius's terms prohibit storing and displaying its content without written consent, and its API's commercial use needs a licence; a flag does not make a public site compliant |
| Label "based on" as "Interpolates" | MusicBrainz says only that one work is based on another and is not a revision or an arrangement; it may be an interpolation, a reused melody or lyrics. The data does not say, so the label does not |
| Show every "sampled by" item | Most are fan mash-ups, remixes and DJ mixes (all of Redbone's are variants of one fan mash-up); the official-release rule keeps the row useful |
| Resolve every source when the work is fetched | One request per source on the interactive path, for something nobody asked to play; a low-priority job costs the same requests and makes nobody wait |
| Scrape WhoSampled | No public API, terms not granted; the developer is asking for permission |
| Store only recording-to-recording samples | Misses all of "based on", which is where 8 of the 9 songs found came from |

## Consequences

- **Coverage is partial and said to be:** 9 of 20 sample-heavy songs had an item, and five of the songs best known for a sample had none. The row shows what MusicBrainz knows, and the "Add a source" and WhoSampled links are the answer to the rest.
- **No extra request on the interactive path.** `source` jobs add one gated request per resolved source, at scheduled priority.
- **A migration** adds three tables and the `source` job kind; nothing existing changes.
- **Dependencies:** the "Add a source" and the community items need FR-AUTH-01 and the review queue (v2). Reading and showing MusicBrainz's links needs neither and can ship first.
- **Not verified here:** the WhoSampled search URL pattern; Discogs' and SecondHandSongs' pages directly (403); whether the official-release rule leaves enough "Sampled in" items to be worth a row (not measured, it needs the `source` job).
