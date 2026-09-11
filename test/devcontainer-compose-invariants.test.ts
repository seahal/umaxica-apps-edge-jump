/**
 * The Dev Container must open from a fresh clone with no local file created.
 *
 * The Dev Containers CLI passes every `dockerComposeFile` entry to Compose as `-f`, so an
 * entry a clone does not contain fails the whole `up` at configuration resolution with a
 * bare `no such file or directory`. A tracked file that demands a `${VAR:?}` fails the same
 * way on a machine that has not set it, because Compose interpolates every listed file in
 * full whichever service is named.
 *
 * Both mistakes are cheap to make and only show up on someone else's machine, so guard them
 * here. A developer-local override belongs in the gitignored `compose.override.yaml`, which
 * is optional by construction: nothing creates it and nothing requires it.
 *
 * Everything reads files directly, so these checks need no container engine.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..');
const devcontainerPath = join(repoRoot, '.devcontainer', 'devcontainer.json');
const read = (path: string) => readFileSync(path, 'utf8');

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

/** `devcontainer.json` is JSON with comments; strip them the way the CLI does. */
function parseDevcontainer(): { dockerComposeFile?: string | string[] } {
  const source = read(devcontainerPath)
    .replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    .replaceAll(/^\s*\/\/.*$/gmu, '');
  return JSON.parse(source) as { dockerComposeFile?: string | string[] };
}

const composeEntries = (): string[] => {
  const entry = parseDevcontainer().dockerComposeFile;
  if (entry === undefined) return [];
  return typeof entry === 'string' ? [entry] : entry;
};

describe('dev container starts from a fresh clone', () => {
  it('references only Git-tracked compose files', () => {
    const tracked = new Set(trackedFiles());
    const entries = composeEntries();
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      // Entries are relative to `devcontainer.json`.
      const absolute = resolve(dirname(devcontainerPath), entry);
      const fromRepoRoot = relative(repoRoot, absolute);

      expect(existsSync(absolute), `${entry} is missing`).toBe(true);
      expect(tracked.has(fromRepoRoot), `${entry} is not tracked, so a fresh clone lacks it`).toBe(
        true,
      );
    }
  });

  it('needs no host variable to resolve', () => {
    for (const entry of composeEntries()) {
      // Comments discuss interpolation at length; only directives count.
      const directives = read(resolve(dirname(devcontainerPath), entry))
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('#'))
        .join('\n');

      expect(directives, `${entry} uses a required \${VAR:?} interpolation`).not.toMatch(
        /\$\{[^}]+:\?/u,
      );
    }
  });

  it('keeps a developer-local override out of Git', () => {
    // The escape hatch is ignored up front, so a host-specific override can never become a
    // committed diff -- and, being optional, its absence can never block a fresh clone.
    const gitignore = read(join(repoRoot, '.gitignore'));
    expect(gitignore).toMatch(/^\/compose\.override\.ya?ml$/mu);

    const tracked = trackedFiles();
    expect(tracked).not.toContain('compose.override.yaml');
    expect(tracked).not.toContain('compose.override.yml');
    expect(tracked).not.toContain('compose.custom.yaml');
  });
});
