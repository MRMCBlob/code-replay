import { describe, expect, it } from "vitest";
import {
  normalizeRenamePath,
  parseGitLog,
  parseNumstatLine,
} from "../src/git.js";

const REC = "\x1e";
const FS = "\x1f";

function header(
  hash: string,
  name: string,
  email: string,
  date: string,
  subject: string,
): string {
  return `${REC}${hash}${FS}${name}${FS}${email}${FS}${date}${FS}${subject}`;
}

describe("parseNumstatLine", () => {
  it("parses a normal line", () => {
    expect(parseNumstatLine("10\t3\tsrc/app.ts")).toEqual({
      added: 10,
      removed: 3,
      path: "src/app.ts",
      binary: false,
    });
  });

  it("treats binary files as zero lines", () => {
    expect(parseNumstatLine("-\t-\timg/logo.png")).toEqual({
      added: 0,
      removed: 0,
      path: "img/logo.png",
      binary: true,
    });
  });

  it("returns null for malformed lines", () => {
    expect(parseNumstatLine("garbage")).toBeNull();
  });
});

describe("normalizeRenamePath", () => {
  it("handles simple rename", () => {
    expect(normalizeRenamePath("old/a.ts => new/b.ts")).toBe("new/b.ts");
  });
  it("handles braced rename", () => {
    expect(normalizeRenamePath("src/{old => new}/file.ts")).toBe(
      "src/new/file.ts",
    );
  });
  it("leaves non-renames untouched", () => {
    expect(normalizeRenamePath("src/file.ts")).toBe("src/file.ts");
  });
});

describe("parseGitLog", () => {
  it("parses multiple commits with file stats", () => {
    const raw =
      header("abc123", "Ada", "ada@x.io", "2024-01-01T10:00:00+00:00", "init") +
      "\n10\t0\tsrc/a.ts\n5\t2\tsrc/b.ts\n" +
      header(
        "def456",
        "Bob",
        "bob@x.io",
        "2024-01-02T12:00:00+00:00",
        "fix: thing",
      ) +
      "\n-\t-\tlogo.png\n3\t3\tsrc/a.ts\n";

    const commits = parseGitLog(raw);
    expect(commits).toHaveLength(2);

    const [c1, c2] = commits;
    expect(c1!.hash).toBe("abc123");
    expect(c1!.authorName).toBe("Ada");
    expect(c1!.added).toBe(15);
    expect(c1!.removed).toBe(2);
    expect(c1!.files).toHaveLength(2);

    expect(c2!.subject).toBe("fix: thing");
    expect(c2!.added).toBe(3);
    expect(c2!.removed).toBe(3);
    expect(c2!.files.find((f) => f.binary)?.path).toBe("logo.png");
  });

  it("returns empty array for empty input", () => {
    expect(parseGitLog("")).toEqual([]);
  });
});
