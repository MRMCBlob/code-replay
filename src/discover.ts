import fs from "node:fs/promises";
import path from "node:path";

/** Directory names never worth descending into while hunting for repos. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".cache",
  ".npm",
  ".pnpm-store",
  "vendor",
  "dist",
  "build",
  "out",
  "target",
  ".next",
  ".turbo",
  ".venv",
  "venv",
  "__pycache__",
  // AI/editor tool dirs that vendor their own git repos
  ".cursor",
  ".claude",
  ".codex",
  // OS / system noise (mostly Windows + macOS)
  "AppData",
  "Application Data",
  "Windows",
  "$Recycle.Bin",
  "System Volume Information",
  "Library",
  ".Trash",
]);

export interface DiscoverOptions {
  /** Max directory depth to descend from each root (root = depth 0). */
  maxDepth?: number;
  /** Called with each repo path as it is found (for progress UI). */
  onFound?: (repoPath: string) => void;
}

/**
 * Walk one or more root directories and return paths of every git repo found.
 * A directory containing a `.git` entry is reported and NOT descended into
 * further (nested submodules are intentionally skipped to stay fast).
 */
export async function findGitRepos(
  roots: string[],
  opts: DiscoverOptions = {},
): Promise<string[]> {
  const maxDepth = opts.maxDepth ?? 7;
  const found = new Set<string>();
  const seenReal = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied, gone, etc. — skip silently
    }

    if (entries.some((e) => e.name === ".git")) {
      if (!found.has(dir)) {
        found.add(dir);
        opts.onFound?.(dir);
      }
      return; // don't descend into a repo
    }

    if (depth >= maxDepth) return;

    for (const e of entries) {
      if (!e.isDirectory() && !e.isSymbolicLink()) continue;
      if (e.name.startsWith(".") && e.name !== ".git") {
        // allow hidden project folders shallowly but skip obvious dot-dirs
        if (SKIP_DIRS.has(e.name)) continue;
      }
      if (SKIP_DIRS.has(e.name)) continue;

      const child = path.join(dir, e.name);
      // Guard against symlink loops by resolving real paths once.
      try {
        const real = await fs.realpath(child);
        if (seenReal.has(real)) continue;
        seenReal.add(real);
      } catch {
        continue;
      }
      await walk(child, depth + 1);
    }
  }

  for (const root of roots) {
    await walk(path.resolve(root), 0);
  }
  return [...found];
}
