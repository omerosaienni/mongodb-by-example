import { afterAll, describe, expect, it } from 'vitest';
import { closeClient } from '../db.js';
import { PAYLOAD, EXPECTED_SHA256, sha256, reset, roundTrip, download, upload } from './gridfs.js';

afterAll(async () => {
  await reset();
  await closeClient();
});

describe('a GridFS round trip preserves the file byte-for-byte', () => {
  it('downloads the same bytes it uploaded', async () => {
    const downloaded = await roundTrip(PAYLOAD);

    // Hash, not length: a truncated or corrupted stream of the same length would
    // pass a length check but fail this digest comparison.
    expect(sha256(downloaded)).toBe(EXPECTED_SHA256);
    expect(downloaded.equals(PAYLOAD)).toBe(true);
  });

  it('survives a payload larger than the default chunk size', async () => {
    // The default GridFS chunk is 255 KiB, so a payload past it is split across
    // multiple chunks. Reassembly must rejoin them in order: a single dropped or
    // reordered chunk changes the hash.
    const big = Buffer.alloc(700 * 1024);
    for (let i = 0; i < big.length; i++) {
      big[i] = i % 251;
    }
    await reset();
    await upload(big);
    const downloaded = await download();

    expect(downloaded.length).toBe(big.length);
    expect(sha256(downloaded)).toBe(sha256(big));
  });
});
