import type { Commit, Timeline } from "./types.js";

/** Build day buckets, streaks and weekday/hour heatmap from commits. */
export function computeTimeline(commits: Commit[]): Timeline {
  const perDayMap = new Map<string, number>();
  const heatmap: number[][] = Array.from({ length: 7 }, () =>
    new Array<number>(24).fill(0),
  );
  const perWeekday = new Array<number>(7).fill(0);
  const perHour = new Array<number>(24).fill(0);

  for (const c of commits) {
    if (!c.date) continue;
    const d = new Date(c.date);
    if (Number.isNaN(d.getTime())) continue;
    const day = c.date.slice(0, 10);
    perDayMap.set(day, (perDayMap.get(day) ?? 0) + 1);

    // Use local components of the commit's own offset via the ISO string parse.
    const weekday = d.getDay(); // 0 = Sunday
    const hour = d.getHours();
    heatmap[weekday]![hour]! += 1;
    perWeekday[weekday]! += 1;
    perHour[hour]! += 1;
  }

  const perDay = [...perDayMap.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));

  const busiestDay = perDay.reduce<{ day: string; count: number } | undefined>(
    (best, cur) => (!best || cur.count > best.count ? cur : best),
    undefined,
  );

  const { current, longest } = computeStreaks(perDay.map((p) => p.day));

  return {
    perDay,
    heatmap,
    currentStreak: current,
    longestStreak: longest,
    busiestDay,
    perWeekday,
    perHour,
  };
}

/** Longest run of consecutive calendar days, plus the streak ending at the last day. */
export function computeStreaks(sortedDays: string[]): {
  current: number;
  longest: number;
} {
  if (sortedDays.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    if (isNextDay(sortedDays[i - 1]!, sortedDays[i]!)) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  // "current" = the run ending on the final active day.
  let current = 1;
  for (let i = sortedDays.length - 1; i > 0; i--) {
    if (isNextDay(sortedDays[i - 1]!, sortedDays[i]!)) current += 1;
    else break;
  }
  return { current, longest };
}

/** True when `b` is exactly one calendar day after `a` (both 'YYYY-MM-DD'). */
export function isNextDay(a: string, b: string): boolean {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return db - da === 86_400_000;
}
