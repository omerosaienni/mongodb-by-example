import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

// Structural contract for .github/workflows/ci.yml. We parse the YAML and assert
// on the object tree, never on raw text, so a reordered step or a renamed key is
// still caught and a comment or whitespace tweak is not a false failure.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

interface Step {
  uses?: string;
  with?: Record<string, unknown>;
  run?: string;
}

interface Job {
  'runs-on'?: string;
  needs?: unknown;
  services?: unknown;
  steps?: Step[];
}

interface Workflow {
  name?: string;
  on?: { pull_request?: { branches?: string[] } };
  jobs?: Record<string, Job>;
}

function readYaml<T>(relPath: string): T {
  return parse(readFileSync(repoRoot + relPath, 'utf8')) as T;
}

// Returns the run commands of a job in their declared order, so order-sensitive
// assertions read the same sequence the runner would execute.
function runCommands(job: Job): string[] {
  return (job.steps ?? []).filter((s) => s.run !== undefined).map((s) => s.run as string);
}

describe('ci workflow', () => {
  const wf = readYaml<Workflow>('.github/workflows/ci.yml');

  it('is named CI', () => {
    expect(wf.name).toBe('CI');
  });

  it('triggers on pull requests to main', () => {
    expect(wf.on?.pull_request?.branches).toContain('main');
  });

  it('declares exactly the five expected jobs', () => {
    expect(Object.keys(wf.jobs ?? {}).sort()).toEqual([
      'format',
      'integration',
      'lint',
      'typecheck',
      'unit',
    ]);
  });

  it('runs every job on ubuntu-latest', () => {
    for (const job of Object.values(wf.jobs ?? {})) {
      expect(job['runs-on']).toBe('ubuntu-latest');
    }
  });

  it('keeps all jobs parallel with no needs', () => {
    for (const job of Object.values(wf.jobs ?? {})) {
      expect(job.needs).toBeUndefined();
    }
  });

  it('gives every job the shared checkout and node 22 setup before npm ci', () => {
    for (const job of Object.values(wf.jobs ?? {})) {
      const steps = job.steps ?? [];
      expect(steps[0]?.uses).toBe('actions/checkout@v4');
      expect(steps[1]?.uses).toBe('actions/setup-node@v4');
      // node-version parses as the number 22 (unquoted in YAML)
      expect(steps[1]?.with?.['node-version']).toBe(22);
      expect(steps[1]?.with?.['cache']).toBe('npm');
    }
  });

  it('runs npm ci before each job command', () => {
    for (const job of Object.values(wf.jobs ?? {})) {
      const runs = runCommands(job);
      expect(runs[0]).toBe('npm ci');
      expect(runs.length).toBeGreaterThan(1);
    }
  });

  it('wires lint to npm run lint', () => {
    expect(runCommands(wf.jobs!.lint)).toEqual(['npm ci', 'npm run lint']);
  });

  it('wires format to npm run format:check', () => {
    expect(runCommands(wf.jobs!.format)).toEqual(['npm ci', 'npm run format:check']);
  });

  it('wires typecheck to both root and dashboard typecheck', () => {
    expect(runCommands(wf.jobs!.typecheck)).toEqual([
      'npm ci',
      'npm run typecheck',
      'npm run dashboard:typecheck',
    ]);
  });

  it('wires unit to npm run test:unit', () => {
    expect(runCommands(wf.jobs!.unit)).toEqual(['npm ci', 'npm run test:unit']);
  });

  it('keeps the unit job free of any database setup', () => {
    const unit = wf.jobs!.unit;
    expect(unit.services).toBeUndefined();
    for (const run of runCommands(unit)) {
      expect(run).not.toMatch(/make up|docker compose/);
    }
  });

  it('runs the integration job steps in dependency order', () => {
    const runs = runCommands(wf.jobs!.integration);
    expect(runs).toEqual(['npm ci', 'make up', 'npm run seed', 'npm run test:integration']);
  });
});

describe('package.json typecheck script', () => {
  it('defines the root typecheck script the workflow calls', () => {
    const pkg = readYaml<{ scripts: Record<string, string> }>('/package.json');
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit -p tsconfig.json');
  });
});
