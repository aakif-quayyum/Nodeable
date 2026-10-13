# 0021. Community credits live in their own table, are reviewed before anyone else sees them, and are released as CC0

- **Status:** Proposed (written 2026-10-14; awaiting the developer's approval. Nothing is built. Phases: v2 for FR-CREDIT-USER-01 and FR-CREDIT-REVIEW-01, v3 for FR-CREDIT-VOTE-01.)
- **Date:** 2026-10-14
- **Spec:** section 4 (proposals), section 5 (NFR-PRIV-02, NFR-SEC-05, NFR-LIC-01), section 8 (`user_credits`, `credit_review_events`), section 9 (community endpoints), section 10 (community credits), decisions 0006, 0015, FR-GRAPH-04, FR-AUTH-01, principle 5

## Context

MusicBrainz's credit coverage is uneven, and the spec's biggest risk is "sparse credits for less mainstream songs" (section 15). Today the only remedy is the "Add credits on MusicBrainz" link on a song with no producer and no writer (FR-GRAPH-04), which sends the person away and shows nothing in their own graph until MusicBrainz has the edit and a refresh has run (NFR-REL-03).

Once there are accounts (FR-AUTH-01), a person who knows a credit can be allowed to add it. That raises questions the spec has no answer for: where such a credit is stored, who can see it, under what licence, who checks it, how it is kept from being abused, and what personal data it creates.

Facts checked on 2026-10-14 (musicbrainz.org/doc/About/Data_License and musicbrainz.org/doc/MusicBrainz_Database):

- MusicBrainz's **core data is CC0** (public domain). The page lists areas, artists, events, genres, instruments, labels, mediums, places, recordings, release groups, releases, series, works, CD stubs and **relationships and URLs**; credits are relationships, so every credit Nodeable reads is CC0.
- Its **supplementary data** (user annotations, tags, ratings, derived statistics, edit history) is CC BY-NC-SA 3.0. Nodeable does not read any of it.

## Decision

1. **A separate table, never `credits`.** A user's credit is a row of `user_credits` (section 8). `credits.source` stays `musicbrainz` or `discogs`; no row of MusicBrainz origin and no row of user origin share a table, a unique index or an upsert. A MusicBrainz refresh (NFR-REL-03) cannot overwrite, delete or deduplicate a user's credit, and a user's credit cannot be mistaken for MusicBrainz's.
2. **A small lifecycle, kept as text with a CHECK constraint** (decision 0006): `private` (visible to its author only, labelled "Added by you"), `submitted` (in the review queue; still author only, labelled "Awaiting review"), `approved` (shown to everyone, labelled "Community"), `rejected` (author only, with the reviewer's reason) and `superseded` (MusicBrainz now has the same credit; kept for the record, not drawn twice).
3. **Merged at read time, labelled by origin.** The Api reads MusicBrainz credits from `recording_people` and community credits from `user_credits`, and every credit in a snapshot carries `origin`: `musicbrainz`, `you` or `community`. The views show the label with a word and an icon, not by colour alone (NFR-A11Y-02). The stored `credits_status` and the "credits incomplete" badge keep describing MusicBrainz's data (decision 0015, principle 5); the "Add credits on MusicBrainz" link stays.
4. **Superseded, not deleted.** After a recording's credits are refreshed from MusicBrainz, every user credit on it whose (person, role, detail) now exists in MusicBrainz becomes `superseded`. A user credit MusicBrainz does not have stays, and is kept across every later refresh.
5. **Review by an admin role.** `Submit for review` moves a credit to the queue. A person with the `admin` role (an ASP.NET Core Identity role, given to the developer's account by configuration) approves, or rejects with a reason. Every transition is one row of the append-only `credit_review_events` (who, when, what, why), so the history can be read and a decision can be explained.
6. **CC0 on submission.** To submit, the person accepts that the credit is dedicated to the public domain under CC0, the same terms MusicBrainz's core data is under; the accepted terms' version and time are stored on the credit. A credit that stays `private` is not published and is not dedicated. Because the terms match, an approved credit can be given to MusicBrainz without a licence conflict, and Nodeable offers a link to the song's MusicBrainz page so that the person can make the edit themselves. Nodeable never writes to MusicBrainz and has no way to act as the person there.
7. **The author is an account id and nothing else.** No name, no email and no avatar are stored on the credit or shown with it. The reviewer sees the account id and timestamps so that abuse can be spotted. Deleting an account deletes its `private` and `rejected` credits and withdraws its `submitted` ones; `approved` credits stay (CC0 cannot be taken back) with the author id removed.
8. **A per-user daily submission limit** (proposal: 10 credits a day, a configuration value) and the usual size and character checks on `detail`. The queue is then bounded by the number of active users times the limit, which one reviewer can read.
9. **Visibility.** A person's own graph shows their `private`, `submitted` and `rejected` credits, and hubs and connector cards there count them (that is the point of adding them). A public graph (FR-SHARE-01), recommendations and path finding (FR-REC-01, FR-PATH-01) read `approved` credits only, plus MusicBrainz's.
10. **Votes and trust levels are v3 (FR-CREDIT-VOTE-01)** and wait until there are enough active signed-in users to vote. A trust level is derived from the count of a person's approved credits (proposal: 5 or more skips the queue), never stored as a free-standing flag, and an auto-approved credit still gets its `credit_review_events` row.

## Alternatives considered

| Option | Why it lost |
| --- | --- |
| Insert user credits into `credits` with `source = 'user'` | The unique index, the idempotent upserts and the refresh of section 10 are written on the assumption that every row there is MusicBrainz's. A user row would be deduplicated against, or deleted with, the data it was meant to survive, and the licence boundary would be a column value instead of a table. |
| Show a credit to everyone as soon as it is submitted | One person can put anything in front of every user. A credit shown as fact without a check also breaks principle 5. |
| No community credits; only the link to MusicBrainz | The honest, zero-risk status quo. It leaves graphs for less mainstream songs sparse, which is the risk the spec names, and a person's knowledge goes nowhere unless they edit MusicBrainz themselves. |
| Write the credit to MusicBrainz on the person's behalf | Nodeable has no MusicBrainz account to act as, MusicBrainz's edits are made by its own editors, and the app would carry another service's moderation burden. A link out leaves the person in control. |
| Free-text people (a name with no MBID) | The graph, hubs, supersession and the link to MusicBrainz all key on an MBID. A name with no MBID cannot be matched, merged or superseded. Left open (section 15). |
| Votes and trust levels from the start | Voting needs a population. With a handful of users it only adds code that has no effect and a ranking that one person can move. |

## Consequences

- **A privacy notice is required before accounts exist** (NFR-PRIV-02): an account stores an email address and an id, a credit stores the id and timestamps, and a CC0 submission is irrevocable and public. The notice states what is stored, for how long, the CC0 dedication, and what deleting an account does. It needs a legal reading that this record cannot give; the text above is a design, not legal advice.
- **One reviewer is a bottleneck and a single point of failure.** The daily limit bounds the queue, and the queue length and age are metrics (section 11 will list them when this is built). Trust levels (v3) are the way out.
- **The refresh job gains a step** (the supersede check in decision 4), in the same transaction as the credits it concerns.
- **Reads get a second source.** The snapshot, the hubs query and the Text view must say which credits are whose; the web app's types carry `origin` and the views a label.
- **Approved credits cannot be retracted** by their author, which the submission dialog must say plainly.
- **Revisit** if MusicBrainz's data licence changes, if Nodeable ever stores supplementary (non-CC0) data, or when there are more users than one reviewer can serve.
