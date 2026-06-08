import { describe, expect, it } from "vitest";
import {
  filterByIdentity,
  isEmptyIdentity,
  matchesIdentity,
} from "../src/identity.js";
import type { Commit, Identity } from "../src/types.js";

function commit(p: Partial<Commit>): Commit {
  return {
    hash: p.hash ?? "h",
    authorName: p.authorName ?? "Someone",
    authorEmail: p.authorEmail ?? "someone@x.io",
    date: p.date ?? "2024-01-01T10:00:00+00:00",
    subject: p.subject ?? "msg",
    files: p.files ?? [],
    added: p.added ?? 0,
    removed: p.removed ?? 0,
    coauthors: p.coauthors ?? [],
    repo: p.repo,
  };
}

const me: Identity = { names: ["Ada Lovelace"], emails: ["ada@x.io"] };

describe("isEmptyIdentity", () => {
  it("detects empty identity", () => {
    expect(isEmptyIdentity({ names: [], emails: [] })).toBe(true);
    expect(isEmptyIdentity(me)).toBe(false);
  });
});

describe("matchesIdentity", () => {
  it("matches by author email (case-insensitive)", () => {
    expect(matchesIdentity(commit({ authorEmail: "ADA@x.io" }), me)).toBe(true);
  });

  it("does not match a different author", () => {
    expect(matchesIdentity(commit({ authorEmail: "bob@x.io" }), me)).toBe(false);
  });

  it("matches when I'm a co-author", () => {
    const c = commit({
      authorEmail: "bob@x.io",
      coauthors: ["Ada Lovelace <ada@x.io>"],
    });
    expect(matchesIdentity(c, me)).toBe(true);
  });

  it("falls back to name match when no emails configured", () => {
    const id: Identity = { names: ["Ada Lovelace"], emails: [] };
    expect(
      matchesIdentity(commit({ authorName: "ada lovelace" }), id),
    ).toBe(true);
  });
});

describe("filterByIdentity", () => {
  it("keeps only my commits", () => {
    const commits = [
      commit({ authorEmail: "ada@x.io" }),
      commit({ authorEmail: "bob@x.io" }),
      commit({ authorEmail: "z@x.io", coauthors: ["Ada <ada@x.io>"] }),
    ];
    expect(filterByIdentity(commits, me)).toHaveLength(2);
  });

  it("returns all commits for an empty identity", () => {
    const commits = [commit({}), commit({ authorEmail: "bob@x.io" })];
    expect(filterByIdentity(commits, { names: [], emails: [] })).toHaveLength(2);
  });
});
