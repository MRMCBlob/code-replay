import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** One cached scan result for a given (root, depth). */
interface CacheEntry {
  root: string;
  depth: number;
  repos: string[];
  /** Epoch ms when the scan ran. */
  scannedAt: number;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

const CACHE_VERSION = 1 as const;

/** Directory holding code-replay's persistent state (survives reboots). */
export function cacheDir(): string {
  // Honor XDG on *nix; fall back to ~/.code-replay everywhere.
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) return path.join(xdg, "code-replay");
  return path.join(os.homedir(), ".code-replay");
}

export function cachePath(): string {
  return path.join(cacheDir(), "repos-cache.json");
}

function keyFor(root: string, depth: number): string {
  return `${path.resolve(root)}::depth${depth}`;
}

async function readFile(): Promise<CacheFile> {
  try {
    const raw = await fs.readFile(cachePath(), "utf8");
    const parsed = JSON.parse(raw) as CacheFile;
    if (parsed.version === CACHE_VERSION && parsed.entries) return parsed;
  } catch {
    // missing / corrupt — start fresh
  }
  return { version: CACHE_VERSION, entries: {} };
}

/**
 * Return cached repo paths for (root, depth) if the entry is younger than
 * `ttlMs`. Stale entries (repos whose `.git` no longer exists) are pruned;
 * if everything is gone or the entry is too old, returns null.
 */
export async function loadRepos(
  root: string,
  depth: number,
  ttlMs: number,
): Promise<string[] | null> {
  const file = await readFile();
  const entry = file.entries[keyFor(root, depth)];
  if (!entry) return null;
  if (Date.now() - entry.scannedAt > ttlMs) return null;

  const alive: string[] = [];
  await Promise.all(
    entry.repos.map(async (repo) => {
      try {
        await fs.access(path.join(repo, ".git"));
        alive.push(repo);
      } catch {
        // repo deleted/moved — drop it
      }
    }),
  );
  return alive.length > 0 ? alive : null;
}

/** Persist the repo list for (root, depth), creating the cache dir if needed. */
export async function saveRepos(
  root: string,
  depth: number,
  repos: string[],
): Promise<void> {
  const file = await readFile();
  file.entries[keyFor(root, depth)] = {
    root: path.resolve(root),
    depth,
    repos,
    scannedAt: Date.now(),
  };
  await fs.mkdir(cacheDir(), { recursive: true });
  await fs.writeFile(cachePath(), JSON.stringify(file, null, 2), "utf8");
}

/** Delete the entire cache file. */
export async function clearCache(): Promise<void> {
  try {
    await fs.rm(cachePath());
  } catch {
    // already gone
  }
}
