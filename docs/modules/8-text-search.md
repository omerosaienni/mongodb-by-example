# Deliverable 8 — Text search

## Purpose

A MongoDB text index and a `$text` query that returns matching documents ordered
by relevance score, demonstrated through the native TypeScript driver.
[`src/examples/text.ts`](../../src/examples/text.ts) creates a single text index
over two fields, then runs a search that projects and sorts by the relevance meta
score. Run it with `npm run ex:text`; it prints the built indexes, the matching
articles ordered by score, and whether that order is descending, then exits zero.

## Public interface

### [`src/examples/text.ts`](../../src/examples/text.ts)

All helpers operate on the `articles` scratch collection, typed as
`Collection<Article>`.

- `INDEX_NAMES` — the explicit text index name (`title_body_text`) so callers and
  tests assert by a stable name rather than a reconstructed name.
- `SEARCH_TERM` — the term the demo searches for (`mongodb`), a distinct
  non-stop word that stems to itself so case-insensitive stemming does not blur
  which documents match.
- `ScoredArticle` — a row shaped for printing and asserting: `title` plus the
  relevance `score`.
- `createTextIndex()` — builds the single text index spanning `title` and `body`.
- `sampleArticles()` — the deterministic corpus the demo and tests share.
- `isDescending(scores)` — pure predicate, true if the scores are non-increasing.
- `searchByRelevance(term)` — runs a `$text` search projecting the textScore meta
  and sorting by it descending, returning the matching articles as `ScoredArticle`
  rows.
- `resetAndSeed()` — drops, repopulates and indexes the scratch collection.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.articles: 'articles'` — the scratch collection name the text module
  owns.
- `interface Article` — the document shape (`title`, `body`), passed as the driver
  generic `db.collection<Article>(COLLECTIONS.articles)`.

### [`package.json`](../../package.json)

- `ex:text` — runs the module via `tsx src/examples/text.ts`.

## Key decisions

- Uses a dedicated `articles` scratch collection rather than the seeded `posts`,
  because `posts` holds random faker text so a test cannot know which documents
  contain a term or what their relevance order should be. The corpus here is fixed
  and hand-written, so both the matching set and the score order are deterministic:
  one document repeats the term (highest score), one mentions it once (lower), two
  never mention it (excluded).
- `isDescending` is extracted as a pure helper so the unit tier has genuine
  dependency-free behaviour to assert, keeping the integration ordering assertion
  clean.
- The relevance score is read through a local `ScoredArticle` shape rather than
  widening the collection generic, because textScore is a query-projected meta
  field that is not part of the stored `Article` shape.

## Verified behaviour

A named text index over `title` and `body` backs a `$text` query that returns only
the documents containing the term, with the projected textScore meta sorting
results by relevance so the document repeating the term ranks above a single
mention. Confirmed by the judge: the query returns the two matching titles and
excludes the two non-matching, and the ordering assertion catches a broken sort
(hollow check ASSERTS).

## Gotchas

- A collection may carry at most one text index, so the single index covers both
  `title` and `body`.
- A text index stores its fields as `weights` (`{ title: 1, body: 1 }`), not as
  literal `'text'` keys, so the index-creation test asserts on `weights`.
- The relevance score is only available via the `{ $meta: 'textScore' }`
  projection and must be projected before it can be sorted on or returned.
- Default text search is case-insensitive and applies stemming, so the term and
  corpus avoid stop words and ambiguous stems. Every query needs live Mongo, so
  the behavioural tests are integration tier only.

## Dependencies

Builds on deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md). It uses the
shared client from [`src/db.ts`](../../src/db.ts) and the centralised collection
names and shapes from [`src/collections.ts`](../../src/collections.ts), and seeds
its own scratch collection rather than relying on the faker seed.
