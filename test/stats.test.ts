import { describe, expect, it } from "vitest";
import { computeAuthors, computeTotals } from "../src/stats.js";
import type { Commit } from "../src/types.js";

function commit(p: Partial<Commit>): Commit {
  return {
    hash: p.hash ?? "h",
    authorName: p.authorName ?? "Ada",
    authorEmail: p.authorEmail ?? "ada@x.io",
    date: p.date ?? "2024-01-01T10:00:00+00:00",
    subject: p.subject ?? "msg",
    files: p.files ?? [],
    added: p.added ?? 0,
    removed: p.removed ?? 0,
  };
}

describe("computeTotals", () => {
  it("sums lines, files and active days", () => {
    const commits = [
      commit({
        added: 10,
        removed: 2,
        date: "2024-01-01T10:00:00+00:00",
        files: [
          { added: 10, removed: 0, path: "a.ts", binary: false },
          { added: 0, removed: 2, path: "b.ts", binary: false },
        ],
      }),
      commit({
        added: 5,
        removed: 5,
        date: "2024-01-02T10:00:00+00:00",
        files: [{ added: 5, removed: 5, path: "a.ts", binary: false }],
      }),
    ];
    const t = computeTotals(commits);
    expect(t.commits).toBe(2);
    expect(t.added).toBe(15);
    expect(t.removed).toBe(7);
    expect(t.net).toBe(8);
    expect(t.churn).toBe(22);
    expect(t.filesTouched).toBe(2); // a.ts counted once
    expect(t.activeDays).toBe(2);
    expect(t.firstDate).toBe("2024-01-01T10:00:00+00:00");
    expect(t.lastDate).toBe("2024-01-02T10:00:00+00:00");
  });

  it("handles empty input", () => {
    const t = computeTotals([]);
    expect(t.commits).toBe(0);
    expect(t.filesTouched).toBe(0);
    expect(t.activeDays).toBe(0);
  });
});

describe("computeAuthors", () => {
  it("groups by email and sorts by churn", () => {
    const commits = [
      commit({ authorEmail: "ada@x.io", authorName: "Ada", added: 10, removed: 0 }),
      commit({ authorEmail: "ada@x.io", authorName: "Ada", added: 5, removed: 5 }),
      commit({ authorEmail: "bob@x.io", authorName: "Bob", added: 100, removed: 0 }),
    ];
    const authors = computeAuthors(commits);
    expect(authors).toHaveLength(2);
    expect(authors[0]!.name).toBe("Bob"); // highest churn first
    expect(authors[0]!.commits).toBe(1);
    expect(authors[0]!.churn).toBe(100);

    const ada = authors.find((a) => a.email === "ada@x.io")!;
    expect(ada.commits).toBe(2);
    expect(ada.added).toBe(15);
    expect(ada.removed).toBe(5);
    expect(ada.net).toBe(10);

    const totalShare = authors.reduce((s, a) => s + a.share, 0);
    expect(totalShare).toBeCloseTo(1, 5);
  });
});
