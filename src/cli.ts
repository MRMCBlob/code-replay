import process from "node:process";
import path from "node:path";
import os from "node:os";
import chalk from "chalk";
import { Command } from "commander";
import { getCommits, getGitIdentity, gitToplevel, NotAGitRepoError } from "./git.js";
import { findGitRepos } from "./discover.js";
import { filterByIdentity, isEmptyIdentity } from "./identity.js";
import { clearCache, loadRepos, saveRepos } from "./cache.js";
import { computeAuthors, computeRepos, computeTotals } from "./stats.js";
import { computeLanguages } from "./languages.js";
import { computeTimeline } from "./timeline.js";
import type { Commit, Identity } from "./types.js";
import {
  renderAuthors,
  renderLanguages,
  renderRepos,
  renderSummary,
  renderTimeline,
} from "./render.js";

interface CliOptions {
  since?: string;
  until?: string;
  author?: string;
  pathspec?: string;
  top: string;
  color: boolean;
  all?: boolean;
  root?: string;
  depth: string;
  everyone?: boolean;
  cache: boolean;
  refresh?: boolean;
  cacheTtl: string;
  clearCache?: boolean;
}

const program = new Command();

program
  .name("code-replay")
  .description(
    "Track your git commits: lines added/removed/changed, authors, languages and activity. Defaults to YOUR commits (author or co-author).",
  )
  .version("0.1.0")
  .argument("[repo]", "path to the git repository", ".")
  .option("--since <date>", "only commits after this date (e.g. '2 weeks ago')")
  .option("--until <date>", "only commits before this date")
  .option(
    "--author <pattern>",
    "filter by a specific author (overrides the default 'me' filter)",
  )
  .option("--everyone", "include commits from all authors, not just you")
  .option("--pathspec <path>", "restrict to a path inside the repo")
  .option("--top <n>", "max rows in author/language/repo tables", "10")
  .option(
    "--all",
    "scan EVERY git repo on this machine and aggregate them together",
  )
  .option(
    "--root <path>",
    "with --all: directory to scan for repos (default: your home folder)",
  )
  .option("--depth <n>", "with --all: max folder depth to scan", "7")
  .option("--no-cache", "with --all: ignore the cached repo list")
  .option("--refresh", "with --all: force a fresh filesystem scan")
  .option("--cache-ttl <hours>", "with --all: cache lifetime in hours", "168")
  .option("--clear-cache", "delete the cached repo list and exit")
  .option("--no-color", "disable colored output")
  .action(async (repo: string, opts: CliOptions) => {
    if (!opts.color) chalk.level = 0;

    if (opts.clearCache) {
      await clearCache();
      console.log(chalk.green("✓ Repo cache cleared."));
      return;
    }

    const top = Math.max(1, Number.parseInt(opts.top, 10) || 10);

    try {
      // Resolve "me" unless an explicit author or --everyone was given.
      let identity: Identity | undefined;
      if (!opts.everyone && !opts.author) {
        identity = await getGitIdentity(
          opts.all ? path.resolve(opts.root ?? os.homedir()) : path.resolve(repo),
          opts.all, // force global config for cross-repo mode
        );
        if (isEmptyIdentity(identity)) {
          process.stderr.write(
            chalk.yellow(
              "No git user.name/user.email configured — showing all authors.\n" +
                "Set one with: git config --global user.email you@example.com\n\n",
            ),
          );
          identity = undefined;
        } else {
          const who =
            identity.emails[0] ?? identity.names[0] ?? "you";
          process.stderr.write(chalk.gray(`Filtering to you: ${who}\n`));
        }
      }

      const { commits, label, multi } = opts.all
        ? await collectAll(opts, identity)
        : await collectSingle(repo, opts, identity);

      if (commits.length === 0) {
        console.log(
          chalk.yellow(`No matching commits found in ${label}`),
        );
        return;
      }

      const totals = computeTotals(commits);
      const authors = computeAuthors(commits);
      const languages = computeLanguages(commits);
      const timeline = computeTimeline(commits);

      const sections = [
        "",
        chalk.bold.cyan(`  code-replay  ·  ${label}`),
        "",
        renderSummary(totals),
        "",
      ];
      if (multi) {
        sections.push(renderRepos(computeRepos(commits), top), "");
      }
      sections.push(
        renderAuthors(authors, top),
        "",
        renderLanguages(languages, top),
        "",
        renderTimeline(timeline),
        "",
      );

      console.log(sections.join("\n"));
    } catch (err) {
      if (err instanceof NotAGitRepoError) {
        console.error(chalk.red(`✗ ${err.message}`));
        console.error(
          chalk.gray("  Run inside a git repo, or pass a repo path argument."),
        );
        process.exitCode = 1;
        return;
      }
      console.error(chalk.red("✗ Failed to read git history:"));
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv);

/** Single-repo mode: read the repo at `repo`, optionally filtered to me. */
async function collectSingle(
  repo: string,
  opts: CliOptions,
  identity: Identity | undefined,
): Promise<{ commits: Commit[]; label: string; multi: boolean }> {
  const cwd = path.resolve(process.cwd(), repo);
  let commits = await getCommits({
    cwd,
    since: opts.since,
    until: opts.until,
    author: opts.author,
    pathspec: opts.pathspec,
  });
  if (identity) commits = filterByIdentity(commits, identity);
  return { commits, label: cwd, multi: false };
}

/** --all mode: discover repos (cached), merge commits, filter to me per-repo. */
async function collectAll(
  opts: CliOptions,
  identity: Identity | undefined,
): Promise<{ commits: Commit[]; label: string; multi: boolean }> {
  const root = path.resolve(opts.root ?? os.homedir());
  const maxDepth = Math.max(1, Number.parseInt(opts.depth, 10) || 7);
  const ttlMs =
    Math.max(0, Number.parseFloat(opts.cacheTtl) || 168) * 3_600_000;

  const repos = await resolveRepos(root, maxDepth, ttlMs, opts);

  const all: Commit[] = [];
  let contributed = 0;
  await mapPool(repos, 8, async (repoPath) => {
    try {
      let commits = await getCommits({
        cwd: repoPath,
        since: opts.since,
        until: opts.until,
        author: opts.author,
        pathspec: opts.pathspec,
      });
      if (identity) commits = filterByIdentity(commits, identity);
      if (commits.length === 0) return; // repo I never touched — ignore it
      contributed++;
      const name = path.basename(repoPath);
      for (const c of commits) c.repo = name;
      all.push(...commits);
    } catch {
      // Skip unreadable repos (corrupt, no HEAD, permission) silently.
    }
  });

  const scope = identity ? "your commits" : "all commits";
  return {
    commits: all,
    label: `${scope} across ${contributed}/${repos.length} repos under ${root}`,
    multi: true,
  };
}

/** Get the repo list from cache when possible, else scan the filesystem. */
async function resolveRepos(
  root: string,
  maxDepth: number,
  ttlMs: number,
  opts: CliOptions,
): Promise<string[]> {
  if (opts.cache && !opts.refresh) {
    const cached = await loadRepos(root, maxDepth, ttlMs);
    if (cached) {
      // Auto-refresh when run from a git repo the cache doesn't know about:
      // a new repo has appeared under `root` since the last scan.
      const newRepo = await uncachedCurrentRepo(root, cached);
      if (newRepo) {
        process.stderr.write(
          chalk.gray(
            `New git repo not in cache (${newRepo}) — forcing a fresh scan.\n\n`,
          ),
        );
      } else {
        process.stderr.write(
          chalk.gray(`Using cached repo list (${cached.length} repos). `) +
            chalk.gray("Pass --refresh to rescan.\n\n"),
        );
        return cached;
      }
    }
  }

  process.stderr.write(chalk.gray(`Scanning ${root} for git repos…\n`));
  const repos = await findGitRepos([root], {
    maxDepth,
    onFound: (p) => process.stderr.write(chalk.gray(`  • ${p}\n`)),
  });
  process.stderr.write(
    chalk.gray(`Found ${repos.length} repo(s). Reading history…\n\n`),
  );
  if (opts.cache) {
    await saveRepos(root, maxDepth, repos).catch(() => {});
  }
  return repos;
}

/**
 * If the current working directory is inside a git repo that lives under
 * `root` but is absent from `cached`, return its path — a signal that the
 * cache is stale and a rescan is warranted. Otherwise return null.
 */
async function uncachedCurrentRepo(
  root: string,
  cached: string[],
): Promise<string | null> {
  const top = await gitToplevel(process.cwd());
  if (!top) return null;
  const rel = path.relative(root, top);
  // Not under the scan root → out of scope, cache stays valid.
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  const known = new Set(cached.map((p) => path.resolve(p)));
  return known.has(path.resolve(top)) ? null : top;
}

/** Run `fn` over `items` with at most `limit` concurrent executions. */
async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}
