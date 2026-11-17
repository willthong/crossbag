import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const WORKFLOW = '.github/workflows/release.yml';
const CHANGELOG = 'CHANGELOG.md';
const RELEASE_DOC = 'docs/RELEASE.md';
const MANIFEST = 'crossbag.crosspoint-plugin/manifest.json';

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}

interface Job {
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps?: Step[];
}

interface Workflow {
  on?: { push?: { tags?: string | string[] } };
  permissions?: Record<string, string>;
  jobs?: Record<string, Job>;
}

interface Manifest {
  version: string;
}

// Assert existence first so a missing file fails with a clear message.
async function exists(relative: string): Promise<boolean> {
  try {
    await access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function readRepoFile(relative: string): Promise<string> {
  expect(await exists(relative), `expected ${relative} to exist`)
    .toBe(true);
  return readFile(path.join(root, relative), 'utf8');
}

async function readWorkflow(): Promise<Workflow> {
  return parse(await readRepoFile(WORKFLOW)) as Workflow;
}

function allJobs(workflow: Workflow): [string, Job][] {
  return Object.entries(workflow.jobs ?? {});
}

function stepsOf(job: Job): Step[] {
  return job.steps ?? [];
}

function allSteps(workflow: Workflow): Step[] {
  return allJobs(workflow).flatMap(([, job]) => stepsOf(job));
}

function jobRuns(job: Job, pattern: RegExp): boolean {
  return stepsOf(job).some((step) => pattern.test(step.run ?? ''));
}

const CHECK = /pnpm\s+(run\s+)?check\b/;
const BUILD = /pnpm\s+(run\s+)?build\b/;
const GH_RELEASE = /softprops\/action-gh-release/;

function tagPatterns(workflow: Workflow): string[] {
  const tags = workflow.on?.push?.tags;
  if (typeof tags === 'string') return [tags];
  return tags ?? [];
}

function findReleaseJob(workflow: Workflow): [string, Job] {
  const found = allJobs(workflow).find(([, job]) =>
    stepsOf(job).some((step) => GH_RELEASE.test(step.uses ?? '')),
  );
  expect(
    found,
    'expected a job using softprops/action-gh-release',
  ).toBeDefined();
  return found as [string, Job];
}

function dependencies(workflow: Workflow, name: string): Set<string> {
  const result = new Set<string>();
  const visit = (jobName: string): void => {
    const needed = workflow.jobs?.[jobName]?.needs;
    const names = typeof needed === 'string' ? [needed] : needed ?? [];
    for (const need of names) {
      if (result.has(need)) continue;
      result.add(need);
      visit(need);
    }
  };
  visit(name);
  return result;
}

function checkSuiteJobs(workflow: Workflow): string[] {
  const jobs = allJobs(workflow);
  const direct = jobs.filter(([, job]) => jobRuns(job, CHECK));
  if (direct.length > 0) return direct.map(([name]) => name);

  // CI parity may also be expressed as separate lint/typecheck/test jobs.
  const parts = [
    /pnpm\s+(run\s+)?lint\b/,
    /pnpm\s+(run\s+)?typecheck\b/,
    /pnpm\s+(run\s+)?test\b/,
  ];
  const covered = parts.every((part) =>
    jobs.some(([, job]) => jobRuns(job, part)),
  );
  if (!covered) return [];
  return jobs
    .filter(([, job]) => parts.some((part) => jobRuns(job, part)))
    .map(([name]) => name);
}

function versionCheckStep(workflow: Workflow): Step | undefined {
  return allSteps(workflow).find((step) => {
    const run = step.run ?? '';
    return /manifest\.json/.test(run) && /GITHUB_REF_NAME|tag/i.test(run);
  });
}

function checklistItems(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => /^\s*\d+[.)]\s+(.+)$/.exec(line)?.[1])
    .filter((line): line is string => typeof line === 'string');
}

async function manifestVersion(): Promise<string> {
  const raw = await readRepoFile(MANIFEST);
  return (JSON.parse(raw) as Manifest).version;
}

describe('release workflow', () => {
  it('triggers on push of tags matching v*', async () => {
    const workflow = await readWorkflow();

    expect(tagPatterns(workflow)).toContain('v*');
  });

  it('declares contents: write permission', async () => {
    const workflow = await readWorkflow();
    const permissions = [
      workflow.permissions,
      ...allJobs(workflow).map(([, job]) => job.permissions),
    ];
    const contents = permissions
      .map((entry) => entry?.contents)
      .filter((value): value is string => typeof value === 'string');

    expect(contents, 'release needs to create a GitHub Release')
      .toContain('write');
  });

  it('runs the check suite and the build before publishing', async () => {
    const workflow = await readWorkflow();
    const [releaseJob] = findReleaseJob(workflow);
    const ancestors = dependencies(workflow, releaseJob);
    const checkJobs = checkSuiteJobs(workflow);
    const buildJobs = allJobs(workflow)
      .filter(([, job]) => jobRuns(job, BUILD))
      .map(([name]) => name);

    expect(checkJobs, 'expected a job running the check suite')
      .not.toHaveLength(0);
    expect(buildJobs, 'expected a job running pnpm run build')
      .not.toHaveLength(0);
    for (const job of [...checkJobs, ...buildJobs]) {
      expect(ancestors, `${releaseJob} must depend on ${job}`)
        .toContain(job);
    }
  });

  it('publishes a non-draft, non-prerelease release', async () => {
    const workflow = await readWorkflow();
    const [, job] = findReleaseJob(workflow);
    const step = stepsOf(job).find((entry) =>
      GH_RELEASE.test(entry.uses ?? ''),
    );
    const inputs = step?.with ?? {};

    expect(inputs.draft, 'release must not be a draft').not.toBe(true);
    expect(inputs.prerelease, 'release must not be a prerelease')
      .not.toBe(true);
  });

  it('does not upload the payload as a release asset', async () => {
    const source = await readRepoFile(WORKFLOW);
    const workflow = parse(source) as Workflow;
    const steps = allSteps(workflow);
    const [, releaseJob] = findReleaseJob(workflow);
    const ghRelease = stepsOf(releaseJob).find((step) =>
      GH_RELEASE.test(step.uses ?? ''),
    );

    expect(
      steps.filter((step) => /upload-release-asset/i.test(step.uses ?? '')),
      'Plugin Hub reads the git tag; release assets are unnecessary',
    ).toHaveLength(0);
    expect(
      steps.filter((step) => /gh\s+release\s+upload/.test(step.run ?? '')),
    ).toHaveLength(0);
    expect(
      ghRelease?.with?.files,
      'do not attach the payload directory as a release asset',
    ).toBeUndefined();
    expect(
      source,
      'document why the payload is not attached as a release asset',
    ).toMatch(/^[ \t]*#.*plugin hub.*tag/im);
  });

  it('treats the tag as carrying an optional leading v when checking versions',
    async () => {
      const workflow = await readWorkflow();
      const step = versionCheckStep(workflow);
      const run = step?.run ?? '';

      expect(tagPatterns(workflow)).toContain('v*');
      expect(
        step,
        'expected a step comparing the pushed tag with manifest.json',
      ).toBeDefined();
      expect(
        run,
        'strip an optional leading v rather than assuming it',
      ).toMatch(/#v\b|v\?|s\/\^v/);
    });
});

describe('release documentation', () => {
  it('has an ordered pre-release checklist covering every release step',
    async () => {
      const items = checklistItems(await readRepoFile(RELEASE_DOC));
      const checklist: [string, RegExp][] = [
        ['bump manifest version',
          /(?=.*manifest\.json)(?=.*version)/i],
        ['bump package.json version',
          /(?=.*package\.json)(?=.*version)/i],
        ['update CHANGELOG', /changelog/i],
        ['run check', /pnpm\s+(run\s+)?check\b/],
        ['run build', /pnpm\s+(run\s+)?build\b/],
        ['commit and push', /(?=.*commit)(?=.*push)/i],
        ['tag v<version>', /(?=.*tag)(?=.*v)/i],
        ['wait for the workflow', /workflow/i],
        ['wait for Plugin Hub refresh', /plugin hub/i],
        ['verify in Community Plugins', /community plugins/i],
      ];

      expect(items.length, 'expected an ordered checklist')
        .toBeGreaterThanOrEqual(checklist.length);
      let previous = -1;
      for (const [label, pattern] of checklist) {
        const index = items.findIndex((item) => pattern.test(item));
        expect(index, `missing checklist step: ${label}`)
          .toBeGreaterThanOrEqual(0);
        expect(index, `checklist step out of order: ${label}`)
          .toBeGreaterThan(previous);
        previous = index;
      }
    });

  it('has a CHANGELOG heading for the current manifest version', async () => {
    const version = await manifestVersion();
    const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const changelog = await readRepoFile(CHANGELOG);

    expect(changelog).toMatch(
      new RegExp(`^#{1,6}\\s*v?${escaped}\\b`, 'm'),
    );
  });

  it('lists the manifest version verbatim in the CHANGELOG', async () => {
    const version = await manifestVersion();
    const changelog = await readRepoFile(CHANGELOG);

    expect(changelog).toContain(version);
  });
});
