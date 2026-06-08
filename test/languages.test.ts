import { describe, expect, it } from "vitest";
import { computeLanguages, languageOf } from "../src/languages.js";
import type { Commit } from "../src/types.js";

describe("languageOf", () => {
  it("maps known extensions", () => {
    expect(languageOf("src/app.ts")).toBe("TypeScript");
    expect(languageOf("styles/main.css")).toBe("CSS");
    expect(languageOf("README.md")).toBe("Markdown");
  });
  it("maps special filenames", () => {
    expect(languageOf("Dockerfile")).toBe("Dockerfile");
    expect(languageOf("path/to/Makefile")).toBe("Makefile");
  });
  it("falls back to .ext for unknown extensions", () => {
    expect(languageOf("data.weird")).toBe(".weird");
  });
  it("returns Other for extensionless files", () => {
    expect(languageOf("LICENSE")).toBe("Other");
  });
});

describe("computeLanguages", () => {
  it("aggregates churn per language and counts unique files", () => {
    const commits: Commit[] = [
      {
        hash: "h1",
        authorName: "Ada",
        authorEmail: "ada@x.io",
        date: "2024-01-01T10:00:00+00:00",
        subject: "x",
        added: 0,
        removed: 0,
        coauthors: [],
        files: [
          { added: 10, removed: 0, path: "a.ts", binary: false },
          { added: 4, removed: 1, path: "style.css", binary: false },
          { added: 0, removed: 0, path: "logo.png", binary: true },
        ],
      },
      {
        hash: "h2",
        authorName: "Ada",
        authorEmail: "ada@x.io",
        date: "2024-01-02T10:00:00+00:00",
        subject: "y",
        added: 0,
        removed: 0,
        coauthors: [],
        files: [{ added: 6, removed: 0, path: "a.ts", binary: false }],
      },
    ];

    const langs = computeLanguages(commits);
    const ts = langs.find((l) => l.language === "TypeScript")!;
    expect(ts.churn).toBe(16);
    expect(ts.files).toBe(1); // a.ts unique across commits
    expect(langs.find((l) => l.language === "CSS")!.churn).toBe(5);
    // binary excluded
    expect(langs.find((l) => l.language === ".png")).toBeUndefined();

    expect(langs[0]!.language).toBe("TypeScript"); // sorted by churn desc
    const totalShare = langs.reduce((s, l) => s + l.share, 0);
    expect(totalShare).toBeCloseTo(1, 5);
  });
});
