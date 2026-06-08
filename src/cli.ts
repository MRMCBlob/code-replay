import process from "node:process";
import path from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { getCommits, NotAGitRepoError } from "./git.js";
import { computeAuthors, computeTotals } from "./stats.js";
import { computeLanguages } from "./languages.js";
import { computeTimeline } from "./timeline.js";
import {
  renderAuthors,
  renderLanguages,
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
  .option("--top <n>", "max rows in author/language tables", "10")
  .option("--no-color", "disable colored output")
  .action(async (repo: string, opts: CliOptions) => {
    if (!opts.color) chalk.level = 0;
    const cwd = path.resolve(process.cwd(), repo);
    const top = Math.max(1, Number.parseInt(opts.top, 10) || 10);

    try {
      const commits = await getCommits({
        cwd,
        since: opts.since,
        until: opts.until,
        author: opts.author,
        pathspec: opts.pathspec,
      });

      if (commits.length === 0) {
        console.log(
          chalk.yellow(
            "No commits found for the given filters in " + cwd,
          ),
        );
        return;
      }

      const totals = computeTotals(commits);
      const authors = computeAuthors(commits);
      const languages = computeLanguages(commits);
      const timeline = computeTimeline(commits);

      const out = [
        "",
        chalk.bold.cyan(`  code-replay  ·  ${cwd}`),
        "",
        renderSummary(totals),
        "",
        renderAuthors(authors, top),
        "",
        renderLanguages(languages, top),
        "",
        renderTimeline(timeline),
        "",
      ].join("\n");

      console.log(out);
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
