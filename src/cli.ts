import process from "node:process";
import path from "node:path";
import os from "node:os";
import chalk from "chalk";
import { Command } from "commander";
import { getCommits, NotAGitRepoError } from "./git.js";
import { findGitRepos } from "./discover.js";
import { computeAuthors, computeRepos, computeTotals } from "./stats.js";
import { computeLanguages } from "./languages.js";
import { computeTimeline } from "./timeline.js";
import type { Commit } from "./types.js";
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
}

const program = new Command();

program
  .name("code-replay")
  .description(
    "Track your local git commits: lines added/removed/changed, authors, languages and activity.",
  )
  .version("0.1.0")
  .argument("[repo]", "path to the git repository", ".")
  .option("--since <date>", "only commits after this date (e.g. '2 weeks ago')")
  .option("--until <date>", "only commits before this date")
  .option("--author <pattern>", "filter by author name/email substring")
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
  .option("--no-color", "disable colored output")
  .action(async (repo: string, opts: CliOptions) => {
    if (!opts.color) chalk.level = 0;
    const top = Math.max(1, Number.parseInt(opts.top, 10) || 10);

    try {
      const { commits, label, multi } = opts.all
        ? await collectAll(opts)
        : await collectSingle(repo, opts);

      if (commits.length === 0) {
        console.log(chalk.yellow(`No commits found for the given filters in ${label}`));
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

/** Single-repo mode: read the repo at `repo`. */
async function collectSingle(
  repo: string,
  opts: CliOptions,
): Promise<{ commits: Commit[]; label: string; multi: boolean }> {
  const cwd = path.resolve(process.cwd(), repo);
  const commits = await getCommits({
    cwd,
    since: opts.since,
    until: opts.until,
    author: opts.author,
    pathspec: opts.pathspec,
  });
  return { commits, label: cwd, multi: false };
}

/** --all mode: discover every repo under the scan root and merge their commits. */
async function collectAll(
  opts: CliOptions,
): Promise<{ commits: Commit[]; label: string; multi: boolean }> {
  const root = path.resolve(opts.root ?? os.homedir());
  const maxDepth = Math.max(1, Number.parseInt(opts.depth, 10) || 7);

  process.stderr.write(chalk.gray(`Scanning ${root} for git repos…\n`));
  const repos = await findGitRepos([root], {
    maxDepth,
    onFound: (p) => process.stderr.write(chalk.gray(`  • ${p}\n`)),
  });
  process.stderr.write(
    chalk.gray(`Found ${repos.length} repo(s). Reading history…\n\n`),
  );

  const all: Commit[] = [];
  await mapPool(repos, 8, async (repoPath) => {
    try {
      const commits = await getCommits({
        cwd: repoPath,
        since: opts.since,
        until: opts.until,
        author: opts.author,
        pathspec: opts.pathspec,
      });
      const name = path.basename(repoPath);
      for (const c of commits) c.repo = name;
      all.push(...commits);
    } catch {
      // Skip unreadable repos (corrupt, no HEAD, permission) silently.
    }
  });

  return {
    commits: all,
    label: `all repos under ${root} (${repos.length} found)`,
    multi: true,
  };
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
