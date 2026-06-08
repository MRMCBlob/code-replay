import chalk from "chalk";
import Table from "cli-table3";
import type {
  AuthorStat,
  LanguageStat,
  Timeline,
  Totals,
} from "./types.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format an integer with thousands separators. */
function n(value: number): string {
  return value.toLocaleString("en-US");
}

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/** Horizontal bar scaled to `width`, filled proportionally to `ratio` (0..1). */
function bar(ratio: number, width = 16): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const filled = Math.round(clamped * width);
  return chalk.cyan("█".repeat(filled)) + chalk.gray("░".repeat(width - filled));
}

function heading(text: string): string {
  return chalk.bold.underline(text);
}

export function renderSummary(t: Totals): string {
  const table = new Table({
    chars: dimChars(),
    style: { head: [], border: [] },
  });
  const range =
    t.firstDate && t.lastDate
      ? `${t.firstDate.slice(0, 10)} → ${t.lastDate.slice(0, 10)}`
      : "—";
  const avg = t.commits > 0 ? Math.round(t.churn / t.commits) : 0;

  table.push(
    [chalk.bold("Commits"), n(t.commits)],
    [chalk.bold("Lines added"), chalk.green(`+${n(t.added)}`)],
    [chalk.bold("Lines removed"), chalk.red(`-${n(t.removed)}`)],
    [chalk.bold("Net lines"), netColor(t.net)],
    [chalk.bold("Total churn"), n(t.churn)],
    [chalk.bold("Files touched"), n(t.filesTouched)],
    [chalk.bold("Avg churn/commit"), n(avg)],
    [chalk.bold("Active days"), n(t.activeDays)],
    [chalk.bold("Date range"), range],
  );
  return `${heading("Summary")}\n${table.toString()}`;
}

export function renderAuthors(authors: AuthorStat[], top: number): string {
  const table = new Table({
    head: ["#", "Author", "Commits", "Added", "Removed", "Net", "Share"].map(
      (h) => chalk.bold(h),
    ),
    chars: dimChars(),
    style: { head: [], border: [] },
    colAligns: ["right", "left", "right", "right", "right", "right", "left"],
  });

  authors.slice(0, top).forEach((a, i) => {
    table.push([
      String(i + 1),
      truncate(a.name || a.email || "unknown", 24),
      n(a.commits),
      chalk.green(`+${n(a.added)}`),
      chalk.red(`-${n(a.removed)}`),
      netColor(a.net),
      `${bar(a.share, 10)} ${pct(a.share)}`,
    ]);
  });

  const hidden = authors.length - Math.min(top, authors.length);
  const footer = hidden > 0 ? chalk.gray(`\n  …and ${hidden} more`) : "";
  return `${heading("Authors")}\n${table.toString()}${footer}`;
}

export function renderLanguages(langs: LanguageStat[], top: number): string {
  const table = new Table({
    head: ["Language", "Files", "Churn", "Share"].map((h) => chalk.bold(h)),
    chars: dimChars(),
    style: { head: [], border: [] },
    colAligns: ["left", "right", "right", "left"],
  });

  langs.slice(0, top).forEach((l) => {
    table.push([
      truncate(l.language, 20),
      n(l.files),
      n(l.churn),
      `${bar(l.share, 14)} ${pct(l.share)}`,
    ]);
  });

  const hidden = langs.length - Math.min(top, langs.length);
  const footer = hidden > 0 ? chalk.gray(`\n  …and ${hidden} more`) : "";
  return `${heading("Languages")}\n${table.toString()}${footer}`;
}

export function renderTimeline(tl: Timeline): string {
  const lines: string[] = [];
  lines.push(heading("Activity"));

  const busiest = tl.busiestDay
    ? `${tl.busiestDay.day} (${tl.busiestDay.count} commits)`
    : "—";
  lines.push(
    `  Current streak: ${chalk.bold(String(tl.currentStreak))} day(s)   ` +
      `Longest streak: ${chalk.bold(String(tl.longestStreak))} day(s)   ` +
      `Busiest: ${chalk.bold(busiest)}`,
  );
  lines.push("");
  lines.push(renderHeatmap(tl.heatmap));
  return lines.join("\n");
}

/** Weekday (rows) × hour (cols) shaded grid. */
export function renderHeatmap(heatmap: number[][]): string {
  const max = Math.max(1, ...heatmap.flat());
  const shades = [" ", "░", "▒", "▓", "█"];

  const header =
    "      " +
    Array.from({ length: 24 }, (_, h) => (h % 2 === 0 ? pad2(h) : "  ")).join(
      "",
    );
  const rows: string[] = [chalk.gray(header)];

  for (let d = 0; d < 7; d++) {
    const cells = heatmap[d]!
      .map((count) => {
        if (count === 0) return chalk.gray(shades[0]);
        const idx = Math.min(
          shades.length - 1,
          1 + Math.floor((count / max) * (shades.length - 2)),
        );
        return shadeColor(count, max, shades[idx]!);
      })
      .join("");
    rows.push(`  ${chalk.bold(WEEKDAYS[d]!)} ${cells}`);
  }
  rows.push(
    chalk.gray("  hours →  each cell = commits in that weekday/hour bucket"),
  );
  return rows.join("\n");
}

function shadeColor(count: number, max: number, ch: string): string {
  const r = count / max;
  if (r > 0.66) return chalk.greenBright(ch);
  if (r > 0.33) return chalk.green(ch);
  return chalk.cyan(ch);
}

function netColor(net: number): string {
  if (net > 0) return chalk.green(`+${n(net)}`);
  if (net < 0) return chalk.red(n(net));
  return n(net);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function pad2(num: number): string {
  return num.toString().padStart(2, "0");
}

/** Dimmed table border characters for a softer look. */
function dimChars(): Record<string, string> {
  const c = (ch: string) => chalk.gray(ch);
  return {
    top: c("─"),
    "top-mid": c("┬"),
    "top-left": c("┌"),
    "top-right": c("┐"),
    bottom: c("─"),
    "bottom-mid": c("┴"),
    "bottom-left": c("└"),
    "bottom-right": c("┘"),
    left: c("│"),
    "left-mid": c("├"),
    mid: c("─"),
    "mid-mid": c("┼"),
    right: c("│"),
    "right-mid": c("┤"),
    middle: c("│"),
  };
}
