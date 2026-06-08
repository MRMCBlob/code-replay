import type { AuthorStat, Commit, RepoStat, Totals } from "./types.js";

/** Compute repo-wide totals across all commits. */
export function computeTotals(commits: Commit[]): Totals {
  let added = 0;
  let removed = 0;
  const files = new Set<string>();
  const days = new Set<string>();
  let firstDate: string | undefined;
  let lastDate: string | undefined;

  for (const c of commits) {
    added += c.added;
    removed += c.removed;
    for (const f of c.files) files.add(f.path);
    if (c.date) {
      const day = c.date.slice(0, 10);
      days.add(day);
      if (!firstDate || c.date < firstDate) firstDate = c.date;
      if (!lastDate || c.date > lastDate) lastDate = c.date;
    }
  }

  return {
    commits: commits.length,
    added,
    removed,
    net: added - removed,
    churn: added + removed,
    filesTouched: files.size,
    firstDate,
    lastDate,
    activeDays: days.size,
  };
}

/** Aggregate per author, keyed by email (falls back to name). Sorted by churn desc. */
export function computeAuthors(commits: Commit[]): AuthorStat[] {
  const map = new Map<string, AuthorStat>();
  let totalChurn = 0;

  for (const c of commits) {
    const key = c.authorEmail || c.authorName;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        name: c.authorName,
        email: c.authorEmail,
        commits: 0,
        added: 0,
        removed: 0,
        net: 0,
        churn: 0,
        share: 0,
      };
      map.set(key, entry);
    }
    entry.commits += 1;
    entry.added += c.added;
    entry.removed += c.removed;
    entry.net = entry.added - entry.removed;
    entry.churn = entry.added + entry.removed;
    totalChurn += c.added + c.removed;
  }

  const authors = [...map.values()];
  for (const a of authors) {
    a.share = totalChurn > 0 ? a.churn / totalChurn : 0;
  }
  authors.sort((x, y) => y.churn - x.churn || y.commits - x.commits);
  return authors;
}

/** Aggregate per repo (uses commit.repo). Sorted by churn desc. */
export function computeRepos(commits: Commit[]): RepoStat[] {
  const map = new Map<string, RepoStat>();
  let totalChurn = 0;

  for (const c of commits) {
    const key = c.repo ?? "(unknown)";
    let entry = map.get(key);
    if (!entry) {
      entry = { repo: key, commits: 0, added: 0, removed: 0, churn: 0, share: 0 };
      map.set(key, entry);
    }
    entry.commits += 1;
    entry.added += c.added;
    entry.removed += c.removed;
    entry.churn = entry.added + entry.removed;
    totalChurn += c.added + c.removed;
  }

  const repos = [...map.values()];
  for (const r of repos) {
    r.share = totalChurn > 0 ? r.churn / totalChurn : 0;
  }
  repos.sort((x, y) => y.churn - x.churn || y.commits - x.commits);
  return repos;
}
