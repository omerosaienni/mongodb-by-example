# Deliverable 13 — GridFS

## Purpose

Upload a known file to GridFS and download it back, proving the stored bytes are
byte-for-byte identical via a content hash.
[`src/examples/gridfs.ts`](../../src/examples/gridfs.ts) streams a fixed payload
into a GridFS bucket under a single filename, streams it back reassembled from its
chunks, and compares a sha256 digest of the download against a pinned expected
hash. Run it with `npm run ex:gridfs`; it prints the uploaded and downloaded byte
lengths with their sha256, then `round-trip hash matched: file is byte-for-byte
identical`, and exits zero.

## Public interface

### [`src/examples/gridfs.ts`](../../src/examples/gridfs.ts)

The DB-touching helpers run against a GridFS bucket built behind a private
`bucket()` factory off `getDb()`; the hash helper is pure so the unit tier can
exercise it with the database down.

- `FILENAME` — the fixed filename the upload and download address, so the demo and
  the round-trip helper target the same stored file.
- `PAYLOAD: Buffer` — the known payload bytes, exported so the unit tier can pin
  its hash without a database.
- `EXPECTED_SHA256: string` — the sha256 hex of `PAYLOAD`, pinned as a literal and
  asserted by the unit test so editing the payload without updating the hash fails
  the build.
- `sha256(buffer): string` — pure sha256 hex helper.
- `reset(): Promise<void>` — drops the bucket so a re-run does not accumulate
  duplicate files under the same filename.
- `upload(payload): Promise<void>` — streams a payload into GridFS under
  `FILENAME`, resolving once the file is fully written and indexed.
- `download(): Promise<Buffer>` — streams the stored file back, reassembling its
  chunks into one Buffer.
- `roundTrip(payload): Promise<Buffer>` — reset, upload, download; the one path
  both the demo and the integration test go through.

### [`src/collections.ts`](../../src/collections.ts) additions

- `COLLECTIONS.files` — the GridFSBucket name. GridFS derives `files.files` and
  `files.chunks` from this single name, so the bucket name is not itself a
  collection.

### [`package.json`](../../package.json)

- `ex:gridfs` — runs the module via `tsx src/examples/gridfs.ts`.

## Key decisions

- The bucket name lives in `COLLECTIONS`, not hardcoded, because project convention
  puts every collection and bucket identifier in one place; GridFS derives
  `files.files` and `files.chunks` from it.
- The round trip is gated on a content hash, not a length. test_notes requires a
  truncated or corrupted stream to fail, and a length check would pass a same-length
  corruption, so the test compares a sha256 digest.
- `EXPECTED_SHA256` is pinned as a literal so the unit tier can catch payload drift
  with the database down. The unit test also flips a byte and truncates the payload
  to confirm the hash distinguishes corruption from the original.
- The stream lifecycle is wrapped in a Promise that rejects on `error` and resolves
  on `finish` (upload) or `end` (download), the correct async/await bridge for
  event-based Node streams rather than a raw promise chain. Upload resolves on
  `finish` and `roundTrip` awaits it before download, so there is no
  read-before-write race.
- The `import.meta.url` demo guard runs the demo only on `npm run ex:gridfs` and
  `closeClient()` is called in the guard's finally only, so the helpers stay
  importable from tests without connecting and the shared client is never closed
  inside an importable helper.

## Verified behaviour

Confirmed by the judge (PASS). `npm run ex:gridfs` runs and exits zero, printing
`round-trip hash matched: file is byte-for-byte identical` with matching upload and
download sha256. The integration tier round-trips `PAYLOAD` and asserts
`sha256(downloaded) === EXPECTED_SHA256` plus `downloaded.equals(PAYLOAD)`, and
uploads a 700 KiB buffer spanning multiple 255 KiB chunks to assert the reassembled
hash matches. The unit tier pins the hash and the corruption behaviour so the
integration assertions cannot pass vacuously.

The hollow check returned ASSERTS, so the tests prove behaviour rather than passing
vacuously: changing `Buffer.concat(chunks)` to `Buffer.concat(chunks.slice(1))`,
dropping the first download chunk, corrupted the reassembled buffer and the digest
assertion caught it.

## Gotchas

- GridFS creates two collections, `<bucket>.files` and `<bucket>.chunks`. The bucket
  name is not a single collection.
- `bucket.drop()` throws on a bucket whose collections do not yet exist, so `reset()`
  swallows it with `.catch(() => false)`, matching the missing-collection drop in the
  other modules.
- The default chunk size is 255 KiB. The integration test uploads a 700 KiB payload
  to exercise multi-chunk reassembly, where a dropped or reordered chunk would change
  the hash.
- The round trip needs live Mongo, so the behavioural tests are integration tier
  only, with the hash and corruption assertions in the unit tier.

## Dependencies

Builds on deliverable 3 (the connection helper and seed):
[3-connection-helper-and-seed](./3-connection-helper-and-seed.md). It uses the
shared client from [`src/db.ts`](../../src/db.ts) and the centralised bucket name
from [`src/collections.ts`](../../src/collections.ts), and works in its own GridFS
bucket rather than relying on the faker seed.
