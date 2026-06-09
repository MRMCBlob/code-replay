import { execa } from "execa";
import type { Commit, FileChange, GitLogOptions, Identity } from "./types.js";

/** Record separator emitted before each commit header in the pretty format. */
const REC = "\x1e"; // ASCII record separator
/** Field separator inside a commit header. */
const FS = "\x1f"; // ASCII unit separator
/** Joins multiple Co-authored-by values within the single trailer field. */
const GS = "\x1d"; // ASCII group separator

// Last field = Co-authored-by trailer values, joined by GS (one field, no newlines).
const PRETTY =
  `${REC}%H${FS}%an${FS}%ae${FS}%aI${FS}%s${FS}` +
  `%(trailers:key=Co-authored-by,valueonly,separator=${GS})`;

export class NotAGitRepoError extends Error {
  constructor(public readonly cwd: string) {
    super(`Not a git repository: ${cwd}`);
    this.name = "NotAGitRepoError";
  }
}

/** Returns true when `cwd` is inside a git working tree. */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    const { stdout } = await execa(
      "git",
      ["rev-parse", "--is-inside-work-tree"],
      { cwd, reject: false },
    );
    return stdout.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Return the absolute work-tree root for `cwd`, or null if `cwd` is not inside
 * a git repository. Cheap check used to spot a repo missing from the cache.
 */
export async function gitToplevel(cwd: string): Promise<string | null> {
  try {
    const { stdout, exitCode } = await execa(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd, reject: false },
    );
    if (exitCode !== 0) return null;
    const top = stdout.trim();
    return top ? top : null;
  } catch {
    return null;
  }
}

/**
 * Parse the raw stdout of `git log --numstat` (with our pretty format) into commits.
 * Kept pure and exported so it can be unit-tested without spawning git.
 */
export function parseGitLog(raw: string): Commit[] {
  const commits: Commit[] = [];
  // Split on the record separator; first chunk before the first REC is empty.
  const chunks = raw.split(REC);
  for (const chunk of chunks) {
    const trimmed = chunk.replace(/^\n+/, "");
    if (!trimmed) continue;
    const lines = trimmed.split("\n");
    const header = lines[0] ?? "";
    const fields = header.split(FS);
    const hash = fields[0];
    const authorName = fields[1] ?? "";
    const authorEmail = fields[2] ?? "";
    const date = fields[3] ?? "";
    const subject = fields[4] ?? "";
    const coauthors = (fields[5] ?? "")
      .split(GS)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!hash) continue;

    const files: FileChange[] = [];
    let added = 0;
    let removed = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) continue;
      const file = parseNumstatLine(line);
      if (!file) continue;
      files.push(file);
      added += file.added;
      removed += file.removed;
    }

    commits.push({
      hash,
      authorName,
      authorEmail,
      date,
      subject,
      coauthors,
      files,
      added,
      removed,
    });
  }
  return commits;
}

/** Parse one `added\tremoved\tpath` numstat line. Returns null if malformed. */
export function parseNumstatLine(line: string): FileChange | null {
  const parts = line.split("\t");
  if (parts.length < 3) return null;
  const [a, r, ...rest] = parts;
  const rawPath = rest.join("\t");
  const binary = a === "-" || r === "-";
  return {
    added: binary ? 0 : Number.parseInt(a ?? "0", 10) || 0,
    removed: binary ? 0 : Number.parseInt(r ?? "0", 10) || 0,
    path: normalizeRenamePath(rawPath),
    binary,
  };
}

/**
 * git renames appear as `old => new`, `dir/{old => new}/file`, or `{a => b}`.
 * Reduce them to the new path.
 */
export function normalizeRenamePath(path: string): string {
  if (!path.includes("=>")) return path;
  // Brace form: foo/{old => new}/bar.ts  ->  foo/new/bar.ts
  const braced = path.replace(/\{([^{}]*?) => ([^{}]*?)\}/g, (_m, _old, neu) =>
    String(neu),
  );
  if (braced !== path) return braced.replace(/\/{2,}/g, "/");
  // Simple form: old => new
  const arrow = path.split(" => ");
  return (arrow[arrow.length - 1] ?? path).trim();
}

/** Run `git log` with the given filters and return parsed commits. */
export async function getCommits(opts: GitLogOptions): Promise<Commit[]> {
  if (!(await isGitRepo(opts.cwd))) {
    throw new NotAGitRepoError(opts.cwd);
  }

  const args = [
    "log",
    "--no-merges",
    "--numstat",
    "--date=iso-strict",
    `--pretty=format:${PRETTY}`,
  ];
  if (opts.since) args.push(`--since=${opts.since}`);
  if (opts.until) args.push(`--until=${opts.until}`);
  if (opts.author) args.push(`--author=${opts.author}`);
  if (opts.pathspec) {
    args.push("--", opts.pathspec);
  }

  const { stdout } = await execa("git", args, {
    cwd: opts.cwd,
    // History can be large; raise the buffer ceiling.
    maxBuffer: 256 * 1024 * 1024,
  });
  return parseGitLog(stdout);
}

async function gitConfig(
  key: string,
  cwd: string,
  global: boolean,
): Promise<string> {
  const args = ["config"];
  if (global) args.push("--global");
  args.push("--get", key);
  try {
    const { stdout } = await execa("git", args, { cwd, reject: false });
    return stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Resolve the current user's git identity (user.name / user.email).
 * `global: true` forces the machine-wide config (used for cross-repo --all);
 * otherwise the repo's local config wins, falling back to global.
 */
export async function getGitIdentity(
  cwd: string,
  global = false,
): Promise<Identity> {
  const [email, name] = await Promise.all([
    gitConfig("user.email", cwd, global),
    gitConfig("user.name", cwd, global),
  ]);
  return {
    emails: email ? [email] : [],
    names: name ? [name] : [],
  };
}
