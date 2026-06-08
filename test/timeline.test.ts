import { describe, expect, it } from "vitest";
import {
  computeStreaks,
  computeTimeline,
  isNextDay,
} from "../src/timeline.js";
import type { Commit } from "../src/types.js";

function c(date: string): Commit {
  return {
    hash: date,
    authorName: "Ada",
    authorEmail: "ada@x.io",
    date,
    subject: "x",
    added: 1,
    removed: 0,
    files: [],
    coauthors: [],
  };
}

describe("isNextDay", () => {
  it("detects consecutive days", () => {
    expect(isNextDay("2024-01-01", "2024-01-02")).toBe(true);
    expect(isNextDay("2024-01-31", "2024-02-01")).toBe(true);
  });
  it("rejects gaps and same day", () => {
    expect(isNextDay("2024-01-01", "2024-01-03")).toBe(false);
    expect(isNextDay("2024-01-01", "2024-01-01")).toBe(false);
  });
});

describe("computeStreaks", () => {
  it("finds longest and current streaks", () => {
    const days = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-10"];
    const { current, longest } = computeStreaks(days);
    expect(longest).toBe(3);
    expect(current).toBe(1); // last day is isolated
  });

  it("current streak counts trailing consecutive run", () => {
    const days = ["2024-01-01", "2024-01-05", "2024-01-06", "2024-01-07"];
    const { current, longest } = computeStreaks(days);
    expect(current).toBe(3);
    expect(longest).toBe(3);
  });

  it("handles empty", () => {
    expect(computeStreaks([])).toEqual({ current: 0, longest: 0 });
  });
});

describe("computeTimeline", () => {
  it("buckets per day and fills weekday/hour aggregates", () => {
    const commits = [
      c("2024-01-01T09:00:00+00:00"),
      c("2024-01-01T09:30:00+00:00"),
      c("2024-01-02T14:00:00+00:00"),
    ];
    const tl = computeTimeline(commits);
    expect(tl.perDay).toEqual([
      { day: "2024-01-01", count: 2 },
      { day: "2024-01-02", count: 1 },
    ]);
    expect(tl.busiestDay).toEqual({ day: "2024-01-01", count: 2 });
    expect(tl.perWeekday.reduce((a, b) => a + b, 0)).toBe(3);
    expect(tl.perHour.reduce((a, b) => a + b, 0)).toBe(3);
    expect(tl.heatmap).toHaveLength(7);
    expect(tl.heatmap[0]).toHaveLength(24);
  });
});
