/** A single file changed within a commit. */
export interface FileChange {
  /** Lines added (0 for binary files). */
  added: number;
  /** Lines removed (0 for binary files). */
  removed: number;
  /** Normalized file path (post-rename target). */
  path: string;
  /** True when git reported `-` line counts (binary file). */
  binary: boolean;
}

/** A parsed git commit with its file-level line stats. */
export interface Commit {
  hash: string;
  authorName: string;
  authorEmail: string;
  /** ISO-8601 author date string. */
  date: string;
  subject: string;
  files: FileChange[];
  added: number;
  removed: number;
  /** Repo this commit came from (set when aggregating across many repos). */
  repo?: string;
}

/** Options controlling which commits git returns. */
export interface GitLogOptions {
  cwd: string;
  since?: string;
  until?: string;
  author?: string;
  /** Restrict history to a path inside the repo. */
  pathspec?: string;
}

export interface Totals {
  commits: number;
  added: number;
  removed: number;
  /** added - removed */
  net: number;
  /** added + removed */
  churn: number;
  filesTouched: number;
  firstDate?: string;
  lastDate?: string;
  activeDays: number;
}

export interface AuthorStat {
  name: string;
  email: string;
  commits: number;
  added: number;
  removed: number;
  net: number;
  churn: number;
  /** Share of total churn, 0..1. */
  share: number;
}

export interface LanguageStat {
  language: string;
  files: number;
  added: number;
  removed: number;
  churn: number;
  /** Share of total churn, 0..1. */
  share: number;
}

export interface Timeline {
  /** Sorted list of { day: 'YYYY-MM-DD', count }. */
  perDay: { day: string; count: number }[];
  /** Commits indexed [weekday 0-6 (Sun..Sat)][hour 0-23]. */
  heatmap: number[][];
  currentStreak: number;
  longestStreak: number;
  busiestDay?: { day: string; count: number };
  /** Commit count per weekday, index 0 = Sunday. */
  perWeekday: number[];
  /** Commit count per hour, index 0..23. */
  perHour: number[];
}

export interface RepoStat {
  repo: string;
  commits: number;
  added: number;
  removed: number;
  churn: number;
  /** Share of total churn, 0..1. */
  share: number;
}
