import { execa } from "execa";
import type { Commit, FileChange, GitLogOptions } from "./types.js";

/** Record separator emitted before each commit header in the pretty format. */
const REC = "\x1e"; // ASCII record separator
/** Field separator inside a commit header. */
const FS = "\x1f"; // ASCII unit separator

const PRETTY = `${REC}%H${FS}%an${FS}%ae${FS}%aI${FS}%s`;

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
    const [hash, authorName, authorEmail, date, ...subjectParts] =
      header.split(FS);
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
      authorName: authorName ?? "",
      authorEmail: authorEmail ?? "",
      date: date ?? "",
      subject: subjectParts.join(FS),
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
