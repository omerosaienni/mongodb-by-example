import { createHash } from 'node:crypto';
import { GridFSBucket } from 'mongodb';
import { getDb, closeClient } from '../db.js';
import { COLLECTIONS } from '../collections.js';

// Fixed filename the upload and download address. One constant so the demo and
// the round-trip helper target the same stored file.
export const FILENAME = 'gridfs-roundtrip.txt';

// The known payload. Exported so the unit tier can pin its hash without a
// database, catching any drift in the bytes before the integration test runs.
export const PAYLOAD = Buffer.from(
  'GridFS round-trip payload\nline two\nthe quick brown fox jumps over the lazy dog\n',
  'utf8',
);

// sha256 of PAYLOAD, pinned as a literal. The unit test asserts sha256(PAYLOAD)
// equals this, so editing the payload without updating the hash fails the build.
export const EXPECTED_SHA256 = '4d5e525267c538578443e02da7feb0cc9dec66a6e166fd92131a335f03089f20';

// Content hash, not length. test_notes requires a truncated or corrupted download
// to fail the round trip, which a length check would miss but a digest catches.
export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function bucket(): Promise<GridFSBucket> {
  const db = await getDb();
  return new GridFSBucket(db, { bucketName: COLLECTIONS.files });
}

// Drop the bucket so a re-run does not accumulate duplicate files under the same
// filename. drop() throws on a bucket whose collections do not yet exist, so
// swallow that like the other modules swallow a missing-collection drop.
export async function reset(): Promise<void> {
  const b = await bucket();
  await b.drop().catch(() => false);
}

// Stream the payload into GridFS under FILENAME and resolve once the file is
// fully written and indexed.
export async function upload(payload: Buffer): Promise<void> {
  const b = await bucket();
  await new Promise<void>((resolve, reject) => {
    const stream = b.openUploadStream(FILENAME);
    stream.on('error', reject);
    stream.on('finish', resolve);
    stream.end(payload);
  });
}

// Stream the stored file back and collect its chunks into one Buffer. Reassembly
// from chunks is GridFS's whole job, so the test hashes this result to prove the
// bytes survived the split and rejoin.
export async function download(): Promise<Buffer> {
  const b = await bucket();
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = b.openDownloadStreamByName(FILENAME);
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// Reset, upload the payload, download it back. Both the demo and the integration
// test go through this one path so they exercise the same code.
export async function roundTrip(payload: Buffer): Promise<Buffer> {
  await reset();
  await upload(payload);
  return download();
}

async function demo(): Promise<void> {
  const downloaded = await roundTrip(PAYLOAD);
  const matched = sha256(downloaded) === EXPECTED_SHA256;
  console.log('uploaded bytes:', PAYLOAD.length, '| sha256', EXPECTED_SHA256);
  console.log('downloaded bytes:', downloaded.length, '| sha256', sha256(downloaded));
  if (matched) {
    console.log('round-trip hash matched: file is byte-for-byte identical');
  } else {
    console.log('ERROR: round-trip hash mismatch');
    process.exitCode = 1;
  }
}

// Run directly via `npm run ex:gridfs`. The import.meta.url guard keeps the
// exported helpers importable from tests without running the demo.
if (import.meta.url === `file://${process.argv[1]}`) {
  demo()
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => closeClient());
}
