import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

// The README is the module under test. Resolve its path from this file so the
// test does not depend on the process working directory being the repo root.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const readmePath = fileURLToPath(new URL('../README.md', import.meta.url));

// Heading that introduces the one fenced block the doc-check executes. Only that
// block is run: the other ```sh/```text blocks in the README hold bootstrap,
// servers and destructive targets that would hang or tear down the database, so
// they are documented as prose and deliberately not parsed here.
const VERIFIED_HEADING = '### Verified command set';

// Pull the runnable command lines out of the fenced ```sh block that immediately
// follows the verified-command heading. Trailing `# ...` comments are stripped so
// the executed command matches what a reader would type, and blank lines dropped.
// Parsing the README's own block (rather than a hardcoded copy) is the whole
// point: a command that is wrong in the README is wrong in the test too.
function parseVerifiedCommands(readme: string): string[] {
  const heading = readme.indexOf(VERIFIED_HEADING);
  if (heading === -1) {
    throw new Error(`README is missing the "${VERIFIED_HEADING}" section`);
  }
  const fenceOpen = readme.indexOf('```sh', heading);
  if (fenceOpen === -1) {
    throw new Error('verified-command section has no ```sh block');
  }
  const bodyStart = readme.indexOf('\n', fenceOpen) + 1;
  const fenceClose = readme.indexOf('```', bodyStart);
  if (fenceClose === -1) {
    throw new Error('verified-command ```sh block is never closed');
  }

  return readme
    .slice(bodyStart, fenceClose)
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter((line) => line.length > 0);
}

const readme = await readFile(readmePath, 'utf8');
const commands = parseVerifiedCommands(readme);

describe('README doc-check', () => {
  // Guard against a parser that silently extracts nothing: a green run with zero
  // commands would be a hollow gate, so assert the block actually yielded work.
  it('extracts the verified commands from the README', () => {
    expect(commands.length).toBeGreaterThan(0);
    expect(commands).toContain('npm run ex:crud');
  });

  // Run each quoted command in README order and fail on the first non-zero exit.
  // Per-command timeout is generous because the ex:* modules connect to Mongo and
  // do real work. Mongo is assumed already up: this is the integration tier's
  // precondition, so the block must not contain bootstrap or teardown commands.
  it.each(commands)(
    'runs `%s` and it exits zero',
    async (command) => {
      const [cmd, ...args] = command.split(/\s+/);
      await expect(
        execFileAsync(cmd, args, { cwd: repoRoot, timeout: 120_000 }),
      ).resolves.toBeDefined();
    },
    130_000,
  );
});
